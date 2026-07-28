import { beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import app from '../app.js';
import { isDbReachable, resetDb, testPrisma } from './helpers/db.js';

const dbUp = await isDbReachable();
if (!dbUp) {
  // eslint-disable-next-line no-console
  console.warn('[time-off-directory.routes] DATABASE_URL unreachable — skipping integration tests.');
}

const BASE = '/api/v1/time-off-directory/employees';

async function seedDepartment() {
  return testPrisma.department.create({
    data: { name: 'Direzione', normalizedName: `direzione-${crypto.randomUUID()}` },
  });
}

async function seedEmployee(
  departmentId: string,
  employeeNumber: number,
  overrides: Partial<{
    status: 'ATTIVO' | 'CESSATO' | 'DA_ASSUMERE';
    preferredLanguage: 'IT' | 'EN';
    mondayMinutes: number;
    fte: number;
  }> = {}
) {
  return testPrisma.employee.create({
    data: {
      employeeNumber,
      firstName: 'Nome',
      lastName: `Cognome${employeeNumber}`,
      workEmail: `emp${employeeNumber}@example.test`,
      departmentId,
      birthDate: new Date('1985-04-12T00:00:00.000Z'),
      hireDate: new Date('2015-09-01T00:00:00.000Z'),
      retirementDate: new Date('2052-07-12T00:00:00.000Z'),
      fte: overrides.fte ?? 1,
      usaCategory: 'EXEMPT',
      contractType: 'INDETERMINATO',
      status: overrides.status ?? 'ATTIVO',
      ...(overrides.preferredLanguage ? { preferredLanguage: overrides.preferredLanguage } : {}),
      ...(overrides.mondayMinutes !== undefined ? { mondayMinutes: overrides.mondayMinutes } : {}),
    },
  });
}

describe.skipIf(!dbUp)('time-off directory projection', () => {
  beforeEach(async () => {
    await resetDb();
  });

  it('projects an employee onto the Ferie contract', async () => {
    const department = await seedDepartment();
    const employee = await seedEmployee(department.id, 201, { preferredLanguage: 'EN' });

    const res = await request(app).get(BASE);

    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(1);
    const item = res.body.items[0];
    expect(item).toMatchObject({
      id: employee.id,
      // A string, not a number: the contract keys mirror rows on it as text.
      employeeNumber: '201',
      auth0Subject: 'auth0|ed-201',
      workEmail: 'emp201@example.test',
      displayName: 'Nome Cognome201',
      title: null,
      status: 'ACTIVE',
      fte: 1,
      preferredLanguage: 'EN',
      roles: [],
      approvers: [],
    });
    expect(item.department).toMatchObject({ id: department.id, name: department.name });
    // Full-time default: 7,30 a day, split around the 30-minute break.
    expect(item.schedule).toHaveLength(10);
    expect(item.schedule[0]).toEqual({ weekday: 1, start: '09:00', end: '12:45' });
    expect(new Date(item.updatedAt).toISOString()).toBe(item.updatedAt);
  });

  it('maps a non-active status to INACTIVE and omits unworked days', async () => {
    const department = await seedDepartment();
    await seedEmployee(department.id, 202, { status: 'DA_ASSUMERE', mondayMinutes: 0 });

    const res = await request(app).get(BASE);

    expect(res.body.items[0].status).toBe('INACTIVE');
    expect(res.body.items[0].schedule.some((i: { weekday: number }) => i.weekday === 1)).toBe(false);
  });

  it('flattens approvers across all three roles', async () => {
    const department = await seedDepartment();
    const subject = await seedEmployee(department.id, 300);
    const responsabile = await seedEmployee(department.id, 301);
    const substitute = await seedEmployee(department.id, 302);
    await testPrisma.employeeApprovalAssignment.createMany({
      data: [
        { employeeId: subject.id, approverId: responsabile.id, role: 'RESPONSABILE' },
        { employeeId: subject.id, approverId: substitute.id, role: 'SUBSTITUTE_RESPONSABILE' },
      ],
    });

    const res = await request(app).get(`${BASE}?limit=100`);
    const item = res.body.items.find((i: { id: string }) => i.id === subject.id);

    expect(item.approvers).toEqual([
      { employeeSourceId: responsabile.id, role: 'RESPONSABILE' },
      { employeeSourceId: substitute.id, role: 'SUBSTITUTE_RESPONSABILE' },
    ]);
  });

  it('pages with an id cursor and stops with a null cursor', async () => {
    const department = await seedDepartment();
    for (const employeeNumber of [401, 402, 403]) {
      await seedEmployee(department.id, employeeNumber);
    }

    const first = await request(app).get(`${BASE}?limit=2`);
    expect(first.body.items).toHaveLength(2);
    expect(first.body.nextCursor).toBe(first.body.items[1].id);

    const second = await request(app).get(`${BASE}?limit=2&cursor=${first.body.nextCursor}`);
    expect(second.body.items).toHaveLength(1);
    expect(second.body.nextCursor).toBeNull();

    // Every employee appears exactly once across the pages.
    const ids = [...first.body.items, ...second.body.items].map((i: { id: string }) => i.id);
    expect(new Set(ids).size).toBe(3);
  });

  it('rejects a limit above the contract maximum', async () => {
    const res = await request(app).get(`${BASE}?limit=101`);
    expect(res.status).toBe(400);
  });
});

describe.skipIf(!dbUp)('preferred-language write endpoint', () => {
  beforeEach(async () => {
    await resetDb();
  });

  it('stores the new language and survives a re-read', async () => {
    const department = await seedDepartment();
    const employee = await seedEmployee(department.id, 501, { preferredLanguage: 'IT' });

    const res = await request(app)
      .patch(`${BASE}/${employee.id}/preferred-language`)
      .send({ preferredLanguage: 'EN' });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ preferredLanguage: 'EN' });

    const reread = await request(app).get(BASE);
    expect(reread.body.items[0].preferredLanguage).toBe('EN');
    const stored = await testPrisma.employee.findUniqueOrThrow({ where: { id: employee.id } });
    expect(stored.preferredLanguage).toBe('EN');
  });

  it('records the change in the audit log with the calling client as actor', async () => {
    const department = await seedDepartment();
    const employee = await seedEmployee(department.id, 502, { preferredLanguage: 'IT' });

    await request(app).patch(`${BASE}/${employee.id}/preferred-language`).send({ preferredLanguage: 'EN' });

    const entry = await testPrisma.auditLog.findFirstOrThrow({
      where: { entityType: 'EMPLOYEE', entityId: employee.id, action: 'UPDATE' },
    });
    expect(entry.employeeNumber).toBe(502);
    expect(entry.actorSub).toBeTruthy();
    expect((entry.before as { preferredLanguage: string }).preferredLanguage).toBe('IT');
    expect((entry.after as { preferredLanguage: string }).preferredLanguage).toBe('EN');
  });

  it('404s for an unknown employee', async () => {
    const res = await request(app)
      .patch(`${BASE}/emp_does_not_exist/preferred-language`)
      .send({ preferredLanguage: 'EN' });
    expect(res.status).toBe(404);
  });

  it('400s for an unknown language', async () => {
    const department = await seedDepartment();
    const employee = await seedEmployee(department.id, 503);

    const res = await request(app)
      .patch(`${BASE}/${employee.id}/preferred-language`)
      .send({ preferredLanguage: 'FR' });

    expect(res.status).toBe(400);
  });

  it('refuses to write any field other than the language', async () => {
    const department = await seedDepartment();
    const employee = await seedEmployee(department.id, 504);

    const res = await request(app)
      .patch(`${BASE}/${employee.id}/preferred-language`)
      .send({ preferredLanguage: 'EN', lastName: 'Hacked', status: 'CESSATO' });

    expect(res.status).toBe(400);
    const stored = await testPrisma.employee.findUniqueOrThrow({ where: { id: employee.id } });
    expect(stored.lastName).toBe('Cognome504');
    expect(stored.status).toBe('ATTIVO');
    expect(stored.preferredLanguage).toBe('IT');
  });
});

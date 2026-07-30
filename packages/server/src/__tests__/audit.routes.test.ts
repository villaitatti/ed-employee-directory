import { beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { Prisma } from '@prisma/client';
import app from '../app.js';
import { isDbReachable, resetDb, testPrisma } from './helpers/db.js';

const dbUp = await isDbReachable();
if (!dbUp) {
  // eslint-disable-next-line no-console
  console.warn('[audit.routes] DATABASE_URL unreachable — skipping integration tests.');
}

async function seedDepartment(name = 'Biblioteca') {
  return testPrisma.department.create({ data: { name, normalizedName: name.toLowerCase() } });
}

/** An audit row as the app writes them: names live in the snapshot, not in a column. */
async function seedAuditRow(input: {
  employeeNumber: number | null;
  action?: 'CREATE' | 'UPDATE' | 'DELETE';
  before?: Prisma.InputJsonObject;
  after?: Prisma.InputJsonObject;
}) {
  const data: Prisma.AuditLogUncheckedCreateInput = {
    actorSub: 'auth0|test',
    actorEmail: 'registrar@example.test',
    entityType: 'EMPLOYEE',
    entityId: `emp_${input.employeeNumber}`,
    employeeNumber: input.employeeNumber,
    action: input.action ?? 'CREATE',
    requestId: `req_${input.employeeNumber}_${input.action ?? 'CREATE'}`,
  };
  // Assigned only when present: under exactOptionalPropertyTypes, Prisma's JSON
  // inputs accept a missing key but not an explicit `undefined` — the same shape
  // writeAuditLog gives the real rows.
  if (input.before !== undefined) data.before = input.before;
  if (input.after !== undefined) data.after = input.after;
  return testPrisma.auditLog.create({ data });
}

type Row = { employeeNumber: number | null; action: string };

async function search(q: string): Promise<Row[]> {
  const res = await request(app).get('/api/admin/audit-logs').query({ q });
  expect(res.status).toBe(200);
  return res.body.data as Row[];
}

describe.skipIf(!dbUp)('GET /api/admin/audit-logs — searching', () => {
  beforeEach(async () => {
    await resetDb();
    await seedAuditRow({ employeeNumber: 110, after: { firstName: 'Susan', lastName: 'Bates' } });
    await seedAuditRow({ employeeNumber: 216, after: { firstName: 'Francesca', lastName: 'Picchi' } });
    await seedAuditRow({ employeeNumber: 131, after: { firstName: 'Alessandro', lastName: 'Superbi' } });
  });

  it('finds an employee by surname', async () => {
    const rows = await search('Bates');
    expect(rows.map((r) => r.employeeNumber)).toEqual([110]);
  });

  it('finds an employee by forename', async () => {
    const rows = await search('Francesca');
    expect(rows.map((r) => r.employeeNumber)).toEqual([216]);
  });

  it('ignores case and matches part of a name', async () => {
    expect((await search('bat')).map((r) => r.employeeNumber)).toEqual([110]);
    expect((await search('SUPERBI')).map((r) => r.employeeNumber)).toEqual([131]);
  });

  it('finds a full name written forename-first, as the app writes it', async () => {
    const rows = await search('Susan Bates');
    expect(rows.map((r) => r.employeeNumber)).toEqual([110]);
  });

  it('still takes an Employee Number', async () => {
    const rows = await search('216');
    expect(rows.map((r) => r.employeeNumber)).toEqual([216]);
  });

  it('returns nothing — not everything — when a name matches nobody', async () => {
    // The trap in a filter built this way: an unmatched search that leaves the
    // where-clause empty reads as "here is the whole log".
    expect(await search('Nessuno')).toEqual([]);
  });

  it('returns the whole log when the box is empty', async () => {
    const rows = await search('');
    expect(rows).toHaveLength(3);
  });

  it('finds an employee who has since been deleted', async () => {
    // The reason the search reads the snapshots rather than the Employee table:
    // "who deleted Ada Rossi?" is exactly the question worth asking, and Ada is no
    // longer in the table that would index her name.
    await seedAuditRow({
      employeeNumber: 1001,
      action: 'DELETE',
      before: { firstName: 'Ada', lastName: 'Rossi' },
    });

    const rows = await search('Rossi');
    expect(rows.map((r) => r.employeeNumber)).toEqual([1001]);
    expect(rows[0]?.action).toBe('DELETE');
  });

  it('finds a renamed employee under both the old and the new name', async () => {
    await seedAuditRow({
      employeeNumber: 117,
      action: 'UPDATE',
      before: { firstName: 'Angela', lastName: 'Lees' },
      after: { firstName: 'Angela', lastName: 'Bianchi' },
    });

    expect((await search('Lees')).map((r) => r.employeeNumber)).toEqual([117]);
    expect((await search('Bianchi')).map((r) => r.employeeNumber)).toEqual([117]);
  });

  it('returns every row for the person, not only the one that matched', async () => {
    await seedAuditRow({
      employeeNumber: 110,
      action: 'UPDATE',
      before: { firstName: 'Susan', lastName: 'Bates', status: 'ATTIVO' },
      after: { firstName: 'Susan', lastName: 'Bates', status: 'CESSATO' },
    });

    // Searching a name asks "what happened to this person", so the answer is their
    // history rather than the single row their name was spelled in.
    const rows = await search('Bates');
    expect(rows).toHaveLength(2);
    expect(rows.map((r) => r.action).sort()).toEqual(['CREATE', 'UPDATE']);
  });

  /** A live employee row, so the Employee half of the lookup is exercised too. */
  async function seedEmployee(employeeNumber: number, firstName: string, lastName: string) {
    const department = await seedDepartment(`Dip${employeeNumber}`);
    return testPrisma.employee.create({
      data: {
        employeeNumber,
        firstName,
        lastName,
        workEmail: `e${employeeNumber}@example.test`,
        departmentId: department.id,
        birthDate: new Date('1985-04-12T00:00:00.000Z'),
        hireDate: new Date('2015-09-01T00:00:00.000Z'),
        retirementDate: new Date('2052-07-12T00:00:00.000Z'),
        fte: 1,
        usaCategory: 'EXEMPT',
        contractType: 'INDETERMINATO',
        status: 'ATTIVO',
      },
    });
  }

  it('finds a current employee by name even with no snapshot to go on', async () => {
    // The Employee table is unioned in as a backstop, so a record whose audit rows
    // predate name snapshots is still searchable.
    await seedEmployee(900, 'Giulia', 'Neri');
    await seedAuditRow({ employeeNumber: 900, action: 'UPDATE', before: {}, after: {} });

    const rows = await search('Neri');
    expect(rows.map((r) => r.employeeNumber)).toEqual([900]);
  });

  it('treats LIKE metacharacters as literal text', async () => {
    // Seeded on both sides of the lookup on purpose: an unescaped "%" reaching
    // *either* the snapshot query or the Employee query turns a search for one
    // character into a search for everybody, and this test caught exactly that in
    // the Employee half.
    await seedEmployee(900, 'Giulia', 'Neri');
    await seedAuditRow({ employeeNumber: 900, after: { firstName: 'Giulia', lastName: 'Neri' } });

    expect(await search('%')).toEqual([]);
    expect(await search('_ates')).toEqual([]);
    expect(await search('%Neri%')).toEqual([]);
    // The escaping must not break an ordinary search.
    expect((await search('Neri')).map((r) => r.employeeNumber)).toEqual([900]);
  });
});

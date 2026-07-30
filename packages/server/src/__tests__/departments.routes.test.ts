import { beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { EmployeeStatus } from '@itatti/shared';
import app from '../app.js';
import { isDbReachable, resetDb, testPrisma } from './helpers/db.js';

const dbUp = await isDbReachable();
if (!dbUp) {
  // eslint-disable-next-line no-console
  console.warn('[departments.routes] DATABASE_URL unreachable — skipping integration tests.');
}

let nextEmployeeNumber = 1;

async function seedDepartment(name: string) {
  return testPrisma.department.create({ data: { name, normalizedName: name.toLowerCase() } });
}

async function seedEmployee(
  departmentId: string,
  status: EmployeeStatus,
  names: { firstName?: string; lastName?: string } = {}
) {
  const employeeNumber = nextEmployeeNumber++;
  return testPrisma.employee.create({
    data: {
      employeeNumber,
      firstName: names.firstName ?? `Nome${employeeNumber}`,
      lastName: names.lastName ?? `Cognome${employeeNumber}`,
      workEmail: `dept-count-${employeeNumber}@example.test`,
      departmentId,
      birthDate: new Date('1985-04-12T00:00:00.000Z'),
      // A Cessato employee needs a termination date; an Attivo one needs a hire date.
      hireDate: new Date('2015-09-01T00:00:00.000Z'),
      ...(status === 'CESSATO' ? { terminationDate: new Date('2024-12-31T00:00:00.000Z') } : {}),
      retirementDate: new Date('2052-07-12T00:00:00.000Z'),
      fte: 1,
      usaCategory: 'EXEMPT',
      contractType: 'INDETERMINATO',
      status,
    },
  });
}

type DepartmentRow = {
  id: string;
  name: string;
  employeeCounts: { total: number; byStatus: Record<EmployeeStatus, number> };
  employees: Array<{ id: string; employeeNumber: number; firstName: string; lastName: string; status: EmployeeStatus }>;
};

describe.skipIf(!dbUp)('GET /api/admin/departments', () => {
  beforeEach(async () => {
    await resetDb();
    nextEmployeeNumber = 1;
  });

  it('carries a headcount per department, split by status', async () => {
    const biblioteca = await seedDepartment('Biblioteca');
    await seedEmployee(biblioteca.id, 'ATTIVO');
    await seedEmployee(biblioteca.id, 'ATTIVO');
    await seedEmployee(biblioteca.id, 'CESSATO');
    await seedEmployee(biblioteca.id, 'DA_ASSUMERE');

    const res = await request(app).get('/api/admin/departments');

    expect(res.status).toBe(200);
    const row = (res.body.data as DepartmentRow[]).find((d) => d.name === 'Biblioteca');
    expect(row?.employeeCounts).toEqual({
      total: 4,
      byStatus: { ATTIVO: 2, CESSATO: 1, DA_ASSUMERE: 1 },
    });
  });

  it('names the members, in surname order', async () => {
    const biblioteca = await seedDepartment('Biblioteca');
    // Seeded out of order on purpose: the page writes names forename-first but
    // *orders* them by surname, and that ordering is the server's job.
    await seedEmployee(biblioteca.id, 'ATTIVO', { firstName: 'Ada', lastName: 'Rossi' });
    await seedEmployee(biblioteca.id, 'CESSATO', { firstName: 'Carla', lastName: 'Verdi' });
    await seedEmployee(biblioteca.id, 'ATTIVO', { firstName: 'Bruno', lastName: 'Bianchi' });

    const res = await request(app).get('/api/admin/departments');

    const row = (res.body.data as DepartmentRow[]).find((d) => d.name === 'Biblioteca');
    expect(row?.employees.map((e) => `${e.firstName} ${e.lastName}`)).toEqual([
      'Bruno Bianchi',
      'Ada Rossi',
      'Carla Verdi',
    ]);
    // The status travels with the name, so the page can mark the ones who left.
    expect(row?.employees.find((e) => e.lastName === 'Verdi')?.status).toBe('CESSATO');
  });

  it('keeps each department to its own members', async () => {
    const one = await seedDepartment('Amministrazione');
    const two = await seedDepartment('Informatica');
    await seedEmployee(one.id, 'ATTIVO', { firstName: 'Ada', lastName: 'Rossi' });
    await seedEmployee(two.id, 'ATTIVO', { firstName: 'Bruno', lastName: 'Bianchi' });

    const res = await request(app).get('/api/admin/departments');

    const rows = res.body.data as DepartmentRow[];
    expect(rows.find((d) => d.name === 'Amministrazione')?.employees.map((e) => e.lastName)).toEqual(['Rossi']);
    expect(rows.find((d) => d.name === 'Informatica')?.employees.map((e) => e.lastName)).toEqual(['Bianchi']);
  });

  it('reports an empty department as explicit zeroes and an empty roster', async () => {
    // A department nobody is in has no rows at all, so this is the case where a
    // naive lookup hands the page an undefined to render.
    await seedDepartment('Giardini');

    const res = await request(app).get('/api/admin/departments');

    const row = (res.body.data as DepartmentRow[]).find((d) => d.name === 'Giardini');
    expect(row?.employeeCounts).toEqual({
      total: 0,
      byStatus: { ATTIVO: 0, CESSATO: 0, DA_ASSUMERE: 0 },
    });
    expect(row?.employees).toEqual([]);
  });

  it('cannot let the count and the names disagree', async () => {
    const biblioteca = await seedDepartment('Biblioteca');
    await seedEmployee(biblioteca.id, 'ATTIVO');
    await seedEmployee(biblioteca.id, 'CESSATO');
    await seedEmployee(biblioteca.id, 'DA_ASSUMERE');

    const res = await request(app).get('/api/admin/departments');

    // The tally is counted off the same rows the roster is built from, which is the
    // point of deriving it rather than asking the database twice.
    for (const row of res.body.data as DepartmentRow[]) {
      expect(row.employeeCounts.total).toBe(row.employees.length);
      for (const status of ['ATTIVO', 'CESSATO', 'DA_ASSUMERE'] as EmployeeStatus[]) {
        expect(row.employeeCounts.byStatus[status]).toBe(row.employees.filter((e) => e.status === status).length);
      }
    }
  });

  it('counts each department separately', async () => {
    const one = await seedDepartment('Amministrazione');
    const two = await seedDepartment('Informatica');
    await seedEmployee(one.id, 'ATTIVO');
    await seedEmployee(one.id, 'ATTIVO');
    await seedEmployee(two.id, 'ATTIVO');

    const res = await request(app).get('/api/admin/departments');

    const rows = res.body.data as DepartmentRow[];
    expect(rows.find((d) => d.name === 'Amministrazione')?.employeeCounts.total).toBe(2);
    expect(rows.find((d) => d.name === 'Informatica')?.employeeCounts.total).toBe(1);
    // The web page sums these for its "3 of N" reading, so they have to add up to
    // the whole directory rather than double-count anybody.
    expect(rows.reduce((sum, d) => sum + d.employeeCounts.total, 0)).toBe(3);
  });

  it('leaves the v1 department payload alone', async () => {
    const department = await seedDepartment('Biblioteca');
    await seedEmployee(department.id, 'ATTIVO');

    // The machine-to-machine surface never asked for a headcount, and adding one
    // there would be a contract change for the Ferie portal.
    const res = await request(app).get('/api/v1/departments');

    expect(res.status).toBe(200);
    expect(res.body.data[0]).not.toHaveProperty('employeeCounts');
    expect(res.body.data[0]).not.toHaveProperty('employees');
    expect(Object.keys(res.body.data[0]).sort()).toEqual([
      'createdAt',
      'id',
      'name',
      'normalizedName',
      'updatedAt',
    ]);
  });
});

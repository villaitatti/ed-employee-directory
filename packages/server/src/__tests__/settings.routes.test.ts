import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import ExcelJS from 'exceljs';
import request from 'supertest';
import app from '../app.js';
import { isDbReachable, resetDb, testPrisma } from './helpers/db.js';

const dbUp = await isDbReachable();
if (!dbUp) {
  // eslint-disable-next-line no-console
  console.warn('[settings.routes] DATABASE_URL unreachable — skipping integration tests.');
}

// Seeds one department + one employee, returning the created employee row.
async function seedEmployee(overrides: { retirementDateOverridden?: boolean; tfr?: 'I_TATTI' | 'FONDO_PENSIONE' } = {}) {
  const department = await testPrisma.department.create({
    data: { name: 'Amministrazione', normalizedName: 'amministrazione' },
  });
  return testPrisma.employee.create({
    data: {
      employeeNumber: 1001,
      firstName: 'Giulia',
      lastName: 'Rossi',
      departmentId: department.id,
      birthDate: new Date('1985-04-12T00:00:00.000Z'),
      hireDate: new Date('2015-09-01T00:00:00.000Z'),
      // 1985-04-12 + 67y3m = 2052-07-12 (the default policy).
      retirementDate: new Date('2052-07-12T00:00:00.000Z'),
      retirementDateOverridden: overrides.retirementDateOverridden ?? false,
      fte: 1,
      usaCategory: 'EXEMPT',
      contractType: 'INDETERMINATO',
      tfr: overrides.tfr ?? 'I_TATTI',
      status: 'ATTIVO',
    },
  });
}

async function excelBuffer(rows: unknown[][]): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet('Employees');
  rows.forEach((row) => worksheet.addRow(row));
  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer as ArrayBuffer);
}

describe.skipIf(!dbUp)('retirement-policy settings routes', () => {
  beforeAll(async () => {
    await resetDb();
  });
  beforeEach(async () => {
    await resetDb();
  });
  afterAll(async () => {
    await testPrisma.$disconnect();
  });

  it('GET /settings returns the statutory default when unset', async () => {
    const res = await request(app).get('/api/admin/settings');
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({
      retirementPolicy: { years: 67, months: 3 },
      updatedAt: null,
    });
  });

  it('PUT recalculates non-overridden employees and persists the policy', async () => {
    await seedEmployee();

    const res = await request(app)
      .put('/api/admin/settings/retirement-policy')
      .send({ years: 68, months: 0 });

    expect(res.status).toBe(200);
    expect(res.body.data.retirementPolicy).toEqual({ years: 68, months: 0 });
    expect(res.body.data.recalculatedEmployees).toBe(1);

    // 1985-04-12 + 68y0m = 2053-04-12.
    const employee = await testPrisma.employee.findUniqueOrThrow({ where: { employeeNumber: 1001 } });
    expect(employee.retirementDate.toISOString().slice(0, 10)).toBe('2053-04-12');

    // The setting is now persisted and read back by GET.
    const get = await request(app).get('/api/admin/settings');
    expect(get.body.data.retirementPolicy).toEqual({ years: 68, months: 0 });
    expect(get.body.data.updatedAt).not.toBeNull();
  });

  it('PUT leaves a manually-overridden retirement date untouched', async () => {
    await seedEmployee({ retirementDateOverridden: true });

    const res = await request(app)
      .put('/api/admin/settings/retirement-policy')
      .send({ years: 68, months: 0 });

    expect(res.status).toBe(200);
    expect(res.body.data.recalculatedEmployees).toBe(0);

    const employee = await testPrisma.employee.findUniqueOrThrow({ where: { employeeNumber: 1001 } });
    // Unchanged from the seeded override value.
    expect(employee.retirementDate.toISOString().slice(0, 10)).toBe('2052-07-12');
  });

  it('PUT writes a SETTING audit log entry', async () => {
    await request(app).put('/api/admin/settings/retirement-policy').send({ years: 68, months: 0 });

    const logs = await testPrisma.auditLog.findMany({ where: { entityType: 'SETTING' } });
    expect(logs).toHaveLength(1);
    expect(logs[0]?.action).toBe('UPDATE');
    expect(logs[0]?.entityId).toBe('retirementPolicy');
  });

  it('PUT with an unchanged policy recalculates nothing', async () => {
    await seedEmployee();
    // Default is 67/3; sending the same value must short-circuit the recalc.
    const res = await request(app)
      .put('/api/admin/settings/retirement-policy')
      .send({ years: 67, months: 3 });

    expect(res.status).toBe(200);
    expect(res.body.data.recalculatedEmployees).toBe(0);
    const employee = await testPrisma.employee.findUniqueOrThrow({ where: { employeeNumber: 1001 } });
    expect(employee.retirementDate.toISOString().slice(0, 10)).toBe('2052-07-12');
  });

  it('PUT rejects out-of-range values with a 400', async () => {
    const res = await request(app)
      .put('/api/admin/settings/retirement-policy')
      .send({ years: 67, months: 12 });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('new employees created after a policy change use the new policy', async () => {
    await request(app).put('/api/admin/settings/retirement-policy').send({ years: 68, months: 0 });
    const department = await testPrisma.department.create({
      data: { name: 'Biblioteca', normalizedName: 'biblioteca' },
    });

    const res = await request(app)
      .post('/api/admin/employees')
      .send({
        employeeNumber: 2002,
        firstName: 'Marco',
        lastName: 'Bianchi',
        departmentId: department.id,
        birthDate: '1985-04-12',
        hireDate: '2020-01-01',
        fte: 1,
        usaCategory: 'EXEMPT',
        contractType: 'INDETERMINATO',
        tfr: 'I_TATTI',
        status: 'ATTIVO',
      });

    expect(res.status).toBe(201);
    // Calculated with the new 68y0m policy, not the 67y3m default.
    expect(res.body.data.retirementDate).toBe('2053-04-12');
  });

  it('preserves existing TFR when an employee update omits the field', async () => {
    const employee = await seedEmployee({ tfr: 'FONDO_PENSIONE' });

    const res = await request(app)
      .put(`/api/admin/employees/${employee.id}`)
      .send({
        employeeNumber: 1001,
        firstName: 'Giulia',
        lastName: 'Rossi',
        departmentId: employee.departmentId,
        birthDate: '1985-04-12',
        hireDate: '2015-09-01',
        terminationDate: null,
        retirementDate: null,
        fte: 1,
        usaCategory: 'EXEMPT',
        contractType: 'INDETERMINATO',
        status: 'ATTIVO',
      });

    expect(res.status).toBe(200);
    expect(res.body.data.tfr).toBe('FONDO_PENSIONE');

    const updated = await testPrisma.employee.findUniqueOrThrow({ where: { employeeNumber: 1001 } });
    expect(updated.tfr).toBe('FONDO_PENSIONE');
  });

  it('re-importing an exported calculated date does not freeze it as an override', async () => {
    // Export → change policy → re-import. The exported row carries the OLD
    // calculated date with "Retirement Date Confirmed" = false. After the
    // policy change, the re-import must recalculate (not freeze the stale date).
    await seedEmployee(); // born 1985-04-12, default retirement 2052-07-12
    const department = await testPrisma.department.findFirstOrThrow();

    await request(app).put('/api/admin/settings/retirement-policy').send({ years: 68, months: 0 });

    // A CSV shaped like an export: includes the (now-stale) old date + the
    // confirmed=false flag.
    const csv = [
      'Employee Number,First Name,Last Name,Department,Birth Date,Hire Date,FTE,USA Category,Contract Type,Status,Retirement Date,Retirement Date Confirmed',
      `1001,Giulia,Rossi,${department.name},1985-04-12,2015-09-01,1,Exempt,Indeterminato,Attivo,2052-07-12,false`,
    ].join('\n');

    const preview = await request(app)
      .post('/api/admin/imports/preview')
      .attach('file', Buffer.from(csv), { filename: 'employees.csv', contentType: 'text/csv' });
    expect(preview.status).toBe(201);
    const rowNumbers = preview.body.data.rows.filter((r: { errors: string[] }) => r.errors.length === 0).map((r: { rowNumber: number }) => r.rowNumber);

    const commit = await request(app)
      .post(`/api/admin/imports/${preview.body.data.batchId}/commit`)
      .send({ selectedRows: rowNumbers });
    expect(commit.status).toBe(200);

    const employee = await testPrisma.employee.findUniqueOrThrow({ where: { employeeNumber: 1001 } });
    // Recalculated against the new 68y0m policy, not frozen at the imported date.
    expect(employee.retirementDate.toISOString().slice(0, 10)).toBe('2053-04-12');
    expect(employee.retirementDateOverridden).toBe(false);
  });

  it('honors an imported confirmed retirement date instead of recalculating', async () => {
    await seedEmployee();
    const department = await testPrisma.department.findFirstOrThrow();

    const csv = [
      'Employee Number,First Name,Last Name,Department,Birth Date,Hire Date,FTE,USA Category,Contract Type,Status,Retirement Date,Retirement Date Confirmed',
      `1001,Giulia,Rossi,${department.name},1985-04-12,2015-09-01,1,Exempt,Indeterminato,Attivo,2060-01-01,true`,
    ].join('\n');

    const preview = await request(app)
      .post('/api/admin/imports/preview')
      .attach('file', Buffer.from(csv), { filename: 'employees.csv', contentType: 'text/csv' });
    const rowNumbers = preview.body.data.rows.filter((r: { errors: string[] }) => r.errors.length === 0).map((r: { rowNumber: number }) => r.rowNumber);
    await request(app)
      .post(`/api/admin/imports/${preview.body.data.batchId}/commit`)
      .send({ selectedRows: rowNumbers });

    const employee = await testPrisma.employee.findUniqueOrThrow({ where: { employeeNumber: 1001 } });
    expect(employee.retirementDate.toISOString().slice(0, 10)).toBe('2060-01-01');
    expect(employee.retirementDateOverridden).toBe(true);
  });

  it('preserves existing TFR when an import update omits the TFR column', async () => {
    await seedEmployee({ tfr: 'FONDO_PENSIONE' });
    const department = await testPrisma.department.findFirstOrThrow();

    const csv = [
      'Employee Number,First Name,Last Name,Department,Birth Date,Hire Date,FTE,USA Category,Contract Type,Status',
      `1001,Giulia,Rossi,${department.name},1985-04-12,2015-09-01,1,Exempt,Indeterminato,Attivo`,
    ].join('\n');

    const preview = await request(app)
      .post('/api/admin/imports/preview')
      .attach('file', Buffer.from(csv), { filename: 'employees.csv', contentType: 'text/csv' });
    expect(preview.status).toBe(201);
    expect(preview.body.data.rows[0].normalized).not.toHaveProperty('tfr');

    const commit = await request(app)
      .post(`/api/admin/imports/${preview.body.data.batchId}/commit`)
      .send({ selectedRows: [2] });
    expect(commit.status).toBe(200);

    const employee = await testPrisma.employee.findUniqueOrThrow({ where: { employeeNumber: 1001 } });
    expect(employee.tfr).toBe('FONDO_PENSIONE');
  });

  it('imports employees from an Excel workbook', async () => {
    const department = await testPrisma.department.create({
      data: { name: 'Biblioteca', normalizedName: 'biblioteca' },
    });
    const workbook = await excelBuffer([
      [
        'Employee Number',
        'First Name',
        'Last Name',
        'Department',
        'Birth Date',
        'Hire Date',
        'FTE',
        'USA Category',
        'Contract Type',
        'TFR',
        'Status',
      ],
      [3003, 'Laura', 'Neri', department.name, '12/04/1985', '01/09/2020', 1, 'Exempt', 'Indeterminato', 'Fondo Pensione', 'Attivo'],
    ]);

    const preview = await request(app)
      .post('/api/admin/imports/preview')
      .attach('file', workbook, {
        filename: 'employees.xlsx',
        contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      });

    expect(preview.status).toBe(201);
    expect(preview.body.data.rows[0].errors).toEqual([]);
    expect(preview.body.data.rows[0].normalized.tfr).toBe('FONDO_PENSIONE');

    const commit = await request(app)
      .post(`/api/admin/imports/${preview.body.data.batchId}/commit`)
      .send({ selectedRows: [2] });
    expect(commit.status).toBe(200);

    const employee = await testPrisma.employee.findUniqueOrThrow({ where: { employeeNumber: 3003 } });
    expect(employee.birthDate.toISOString().slice(0, 10)).toBe('1985-04-12');
    expect(employee.tfr).toBe('FONDO_PENSIONE');
  });
});

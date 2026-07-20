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

async function seedApprovers(departmentId?: string) {
  const department =
    departmentId ??
    (
      await testPrisma.department.create({
        data: { name: 'Direzione', normalizedName: `direzione-${crypto.randomUUID()}` },
      })
    ).id;
  const responsabile = await testPrisma.employee.create({
    data: {
      employeeNumber: 9001,
      firstName: 'Responsabile',
      lastName: 'Uno',
      departmentId: department,
      birthDate: new Date('1980-01-01T00:00:00.000Z'),
      hireDate: new Date('2010-01-01T00:00:00.000Z'),
      retirementDate: new Date('2047-04-01T00:00:00.000Z'),
      fte: 1,
      usaCategory: 'EXEMPT',
      contractType: 'INDETERMINATO',
      status: 'ATTIVO',
    },
  });
  const substitute = await testPrisma.employee.create({
    data: {
      employeeNumber: 9002,
      firstName: 'Sostituto',
      lastName: 'Due',
      departmentId: department,
      birthDate: new Date('1981-01-01T00:00:00.000Z'),
      hireDate: new Date('2011-01-01T00:00:00.000Z'),
      retirementDate: new Date('2048-04-01T00:00:00.000Z'),
      fte: 1,
      usaCategory: 'EXEMPT',
      contractType: 'INDETERMINATO',
      status: 'ATTIVO',
      canBeSubstituteResponsible: true,
    },
  });
  return { responsabile, substitute };
}

function approvalRoleIds(approvers: Awaited<ReturnType<typeof seedApprovers>>) {
  return {
    preApproverIds: [],
    responsabileIds: [approvers.responsabile.id],
    substituteResponsabileIds: [approvers.substitute.id],
  };
}

async function seedEmployeeUsingApprovers(departmentId: string, approvers: Awaited<ReturnType<typeof seedApprovers>>) {
  const employee = await testPrisma.employee.create({
    data: {
      employeeNumber: 2002,
      firstName: 'Marco',
      lastName: 'Bianchi',
      departmentId,
      birthDate: new Date('1985-04-12T00:00:00.000Z'),
      hireDate: new Date('2020-01-01T00:00:00.000Z'),
      retirementDate: new Date('2052-07-12T00:00:00.000Z'),
      fte: 1,
      usaCategory: 'EXEMPT',
      contractType: 'INDETERMINATO',
      status: 'ATTIVO',
    },
  });
  await testPrisma.employeeApprovalAssignment.createMany({
    data: [
      { employeeId: employee.id, approverId: approvers.responsabile.id, role: 'RESPONSABILE' },
      { employeeId: employee.id, approverId: approvers.substitute.id, role: 'SUBSTITUTE_RESPONSABILE' },
    ],
  });
  return employee;
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
    const approvers = await seedApprovers(department.id);

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
        approvalRoleIds: approvalRoleIds(approvers),
      });

    expect(res.status).toBe(201);
    // Calculated with the new 68y0m policy, not the 67y3m default.
    expect(res.body.data.retirementDate).toBe('2053-04-12');
  });

  it('rejects an active employee without required approvers', async () => {
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

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('RESPONSABILE_REQUIRED');
  });

  it('rejects a substitute approver without the substitute eligibility flag', async () => {
    const department = await testPrisma.department.create({
      data: { name: 'Biblioteca', normalizedName: 'biblioteca' },
    });
    const approvers = await seedApprovers(department.id);

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
        approvalRoleIds: {
          preApproverIds: [],
          responsabileIds: [approvers.responsabile.id],
          substituteResponsabileIds: [approvers.responsabile.id],
        },
      });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('APPROVER_NOT_SUBSTITUTE_ELIGIBLE');
  });

  it('creates a valid employee with approval roles and weekly hours', async () => {
    const department = await testPrisma.department.create({
      data: { name: 'Biblioteca', normalizedName: 'biblioteca' },
    });
    const approvers = await seedApprovers(department.id);

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
        weeklySchedule: { monday: '7,30', tuesday: '7,30', wednesday: '7,30', thursday: '7,30', friday: '7,30' },
        approvalRoleIds: approvalRoleIds(approvers),
      });

    expect(res.status).toBe(201);
    expect(res.body.data.weeklySchedule.total.display).toBe('37,30');
    expect(res.body.data.approvalRoles.responsabili).toHaveLength(1);
    expect(res.body.data.approvalRoles.substituteResponsabili).toHaveLength(1);
  });

  it('rejects inactivating an employee who is still assigned as an approver', async () => {
    const department = await testPrisma.department.create({
      data: { name: 'Biblioteca', normalizedName: 'biblioteca' },
    });
    const approvers = await seedApprovers(department.id);
    await seedEmployeeUsingApprovers(department.id, approvers);

    const res = await request(app)
      .put(`/api/admin/employees/${approvers.responsabile.id}`)
      .send({
        employeeNumber: approvers.responsabile.employeeNumber,
        firstName: approvers.responsabile.firstName,
        lastName: approvers.responsabile.lastName,
        departmentId: department.id,
        birthDate: '1980-01-01',
        hireDate: '2010-01-01',
        terminationDate: '2026-01-01',
        retirementDate: null,
        fte: 1,
        usaCategory: 'EXEMPT',
        contractType: 'INDETERMINATO',
        status: 'CESSATO',
      });

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('APPROVER_IN_USE');
  });

  it('rejects disabling substitute eligibility while the employee is assigned as substitute', async () => {
    const department = await testPrisma.department.create({
      data: { name: 'Biblioteca', normalizedName: 'biblioteca' },
    });
    const approvers = await seedApprovers(department.id);
    await seedEmployeeUsingApprovers(department.id, approvers);
    const backupSubstitute = await testPrisma.employee.create({
      data: {
        employeeNumber: 9003,
        firstName: 'Sostituto',
        lastName: 'Tre',
        departmentId: department.id,
        birthDate: new Date('1982-01-01T00:00:00.000Z'),
        hireDate: new Date('2012-01-01T00:00:00.000Z'),
        retirementDate: new Date('2049-04-01T00:00:00.000Z'),
        fte: 1,
        usaCategory: 'EXEMPT',
        contractType: 'INDETERMINATO',
        status: 'ATTIVO',
        canBeSubstituteResponsible: true,
      },
    });

    const res = await request(app)
      .put(`/api/admin/employees/${approvers.substitute.id}`)
      .send({
        employeeNumber: approvers.substitute.employeeNumber,
        firstName: approvers.substitute.firstName,
        lastName: approvers.substitute.lastName,
        departmentId: department.id,
        birthDate: '1981-01-01',
        hireDate: '2011-01-01',
        terminationDate: null,
        retirementDate: null,
        fte: 1,
        usaCategory: 'EXEMPT',
        contractType: 'INDETERMINATO',
        status: 'ATTIVO',
        canBeSubstituteResponsible: false,
        approvalRoleIds: {
          preApproverIds: [],
          responsabileIds: [approvers.responsabile.id],
          substituteResponsabileIds: [backupSubstitute.id],
        },
      });

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('SUBSTITUTE_APPROVER_IN_USE');
  });

  it('rejects deleting an employee who is still assigned as an approver', async () => {
    const department = await testPrisma.department.create({
      data: { name: 'Biblioteca', normalizedName: 'biblioteca' },
    });
    const approvers = await seedApprovers(department.id);
    await seedEmployeeUsingApprovers(department.id, approvers);

    const res = await request(app).delete(`/api/admin/employees/${approvers.responsabile.id}`);

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('APPROVER_IN_USE');
  });

  it('preserves existing TFR when an employee update omits the field', async () => {
    const employee = await seedEmployee({ tfr: 'FONDO_PENSIONE' });
    const approvers = await seedApprovers(employee.departmentId);

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
        approvalRoleIds: approvalRoleIds(approvers),
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
    const approvers = await seedApprovers(department.id);

    await request(app).put('/api/admin/settings/retirement-policy').send({ years: 68, months: 0 });

    // A CSV shaped like an export: includes the (now-stale) old date + the
    // confirmed=false flag.
    const csv = [
      'Employee Number,First Name,Last Name,Department,Birth Date,Hire Date,FTE,USA Category,Contract Type,Status,Retirement Date,Retirement Date Confirmed,Responsabile,Sostituto-Responsabile,LU,MA,ME,GIO,VE',
      `1001,Giulia,Rossi,${department.name},1985-04-12,2015-09-01,1,Exempt,Indeterminato,Attivo,2052-07-12,false,${approvers.responsabile.employeeNumber},${approvers.substitute.employeeNumber},"7,30","7,30","7,30","7,30","7,30"`,
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
    const approvers = await seedApprovers(department.id);

    const csv = [
      'Employee Number,First Name,Last Name,Department,Birth Date,Hire Date,FTE,USA Category,Contract Type,Status,Retirement Date,Retirement Date Confirmed,Responsabile,Sostituto-Responsabile',
      `1001,Giulia,Rossi,${department.name},1985-04-12,2015-09-01,1,Exempt,Indeterminato,Attivo,2060-01-01,true,${approvers.responsabile.employeeNumber},${approvers.substitute.employeeNumber}`,
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
    const approvers = await seedApprovers(department.id);

    const csv = [
      'Employee Number,First Name,Last Name,Department,Birth Date,Hire Date,FTE,USA Category,Contract Type,Status,Responsabile,Sostituto-Responsabile',
      `1001,Giulia,Rossi,${department.name},1985-04-12,2015-09-01,1,Exempt,Indeterminato,Attivo,${approvers.responsabile.employeeNumber},${approvers.substitute.employeeNumber}`,
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
    const approvers = await seedApprovers(department.id);
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
        'Responsabile',
        'Sostituto-Responsabile',
        'LU',
        'MA',
        'ME',
        'GIO',
        'VE',
      ],
      [
        3003,
        'Laura',
        'Neri',
        department.name,
        '12/04/1985',
        '01/09/2020',
        1,
        'Exempt',
        'Indeterminato',
        'Fondo Pensione',
        'Attivo',
        String(approvers.responsabile.employeeNumber),
        String(approvers.substitute.employeeNumber),
        '7,30',
        '7,30',
        '7,30',
        '7,30',
        '7,30',
      ],
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
    expect(employee.mondayMinutes).toBe(450);
  });

  it('defaults blank weekday columns to full time instead of rejecting the row', async () => {
    const department = await testPrisma.department.create({
      data: { name: 'Biblioteca', normalizedName: 'biblioteca' },
    });
    const approvers = await seedApprovers(department.id);
    // Only LU is filled; the other weekday columns are present but blank.
    const csv = [
      'Employee Number,First Name,Last Name,Department,Birth Date,Hire Date,FTE,USA Category,Contract Type,Status,Responsabile,Sostituto-Responsabile,LU,MA,ME,GIO,VE',
      `6001,Ada,Uno,${department.name},1985-04-12,2020-01-01,1,Exempt,Indeterminato,Attivo,${approvers.responsabile.employeeNumber},${approvers.substitute.employeeNumber},"6,00",,,,`,
    ].join('\n');

    const preview = await request(app)
      .post('/api/admin/imports/preview')
      .attach('file', Buffer.from(csv), { filename: 'employees.csv', contentType: 'text/csv' });

    expect(preview.status).toBe(201);
    const row = (preview.body.data.rows as Array<{ rowNumber: number; errors: string[]; selected: boolean }>).find(
      (r) => r.rowNumber === 2
    );
    expect(row?.errors).toEqual([]);
    expect(row?.selected).toBe(true);

    const commit = await request(app)
      .post(`/api/admin/imports/${preview.body.data.batchId}/commit`)
      .send({ selectedRows: [2] });
    expect(commit.status).toBe(200);
    const employee = await testPrisma.employee.findUniqueOrThrow({ where: { employeeNumber: 6001 } });
    expect(employee.mondayMinutes).toBe(360);
    expect(employee.tuesdayMinutes).toBe(450);
    expect(employee.fridayMinutes).toBe(450);
  });

  it('imports approval roles that reference employees from the same file', async () => {
    const department = await testPrisma.department.create({
      data: { name: 'Biblioteca', normalizedName: 'biblioteca' },
    });
    const csv = [
      'Employee Number,First Name,Last Name,Department,Birth Date,Hire Date,FTE,USA Category,Contract Type,TFR,Status,Sostituto Abilitato,Responsabile,Sostituto-Responsabile',
      `4001,Ada,Uno,${department.name},1985-04-12,2020-01-01,1,Exempt,Indeterminato,I Tatti,Attivo,true,4002,4003`,
      `4002,Bruno,Due,${department.name},1986-04-12,2020-01-01,1,Exempt,Indeterminato,I Tatti,Attivo,true,4001,4003`,
      `4003,Carla,Tre,${department.name},1987-04-12,2020-01-01,1,Exempt,Indeterminato,I Tatti,Attivo,true,4001,4002`,
    ].join('\n');

    const preview = await request(app)
      .post('/api/admin/imports/preview')
      .attach('file', Buffer.from(csv), { filename: 'employees.csv', contentType: 'text/csv' });

    expect(preview.status).toBe(201);
    expect(preview.body.data.rows.every((row: { errors: string[] }) => row.errors.length === 0)).toBe(true);

    const commit = await request(app)
      .post(`/api/admin/imports/${preview.body.data.batchId}/commit`)
      .send({ selectedRows: [2, 3, 4] });

    expect(commit.status).toBe(200);
    const ada = await testPrisma.employee.findUniqueOrThrow({ where: { employeeNumber: 4001 } });
    const assignments = await testPrisma.employeeApprovalAssignment.findMany({
      where: { employeeId: ada.id },
    });
    expect(assignments).toHaveLength(2);
  });

  it('marks rows invalid when they reference a new approver row that is not importable', async () => {
    const department = await testPrisma.department.create({
      data: { name: 'Biblioteca', normalizedName: 'biblioteca' },
    });
    const csv = [
      'Employee Number,First Name,Last Name,Department,Birth Date,Hire Date,FTE,USA Category,Contract Type,TFR,Status,Sostituto Abilitato,Responsabile,Sostituto-Responsabile',
      `4101,Ada,Uno,${department.name},1985-04-12,2020-01-01,1,Exempt,Indeterminato,I Tatti,Attivo,true,4102,4102`,
      `4102,Bruno,Due,${department.name},1986-04-12,2020-01-01,1,Exempt,Indeterminato,I Tatti,Attivo,true,,`,
    ].join('\n');

    const preview = await request(app)
      .post('/api/admin/imports/preview')
      .attach('file', Buffer.from(csv), { filename: 'employees.csv', contentType: 'text/csv' });

    expect(preview.status).toBe(201);
    const rows = preview.body.data.rows as Array<{ rowNumber: number; errors: string[]; selected: boolean }>;
    expect(rows.find((row) => row.rowNumber === 2)?.selected).toBe(false);
    expect(rows.find((row) => row.rowNumber === 2)?.errors).toContain(
      'Approver Employee Number 4102 is not a valid row in this import.'
    );
    expect(rows.find((row) => row.rowNumber === 3)?.errors).toContain(
      'Active employees require at least one Responsabile.'
    );
  });

  it('rejects a reference to an existing employee whose own (invalid) row is deselected', async () => {
    const department = await testPrisma.department.create({
      data: { name: 'Biblioteca', normalizedName: 'biblioteca' },
    });
    const approvers = await seedApprovers(department.id);
    // 9001 (the existing Responsabile) is also a subject row in this file, but
    // that row is invalid (blank first name) so it won't be applied. A second
    // row references 9001 — it must NOT silently pass against the stale DB copy.
    const csv = [
      'Employee Number,First Name,Last Name,Department,Birth Date,Hire Date,FTE,USA Category,Contract Type,TFR,Status,Sostituto Abilitato,Responsabile,Sostituto-Responsabile',
      `${approvers.responsabile.employeeNumber},,Uno,${department.name},1980-01-01,2010-01-01,1,Exempt,Indeterminato,I Tatti,Attivo,false,${approvers.substitute.employeeNumber},${approvers.substitute.employeeNumber}`,
      `5001,Marco,Bianchi,${department.name},1985-04-12,2020-01-01,1,Exempt,Indeterminato,I Tatti,Attivo,false,${approvers.responsabile.employeeNumber},${approvers.substitute.employeeNumber}`,
    ].join('\n');

    const preview = await request(app)
      .post('/api/admin/imports/preview')
      .attach('file', Buffer.from(csv), { filename: 'employees.csv', contentType: 'text/csv' });

    expect(preview.status).toBe(201);
    const rows = preview.body.data.rows as Array<{ rowNumber: number; errors: string[]; selected: boolean }>;
    expect(rows.find((row) => row.rowNumber === 2)?.selected).toBe(false);
    expect(rows.find((row) => row.rowNumber === 3)?.selected).toBe(false);
    expect(rows.find((row) => row.rowNumber === 3)?.errors).toContain(
      `Approver Employee Number ${approvers.responsabile.employeeNumber} is not a valid row in this import.`
    );
  });

  it('flags at preview a row that inactivates an approver still used elsewhere', async () => {
    const department = await testPrisma.department.create({
      data: { name: 'Biblioteca', normalizedName: 'biblioteca' },
    });
    const approvers = await seedApprovers(department.id);
    await seedEmployeeUsingApprovers(department.id, approvers);
    // Out-of-file employee 2002 references 9001 as Responsabile. An import that
    // inactivates 9001 must be flagged at preview, not blow up the commit.
    const csv = [
      'Employee Number,First Name,Last Name,Department,Birth Date,Hire Date,Termination Date,FTE,USA Category,Contract Type,TFR,Status',
      `${approvers.responsabile.employeeNumber},Responsabile,Uno,${department.name},1980-01-01,2010-01-01,2026-01-01,1,Exempt,Indeterminato,I Tatti,Cessato`,
    ].join('\n');

    const preview = await request(app)
      .post('/api/admin/imports/preview')
      .attach('file', Buffer.from(csv), { filename: 'employees.csv', contentType: 'text/csv' });

    expect(preview.status).toBe(201);
    const row = (preview.body.data.rows as Array<{ rowNumber: number; errors: string[]; selected: boolean }>).find(
      (r) => r.rowNumber === 2
    );
    expect(row?.selected).toBe(false);
    expect(row?.errors.join(' ')).toContain('cannot be made inactive');
  });

  it('allows a field-only re-import of an employee whose assigned approver later went inactive', async () => {
    const department = await testPrisma.department.create({
      data: { name: 'Biblioteca', normalizedName: 'biblioteca' },
    });
    const approvers = await seedApprovers(department.id);
    const employee = await seedEmployeeUsingApprovers(department.id, approvers);
    // The Responsabile becomes inactive directly in the DB after assignment.
    await testPrisma.employee.update({
      where: { id: approvers.responsabile.id },
      data: { status: 'CESSATO' },
    });

    // A re-import of the dependent employee that omits role columns must succeed:
    // it doesn't touch approvals, so the now-inactive grandfathered approver
    // must not block it.
    const csv = [
      'Employee Number,First Name,Last Name,Department,Birth Date,Hire Date,FTE,USA Category,Contract Type,Status',
      `${employee.employeeNumber},Marco,Bianchi,${department.name},1985-04-12,2020-01-02,1,Exempt,Indeterminato,Attivo`,
    ].join('\n');

    const preview = await request(app)
      .post('/api/admin/imports/preview')
      .attach('file', Buffer.from(csv), { filename: 'employees.csv', contentType: 'text/csv' });
    expect(preview.status).toBe(201);
    const row = (preview.body.data.rows as Array<{ rowNumber: number; selected: boolean }>).find(
      (r) => r.rowNumber === 2
    );
    expect(row?.selected).toBe(true);

    const commit = await request(app)
      .post(`/api/admin/imports/${preview.body.data.batchId}/commit`)
      .send({ selectedRows: [2] });
    expect(commit.status).toBe(200);
    const updated = await testPrisma.employee.findUniqueOrThrow({
      where: { employeeNumber: employee.employeeNumber },
    });
    expect(updated.hireDate?.toISOString().slice(0, 10)).toBe('2020-01-02');
  });

  it('grandfathering is role-specific: an existing approver added to a new role is re-validated', async () => {
    const department = await testPrisma.department.create({
      data: { name: 'Biblioteca', normalizedName: 'biblioteca' },
    });
    const approvers = await seedApprovers(department.id);
    // 2002 already uses 9001 as Responsabile and 9002 as Sostituto-Responsabile.
    const employee = await seedEmployeeUsingApprovers(department.id, approvers);

    // Now also assign 9001 (the Responsabile — NOT substitute-eligible) as a
    // Sostituto-Responsabile. Being grandfathered in the Responsabile role must
    // not wave through this brand-new substitute assignment.
    const res = await request(app)
      .put(`/api/admin/employees/${employee.id}`)
      .send({
        employeeNumber: employee.employeeNumber,
        firstName: employee.firstName,
        lastName: employee.lastName,
        departmentId: department.id,
        birthDate: '1985-04-12',
        hireDate: '2020-01-01',
        fte: 1,
        usaCategory: 'EXEMPT',
        contractType: 'INDETERMINATO',
        status: 'ATTIVO',
        approvalRoleIds: {
          preApproverIds: [],
          responsabileIds: [approvers.responsabile.id],
          substituteResponsabileIds: [approvers.substitute.id, approvers.responsabile.id],
        },
      });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('APPROVER_NOT_SUBSTITUTE_ELIGIBLE');
  });

  it('rejects an import file that exceeds the row cap', async () => {
    const header =
      'Employee Number,First Name,Last Name,Department,Birth Date,FTE,USA Category,Contract Type,Status';
    const lines = [header];
    for (let i = 0; i < 2001; i += 1) {
      lines.push(`${i + 1},A,B,Amministrazione,1990-01-01,1,Exempt,Indeterminato,Da Assumere`);
    }

    const res = await request(app)
      .post('/api/admin/imports/preview')
      .attach('file', Buffer.from(lines.join('\n')), { filename: 'big.csv', contentType: 'text/csv' });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('IMPORT_TOO_MANY_ROWS');
  });

  it('maps a duplicate Employee Number to a 409 rather than a 500', async () => {
    const employee = await seedEmployee();

    const res = await request(app)
      .post('/api/admin/employees')
      .send({
        employeeNumber: employee.employeeNumber,
        firstName: 'Duplicate',
        lastName: 'Person',
        departmentId: employee.departmentId,
        birthDate: '1990-01-01',
        fte: 1,
        usaCategory: 'EXEMPT',
        contractType: 'INDETERMINATO',
        // DA_ASSUMERE needs no approvers, so the create reaches the unique index.
        status: 'DA_ASSUMERE',
      });

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('DUPLICATE_VALUE');
  });

  it('preserves a confirmed retirement date when the import omits the retirement columns', async () => {
    const department = await testPrisma.department.create({
      data: { name: 'Amministrazione', normalizedName: 'amministrazione' },
    });
    await testPrisma.employee.create({
      data: {
        employeeNumber: 4004,
        firstName: 'Anna',
        lastName: 'Verdi',
        departmentId: department.id,
        birthDate: new Date('1990-05-05T00:00:00.000Z'),
        retirementDate: new Date('2050-01-01T00:00:00.000Z'),
        retirementDateOverridden: true,
        fte: 1,
        usaCategory: 'EXEMPT',
        contractType: 'INDETERMINATO',
        status: 'DA_ASSUMERE',
      },
    });

    // A partial re-import with no "Retirement Date"/"Confirmed" columns must not
    // wipe the confirmed government date back to a calculated one.
    const csv = [
      'Employee Number,First Name,Last Name,Department,Birth Date,FTE,USA Category,Contract Type,Status',
      `4004,Anna,Verdi,${department.name},1990-05-05,1,Exempt,Indeterminato,Da Assumere`,
    ].join('\n');

    const preview = await request(app)
      .post('/api/admin/imports/preview')
      .attach('file', Buffer.from(csv), { filename: 'employees.csv', contentType: 'text/csv' });
    expect(preview.status).toBe(201);
    const row = (preview.body.data.rows as Array<{ rowNumber: number; selected: boolean }>).find(
      (r) => r.rowNumber === 2
    );
    expect(row?.selected).toBe(true);

    const commit = await request(app)
      .post(`/api/admin/imports/${preview.body.data.batchId}/commit`)
      .send({ selectedRows: [2] });
    expect(commit.status).toBe(200);

    const updated = await testPrisma.employee.findUniqueOrThrow({ where: { employeeNumber: 4004 } });
    expect(updated.retirementDateOverridden).toBe(true);
    expect(updated.retirementDate.toISOString().slice(0, 10)).toBe('2050-01-01');
  });
});

import { beforeEach, describe, expect, it } from 'vitest';
import ExcelJS from 'exceljs';
import request from 'supertest';
import app from '../app.js';
import { buildImportTemplate } from '../services/import-template.js';
import { isDbReachable, resetDb, testPrisma } from './helpers/db.js';

const dbUp = await isDbReachable();
if (!dbUp) {
  // eslint-disable-next-line no-console
  console.warn('[import-roundtrip] DATABASE_URL unreachable — skipping integration tests.');
}

/**
 * The template as an operator would hand it back: untouched apart from the
 * department, which has to name one that exists in this database.
 *
 * This is the test that matters most about the template. A workbook whose headings
 * the importer does not recognise produces a preview of blank rows and a pile of
 * validation errors — and it would look like the operator's mistake. The example
 * rows are left exactly as shipped, approver columns included, so the file is only
 * valid if the examples themselves obey the rules.
 */
async function templateAsFilledFile(departmentName: string): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  // exceljs types `load` against its own ArrayBuffer-shaped Buffer, not Node's —
  // same cast parseUploadRecords makes in routes/admin.ts.
  const template = (await buildImportTemplate()) as unknown as Parameters<typeof workbook.xlsx.load>[0];
  await workbook.xlsx.load(template);
  const sheet = workbook.getWorksheet('Dipendenti')!;

  const headers = (sheet.getRow(1).values as unknown[]).slice(1).map((value) => String(value));
  const departmentColumn = headers.indexOf('Department') + 1;

  for (const rowNumber of [2, 3]) {
    sheet.getRow(rowNumber).getCell(departmentColumn).value = departmentName;
  }

  return Buffer.from((await workbook.xlsx.writeBuffer()) as ArrayBuffer);
}

describe.skipIf(!dbUp)('a file filled in from the template', () => {
  beforeEach(async () => {
    await resetDb();
  });

  it('previews without a single error, and commits', async () => {
    const department = await testPrisma.department.create({
      data: { name: 'Biblioteca', normalizedName: 'biblioteca' },
    });
    const file = await templateAsFilledFile(department.name);

    const preview = await request(app)
      .post('/api/admin/imports/preview')
      .attach('file', file, {
        filename: 'ed-modello-dipendenti.xlsx',
        contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      });

    expect(preview.status).toBe(201);
    const rows = preview.body.data.rows as Array<{
      rowNumber: number;
      errors: string[];
      proposedAction: string | null;
      selected: boolean;
    }>;

    // Two example rows, both readable, both new, both ticked.
    expect(rows).toHaveLength(2);
    expect(rows.flatMap((row) => row.errors)).toEqual([]);
    expect(rows.map((row) => row.proposedAction)).toEqual(['CREATE', 'CREATE']);
    expect(rows.every((row) => row.selected)).toBe(true);

    const commit = await request(app)
      .post(`/api/admin/imports/${preview.body.data.batchId}/commit`)
      .send({ selectedRows: rows.map((row) => row.rowNumber) });

    expect(commit.status).toBe(200);
    expect(commit.body.data.committed).toHaveLength(2);

    // The values the template's examples demonstrate arrive as the examples imply:
    // the sessantesimi parse, the FTE comma-decimal parses, the dates land.
    const giulia = await testPrisma.employee.findUniqueOrThrow({ where: { employeeNumber: 1042 } });
    expect(giulia.firstName).toBe('Giulia');
    expect(giulia.status).toBe('ATTIVO');
    expect(giulia.birthDate.toISOString().slice(0, 10)).toBe('1985-04-12');
    expect(Number(giulia.fte)).toBe(1);

    const marco = await testPrisma.employee.findUniqueOrThrow({ where: { employeeNumber: 1043 } });
    // "0,8" in the example — a comma decimal, which is how an Italian keyboard
    // writes it and the thing most likely to be rejected by a naive parser.
    expect(Number(marco.fte)).toBe(0.8);
    // "4,00" on Friday is four hours, not four hundred minutes and not 4.0 hours
    // written in decimal.
    expect(marco.fridayMinutes).toBe(240);
    expect(marco.mondayMinutes).toBe(450);
    expect(marco.terminationDate?.toISOString().slice(0, 10)).toBe('2027-06-30');
  });

  it('is served as a downloadable workbook', async () => {
    const res = await request(app).get('/api/admin/imports/template').responseType('blob');

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('spreadsheetml.sheet');
    expect(res.headers['content-disposition']).toContain('ed-modello-dipendenti.xlsx');
    // A real xlsx is a zip; "PK" is its first two bytes.
    expect(Buffer.from(res.body).subarray(0, 2).toString()).toBe('PK');
  });
});

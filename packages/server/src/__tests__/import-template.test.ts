import { describe, expect, it } from 'vitest';
import ExcelJS from 'exceljs';
import { buildImportTemplate, IMPORT_TEMPLATE_COLUMNS } from '../services/import-template.js';
import { normalizeHeader } from '../services/csv.js';

async function openTemplate() {
  const workbook = new ExcelJS.Workbook();
  // exceljs types `load` against its own ArrayBuffer-shaped Buffer, not Node's —
  // same cast parseUploadRecords makes in routes/admin.ts.
  const template = (await buildImportTemplate()) as unknown as Parameters<typeof workbook.xlsx.load>[0];
  await workbook.xlsx.load(template);
  return workbook;
}

const headerRow = (sheet: ExcelJS.Worksheet) =>
  (sheet.getRow(1).values as unknown[]).slice(1).map((value) => String(value));

describe('the import template', () => {
  it('has a sheet to fill in and a sheet that explains it', async () => {
    const workbook = await openTemplate();
    expect(workbook.worksheets.map((sheet) => sheet.name)).toEqual(['Dipendenti', 'Istruzioni']);
  });

  it('uses the same headings the export writes, so a round trip needs no renaming', async () => {
    // The point of matching: export, edit in Excel, import back.
    const workbook = await openTemplate();
    const headers = headerRow(workbook.getWorksheet('Dipendenti')!);

    expect(headers).toEqual([
      'Employee Number',
      'First Name',
      'Last Name',
      'Work Email',
      'Preferred Language',
      'Department',
      'Birth Date',
      'Hire Date',
      'Termination Date',
      'Retirement Date',
      'Retirement Date Confirmed',
      'FTE',
      'USA Category',
      'Contract Type',
      'TFR',
      'Status',
      'Responsabile Abilitato',
      'Sostituto Abilitato',
      'Responsabile Pre-approvatore',
      'Responsabile',
      'Sostituto-Responsabile',
      'LU',
      'MA',
      'ME',
      'GIO',
      'VE',
    ]);
  });

  it('carries two example rows, so the shape is visible without reading anything', async () => {
    const workbook = await openTemplate();
    const sheet = workbook.getWorksheet('Dipendenti')!;

    // Header plus two examples.
    expect(sheet.rowCount).toBe(3);
    const first = (sheet.getRow(2).values as unknown[]).slice(1).map((value) => String(value ?? ''));
    expect(first[0]).toBe('1042');
    expect(first[1]).toBe('Giulia');
    // Sessantesimi, which is the format most likely to be got wrong.
    expect(first).toContain('7,30');
  });

  it('documents every column of the data sheet, and nothing that is not one', async () => {
    const workbook = await openTemplate();
    const dataHeaders = headerRow(workbook.getWorksheet('Dipendenti')!);
    const guide = workbook.getWorksheet('Istruzioni')!;

    const documented: string[] = [];
    guide.eachRow((row, rowNumber) => {
      if (rowNumber === 1) return;
      const label = String((row.values as unknown[])[1] ?? '');
      // Skip the heading row and the "how it works" preamble.
      if (label && label !== 'COME FUNZIONA') documented.push(label);
    });

    expect(documented).toEqual(dataHeaders);
  });

  it('says of every column whether it has to be filled, and what goes in it', async () => {
    const workbook = await openTemplate();
    const guide = workbook.getWorksheet('Istruzioni')!;

    const rows: Array<{ column: string; required: string; guidance: string }> = [];
    guide.eachRow((row, rowNumber) => {
      if (rowNumber === 1) return;
      const values = row.values as unknown[];
      const column = String(values[1] ?? '');
      if (!column || column === 'COME FUNZIONA') return;
      rows.push({ column, required: String(values[2] ?? ''), guidance: String(values[3] ?? '') });
    });

    for (const row of rows) {
      expect(['Sì', 'No', 'Dipende']).toContain(row.required);
      // Not an empty cell and not a one-word shrug.
      expect(row.guidance.length).toBeGreaterThan(15);
    }

    // The rules most likely to be got wrong are actually spelled out.
    const find = (column: string) => rows.find((row) => row.column === column)!;
    expect(find('Employee Number').required).toBe('Sì');
    expect(find('Employee Number').guidance).toMatch(/aggiornata/);
    expect(find('Department').guidance).toMatch(/esiste già/);
    expect(find('Status').guidance).toMatch(/Attivo.*Cessato.*Da Assumere/);
    expect(find('FTE').guidance).toMatch(/tempo pieno/);
    expect(find('LU').guidance).toMatch(/sessantesimi/);
    expect(find('Responsabile').guidance).toMatch(/matricola/);
    expect(find('Hire Date').required).toBe('Dipende');
    expect(find('TFR').required).toBe('No');
  });

  it('names the accepted values for every closed list', async () => {
    // A closed list the operator cannot guess is the fastest way to a rejected row.
    const guidance = (header: string) =>
      IMPORT_TEMPLATE_COLUMNS.find((column) => column.header === header)!.accepts;

    expect(guidance('Status')).toContain('Attivo');
    expect(guidance('USA Category')).toContain('Non Exempt');
    expect(guidance('Contract Type')).toContain('Collaboratore');
    expect(guidance('TFR')).toContain('Fondo Pensione');
    expect(guidance('Preferred Language')).toContain('EN');
  });

  it('writes headings the importer’s own alias lists recognise', async () => {
    // The importer matches on normalized headers; if the template drifted from
    // those, a file filled in from it would import as a sheet of blanks.
    const workbook = await openTemplate();
    const headers = headerRow(workbook.getWorksheet('Dipendenti')!).map(normalizeHeader);

    expect(headers).toContain('employee number');
    expect(headers).toContain('department');
    expect(headers).toContain('birth date');
    expect(headers).toContain('status');
    expect(headers).toContain('responsabile');
    expect(headers).toContain('lu');
  });
});

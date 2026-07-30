import ExcelJS from 'exceljs';

/**
 * The blank workbook the import dialog offers for download.
 *
 * Its headers are the same strings the *export* writes, which is not a coincidence:
 * that is what makes "export, edit in Excel, import back" work without anybody
 * renaming a column. The importer accepts Italian aliases for all of them too (see
 * the `readFirst` calls in routes/admin.ts), so a file typed from scratch in Italian
 * is read the same way.
 *
 * Every column carries its own documentation here rather than in a wiki page
 * nobody opens: the second sheet is generated from this list, so a rule and the
 * sentence describing it cannot drift apart.
 */
type TemplateColumn = {
  header: string;
  width: number;
  /** How the second sheet describes whether the cell has to be filled. */
  requirement: 'required' | 'optional' | 'conditional';
  /** Italian: when a conditional column becomes mandatory. */
  requirementNote?: string;
  /** Italian: the accepted format or the list of accepted values. */
  accepts: string;
  /** Two example rows, so the shape is visible without reading anything. */
  examples: [string, string];
};

export const IMPORT_TEMPLATE_COLUMNS: TemplateColumn[] = [
  {
    header: 'Employee Number',
    width: 18,
    requirement: 'required',
    accepts: 'Numero intero positivo. È la chiave: se il numero esiste già, la scheda viene aggiornata; se non esiste, viene creata.',
    examples: ['1042', '1043'],
  },
  {
    header: 'First Name',
    width: 18,
    requirement: 'required',
    accepts: 'Solo il nome proprio. Nome e cognome restano in due colonne separate, anche se ED li scrive insieme.',
    examples: ['Giulia', 'Marco'],
  },
  {
    header: 'Last Name',
    width: 18,
    requirement: 'required',
    accepts: 'Solo il cognome. È il campo su cui vengono ordinati gli elenchi.',
    examples: ['Rossi', 'Bianchi'],
  },
  {
    header: 'Work Email',
    width: 32,
    requirement: 'required',
    accepts: 'Indirizzo email. Deve essere univoco: due dipendenti non possono avere la stessa email.',
    examples: ['grossi@itatti.harvard.edu', 'mbianchi@itatti.harvard.edu'],
  },
  {
    header: 'Preferred Language',
    width: 20,
    requirement: 'optional',
    accepts: 'IT oppure EN (si accettano anche "Italiano" e "Inglese"). Se la cella è vuota, la lingua già registrata non viene toccata.',
    examples: ['IT', 'EN'],
  },
  {
    header: 'Department',
    width: 28,
    requirement: 'required',
    accepts: 'Il nome esatto di un dipartimento che esiste già. I dipartimenti non si creano da qui: aggiungili prima nella pagina Dipartimenti.',
    examples: ['Biblioteca', 'Administration/Finance'],
  },
  {
    header: 'Birth Date',
    width: 14,
    requirement: 'required',
    accepts: 'GG/MM/AAAA oppure AAAA-MM-GG. Vale per tutte le date di questo file.',
    examples: ['12/04/1985', '1990-11-20'],
  },
  {
    header: 'Hire Date',
    width: 14,
    requirement: 'conditional',
    requirementNote: 'Obbligatoria quando lo stato è Attivo.',
    accepts: 'GG/MM/AAAA oppure AAAA-MM-GG.',
    examples: ['01/09/2015', '2020-01-02'],
  },
  {
    header: 'Termination Date',
    width: 16,
    requirement: 'conditional',
    requirementNote: 'Obbligatoria quando lo stato è Cessato.',
    accepts: 'GG/MM/AAAA oppure AAAA-MM-GG. Non può precedere la data di assunzione. Si può indicare anche su un dipendente Attivo, per un contratto a termine di cui si conosce già la fine.',
    examples: ['', '30/06/2027'],
  },
  {
    header: 'Retirement Date',
    width: 16,
    requirement: 'optional',
    accepts: 'Lascia vuoto: viene calcolata dalla data di nascita e dall’età pensionabile impostata. Compilala solo se la data ufficiale è diversa da quella calcolata, e in quel caso metti Sì nella colonna successiva.',
    examples: ['', ''],
  },
  {
    header: 'Retirement Date Confirmed',
    width: 28,
    requirement: 'optional',
    accepts: 'Sì oppure No. Sì significa "usa la data che ho scritto e non ricalcolarla mai".',
    examples: ['No', 'No'],
  },
  {
    header: 'FTE',
    width: 10,
    requirement: 'required',
    accepts: '1 per il tempo pieno; una frazione per il part-time (0,5 oppure 0.5). Massimo tre decimali.',
    examples: ['1', '0,8'],
  },
  {
    header: 'USA Category',
    width: 16,
    requirement: 'required',
    accepts: 'Exempt, Non Exempt oppure Other.',
    examples: ['Exempt', 'Non Exempt'],
  },
  {
    header: 'Contract Type',
    width: 18,
    requirement: 'required',
    accepts: 'Indeterminato, Determinato, Contratto USA oppure Collaboratore.',
    examples: ['Indeterminato', 'Determinato'],
  },
  {
    header: 'TFR',
    width: 18,
    requirement: 'optional',
    accepts: 'I Tatti oppure Fondo Pensione.',
    examples: ['I Tatti', 'Fondo Pensione'],
  },
  {
    header: 'Status',
    width: 16,
    requirement: 'required',
    accepts: 'Attivo, Cessato oppure Da Assumere.',
    examples: ['Attivo', 'Attivo'],
  },
  {
    header: 'Responsabile Abilitato',
    width: 22,
    requirement: 'optional',
    accepts: 'Sì oppure No. Dice se questa persona può essere scelta come Responsabile di altri, non chi approva le sue ferie.',
    examples: ['Sì', 'Sì'],
  },
  {
    header: 'Sostituto Abilitato',
    width: 22,
    requirement: 'optional',
    accepts: 'Sì oppure No. Come sopra, per il ruolo di Sostituto-Responsabile. Chi viene indicato come Sostituto di qualcuno deve avere Sì in questa colonna.',
    examples: ['Sì', 'Sì'],
  },
  {
    header: 'Responsabile Pre-approvatore',
    width: 30,
    requirement: 'optional',
    accepts: 'Numero matricola di chi pre-approva le ferie di questa persona. Più numeri si separano con una virgola.',
    examples: ['', ''],
  },
  {
    header: 'Responsabile',
    width: 24,
    requirement: 'conditional',
    requirementNote: 'Obbligatorio per un dipendente Attivo, appena esiste qualcuno abilitato al ruolo.',
    accepts: 'Numero matricola di chi approva le ferie di questa persona — non il suo nome. Più numeri si separano con una virgola. Nessuno può essere responsabile di sé stesso: nelle righe di esempio le due persone si fanno da responsabile a vicenda.',
    // Crossed over, not self-referential: 1042's responsabile is 1043 and vice
    // versa. A template whose own example breaks the self-approval rule would be
    // rejected the first time anybody trusted it.
    examples: ['1043', '1042'],
  },
  {
    header: 'Sostituto-Responsabile',
    width: 26,
    requirement: 'conditional',
    requirementNote: 'Obbligatorio per un dipendente Attivo, appena esiste qualcuno abilitato al ruolo.',
    accepts: 'Numero matricola di chi sostituisce il Responsabile quando non c’è. Deve essere una persona con "Sostituto Abilitato" a Sì.',
    examples: ['1043', '1042'],
  },
  ...(['LU', 'MA', 'ME', 'GIO', 'VE'] as const).map((day, index) => ({
    header: day,
    width: 10,
    requirement: 'optional' as const,
    accepts:
      'Ore del giorno in sessantesimi: 7,30 vuol dire sette ore e trenta minuti, non sette ore e mezza scritte come 7,5. Se lasci vuote tutte e cinque le colonne, viene applicato il tempo pieno (7,30 al giorno).',
    examples: (index === 4 ? ['7,30', '4,00'] : ['7,30', '7,30']) as [string, string],
  })),
];

const REQUIREMENT_LABELS: Record<TemplateColumn['requirement'], string> = {
  required: 'Sì',
  optional: 'No',
  conditional: 'Dipende',
};

/**
 * The workbook itself: a sheet to fill in, and a sheet that explains it.
 *
 * The example rows are left in the file on purpose. An operator who deletes them
 * and types over the headers has a valid file; one who is not sure what "7,30"
 * means has two rows showing it. The instructions say to delete them.
 */
export async function buildImportTemplate(): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'ED - Employee Directory';

  const sheet = workbook.addWorksheet('Dipendenti');
  sheet.columns = IMPORT_TEMPLATE_COLUMNS.map((column) => ({ header: column.header, width: column.width }));
  sheet.getRow(1).font = { bold: true };
  // Frozen, so the headers stay visible on a file with three hundred rows.
  sheet.views = [{ state: 'frozen', ySplit: 1 }];
  for (const index of [0, 1] as const) {
    sheet.addRow(IMPORT_TEMPLATE_COLUMNS.map((column) => column.examples[index]));
  }

  const guide = workbook.addWorksheet('Istruzioni');
  guide.columns = [
    { header: 'Colonna', width: 30 },
    { header: 'Da compilare', width: 14 },
    { header: 'Che cosa scrivere', width: 96 },
  ];
  guide.getRow(1).font = { bold: true };
  guide.views = [{ state: 'frozen', ySplit: 1 }];

  guide.addRow([
    'COME FUNZIONA',
    '',
    'Le due righe di esempio nel foglio "Dipendenti" servono solo da guida: cancellale e scrivi i tuoi dati sotto le intestazioni, senza rinominarle. Caricando il file vedrai prima un’anteprima riga per riga: niente viene salvato finché non la confermi.',
  ]);
  guide.addRow([]);

  for (const column of IMPORT_TEMPLATE_COLUMNS) {
    guide.addRow([
      column.header,
      REQUIREMENT_LABELS[column.requirement],
      [column.requirementNote, column.accepts].filter(Boolean).join(' '),
    ]);
  }

  guide.eachRow((row) => {
    row.alignment = { vertical: 'top', wrapText: true };
  });
  guide.getRow(1).alignment = { vertical: 'middle' };
  guide.getRow(2).font = { bold: true };

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer as ArrayBuffer);
}

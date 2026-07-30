import { afterEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ImportDialog } from './ui/ImportDialog.js';
import { renderWithProviders } from './test/render.js';

const department = {
  id: 'dept_1',
  name: 'Biblioteca',
  normalizedName: 'biblioteca',
  createdAt: '',
  updatedAt: '',
  employeeCounts: { total: 0, byStatus: { ATTIVO: 0, CESSATO: 0, DA_ASSUMERE: 0 } },
};

function previewRow(overrides: Record<string, unknown> = {}) {
  return {
    rowNumber: 2,
    original: {},
    normalized: { employeeNumber: 1042, firstName: 'Giulia', lastName: 'Rossi', departmentId: 'dept_1' },
    errors: [],
    proposedAction: 'CREATE',
    existingEmployeeId: null,
    selected: true,
    ...overrides,
  };
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

/** Stubs the department list plus one preview response. */
function stubApi(rows: unknown[]) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/api/admin/departments')) return json({ data: [department] });
      if (url.includes('/imports/preview')) return json({ data: { batchId: 'batch_1', rows } }, 201);
      return json({ data: [] });
    })
  );
}

async function uploadAndPreview() {
  const user = userEvent.setup();
  const file = new File(['x'], 'dipendenti.xlsx', {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  await user.upload(document.querySelector('input[type="file"]') as HTMLInputElement, file);
  await user.click(screen.getByRole('button', { name: /^Anteprima/i }));
  return user;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('the import dialog', () => {
  it('explains what the import is for before asking for a file', async () => {
    stubApi([]);
    renderWithProviders(<ImportDialog open onOpenChange={() => {}} />);

    // The three things an operator needs to know up front, in order.
    expect(screen.getByText(/Serve per aggiungere o aggiornare molti dipendenti/)).toBeInTheDocument();
    expect(screen.getByText('1. Prepara il file')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Scarica il modello Excel/i })).toBeInTheDocument();
    expect(screen.getByText('2. Carica il file')).toBeInTheDocument();
  });

  it('says the import is for employees, and where departments come from instead', async () => {
    stubApi([]);
    renderWithProviders(<ImportDialog open onOpenChange={() => {}} />);

    expect(screen.getByText(/i dipartimenti si creano dalla pagina Dipartimenti/)).toBeInTheDocument();
  });

  it('promises that uploading saves nothing', async () => {
    // The reason an operator hesitates over an import button is not knowing whether
    // it is about to overwrite the directory.
    stubApi([]);
    renderWithProviders(<ImportDialog open onOpenChange={() => {}} />);

    expect(screen.getByText(/Nessun dato viene salvato in questo passaggio/)).toBeInTheDocument();
  });

  it('cannot import until a preview has been seen', async () => {
    stubApi([previewRow()]);
    renderWithProviders(<ImportDialog open onOpenChange={() => {}} />);

    expect(screen.getByRole('button', { name: /Importa 0 righe/i })).toBeDisabled();

    await uploadAndPreview();
    expect(await screen.findByRole('button', { name: /Importa 1 riga/i })).toBeEnabled();
  });

  it('says what will happen to each row, in words rather than enum names', async () => {
    stubApi([
      previewRow(),
      previewRow({ rowNumber: 3, proposedAction: 'UPDATE', existingEmployeeId: 'emp_9' }),
    ]);
    renderWithProviders(<ImportDialog open onOpenChange={() => {}} />);
    await uploadAndPreview();

    await screen.findByText('Nuovo');
    expect(screen.getByText('Aggiornato')).toBeInTheDocument();
    // The raw enum used to be printed straight into the cell.
    expect(screen.queryByText('CREATE')).not.toBeInTheDocument();
    expect(screen.queryByText('UPDATE')).not.toBeInTheDocument();
  });

  it('marks an unusable row, lists its problems, and will not let it be ticked', async () => {
    stubApi([
      previewRow(),
      previewRow({
        rowNumber: 3,
        errors: ['Dipartimento non trovato.', 'Data di nascita non valida.'],
        proposedAction: null,
        selected: false,
      }),
    ]);
    renderWithProviders(<ImportDialog open onOpenChange={() => {}} />);
    await uploadAndPreview();

    // A count of the bad rows, up front, saying what to do about them.
    expect(await screen.findByRole('alert')).toHaveTextContent(/1 riga non può essere importata/);

    const blockedRow = screen.getByText('Dipartimento non trovato.').closest('tr')!;
    expect(within(blockedRow).getByText('Da correggere')).toBeInTheDocument();
    // Each error on its own line rather than run together into one sentence.
    expect(within(blockedRow).getByText('Data di nascita non valida.')).toBeInTheDocument();
    // `aria-disabled`, because Base UI renders the checkbox as a span rather than
    // a native input — so the row cannot be ticked into the import.
    expect(within(blockedRow).getByRole('checkbox')).toHaveAttribute('aria-disabled', 'true');

    // The good row is still importable — a bad row does not sink the whole file.
    expect(screen.getByRole('button', { name: /Importa 1 riga/i })).toBeEnabled();
  });

  it('counts what is ticked against what was read', async () => {
    stubApi([previewRow(), previewRow({ rowNumber: 3 })]);
    renderWithProviders(<ImportDialog open onOpenChange={() => {}} />);
    const user = await uploadAndPreview();

    expect(await screen.findByText('2 righe selezionate su 2')).toBeInTheDocument();

    const rows = screen.getAllByRole('checkbox');
    await user.click(rows[0]!);
    // Singular, as an Italian would write it — "1 righe" is what this line read
    // before the count got its plural forms.
    expect(await screen.findByText('1 riga selezionata su 2')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Importa 1 riga/i })).toBeEnabled();
  });

  it('drops a preview that arrives for a file the operator has since replaced', async () => {
    // The race the picker-clearing alone does not cover: preview v1, spot the
    // mistake, pick the corrected v2 while v1's request is still in flight. If
    // v1's response installed itself, its near-identical rows would sit under a
    // picker naming v2, and confirming would import the uncorrected file.
    let releasePreview!: () => void;
    const gate = new Promise<void>((resolve) => {
      releasePreview = resolve;
    });
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes('/api/admin/departments')) return json({ data: [department] });
        if (url.includes('/imports/preview')) {
          await gate;
          return json({ data: { batchId: 'batch_v1', rows: [previewRow()] } }, 201);
        }
        return json({ data: [] });
      })
    );
    renderWithProviders(<ImportDialog open onOpenChange={() => {}} />);

    const user = userEvent.setup();
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    const type = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
    await user.upload(input, new File(['v1'], 'dipendenti-v1.xlsx', { type }));
    await user.click(screen.getByRole('button', { name: /^Anteprima/i }));
    // The corrected file replaces the first while its preview is still pending.
    await user.upload(input, new File(['v2'], 'dipendenti-v2.xlsx', { type }));
    releasePreview();

    // The request settles — Anteprima frees up for v2 — but v1's rows never
    // appear and there is nothing to confirm.
    await waitFor(() => expect(screen.getByRole('button', { name: /^Anteprima/i })).toBeEnabled());
    expect(screen.queryByText('3. Controlla e conferma')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Importa 0 righe/i })).toBeDisabled();
  });

  it('drops a stale preview when a different file is chosen', async () => {
    // Otherwise Commit could submit the batch belonging to the previous file.
    stubApi([previewRow()]);
    renderWithProviders(<ImportDialog open onOpenChange={() => {}} />);
    const user = await uploadAndPreview();

    await screen.findByText('3. Controlla e conferma');

    await user.upload(
      document.querySelector('input[type="file"]') as HTMLInputElement,
      new File(['y'], 'altro.xlsx', {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      })
    );

    expect(screen.queryByText('3. Controlla e conferma')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Importa 0 righe/i })).toBeDisabled();
  });
});

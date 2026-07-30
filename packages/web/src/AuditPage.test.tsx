import { afterEach, describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import { AuditPage } from './routes/AuditPage.js';
import { renderWithProviders } from './test/render.js';

/** An approver as the employee snapshot carries it — nested, with internal ids. */
function approverSnapshot(employeeNumber: number, firstName: string, lastName: string) {
  return {
    id: `cms7ejrrx000usmzp3lcsw9e${employeeNumber}`,
    employeeNumber,
    firstName,
    lastName,
    status: 'ATTIVO',
    department: {
      id: 'cms7cregp0006smzpy4fd9qym',
      name: 'Administration/Finance',
      normalizedName: 'administration/finance',
      createdAt: '2026-07-30T10:10:12.601Z',
      updatedAt: '2026-07-30T10:10:12.601Z',
    },
  };
}

function entry(overrides: Record<string, unknown>) {
  return {
    id: `log_${Math.abs(JSON.stringify(overrides).length)}`,
    actorSub: 'auth0|abc',
    actorEmail: 'registrar@itatti.harvard.edu',
    entityType: 'EMPLOYEE',
    entityId: 'emp_1',
    employeeNumber: 216,
    action: 'UPDATE',
    before: null,
    after: null,
    requestId: 'req_1',
    importBatchId: null,
    createdAt: '2026-07-30T11:01:00.000Z',
    ...overrides,
  };
}

function stubAudit(entries: unknown[]) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () =>
      new Response(JSON.stringify({ data: entries }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    )
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('the change history', () => {
  it('names the approvers who changed instead of printing their JSON', async () => {
    // This is the entry that made the page unreadable: `approvalRoles` is nested,
    // so the generic formatter stringified it and the cell filled with database
    // ids, department records and normalized slugs.
    stubAudit([
      entry({
        before: { approvalRoles: { preApprovers: [], responsabili: [], substituteResponsabili: [] } },
        after: {
          approvalRoles: {
            preApprovers: [],
            responsabili: [approverSnapshot(110, 'Susan', 'Bates')],
            substituteResponsabili: [],
          },
        },
      }),
    ]);

    renderWithProviders(<AuditPage />);
    const cell = (await screen.findByText('Responsabile')).closest('td')!;

    expect(cell).toHaveTextContent('Susan Bates');
    // The empty side says so in words rather than as "[]".
    expect(cell).toHaveTextContent('(nessuno)');
    // None of the plumbing reaches the operator.
    expect(cell.textContent).not.toMatch(/cms7|normalizedName|\{|\[|"/);
  });

  it('lists one row per approver role that moved, and leaves the others out', async () => {
    stubAudit([
      entry({
        before: {
          approvalRoles: {
            preApprovers: [],
            responsabili: [approverSnapshot(110, 'Susan', 'Bates')],
            substituteResponsabili: [],
          },
        },
        after: {
          approvalRoles: {
            preApprovers: [],
            responsabili: [approverSnapshot(110, 'Susan', 'Bates')],
            substituteResponsabili: [approverSnapshot(131, 'Alessandro', 'Superbi')],
          },
        },
      }),
    ]);

    renderWithProviders(<AuditPage />);
    await screen.findByText('Sostituto-Responsabile');

    // The Responsabile did not change, so it is not reported as if it had.
    expect(screen.queryByText('Responsabile')).not.toBeInTheDocument();
    expect(screen.getByText('Alessandro Superbi')).toBeInTheDocument();
  });

  it('names the weekday whose hours changed', async () => {
    const day = (display: string) => ({ minutes: 450, display });
    stubAudit([
      entry({
        before: {
          weeklySchedule: {
            monday: day('7,30'),
            tuesday: day('7,30'),
            wednesday: day('7,30'),
            thursday: day('7,30'),
            friday: day('7,30'),
            total: day('37,30'),
          },
        },
        after: {
          weeklySchedule: {
            monday: day('7,30'),
            tuesday: day('7,30'),
            wednesday: day('4,00'),
            thursday: day('7,30'),
            friday: day('7,30'),
            total: day('34,00'),
          },
        },
      }),
    ]);

    renderWithProviders(<AuditPage />);

    // Spelled out, not the "ME" the form's column heading uses.
    const cell = (await screen.findByText('Mercoledì')).closest('td')!;
    expect(cell).toHaveTextContent('7,30');
    expect(cell).toHaveTextContent('4,00');
    expect(screen.queryByText('Lunedì')).not.toBeInTheDocument();
    expect(cell.textContent).not.toMatch(/minutes|\{/);
  });

  it('says a record was created rather than that nothing changed', async () => {
    // "Nessuna modifica ai campi" on a creation was the opposite of the truth:
    // every field was set.
    stubAudit([entry({ action: 'CREATE', before: null, after: { firstName: 'Angela', lastName: 'Lees' } })]);

    renderWithProviders(<AuditPage />);

    expect(await screen.findByText('Scheda creata')).toBeInTheDocument();
    expect(screen.queryByText(/Nessun campo modificato/)).not.toBeInTheDocument();
  });

  it('says a record was deleted', async () => {
    stubAudit([entry({ action: 'DELETE', before: { firstName: 'Ada', lastName: 'Rossi' }, after: null })]);

    renderWithProviders(<AuditPage />);

    expect(await screen.findByText('Scheda eliminata')).toBeInTheDocument();
  });

  it('counts the rows an Excel import committed', async () => {
    stubAudit([
      entry({
        entityType: 'IMPORT_BATCH',
        action: 'IMPORT_COMMIT',
        employeeNumber: null,
        before: null,
        after: { committedRows: 12 },
      }),
    ]);

    renderWithProviders(<AuditPage />);

    expect(await screen.findByText('Importate 12 righe dal file Excel')).toBeInTheDocument();
  });

  it('writes yes and no rather than true and false', async () => {
    stubAudit([
      entry({ before: { canBeResponsible: false }, after: { canBeResponsible: true } }),
    ]);

    renderWithProviders(<AuditPage />);
    const cell = (await screen.findByText('Può essere Responsabile')).closest('td')!;

    expect(cell).toHaveTextContent('No');
    expect(cell).toHaveTextContent('Sì');
    expect(cell.textContent).not.toMatch(/true|false/);
  });

  it('spells the retirement age out instead of "67y 3m"', async () => {
    stubAudit([
      entry({
        entityType: 'SETTING',
        employeeNumber: null,
        before: { retirementPolicy: { years: 67, months: 3 } },
        after: { retirementPolicy: { years: 67, months: 6 } },
      }),
    ]);

    renderWithProviders(<AuditPage />);
    // Named twice on purpose — once as the record the row is about, once as the
    // field that changed — so the assertion is on the row, not on a lone match.
    const row = (await screen.findByText('67 anni e 3 mesi')).closest('tr')!;

    expect(row).toHaveTextContent('Età pensionabile');
    expect(row).toHaveTextContent('67 anni e 6 mesi');
    expect(row.textContent).not.toMatch(/67y|3m/);
  });

  it('names the department a department row is about', async () => {
    // The old layout had an "Entità" column saying "Dipartimento" beside an
    // employee column showing a dash, so the row never said *which* department.
    stubAudit([
      entry({
        entityType: 'DEPARTMENT',
        employeeNumber: null,
        entityId: 'dept_1',
        before: { name: 'Biblioteca', normalizedName: 'biblioteca' },
        after: { name: 'Biblioteca e Archivio', normalizedName: 'biblioteca e archivio' },
      }),
    ]);

    renderWithProviders(<AuditPage />);
    // The one data row; "Dipartimento" appears both as the kind and as the field,
    // so anchoring on the text would be ambiguous.
    // The new name appears twice — as the subject and as the change's after side —
    // so this waits for either rather than demanding a unique match.
    await screen.findAllByText('Biblioteca e Archivio');
    const row = screen.getAllByRole('row')[1] as HTMLTableRowElement;

    // The subject column names the department, where it used to show a dash.
    expect(row.cells[2]).toHaveTextContent('Biblioteca e Archivio');
    expect(row).toHaveTextContent('Biblioteca');
    // The uniqueness slug is not a change anybody made, so it is not reported as
    // a second rename underneath the real one.
    expect(row.textContent).not.toMatch(/normalizedName|biblioteca/);
  });

  it('explains an empty history rather than showing a blank table', async () => {
    stubAudit([]);

    renderWithProviders(<AuditPage />);

    expect(await screen.findByText(/Nessuna modifica registrata finora/)).toBeInTheDocument();
  });
});

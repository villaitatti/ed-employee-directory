import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DepartmentsPage } from './routes/DepartmentsPage.js';
import { renderWithProviders } from './test/render.js';

let nextEmployeeNumber = 1;

function member(firstName: string, lastName: string, status = 'ATTIVO') {
  const employeeNumber = nextEmployeeNumber++;
  return { id: `emp_${employeeNumber}`, employeeNumber, firstName, lastName, status };
}

/** Counts derived from the roster, the way the server derives them. */
function department(id: string, name: string, employees: ReturnType<typeof member>[]) {
  const byStatus = { ATTIVO: 0, CESSATO: 0, DA_ASSUMERE: 0 };
  for (const employee of employees) byStatus[employee.status as keyof typeof byStatus] += 1;
  return {
    id,
    name,
    normalizedName: name.toLowerCase(),
    createdAt: '2026-01-05T09:00:00.000Z',
    updatedAt: '2026-07-29T14:52:00.000Z',
    employeeCounts: { total: employees.length, byStatus },
    employees,
  };
}

const departments = [
  department('dept_1', 'Biblioteca', [
    member('Ada', 'Rossi'),
    member('Bruno', 'Bianchi'),
    member('Carla', 'Verdi', 'CESSATO'),
  ]),
  // Nobody at all: the distinction between "0" and "not loaded yet" is the whole
  // reason the skeleton exists.
  department('dept_2', 'Giardini', []),
  // More names than the tooltip shows, so the tail has to be summarised.
  department(
    'dept_3',
    'Amministrazione',
    Array.from({ length: 15 }, (_, index) => member(`Nome${index}`, `Cognome${index}`))
  ),
];

function json(body: unknown) {
  return new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });
}

/** Resolves when the test says so, so the loading state can be inspected. */
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('the departments table', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn(async () => json({ data: departments })));
  });

  it('counts the departments above the table', async () => {
    renderWithProviders(<DepartmentsPage />);

    expect(await screen.findByText('3 dipartimenti')).toBeInTheDocument();
  });

  it('gives each department its headcount', async () => {
    renderWithProviders(<DepartmentsPage />);

    const row = (await screen.findByRole('cell', { name: 'Biblioteca' })).closest('tr')!;
    expect(row.cells[1]).toHaveTextContent('3');
  });

  it('names the people in the department, not just how many', async () => {
    renderWithProviders(<DepartmentsPage />);

    // The names are the answer a headcount raises. A tooltip needs a pointer or
    // focus, and reading down a column of numbers is neither, so they are in the
    // cell's text too.
    const cell = (await screen.findByRole('cell', { name: 'Biblioteca' })).closest('tr')!.cells[1]!;
    expect(cell).toHaveTextContent('Ada Rossi');
    expect(cell).toHaveTextContent('Bruno Bianchi');
    // Forename-first, as everywhere else in the app.
    expect(cell).not.toHaveTextContent('Rossi Ada');
  });

  it('tags only the people who are not Attivo', async () => {
    renderWithProviders(<DepartmentsPage />);

    const cell = (await screen.findByRole('cell', { name: 'Biblioteca' })).closest('tr')!.cells[1]!;
    // Marking every current employee "Attivo" is noise; a name that is no longer
    // current is the thing worth saying.
    expect(cell).toHaveTextContent('Carla Verdi (Cessato)');
    expect(cell).not.toHaveTextContent('Ada Rossi (Attivo)');
  });

  it('summarises the tail rather than growing a popup taller than the row', async () => {
    renderWithProviders(<DepartmentsPage />);

    const cell = (await screen.findByRole('cell', { name: 'Amministrazione' })).closest('tr')!.cells[1]!;
    expect(cell).toHaveTextContent('15');
    expect(cell).toHaveTextContent('Nome0 Cognome0');
    expect(cell).toHaveTextContent('Nome11 Cognome11');
    // Twelve shown out of fifteen.
    expect(cell).not.toHaveTextContent('Nome12 Cognome12');
    expect(cell).toHaveTextContent('e altri 3');
  });

  it('offers the count to hover and to keyboard focus', async () => {
    renderWithProviders(<DepartmentsPage />);

    // The tooltip itself is a Base UI popup that jsdom will not open — hover there
    // is not a real pointer — so what is checked here is the affordance: the count
    // is focusable, which is what makes the tooltip reachable without a mouse.
    // The popup's own contents are verified in the browser.
    const row = (await screen.findByRole('cell', { name: 'Biblioteca' })).closest('tr')!;
    const trigger = within(row.cells[1]!).getByText('3');
    expect(trigger).toHaveAttribute('tabindex', '0');
    trigger.focus();
    expect(trigger).toHaveFocus();
  });

  it('says "no employees" rather than a bare zero', async () => {
    renderWithProviders(<DepartmentsPage />);

    const row = (await screen.findByRole('cell', { name: 'Giardini' })).closest('tr')!;
    expect(row.cells[1]).toHaveTextContent('Nessun dipendente');
    // No dotted-underline hover affordance on a department with nothing to break down.
    expect(within(row.cells[1]!).queryByText('0')).not.toBeInTheDocument();
  });
});

describe('while the departments are loading', () => {
  it('shows placeholder rows instead of an empty table', async () => {
    const pending = deferred<Response>();
    vi.stubGlobal('fetch', vi.fn(() => pending.promise));

    const { container } = renderWithProviders(<DepartmentsPage />);

    // The headings render immediately either way; what used to be underneath them
    // was nothing at all, which reads as a page that failed rather than one that
    // is working.
    expect(container.querySelector('[data-slot="table-skeleton"]')).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('Caricamento dei dipartimenti…');
    // And the empty-state message is not shown, because nothing is known yet.
    expect(screen.queryByText(/Aggiungi i dipartimenti/)).not.toBeInTheDocument();

    pending.resolve(json({ data: departments }));
    expect(await screen.findByRole('cell', { name: 'Biblioteca' })).toBeInTheDocument();
    expect(container.querySelector('[data-slot="table-skeleton"]')).not.toBeInTheDocument();
  });
});

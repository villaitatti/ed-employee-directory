import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { EmployeesPage } from './routes/EmployeesPage.js';
import { renderWithProviders } from './test/render.js';

const department = {
  id: 'dept_1',
  name: 'Amministrazione',
  normalizedName: 'amministrazione',
  createdAt: '',
  updatedAt: '',
};

function approver(employeeNumber: number, firstName: string, lastName: string) {
  return { id: `emp_${employeeNumber}`, employeeNumber, firstName, lastName, status: 'ATTIVO', department };
}

const schedule = {
  monday: { minutes: 450, display: '7,30' },
  tuesday: { minutes: 450, display: '7,30' },
  wednesday: { minutes: 450, display: '7,30' },
  thursday: { minutes: 450, display: '7,30' },
  friday: { minutes: 450, display: '7,30' },
  total: { minutes: 2250, display: '37,30' },
};

function employee(
  employeeNumber: number,
  firstName: string,
  lastName: string,
  overrides: Record<string, unknown> = {}
) {
  return {
    id: `emp_${employeeNumber}`,
    employeeNumber,
    firstName,
    lastName,
    workEmail: `${firstName}@itatti.harvard.edu`.toLowerCase(),
    preferredLanguage: 'IT',
    departmentId: department.id,
    department,
    birthDate: '1980-01-15',
    hireDate: '2015-09-01',
    terminationDate: null,
    retirementDate: '2047-04-15',
    retirementDateOverridden: false,
    fte: 1,
    usaCategory: 'EXEMPT',
    contractType: 'INDETERMINATO',
    tfr: 'I_TATTI',
    status: 'ATTIVO',
    canBeResponsible: true,
    canBeSubstituteResponsible: true,
    weeklySchedule: schedule,
    approvalRoles: { preApprovers: [], responsabili: [], substituteResponsabili: [] },
    createdAt: '',
    updatedAt: '',
    ...overrides,
  };
}

/** Surname order out of the API, which is what the page starts from. */
const roster = [
  employee(1002, 'Bruno', 'Bianchi', {
    retirementDate: '2053-02-03',
    approvalRoles: {
      preApprovers: [],
      responsabili: [approver(1001, 'Ada', 'Rossi')],
      // No substitute: an Active employee is supposed to have one.
      substituteResponsabili: [],
    },
  }),
  employee(1001, 'Ada', 'Rossi', {
    retirementDate: '2045-07-12',
    approvalRoles: {
      preApprovers: [approver(1003, 'Carla', 'Verdi')],
      responsabili: [approver(1002, 'Bruno', 'Bianchi')],
      substituteResponsabili: [approver(1003, 'Carla', 'Verdi')],
    },
  }),
  employee(1003, 'Carla', 'Verdi', {
    retirementDate: '2057-05-20',
    approvalRoles: {
      preApprovers: [],
      responsabili: [approver(1001, 'Ada', 'Rossi'), approver(1002, 'Bruno', 'Bianchi')],
      substituteResponsabili: [approver(1002, 'Bruno', 'Bianchi')],
    },
  }),
];

function json(body: unknown) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

beforeEach(() => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/api/admin/departments')) return json({ data: [department] });
      if (url.includes('/api/admin/employee-options')) return json({ data: [] });
      if (url.includes('/api/admin/employees')) return json({ data: roster, nextCursor: null });
      return json({ data: [] });
    })
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

/** The name column, in the order the table currently shows it. */
async function names() {
  // Awaited on a cell rather than a row: the header row exists before the data
  // arrives, so waiting for "a row" would resolve to just that.
  await screen.findByRole('cell', { name: 'Ada Rossi' });
  return screen
    .getAllByRole('row')
    .slice(1)
    .map((row) => (row as HTMLTableRowElement).cells[1]?.textContent?.trim());
}

/** The row a person is the *subject* of — they appear in other rows as an approver. */
async function rowFor(name: string) {
  const cell = await screen.findByRole('cell', { name });
  return cell.closest('tr') as HTMLTableRowElement;
}

describe('the directory table', () => {
  it('names the approvers rather than counting them', async () => {
    renderWithProviders(<EmployeesPage />);

    const workflow = (await rowFor('Ada Rossi')).cells[7]!;

    // Who to go to, not how many there are — "R 1 / S 1" answered a question
    // nobody has.
    expect(workflow).toHaveTextContent('Bruno Bianchi');
    expect(workflow).toHaveTextContent('Carla Verdi');
    expect(workflow.textContent).not.toMatch(/R \d/);

    // The role is abbreviated on screen ("Resp.", which is not a word when read
    // aloud) but spelled out for a screen reader.
    expect(within(workflow).getByText('Resp.')).toBeInTheDocument();
    expect(within(workflow).getByText('Responsabile:')).toBeInTheDocument();
    expect(within(workflow).getByText('Sostituto-Responsabile:')).toBeInTheDocument();
  });

  it('calls out a missing Sostituto rather than leaving a blank', async () => {
    renderWithProviders(<EmployeesPage />);

    // An Active employee needs both roles, so the empty half is a problem to
    // see, not an absence to skim past.
    expect((await rowFor('Bruno Bianchi')).cells[7]).toHaveTextContent('Da assegnare');
  });

  it('starts ordered by surname and reorders on a column heading', async () => {
    const user = userEvent.setup();
    renderWithProviders(<EmployeesPage />);

    expect(await names()).toEqual(['Bruno Bianchi', 'Ada Rossi', 'Carla Verdi']);
    expect(screen.getByRole('columnheader', { name: /Nome e cognome/i })).toHaveAttribute(
      'aria-sort',
      'ascending'
    );

    await user.click(screen.getByRole('button', { name: /Numero Matricola/i }));
    expect(await names()).toEqual(['Ada Rossi', 'Bruno Bianchi', 'Carla Verdi']);
    expect(screen.getByRole('columnheader', { name: /Numero Matricola/i })).toHaveAttribute(
      'aria-sort',
      'ascending'
    );
    // The name column hands the sort over rather than keeping its own marker.
    expect(screen.getByRole('columnheader', { name: /Nome e cognome/i })).toHaveAttribute(
      'aria-sort',
      'none'
    );

    // Clicking the column you are already sorted by turns it around.
    await user.click(screen.getByRole('button', { name: /Numero Matricola/i }));
    expect(await names()).toEqual(['Carla Verdi', 'Bruno Bianchi', 'Ada Rossi']);
    expect(screen.getByRole('columnheader', { name: /Numero Matricola/i })).toHaveAttribute(
      'aria-sort',
      'descending'
    );
  });

  it('sorts dates chronologically, not by how they are spelled', async () => {
    const user = userEvent.setup();
    renderWithProviders(<EmployeesPage />);
    await screen.findByRole('cell', { name: 'Ada Rossi' });

    // "01 agosto" before "05 gennaio" alphabetically; the stored ISO date is
    // what decides.
    await user.click(screen.getByRole('button', { name: /Data pensionamento/i }));
    expect(await names()).toEqual(['Ada Rossi', 'Bruno Bianchi', 'Carla Verdi']);
  });

  it('leaves the workflow column unsorted — a list of names has no useful order', async () => {
    renderWithProviders(<EmployeesPage />);
    await screen.findByRole('cell', { name: 'Ada Rossi' });

    expect(screen.getByRole('columnheader', { name: /Workflow/i })).not.toHaveAttribute('aria-sort');
  });
});

import { afterEach, describe, expect, it, vi } from 'vitest';
import { useState } from 'react';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { toast } from 'sonner';
import { emptyEmployeeDraft, type EmployeeDraft } from './employee-draft.js';
import { EmployeeForm } from './routes/EmployeeForm.js';
import { fieldErrorId } from './employee-validation.js';
import i18n from './i18n/config.js';
import { renderWithProviders } from './test/render.js';

const department = { id: 'dept_1', name: 'Amministrazione', normalizedName: 'amministrazione', createdAt: '', updatedAt: '' };
const departments = [department];
const employeeOptions = [
  {
    id: 'emp_1',
    employeeNumber: 1001,
    firstName: 'Ada',
    lastName: 'Rossi',
    status: 'ATTIVO' as const,
    department,
    canBeResponsible: true,
    canBeSubstituteResponsible: false,
  },
  {
    id: 'emp_2',
    employeeNumber: 1002,
    firstName: 'Bruno',
    lastName: 'Bianchi',
    status: 'ATTIVO' as const,
    department,
    canBeResponsible: false,
    canBeSubstituteResponsible: true,
  },
];

describe('EmployeeForm modal', () => {
  it('renders as a modal dialog', () => {
    const { container } = renderWithProviders(
      <EmployeeForm
        draft={emptyEmployeeDraft}
        departments={departments}
        employeeOptions={employeeOptions}
        onCancel={vi.fn()}
        onChange={vi.fn()}
        onSave={vi.fn()}
        isSaving={false}
      />
    );
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    // 12 always-required fields (including Work Email), plus three that are
    // conditionally required and all apply to this ATTIVO draft: the Hire Date,
    // the Responsabile (emp_1 is eligible to pick), and the Substitute-Responsabile
    // (emp_2 is) — both halves of the server's active-employee approver rule.
    expect(container.querySelectorAll('[data-slot="field-required"]')).toHaveLength(15);
  });

  it('renders stored dates with a localized, unambiguous display value', () => {
    renderWithProviders(
      <EmployeeForm
        draft={{ ...emptyEmployeeDraft, birthDate: '2026-03-02' }}
        departments={departments}
        employeeOptions={employeeOptions}
        onCancel={vi.fn()}
        onChange={vi.fn()}
        onSave={vi.fn()}
        isSaving={false}
      />
    );

    const birthDate = screen.getByLabelText('Data di nascita');
    // A text box, never <input type="date">: the native one is month-first and
    // labelled in the browser's language, not the operator's.
    expect(birthDate).toHaveAttribute('type', 'text');
    expect(birthDate).toHaveValue('02 marzo 2026');
  });

  it('puts status first and hides termination date for new active employees', async () => {
    const user = userEvent.setup();
    let draft = { ...emptyEmployeeDraft };
    const onChange = vi.fn((next) => {
      draft = next;
    });

    const { rerender } = renderWithProviders(
      <EmployeeForm
        draft={draft}
        departments={departments}
        employeeOptions={employeeOptions}
        onCancel={vi.fn()}
        onChange={onChange}
        onSave={vi.fn()}
        isSaving={false}
      />
    );

    const status = screen.getByRole('combobox', { name: 'Stato' });
    const hireDate = screen.getByLabelText('Data assunzione');
    expect(status.compareDocumentPosition(hireDate) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.queryByLabelText('Data cessazione')).not.toBeInTheDocument();

    await user.click(status);
    await user.click(await screen.findByRole('option', { name: 'Cessato' }));
    rerender(
      <EmployeeForm
        draft={draft}
        departments={departments}
        employeeOptions={employeeOptions}
        onCancel={vi.fn()}
        onChange={onChange}
        onSave={vi.fn()}
        isSaving={false}
      />
    );
    expect(screen.getByLabelText('Data cessazione')).toBeInTheDocument();
  });

  it('shows termination date when editing an active employee', () => {
    renderWithProviders(
      <EmployeeForm
        draft={{ ...emptyEmployeeDraft, id: 'emp_1', status: 'ATTIVO' }}
        departments={departments}
        employeeOptions={employeeOptions}
        onCancel={vi.fn()}
        onChange={vi.fn()}
        onSave={vi.fn()}
        isSaving={false}
      />
    );

    expect(screen.getByLabelText('Data cessazione')).toBeInTheDocument();
  });

  it('calculates retirement date from birth date and shows the policy hint', () => {
    renderWithProviders(
      <EmployeeForm
        draft={{ ...emptyEmployeeDraft, birthDate: '1980-01-15' }}
        departments={departments}
        employeeOptions={employeeOptions}
        onCancel={vi.fn()}
        onChange={vi.fn()}
        onSave={vi.fn()}
        isSaving={false}
      />
    );

    expect(screen.getByLabelText('Data pensionamento')).toHaveValue('15 aprile 2047');
    expect(
      screen.getByText(
        /Calcolata automaticamente dalla data di nascita in base all’età pensionabile \(67 anni e 3 mesi\)/
      )
    ).toBeInTheDocument();
  });

  it('parses typed numeric dates as day/month/year', async () => {
    const user = userEvent.setup();
    let latestDraft = { ...emptyEmployeeDraft };

    function ControlledEmployeeForm() {
      const [draft, setDraft] = useState({ ...emptyEmployeeDraft });
      return (
        <EmployeeForm
          draft={draft}
          departments={departments}
          employeeOptions={employeeOptions}
          onCancel={() => undefined}
          onChange={(next) => {
            latestDraft = next;
            setDraft(next);
          }}
          onSave={vi.fn()}
          isSaving={false}
        />
      );
    }

    renderWithProviders(<ControlledEmployeeForm />);

    const birthDate = screen.getByLabelText('Data di nascita');
    await user.click(birthDate);
    await user.clear(birthDate);
    await user.type(birthDate, '15/03/1990');
    await user.tab();
    expect(latestDraft.birthDate).toBe('1990-03-15');
    expect(birthDate).toHaveValue('15 marzo 1990');

    // 1/5 must be 1 May (day-first), not 5 January (US month-first).
    await user.click(birthDate);
    await user.clear(birthDate);
    await user.type(birthDate, '1/5/1990');
    await user.tab();
    expect(latestDraft.birthDate).toBe('1990-05-01');
    expect(birthDate).toHaveValue('01 maggio 1990');
  });

  it('closes the calendar once a day is picked', async () => {
    // Regression: picking a day handed the caret back to the box, and the
    // focus handler that opens the calendar read that as the operator arriving
    // at the field — so the calendar re-opened the instant it closed.
    const user = userEvent.setup();

    function ControlledEmployeeForm() {
      const [draft, setDraft] = useState({ ...emptyEmployeeDraft });
      return (
        <EmployeeForm
          draft={draft}
          departments={departments}
          employeeOptions={employeeOptions}
          onCancel={() => undefined}
          onChange={setDraft}
          onSave={vi.fn()}
          isSaving={false}
        />
      );
    }

    renderWithProviders(<ControlledEmployeeForm />);

    const birthDate = screen.getByLabelText('Data di nascita');
    await user.click(birthDate);
    await user.type(birthDate, '04/12/2000');
    await user.click(await screen.findByRole('button', { name: '4 dicembre 2000' }));

    expect(birthDate).toHaveValue('04 dicembre 2000');
    expect(screen.queryByRole('button', { name: '4 dicembre 2000' })).not.toBeInTheDocument();

    // And clicking the box offers it again — the caret never left, so there is
    // no focus event to rely on here.
    await user.click(birthDate);
    expect(await screen.findByRole('button', { name: '4 dicembre 2000' })).toBeInTheDocument();
  });

  it('keeps the typed date when clicking the already-selected calendar day', async () => {
    const user = userEvent.setup();
    let latestDraft = { ...emptyEmployeeDraft };

    function ControlledEmployeeForm() {
      const [draft, setDraft] = useState({ ...emptyEmployeeDraft });
      return (
        <EmployeeForm
          draft={draft}
          departments={departments}
          employeeOptions={employeeOptions}
          onCancel={() => undefined}
          onChange={(next) => {
            latestDraft = next;
            setDraft(next);
          }}
          onSave={vi.fn()}
          isSaving={false}
        />
      );
    }

    renderWithProviders(<ControlledEmployeeForm />);

    const birthDate = screen.getByLabelText('Data di nascita');
    await user.click(birthDate);
    await user.clear(birthDate);
    await user.type(birthDate, '01/12/2000');

    expect(latestDraft.birthDate).toBe('2000-12-01');
    const selectedDay = await screen.findByRole('button', { name: '1 dicembre 2000' });
    await user.click(selectedDay);

    expect(latestDraft.birthDate).toBe('2000-12-01');
    await user.tab();
    expect(birthDate).toHaveValue('01 dicembre 2000');
  });

  it('offers the TFR options in a listbox', async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <EmployeeForm
        draft={emptyEmployeeDraft}
        departments={departments}
        employeeOptions={employeeOptions}
        onCancel={vi.fn()}
        onChange={vi.fn()}
        onSave={vi.fn()}
        isSaving={false}
      />
    );

    const tfr = screen.getByRole('combobox', { name: 'TFR' });
    await user.click(tfr);
    // Awaited: the listbox is portalled, so it lands a tick after the click.
    expect(await screen.findByRole('option', { name: 'I Tatti' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Fondo Pensione' })).toBeInTheDocument();
  });

  it('moves focus into the dialog when it opens', () => {
    renderWithProviders(
      <EmployeeForm
        draft={emptyEmployeeDraft}
        departments={departments}
        employeeOptions={employeeOptions}
        onCancel={vi.fn()}
        onChange={vi.fn()}
        onSave={vi.fn()}
        isSaving={false}
      />
    );

    const dialog = screen.getByRole('dialog');
    expect(dialog.contains(document.activeElement)).toBe(true);
  });

  it('keeps focus in a controlled field while the parent rerenders', async () => {
    const user = userEvent.setup();

    function ControlledEmployeeForm() {
      const [draft, setDraft] = useState({ ...emptyEmployeeDraft });
      return (
        <EmployeeForm
          draft={draft}
          departments={departments}
          employeeOptions={employeeOptions}
          onCancel={() => undefined}
          onChange={setDraft}
          onSave={vi.fn()}
          isSaving={false}
        />
      );
    }

    renderWithProviders(<ControlledEmployeeForm />);

    const firstName = screen.getByLabelText('Nome');
    await user.click(firstName);
    await user.keyboard('Ada');

    expect(firstName).toHaveValue('Ada');
    expect(firstName).toHaveFocus();
    expect(screen.getByLabelText('Numero Matricola')).toHaveValue('');
  });

  it('closes immediately via Escape when the form is pristine', async () => {
    const onCancel = vi.fn();
    const user = userEvent.setup();
    renderWithProviders(
      <EmployeeForm
        draft={emptyEmployeeDraft}
        departments={departments}
        employeeOptions={employeeOptions}
        onCancel={onCancel}
        onChange={vi.fn()}
        onSave={vi.fn()}
        isSaving={false}
      />
    );

    await user.keyboard('{Escape}');
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('stays pristine when the retirement override is switched on and back off', async () => {
    // Switching the override on seeds `retirementDate` with the projection so the
    // input has something to edit. That value is never submitted while the switch
    // is off, so a round trip must not count as an unsaved change.
    const onCancel = vi.fn();
    const user = userEvent.setup();

    function ControlledEmployeeForm() {
      const [draft, setDraft] = useState({ ...emptyEmployeeDraft, birthDate: '1980-01-15' });
      return (
        <EmployeeForm
          draft={draft}
          departments={departments}
          employeeOptions={employeeOptions}
          onCancel={onCancel}
          onChange={setDraft}
          onSave={vi.fn()}
          isSaving={false}
        />
      );
    }

    renderWithProviders(<ControlledEmployeeForm />);
    const override = screen.getByRole('switch', { name: 'Data pensionamento confermata' });

    await user.click(override);
    expect(screen.getByLabelText('Data pensionamento')).toHaveValue('15 aprile 2047');
    await user.click(override);
    await user.click(await screen.findByRole('button', { name: 'Conferma' }));

    // No discard prompt: Escape closes straight away.
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('alertdialog', { name: 'Scartare le modifiche?' })).not.toBeInTheDocument();
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('restores a confirmed retirement date when the override is switched back on', async () => {
    const user = userEvent.setup();
    let latestDraft = { ...emptyEmployeeDraft };

    function ControlledEmployeeForm() {
      const [draft, setDraft] = useState({
        ...emptyEmployeeDraft,
        birthDate: '1980-01-15',
        retirementDate: '2050-06-30',
        retirementDateOverridden: true,
      });
      return (
        <EmployeeForm
          draft={draft}
          departments={departments}
          employeeOptions={employeeOptions}
          onCancel={vi.fn()}
          onChange={(next) => {
            latestDraft = next;
            setDraft(next);
          }}
          onSave={vi.fn()}
          isSaving={false}
        />
      );
    }

    renderWithProviders(<ControlledEmployeeForm />);
    const override = screen.getByRole('switch', { name: 'Data pensionamento confermata' });

    await user.click(override);
    await user.click(await screen.findByRole('button', { name: 'Conferma' }));
    // Unconfirmed: the input falls back to the projection, but the confirmed date
    // is kept so switching back on does not silently replace it.
    expect(screen.getByLabelText('Data pensionamento')).toHaveValue('15 aprile 2047');

    await user.click(override);
    expect(latestDraft.retirementDate).toBe('2050-06-30');
    expect(screen.getByLabelText('Data pensionamento')).toHaveValue('30 giugno 2050');
  });

  it('prompts before discarding when there are unsaved changes', async () => {
    const onCancel = vi.fn();
    const user = userEvent.setup();
    // A draft that differs from its initial state is "dirty". We simulate the
    // dirty state by rendering with a draft, then editing a field so the
    // internal initial-snapshot differs from the current draft.
    let draft = { ...emptyEmployeeDraft };
    const onChange = vi.fn((next) => {
      draft = next;
    });

    const { rerender } = renderWithProviders(
      <EmployeeForm
        draft={draft}
        departments={departments}
        employeeOptions={employeeOptions}
        onCancel={onCancel}
        onChange={onChange}
        onSave={vi.fn()}
        isSaving={false}
      />
    );

    // Type into First Name (Italian label "Nome") to make the form dirty.
    await user.type(screen.getByLabelText('Nome'), 'Ada');
    rerender(
      <EmployeeForm
        draft={{ ...draft, firstName: 'Ada' }}
        departments={departments}
        employeeOptions={employeeOptions}
        onCancel={onCancel}
        onChange={onChange}
        onSave={vi.fn()}
        isSaving={false}
      />
    );

    // Cancelling the confirmation keeps the form open.
    await user.keyboard('{Escape}');
    const confirmation = await screen.findByRole('alertdialog', { name: 'Scartare le modifiche?' });
    await user.click(within(confirmation).getByRole('button', { name: 'Annulla' }));
    expect(onCancel).not.toHaveBeenCalled();

    // Confirming the discard closes the form.
    await user.keyboard('{Escape}');
    await user.click(await screen.findByRole('button', { name: 'Scarta modifiche' }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('lets the discard confirmation own the keyboard while it is open', async () => {
    // Regression: the form's Escape/Tab handler used to be bound to `document`,
    // so it fought the layered confirmation — Escape re-opened the confirmation
    // the instant it closed itself, and Tab pulled focus back out into the form
    // behind it.
    const onCancel = vi.fn();
    const user = userEvent.setup();

    function ControlledEmployeeForm() {
      const [draft, setDraft] = useState({ ...emptyEmployeeDraft });
      return (
        <EmployeeForm
          draft={draft}
          departments={departments}
          employeeOptions={employeeOptions}
          onCancel={onCancel}
          onChange={setDraft}
          onSave={vi.fn()}
          isSaving={false}
        />
      );
    }

    renderWithProviders(<ControlledEmployeeForm />);
    await user.type(screen.getByLabelText('Nome'), 'Ada');

    await user.keyboard('{Escape}');
    const confirmation = await screen.findByRole('alertdialog', { name: 'Scartare le modifiche?' });

    // Tab stays inside the confirmation instead of escaping into the form behind it.
    await user.tab();
    expect(confirmation.contains(document.activeElement)).toBe(true);

    // Escape dismisses the confirmation instead of re-opening it, and leaves the
    // form itself open.
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('alertdialog', { name: 'Scartare le modifiche?' })).not.toBeInTheDocument();
    expect(onCancel).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog', { name: 'Nuovo dipendente' })).toBeInTheDocument();
  });

  it('shows full-time weekday defaults and weekly total', () => {
    renderWithProviders(
      <EmployeeForm
        draft={emptyEmployeeDraft}
        departments={departments}
        employeeOptions={employeeOptions}
        onCancel={vi.fn()}
        onChange={vi.fn()}
        onSave={vi.fn()}
        isSaving={false}
      />
    );

    expect(screen.getAllByDisplayValue('7,30')).toHaveLength(5);
    expect(screen.getByText('Totale settimanale: 37,30.')).toBeInTheDocument();
  });

  it('warns when weekly hours differ from FTE', () => {
    renderWithProviders(
      <EmployeeForm
        draft={{
          ...emptyEmployeeDraft,
          weeklySchedule: { ...emptyEmployeeDraft.weeklySchedule, monday: '5,00' },
        }}
        departments={departments}
        employeeOptions={employeeOptions}
        onCancel={vi.fn()}
        onChange={vi.fn()}
        onSave={vi.fn()}
        isSaving={false}
      />
    );

    expect(screen.getByText('Totale settimanale 35,00; atteso da FTE 37,30.')).toBeInTheDocument();
  });

  it('filters the searchable Sostituto-Responsabile picker to eligible employees', async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <EmployeeForm
        draft={emptyEmployeeDraft}
        departments={departments}
        employeeOptions={employeeOptions}
        onCancel={vi.fn()}
        onChange={vi.fn()}
        onSave={vi.fn()}
        isSaving={false}
      />
    );

    const substituteSelect = screen.getByRole('combobox', { name: 'Sostituto-Responsabile' });
    await user.click(substituteSelect);
    expect(screen.getByRole('option', { name: 'Bruno Bianchi (1002)' })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: 'Ada Rossi (1001)' })).not.toBeInTheDocument();
  });

  it('keeps a selected approver visible and removable even when no longer eligible', () => {
    const onChange = vi.fn();
    // 'emp_3' is selected as a Responsabile but is absent from employeeOptions
    // (e.g. it became inactive after assignment). It must still render a
    // removable chip rather than vanishing into the payload.
    renderWithProviders(
      <EmployeeForm
        draft={{
          ...emptyEmployeeDraft,
          approvalRoleIds: { ...emptyEmployeeDraft.approvalRoleIds, responsabileIds: ['emp_3', 'emp_1'] },
        }}
        departments={departments}
        employeeOptions={employeeOptions}
        onCancel={vi.fn()}
        onChange={onChange}
        onSave={vi.fn()}
        isSaving={false}
      />
    );

    const removeButton = screen.getByRole('button', { name: /Rimuovi Non più idoneo a questo ruolo/i });
    expect(removeButton).toBeInTheDocument();
    // Flagged visually too, so it reads as something to fix rather than a normal
    // selection sitting next to the eligible ones.
    expect(removeButton.closest('[data-ineligible="true"]')).not.toBeNull();
    // An eligible selection carries no such flag.
    expect(
      screen.getByRole('button', { name: /Rimuovi Ada Rossi/i }).closest('[data-ineligible="true"]')
    ).toBeNull();
    removeButton.click();
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        approvalRoleIds: expect.objectContaining({ responsabileIds: ['emp_1'] }),
      })
    );
  });

  it('filters the Responsabile picker to Responsabile-eligible employees', async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <EmployeeForm
        draft={emptyEmployeeDraft}
        departments={departments}
        employeeOptions={employeeOptions}
        onCancel={vi.fn()}
        onChange={vi.fn()}
        onSave={vi.fn()}
        isSaving={false}
      />
    );

    const responsabileSelect = screen.getByRole('combobox', { name: 'Responsabile' });
    await user.click(responsabileSelect);
    // emp_1 is Responsabile-eligible; emp_2 is not.
    expect(screen.getByRole('option', { name: 'Ada Rossi (1001)' })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: 'Bruno Bianchi (1002)' })).not.toBeInTheDocument();
  });

  it('exposes the two role-capability switches in their own section', () => {
    renderWithProviders(
      <EmployeeForm
        draft={emptyEmployeeDraft}
        departments={departments}
        employeeOptions={employeeOptions}
        onCancel={vi.fn()}
        onChange={vi.fn()}
        onSave={vi.fn()}
        isSaving={false}
      />
    );

    expect(screen.getByRole('switch', { name: 'Può essere Responsabile' })).toBeInTheDocument();
    expect(screen.getByRole('switch', { name: 'Può essere Sostituto-Responsabile' })).toBeInTheDocument();
  });

  it('flags the Responsabile as required for an active employee when one is eligible', () => {
    const { container } = renderWithProviders(
      <EmployeeForm
        draft={emptyEmployeeDraft}
        departments={departments}
        employeeOptions={employeeOptions}
        onCancel={vi.fn()}
        onChange={vi.fn()}
        onSave={vi.fn()}
        isSaving={false}
      />
    );

    // Up front this is guidance, worded like every other field's hint — not the
    // error sentence, which would read as an unhighlighted failure.
    expect(
      screen.getByText('Obbligatorio per un dipendente Attivo: indica chi approva le sue richieste di ferie.')
    ).toBeInTheDocument();
    expect(container.querySelector('[data-field="responsabileIds"] [data-slot="field-description"]')).not.toBeNull();
    expect(container.querySelector('[data-field="responsabileIds"] [data-slot="field-error"]')).toBeNull();
    expect(container.querySelector('[data-slot="field-required"]')).not.toBeNull();
  });

  it('does not require a Responsabile while bootstrapping (no eligible options)', () => {
    renderWithProviders(
      <EmployeeForm
        draft={emptyEmployeeDraft}
        departments={departments}
        // Only a Sostituto-eligible option exists — nobody can be picked as
        // Responsabile yet, so the field is optional and no requirement is shown.
        employeeOptions={employeeOptions.filter((option) => !option.canBeResponsible)}
        onCancel={vi.fn()}
        onChange={vi.fn()}
        onSave={vi.fn()}
        isSaving={false}
      />
    );

    expect(screen.queryByText('Seleziona almeno un Responsabile per questo dipendente.')).not.toBeInTheDocument();
  });
  it('suggests the conventional work email once both names are filled', async () => {
    const user = userEvent.setup();
    let latestDraft = { ...emptyEmployeeDraft };

    function Controlled() {
      const [draft, setDraft] = useState({ ...emptyEmployeeDraft });
      return (
        <EmployeeForm
          draft={draft}
          departments={departments}
          employeeOptions={employeeOptions}
          onCancel={() => undefined}
          onChange={(next) => {
            latestDraft = next;
            setDraft(next);
          }}
          onSave={vi.fn()}
          isSaving={false}
        />
      );
    }

    renderWithProviders(<Controlled />);

    // A first name alone is not enough to build an address from.
    await user.type(screen.getByLabelText('Nome'), 'Andrea');
    expect(latestDraft.workEmail).toBe('');

    await user.type(screen.getByLabelText('Cognome'), 'Caselli');
    expect(latestDraft.workEmail).toBe('acaselli@itatti.harvard.edu');
    expect(screen.getByLabelText('Email di lavoro')).toHaveValue('acaselli@itatti.harvard.edu');
  });

  it('stops suggesting once the address has been edited by hand', async () => {
    const user = userEvent.setup();
    let latestDraft = { ...emptyEmployeeDraft };

    function Controlled() {
      const [draft, setDraft] = useState({ ...emptyEmployeeDraft });
      return (
        <EmployeeForm
          draft={draft}
          departments={departments}
          employeeOptions={employeeOptions}
          onCancel={() => undefined}
          onChange={(next) => {
            latestDraft = next;
            setDraft(next);
          }}
          onSave={vi.fn()}
          isSaving={false}
        />
      );
    }

    renderWithProviders(<Controlled />);

    await user.type(screen.getByLabelText('Nome'), 'Andrea');
    await user.type(screen.getByLabelText('Cognome'), 'Caselli');

    const email = screen.getByLabelText('Email di lavoro');
    await user.clear(email);
    await user.type(email, 'andrea.caselli@itatti.harvard.edu');

    // Correcting the surname must not clobber the address the operator chose.
    await user.clear(screen.getByLabelText('Cognome'));
    await user.type(screen.getByLabelText('Cognome'), 'Caselli-Verdi');
    expect(latestDraft.workEmail).toBe('andrea.caselli@itatti.harvard.edu');
  });

  it('leaves an existing employee\'s address alone when their name is corrected', async () => {
    const user = userEvent.setup();
    const existing = {
      ...emptyEmployeeDraft,
      id: 'emp_9',
      firstName: 'Andrea',
      lastName: 'Caselli',
      workEmail: 'legacy.address@itatti.harvard.edu',
    };
    let latestDraft: EmployeeDraft = { ...existing };

    function Controlled() {
      const [draft, setDraft] = useState<EmployeeDraft>({ ...existing });
      return (
        <EmployeeForm
          draft={draft}
          departments={departments}
          employeeOptions={employeeOptions}
          onCancel={() => undefined}
          onChange={(next) => {
            latestDraft = next;
            setDraft(next);
          }}
          onSave={vi.fn()}
          isSaving={false}
        />
      );
    }

    renderWithProviders(<Controlled />);

    await user.clear(screen.getByLabelText('Cognome'));
    await user.type(screen.getByLabelText('Cognome'), 'Caselli Rossi');
    expect(latestDraft.workEmail).toBe('legacy.address@itatti.harvard.edu');
  });
});

describe('EmployeeForm validation feedback', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  /** A draft that only fails on the fields each test is about. */
  const validDraft: EmployeeDraft = {
    ...emptyEmployeeDraft,
    employeeNumber: '2001',
    firstName: 'Andrea',
    lastName: 'Caselli',
    workEmail: 'acaselli@itatti.harvard.edu',
    departmentId: 'dept_1',
    birthDate: '1980-05-04',
    hireDate: '2020-01-02',
    // Both approver roles filled: an ATTIVO employee needs each one as soon as
    // somebody is eligible for it, which emp_1 and emp_2 respectively are.
    approvalRoleIds: {
      ...emptyEmployeeDraft.approvalRoleIds,
      responsabileIds: ['emp_1'],
      substituteResponsabileIds: ['emp_2'],
    },
  };

  function renderForm(draft: EmployeeDraft, onSave = vi.fn()) {
    const result = renderWithProviders(
      <EmployeeForm
        draft={draft}
        departments={departments}
        employeeOptions={employeeOptions}
        onCancel={vi.fn()}
        onChange={vi.fn()}
        onSave={onSave}
        isSaving={false}
      />
    );
    return { ...result, onSave };
  }

  it('saves a complete draft without complaint', async () => {
    const user = userEvent.setup();
    const { onSave } = renderForm(validDraft);
    await user.click(screen.getByRole('button', { name: /Salva/i }));
    expect(onSave).toHaveBeenCalledOnce();
  });

  it('blocks an incomplete draft, highlights the fields, and names them in the toast', async () => {
    const errorSpy = vi.spyOn(toast, 'error').mockImplementation(() => 'id');
    const user = userEvent.setup();
    const { container, onSave } = renderForm(emptyEmployeeDraft);

    await user.click(screen.getByRole('button', { name: /Salva/i }));

    expect(onSave).not.toHaveBeenCalled();
    expect(errorSpy).toHaveBeenCalledWith(
      'Controlla i campi evidenziati',
      expect.objectContaining({
        // Listed in the order the form renders them, by their printed labels.
        description: expect.stringContaining('Numero Matricola, Nome, Cognome, Data di nascita'),
      })
    );
    // Not just a toast: the inputs themselves are marked.
    expect(container.querySelector('[data-field="employeeNumber"][data-invalid="true"]')).not.toBeNull();
    expect(container.querySelector('[data-field="firstName"][data-invalid="true"]')).not.toBeNull();
    expect(screen.getAllByText('Campo obbligatorio.').length).toBeGreaterThan(0);
  });

  it('marks nothing before the first save attempt', () => {
    const { container } = renderForm(emptyEmployeeDraft);
    expect(container.querySelector('[data-invalid="true"]')).toBeNull();
  });

  it('explains the cross-field date rules on the field they blame', async () => {
    const errorSpy = vi.spyOn(toast, 'error').mockImplementation(() => 'id');
    const user = userEvent.setup();
    const { container } = renderForm({
      ...validDraft,
      status: 'CESSATO',
      hireDate: '2020-01-02',
      terminationDate: '2019-12-31',
    });

    await user.click(screen.getByRole('button', { name: /Salva/i }));

    expect(errorSpy).toHaveBeenCalled();
    const terminationField = container.querySelector('[data-field="terminationDate"]');
    expect(terminationField).toHaveAttribute('data-invalid', 'true');
    expect(within(terminationField as HTMLElement).getByRole('alert')).toHaveTextContent(
      'Non può precedere la data di assunzione.'
    );
  });

  it('rejects an FTE outside the allowed range with the rule spelled out', async () => {
    vi.spyOn(toast, 'error').mockImplementation(() => 'id');
    const user = userEvent.setup();
    const { container, onSave } = renderForm({ ...validDraft, fte: '2' });

    await user.click(screen.getByRole('button', { name: /Salva/i }));

    expect(onSave).not.toHaveBeenCalled();
    expect(within(container.querySelector('[data-field="fte"]') as HTMLElement).getByRole('alert')).toHaveTextContent(
      'Inserisci un valore tra 0 e 1, con al massimo 3 decimali — per esempio 0,5.'
    );
  });

  it('highlights the Responsabile field itself, not just the message, once save is attempted', async () => {
    vi.spyOn(toast, 'error').mockImplementation(() => 'id');
    const user = userEvent.setup();
    const { container } = renderForm({
      ...validDraft,
      approvalRoleIds: { ...emptyEmployeeDraft.approvalRoleIds, responsabileIds: [] },
    });

    // Before: a plain hint, no error styling.
    expect(container.querySelector('[data-field="responsabileIds"][data-invalid="true"]')).toBeNull();

    await user.click(screen.getByRole('button', { name: /Salva/i }));

    const field = container.querySelector('[data-field="responsabileIds"]');
    expect(field).toHaveAttribute('data-invalid', 'true');
    // The input itself carries the invalid state, and the message is announced.
    expect(screen.getByRole('combobox', { name: 'Responsabile' })).toHaveAttribute('aria-invalid', 'true');
    expect(within(field as HTMLElement).getByRole('alert')).toHaveAttribute(
      'id',
      fieldErrorId('responsabileIds')
    );
    expect(within(field as HTMLElement).getByRole('alert')).toHaveTextContent(
      'Seleziona almeno un Responsabile per questo dipendente.'
    );
    // And its section is badged, for when the field is scrolled out of view.
    expect(field?.closest('fieldset')).toHaveAttribute('data-has-errors', 'true');
  });

  it('blocks an active employee with no Sostituto-Responsabile client-side', async () => {
    vi.spyOn(toast, 'error').mockImplementation(() => 'id');
    const user = userEvent.setup();
    // emp_2 is substitute-eligible, so the server's rule applies. Before this was
    // mirrored client-side the form let the save through and the API answered
    // SOSTITUTO_RESPONSABILE_REQUIRED after a round trip.
    const { container, onSave } = renderForm({
      ...validDraft,
      approvalRoleIds: { ...validDraft.approvalRoleIds, substituteResponsabileIds: [] },
    });

    await user.click(screen.getByRole('button', { name: /Salva/i }));

    expect(onSave).not.toHaveBeenCalled();
    const field = container.querySelector('[data-field="substituteResponsabileIds"]');
    expect(field).toHaveAttribute('data-invalid', 'true');
    expect(within(field as HTMLElement).getByRole('alert')).toHaveTextContent(
      'Seleziona almeno un Sostituto-Responsabile per questo dipendente.'
    );
  });

  it('does not require approver roles while bootstrapping, when nobody is eligible', async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    // No eligible candidates at all: the server's bootstrap exception applies, so
    // neither role may be demanded — the very first Responsabile cannot have one.
    renderWithProviders(
      <EmployeeForm
        draft={{ ...validDraft, approvalRoleIds: emptyEmployeeDraft.approvalRoleIds }}
        departments={departments}
        employeeOptions={[]}
        onCancel={vi.fn()}
        onChange={vi.fn()}
        onSave={onSave}
        isSaving={false}
      />
    );

    await user.click(screen.getByRole('button', { name: /Salva/i }));
    expect(onSave).toHaveBeenCalledOnce();
  });

  it('lists every problem in a summary that jumps to the field it names', async () => {
    vi.spyOn(toast, 'error').mockImplementation(() => 'id');
    const user = userEvent.setup();
    const { container } = renderForm({ ...validDraft, employeeNumber: '', fte: '9' });

    // No summary until the operator asks to save.
    expect(container.querySelector('[data-slot="form-error-summary"]')).toBeNull();
    await user.click(screen.getByRole('button', { name: /Salva/i }));

    const summary = container.querySelector('[data-slot="form-error-summary"]') as HTMLElement;
    expect(summary).not.toBeNull();
    expect(within(summary).getByText('Ci sono 2 campi da correggere prima di salvare:')).toBeInTheDocument();

    // Each entry names a field and jumps to it — the toast is gone in ten
    // seconds, this is what remains.
    const jump = within(summary).getByRole('button', { name: 'Vai al campo FTE' });
    await user.click(jump);
    expect(screen.getByLabelText('FTE')).toHaveFocus();
  });

  it('clears the summary as the last problem is fixed', async () => {
    vi.spyOn(toast, 'error').mockImplementation(() => 'id');
    const user = userEvent.setup();

    function Controlled() {
      const [draft, setDraft] = useState<EmployeeDraft>({ ...validDraft, employeeNumber: '' });
      return (
        <EmployeeForm
          draft={draft}
          departments={departments}
          employeeOptions={employeeOptions}
          onCancel={vi.fn()}
          onChange={setDraft}
          onSave={vi.fn()}
          isSaving={false}
        />
      );
    }

    const { container } = renderWithProviders(<Controlled />);
    await user.click(screen.getByRole('button', { name: /Salva/i }));
    expect(container.querySelector('[data-slot="form-error-summary"]')).not.toBeNull();

    await user.type(screen.getByLabelText('Numero Matricola'), '2001');

    expect(container.querySelector('[data-slot="form-error-summary"]')).toBeNull();
    expect(container.querySelector('[data-invalid="true"]')).toBeNull();
    expect(container.querySelector('[data-has-errors="true"]')).toBeNull();
  });

  it('shows the field errors a rejected save came back with', () => {
    const { container } = renderWithProviders(
      <EmployeeForm
        draft={validDraft}
        departments={departments}
        employeeOptions={employeeOptions}
        serverErrors={{ fields: { workEmail: 'Già assegnata a un altro dipendente.' }, rejectionId: 1 }}
        onCancel={vi.fn()}
        onChange={vi.fn()}
        onSave={vi.fn()}
        isSaving={false}
      />
    );

    const emailField = container.querySelector('[data-field="workEmail"]');
    expect(emailField).toHaveAttribute('data-invalid', 'true');
    expect(within(emailField as HTMLElement).getByRole('alert')).toHaveTextContent(
      'Già assegnata a un altro dipendente.'
    );
  });

  it('clears a rejected-value error once that field is edited', async () => {
    const user = userEvent.setup();

    function Controlled() {
      const [draft, setDraft] = useState<EmployeeDraft>(validDraft);
      return (
        <EmployeeForm
          draft={draft}
          departments={departments}
          employeeOptions={employeeOptions}
          serverErrors={{ fields: { workEmail: 'Già assegnata a un altro dipendente.' }, rejectionId: 1 }}
          onCancel={vi.fn()}
          onChange={setDraft}
          onSave={vi.fn()}
          isSaving={false}
        />
      );
    }

    const { container } = renderWithProviders(<Controlled />);
    expect(container.querySelector('[data-field="workEmail"][data-invalid="true"]')).not.toBeNull();

    // "Already taken" was a verdict on the submitted address; typing a new one
    // makes it stale, so it must not stay red while the operator fixes it.
    await user.type(screen.getByLabelText('Email di lavoro'), 'x');
    expect(container.querySelector('[data-field="workEmail"][data-invalid="true"]')).toBeNull();
  });

  it.each(['0x40', '6.4e1', '0b1000000'])(
    'refuses %s as an employee number rather than coercing it to 64',
    async (value) => {
      vi.spyOn(toast, 'error').mockImplementation(() => 'id');
      const user = userEvent.setup();
      const { container, onSave } = renderForm({ ...validDraft, employeeNumber: value });

      await user.click(screen.getByRole('button', { name: /Salva/i }));

      expect(onSave).not.toHaveBeenCalled();
      expect(container.querySelector('[data-field="employeeNumber"]')).toHaveAttribute('data-invalid', 'true');
    }
  );

  it('quotes the discarded retirement date in the operator’s own date format', async () => {
    const user = userEvent.setup();
    renderForm({ ...validDraft, retirementDateOverridden: true, retirementDate: '2050-06-30' });

    // Switching the confirmation off warns that the date will be recalculated.
    await user.click(screen.getByRole('switch', { name: 'Data pensionamento confermata' }));

    // "30 giugno 2050", matching what the field itself displays — not the
    // table formatter's fixed-English "30 Jun 2050".
    expect(await screen.findByText(/30 giugno 2050/)).toBeInTheDocument();
    expect(screen.queryByText(/30 Jun 2050/)).not.toBeInTheDocument();
  });

  it('re-marks a field when the identical rejection comes back', async () => {
    const user = userEvent.setup();
    const duplicate = { workEmail: 'Già assegnata a un altro dipendente.' };

    function Controlled({ rejectionId }: { rejectionId: number }) {
      const [draft, setDraft] = useState<EmployeeDraft>(validDraft);
      return (
        <EmployeeForm
          draft={draft}
          departments={departments}
          employeeOptions={employeeOptions}
          serverErrors={{ fields: duplicate, rejectionId }}
          onCancel={vi.fn()}
          onChange={setDraft}
          onSave={vi.fn()}
          isSaving={false}
        />
      );
    }

    const { container, rerender } = renderWithProviders(<Controlled rejectionId={1} />);
    const marked = () => container.querySelector('[data-field="workEmail"][data-invalid="true"]');
    expect(marked()).not.toBeNull();

    // Editing dismisses the verdict, because it was about the submitted value.
    await user.type(screen.getByLabelText('Email di lavoro'), 'x');
    expect(marked()).toBeNull();

    // Now the operator puts the duplicate address back and saves again. The
    // server returns a byte-identical payload, so nothing about `fields` has
    // changed — only that a second rejection happened. The mark has to return,
    // otherwise the save fails with a toast and no indication of where.
    rerender(<Controlled rejectionId={2} />);
    expect(marked()).not.toBeNull();
  });

  it('reports in English when the operator has switched language', async () => {
    await i18n.changeLanguage('en');
    const errorSpy = vi.spyOn(toast, 'error').mockImplementation(() => 'id');
    const user = userEvent.setup();
    try {
      renderForm(emptyEmployeeDraft);
      await user.click(screen.getByRole('button', { name: /Save/i }));
      expect(errorSpy).toHaveBeenCalledWith(
        'Check the highlighted fields',
        expect.objectContaining({ description: expect.stringContaining('Employee Number') })
      );
      expect(screen.getAllByText('This field is required.').length).toBeGreaterThan(0);
    } finally {
      await i18n.changeLanguage('it');
    }
  });
});

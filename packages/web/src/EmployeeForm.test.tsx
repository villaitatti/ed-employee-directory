import { describe, expect, it, vi } from 'vitest';
import { useState } from 'react';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { EmployeeForm, emptyEmployeeDraft } from './App.js';
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
    // 11 always-required fields + the Responsabile field, which is required here
    // because an eligible Responsabile (emp_1) exists to pick and the draft is ATTIVO.
    expect(container.querySelectorAll('.field-required')).toHaveLength(12);
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
    expect(birthDate).toHaveAttribute('data-dates-input', 'true');
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
    await user.click(screen.getByRole('option', { name: 'Cessato' }));
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

  it('renders the searchable TFR options', async () => {
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
    expect(screen.getByRole('option', { name: 'I Tatti' })).toBeInTheDocument();
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
    expect(screen.queryByRole('dialog', { name: 'Conferma richiesta' })).not.toBeInTheDocument();
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

    // Cancelling the Mantine confirmation keeps the form open.
    await user.keyboard('{Escape}');
    const confirmation = await screen.findByRole('dialog', { name: 'Conferma richiesta' });
    await user.click(within(confirmation).getByRole('button', { name: 'Annulla' }));
    expect(onCancel).not.toHaveBeenCalled();

    // Confirming the discard closes the form.
    await user.keyboard('{Escape}');
    await user.click(await screen.findByRole('button', { name: 'Scarta modifiche' }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('lets the discard confirmation own the keyboard while it is open', async () => {
    // Regression: the form's Escape/Tab handler used to be bound to `document`,
    // so it fought the layered Mantine confirmation — Escape re-opened the
    // confirmation the instant Mantine closed it, and Tab pulled focus back out
    // into the form behind it.
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
    const confirmation = await screen.findByRole('dialog', { name: 'Conferma richiesta' });

    // Tab stays inside the confirmation instead of escaping into the form behind it.
    await user.tab();
    expect(confirmation.contains(document.activeElement)).toBe(true);

    // Escape dismisses the confirmation instead of re-opening it, and leaves the
    // form itself open.
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog', { name: 'Conferma richiesta' })).not.toBeInTheDocument();
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
    expect(screen.getByRole('option', { name: 'Bianchi Bruno (1002)' })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: 'Rossi Ada (1001)' })).not.toBeInTheDocument();
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

    const removeButton = screen.getByRole('button', { name: /Rimuovi Approvatore non più idoneo/i });
    expect(removeButton).toBeInTheDocument();
    // Flagged visually too, so it reads as something to fix rather than a normal
    // selection sitting next to the eligible ones.
    expect(removeButton.closest('.employee-pill-invalid')).not.toBeNull();
    // An eligible selection carries no such flag.
    expect(screen.getByRole('button', { name: /Rimuovi Rossi Ada/i }).closest('.employee-pill-invalid')).toBeNull();
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
    expect(screen.getByRole('option', { name: 'Rossi Ada (1001)' })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: 'Bianchi Bruno (1002)' })).not.toBeInTheDocument();
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

    expect(screen.getByText('Seleziona almeno un Responsabile per questo dipendente.')).toBeInTheDocument();
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
});

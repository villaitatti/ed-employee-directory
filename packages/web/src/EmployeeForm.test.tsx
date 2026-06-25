import { describe, expect, it, vi } from 'vitest';
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
    canBeSubstituteResponsible: false,
  },
  {
    id: 'emp_2',
    employeeNumber: 1002,
    firstName: 'Bruno',
    lastName: 'Bianchi',
    status: 'ATTIVO' as const,
    department,
    canBeSubstituteResponsible: true,
  },
];

describe('EmployeeForm modal', () => {
  it('renders as a modal dialog', () => {
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
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('renders the TFR options', () => {
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

    expect(screen.getByLabelText('TFR')).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'I Tatti' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Fondo Pensione' })).toBeInTheDocument();
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

    // Confirm dialog returns false → close is cancelled.
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false);
    await user.keyboard('{Escape}');
    expect(confirmSpy).toHaveBeenCalled();
    expect(onCancel).not.toHaveBeenCalled();

    // Confirm returns true → close proceeds.
    confirmSpy.mockReturnValue(true);
    await user.keyboard('{Escape}');
    expect(onCancel).toHaveBeenCalledTimes(1);
    confirmSpy.mockRestore();
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

  it('filters the Sostituto-Responsabile picker to eligible employees', () => {
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

    const substituteSelect = screen.getByLabelText('Sostituto-Responsabile');
    expect(within(substituteSelect).getByRole('option', { name: 'Bianchi Bruno (1002)' })).toBeInTheDocument();
    expect(within(substituteSelect).queryByRole('option', { name: 'Rossi Ada (1001)' })).not.toBeInTheDocument();
  });
});

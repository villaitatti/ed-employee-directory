import { describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { EmployeeForm, emptyEmployeeDraft } from './App.js';
import { renderWithProviders } from './test/render.js';

const departments = [{ id: 'dept_1', name: 'Amministrazione', normalizedName: 'amministrazione', createdAt: '', updatedAt: '' }];

describe('EmployeeForm modal', () => {
  it('renders as a modal dialog', () => {
    renderWithProviders(
      <EmployeeForm
        draft={emptyEmployeeDraft}
        departments={departments}
        onCancel={vi.fn()}
        onChange={vi.fn()}
        onSave={vi.fn()}
        isSaving={false}
      />
    );
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('closes immediately via Escape when the form is pristine', async () => {
    const onCancel = vi.fn();
    const user = userEvent.setup();
    renderWithProviders(
      <EmployeeForm
        draft={emptyEmployeeDraft}
        departments={departments}
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
});

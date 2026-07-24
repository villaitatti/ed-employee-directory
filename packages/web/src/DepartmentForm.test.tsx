import { describe, expect, it, vi } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DepartmentForm, emptyDepartmentDraft } from './App.js';
import { renderWithProviders } from './test/render.js';

describe('DepartmentForm modal', () => {
  it('renders as a modal dialog', () => {
    renderWithProviders(
      <DepartmentForm
        draft={emptyDepartmentDraft}
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
      <DepartmentForm
        draft={emptyDepartmentDraft}
        onCancel={onCancel}
        onChange={vi.fn()}
        onSave={vi.fn()}
        isSaving={false}
      />
    );

    await user.keyboard('{Escape}');
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('shows the create title when the draft has no id', () => {
    renderWithProviders(
      <DepartmentForm
        draft={emptyDepartmentDraft}
        onCancel={vi.fn()}
        onChange={vi.fn()}
        onSave={vi.fn()}
        isSaving={false}
      />
    );
    // Italian label for "New department".
    expect(screen.getByRole('heading', { name: 'Nuovo dipartimento' })).toBeInTheDocument();
  });

  it('shows the department name as the title when editing an existing department', () => {
    renderWithProviders(
      <DepartmentForm
        draft={{ id: 'dept_1', name: 'Amministrazione' }}
        onCancel={vi.fn()}
        onChange={vi.fn()}
        onSave={vi.fn()}
        isSaving={false}
      />
    );
    expect(screen.getByRole('heading', { name: 'Amministrazione' })).toBeInTheDocument();
    expect(screen.getByRole('dialog')).toHaveAttribute('aria-label', 'Amministrazione');
  });

  it('disables the save button while a save is in flight', () => {
    renderWithProviders(
      <DepartmentForm
        draft={emptyDepartmentDraft}
        onCancel={vi.fn()}
        onChange={vi.fn()}
        onSave={vi.fn()}
        isSaving
      />
    );
    expect(screen.getByRole('button', { name: /salva/i })).toBeDisabled();
  });

  it('closes via a backdrop click when the form is pristine', async () => {
    const onCancel = vi.fn();
    const user = userEvent.setup();
    renderWithProviders(
      <DepartmentForm
        draft={emptyDepartmentDraft}
        onCancel={onCancel}
        onChange={vi.fn()}
        onSave={vi.fn()}
        isSaving={false}
      />
    );

    // The overlay (presentation role) is the backdrop; clicking it closes the modal.
    const overlay = screen.getByRole('dialog').parentElement as HTMLElement;
    await user.pointer({ keys: '[MouseLeft>]', target: overlay });
    await user.pointer({ keys: '[/MouseLeft]', target: overlay });
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('submits the draft when the form is saved', async () => {
    const onSave = vi.fn();
    const user = userEvent.setup();
    renderWithProviders(
      <DepartmentForm
        draft={{ ...emptyDepartmentDraft, name: 'Amministrazione' }}
        onCancel={vi.fn()}
        onChange={vi.fn()}
        onSave={onSave}
        isSaving={false}
      />
    );

    await user.click(screen.getByRole('button', { name: /salva/i }));
    expect(onSave).toHaveBeenCalledTimes(1);
  });

  it('prompts before discarding when there are unsaved changes', async () => {
    const onCancel = vi.fn();
    const user = userEvent.setup();
    let draft = { ...emptyDepartmentDraft };
    const onChange = vi.fn((next) => {
      draft = next;
    });

    const { rerender } = renderWithProviders(
      <DepartmentForm
        draft={draft}
        onCancel={onCancel}
        onChange={onChange}
        onSave={vi.fn()}
        isSaving={false}
      />
    );

    // Type into the Department name (Italian label "Dipartimento") to make the form dirty.
    await user.type(screen.getByLabelText('Dipartimento'), 'Ricerca');
    rerender(
      <DepartmentForm
        draft={{ ...draft, name: 'Ricerca' }}
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
});

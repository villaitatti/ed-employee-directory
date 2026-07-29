import { describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import { emptyEmployeeDraft } from './employee-draft.js';
import { DepartmentForm, emptyDepartmentDraft } from './routes/DepartmentForm.js';
import { EmployeeForm } from './routes/EmployeeForm.js';
import { ImportPage } from './routes/ImportPage.js';
import { SettingsPage } from './routes/SettingsPage.js';
import { renderWithProviders } from './test/render.js';

const department = {
  id: 'dept_1',
  name: 'Amministrazione',
  normalizedName: 'amministrazione',
  createdAt: '',
  updatedAt: '',
};

/**
 * The browser's own form UI is never acceptable here: its constraint-validation
 * bubble says "Please fill out this field." in the *browser's* language on a form
 * the operator has set to Italian, points at one field at a time, and cannot
 * express the cross-field rules this domain has. Every form therefore opts out of
 * native validation and reports problems itself.
 *
 * These are cheap attribute checks on purpose — the behaviour they protect is
 * invisible in jsdom (which implements no validation UI), so nothing else in the
 * suite would notice if `noValidate` were dropped in a refactor.
 */
describe('no native browser form UI', () => {
  it('opts the employee form out of native validation', () => {
    renderWithProviders(
      <EmployeeForm
        draft={emptyEmployeeDraft}
        departments={[department]}
        employeeOptions={[]}
        onCancel={vi.fn()}
        onChange={vi.fn()}
        onSave={vi.fn()}
        isSaving={false}
      />
    );
    expect(screen.getByRole('dialog')).toHaveAttribute('novalidate');
  });

  it('opts the department form out of native validation', () => {
    renderWithProviders(
      <DepartmentForm
        draft={emptyDepartmentDraft}
        onCancel={vi.fn()}
        onChange={vi.fn()}
        onSave={vi.fn()}
        isSaving={false}
      />
    );
    expect(screen.getByRole('dialog')).toHaveAttribute('novalidate');
  });

  it('opts the settings form out of native validation and avoids number spinners', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(JSON.stringify({ data: { retirementPolicy: { years: 67, months: 3 }, updatedAt: null } }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        })
      )
    );
    const { container } = renderWithProviders(<SettingsPage />);

    const years = await screen.findByLabelText('Anni');
    expect(container.querySelector('form')).toHaveAttribute('novalidate');
    // type="number" would add the browser's spinner arrows and let a stray
    // scroll-wheel silently change a value that rewrites every retirement date.
    expect(years).toHaveAttribute('type', 'text');
    expect(years).toHaveAttribute('inputmode', 'numeric');
    expect(container.querySelector('input[type="number"]')).toBeNull();
    vi.unstubAllGlobals();
  });

  it('picks the import file with a localized control, not the browser widget', () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(JSON.stringify({ data: [] }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        })
      )
    );
    const { container } = renderWithProviders(<ImportPage />);

    // A bare <input type="file"> renders the browser's own control, which reads
    // "Choose File / No file chosen" in the browser's language and ignores the
    // app's styling. FilePicker keeps a real file input to open the picker but
    // hides it, exposing a styled button with our own placeholder instead.
    const nativeInput = container.querySelector('input[type="file"]');
    expect(nativeInput).toHaveStyle({ display: 'none' });
    expect(screen.getByRole('button', { name: 'File Excel da importare' })).toBeInTheDocument();
    expect(screen.getByText('Scegli un file .xlsx…')).toBeInTheDocument();
    vi.unstubAllGlobals();
  });
});

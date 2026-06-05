import {
  Building2,
  ClipboardList,
  Download,
  FileCheck2,
  History,
  Languages,
  LogOut,
  Plus,
  Save,
  Search,
  Settings,
  Trash2,
  Upload,
  UsersRound,
  X,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { NavLink, Navigate, Route, Routes } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast, Toaster } from 'sonner';
import {
  CONTRACT_TYPES,
  EMPLOYEE_STATUSES,
  RETIREMENT_MONTHS_MAX,
  RETIREMENT_MONTHS_MIN,
  RETIREMENT_YEARS_MAX,
  RETIREMENT_YEARS_MIN,
  USA_CATEGORIES,
  type ContractType,
  type Department,
  type Employee,
  type EmployeeStatus,
  type ImportPreview,
  type UsaCategory,
} from '@itatti/shared';
import { createApiClient } from './api/client.js';
import { useEdAuth } from './auth/AuthProvider.js';
import './styles/app.css';

export type EmployeeDraft = {
  id?: string;
  employeeNumber: string;
  firstName: string;
  lastName: string;
  departmentId: string;
  birthDate: string;
  hireDate: string;
  terminationDate: string;
  retirementDate: string;
  resetRetirementDate: boolean;
  fte: string;
  usaCategory: UsaCategory;
  contractType: ContractType;
  status: EmployeeStatus;
};

export const emptyEmployeeDraft: EmployeeDraft = {
  employeeNumber: '',
  firstName: '',
  lastName: '',
  departmentId: '',
  birthDate: '',
  hireDate: '',
  terminationDate: '',
  retirementDate: '',
  resetRetirementDate: false,
  fte: '1',
  usaCategory: 'EXEMPT',
  contractType: 'INDETERMINATO',
  status: 'ATTIVO',
};

function toEmployeeDraft(employee: Employee): EmployeeDraft {
  return {
    id: employee.id,
    employeeNumber: String(employee.employeeNumber),
    firstName: employee.firstName,
    lastName: employee.lastName,
    departmentId: employee.departmentId,
    birthDate: employee.birthDate,
    hireDate: employee.hireDate ?? '',
    terminationDate: employee.terminationDate ?? '',
    retirementDate: employee.retirementDate,
    resetRetirementDate: false,
    fte: String(employee.fte).replace('.', ','),
    usaCategory: employee.usaCategory,
    contractType: employee.contractType,
    status: employee.status,
  };
}

function useApi() {
  const auth = useEdAuth();
  return useMemo(() => createApiClient(auth.getAccessToken), [auth]);
}

function useDepartments(api: ReturnType<typeof createApiClient>) {
  return useQuery({ queryKey: ['departments'], queryFn: api.departments });
}

function Shell() {
  const { t, i18n } = useTranslation();
  const auth = useEdAuth();

  if (auth.isLoading) {
    return <div className="app-loading">ED</div>;
  }

  if (!auth.isAuthenticated) {
    return (
      <main className="signin-screen">
        <img className="brand-logo" src="/itatti-logo.png" alt="I Tatti" />
        <div>
          <p className="eyebrow">{t('copy.productEyebrow')}</p>
          <h1>ED - Employee Directory</h1>
          <p>{t('copy.subtitle')}</p>
          <button className="button primary" onClick={() => void auth.login()}>
            {t('actions.signIn')}
          </button>
        </div>
      </main>
    );
  }

  const toggleLanguage = () => {
    void i18n.changeLanguage(i18n.language === 'it' ? 'en' : 'it');
  };

  return (
    <>
      <Toaster richColors position="top-right" />
      <div className="app-shell">
        <header className="topbar">
          <div className="identity">
            <img className="brand-logo" src="/itatti-logo.png" alt="I Tatti" />
            <div>
              <p className="eyebrow">{t('copy.productEyebrow')}</p>
              <h1>ED - Employee Directory</h1>
            </div>
          </div>
          <div className="topbar-actions">
            <button className="icon-button" type="button" onClick={toggleLanguage} title="Language">
              <Languages size={18} />
              <span>{i18n.language.toUpperCase()}</span>
            </button>
            <button className="icon-button" type="button" onClick={auth.logout} title={t('actions.signOut')}>
              <LogOut size={18} />
            </button>
          </div>
        </header>
        <div className="workbench">
          <nav className="sidebar" aria-label="Primary">
            <NavLink to="/employees">
              <UsersRound size={18} />
              {t('nav.employees')}
            </NavLink>
            <NavLink to="/departments">
              <Building2 size={18} />
              {t('nav.departments')}
            </NavLink>
            <NavLink to="/import">
              <Upload size={18} />
              {t('nav.import')}
            </NavLink>
            <NavLink to="/audit">
              <History size={18} />
              {t('nav.audit')}
            </NavLink>
            <NavLink to="/settings">
              <Settings size={18} />
              {t('nav.settings')}
            </NavLink>
            <div className="sidebar-version" aria-label={`Version ${__APP_VERSION__}`}>
              v{__APP_VERSION__}
            </div>
          </nav>
          <main className="content">
            <Routes>
              <Route path="/" element={<Navigate to="/employees" replace />} />
              <Route path="/employees" element={<EmployeesPage />} />
              <Route path="/departments" element={<DepartmentsPage />} />
              <Route path="/import" element={<ImportPage />} />
              <Route path="/audit" element={<AuditPage />} />
              <Route path="/settings" element={<SettingsPage />} />
            </Routes>
          </main>
        </div>
      </div>
    </>
  );
}

function EmployeesPage() {
  const { t } = useTranslation();
  const api = useApi();
  const queryClient = useQueryClient();
  const [filters, setFilters] = useState({ q: '', status: '', departmentId: '' });
  const [draft, setDraft] = useState<EmployeeDraft | null>(null);
  const departments = useDepartments(api);
  const employees = useQuery({
    queryKey: ['employees', filters],
    queryFn: () =>
      api.employees({
        q: filters.q || undefined,
        status: filters.status || undefined,
        departmentId: filters.departmentId || undefined,
      }),
  });

  const saveEmployee = useMutation({
    mutationFn: async (input: EmployeeDraft) => {
      const payload = {
        employeeNumber: Number(input.employeeNumber),
        firstName: input.firstName,
        lastName: input.lastName,
        departmentId: input.departmentId,
        birthDate: input.birthDate,
        hireDate: input.hireDate || null,
        terminationDate: input.terminationDate || null,
        retirementDate: input.retirementDate || null,
        resetRetirementDate: input.resetRetirementDate,
        fte: Number(input.fte.replace(',', '.')),
        usaCategory: input.usaCategory,
        contractType: input.contractType,
        status: input.status,
      };
      return input.id ? api.updateEmployee(input.id, payload) : api.createEmployee(payload);
    },
    onSuccess: () => {
      setDraft(null);
      toast.success(t('actions.save'));
      void queryClient.invalidateQueries({ queryKey: ['employees'] });
      void queryClient.invalidateQueries({ queryKey: ['audit'] });
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : 'Error'),
  });

  const deleteEmployee = useMutation({
    mutationFn: api.deleteEmployee,
    onSuccess: () => {
      toast.success(t('actions.delete'));
      void queryClient.invalidateQueries({ queryKey: ['employees'] });
      void queryClient.invalidateQueries({ queryKey: ['audit'] });
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : 'Error'),
  });

  const exportEmployees = async () => {
    try {
      const blob = await api.exportEmployeesCsv({
        q: filters.q || undefined,
        status: filters.status || undefined,
        departmentId: filters.departmentId || undefined,
      });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'ed-employees.csv';
      document.body.append(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 0);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Error');
    }
  };

  return (
    <section className="page-grid employees-grid">
      <div className="section-heading">
        <div>
          <p className="eyebrow">{t('nav.employees')}</p>
          <h2>{t('copy.subtitle')}</h2>
        </div>
        <div className="action-row">
          <button className="button secondary" type="button" onClick={exportEmployees}>
            <Download size={16} />
            {t('actions.export')}
          </button>
          <button className="button primary" type="button" onClick={() => setDraft(emptyEmployeeDraft)}>
            <Plus size={16} />
            {t('actions.createEmployee')}
          </button>
        </div>
      </div>

      <div className="toolbar">
        <label className="search-field">
          <Search size={16} />
          <input
            value={filters.q}
            onChange={(event) => setFilters((current) => ({ ...current, q: event.target.value }))}
            placeholder={t('fields.search')}
          />
        </label>
        <select
          value={filters.status}
          onChange={(event) => setFilters((current) => ({ ...current, status: event.target.value }))}
          aria-label={t('fields.status')}
        >
          <option value="">{t('fields.status')}</option>
          {EMPLOYEE_STATUSES.map((status) => (
            <option key={status} value={status}>
              {t(`status.${status}`)}
            </option>
          ))}
        </select>
        <select
          value={filters.departmentId}
          onChange={(event) => setFilters((current) => ({ ...current, departmentId: event.target.value }))}
          aria-label={t('fields.department')}
        >
          <option value="">{t('fields.department')}</option>
          {departments.data?.map((department) => (
            <option key={department.id} value={department.id}>
              {department.name}
            </option>
          ))}
        </select>
      </div>

      <div className="data-surface">
        <table>
          <thead>
            <tr>
              <th>{t('fields.employeeNumber')}</th>
              <th>{t('fields.lastName')}</th>
              <th>{t('fields.firstName')}</th>
              <th>{t('fields.department')}</th>
              <th>{t('fields.status')}</th>
              <th>{t('fields.fte')}</th>
              <th>{t('fields.retirementDate')}</th>
              <th aria-label="Actions" />
            </tr>
          </thead>
          <tbody>
            {employees.data?.data.map((employee) => (
              <tr key={employee.id}>
                <td>{employee.employeeNumber}</td>
                <td>{employee.lastName}</td>
                <td>{employee.firstName}</td>
                <td>{employee.department?.name}</td>
                <td>
                  <span className={`status-pill status-${employee.status.toLowerCase()}`}>{t(`status.${employee.status}`)}</span>
                </td>
                <td>{employee.fte}</td>
                <td>{employee.retirementDate}</td>
                <td className="row-actions">
                  <button className="text-button" type="button" onClick={() => setDraft(toEmployeeDraft(employee))}>
                    Edit
                  </button>
                  <button className="icon-danger" type="button" onClick={() => deleteEmployee.mutate(employee.id)} title={t('actions.delete')}>
                    <Trash2 size={16} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!employees.isLoading && employees.data?.data.length === 0 ? (
          <p className="empty-state">{t('copy.emptyEmployees')}</p>
        ) : null}
      </div>

      {draft ? (
        <EmployeeForm
          draft={draft}
          departments={departments.data ?? []}
          onCancel={() => setDraft(null)}
          onChange={setDraft}
          onSave={() => saveEmployee.mutate(draft)}
          isSaving={saveEmployee.isPending}
        />
      ) : null}
    </section>
  );
}

export function EmployeeForm({
  draft,
  departments,
  onCancel,
  onChange,
  onSave,
  isSaving,
}: {
  draft: EmployeeDraft;
  departments: Department[];
  onCancel: () => void;
  onChange: (draft: EmployeeDraft) => void;
  onSave: () => void;
  isSaving: boolean;
}) {
  const { t } = useTranslation();
  const set = <K extends keyof EmployeeDraft>(key: K, value: EmployeeDraft[K]) => {
    onChange({ ...draft, [key]: value });
  };

  const initialDraft = useRef(draft);
  const isDirty = JSON.stringify(draft) !== JSON.stringify(initialDraft.current);

  const requestClose = useCallback(() => {
    if (isDirty && !window.confirm(t('copy.discardChanges'))) return;
    onCancel();
  }, [isDirty, onCancel, t]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') requestClose();
    };
    document.addEventListener('keydown', onKeyDown);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = '';
    };
  }, [requestClose]);

  return (
    <div
      className="modal-overlay"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) requestClose();
      }}
    >
      <form
        className="modal-dialog"
        role="dialog"
        aria-modal="true"
        aria-label={draft.id ? `${draft.lastName} ${draft.firstName}` : t('actions.createEmployee')}
        onSubmit={(event) => {
          event.preventDefault();
          onSave();
        }}
      >
        <header className="modal-header">
          <div>
            <p className="eyebrow">{t('nav.employees')}</p>
            <h3>{draft.id ? `${draft.lastName} ${draft.firstName}` : t('actions.createEmployee')}</h3>
          </div>
          <button className="modal-close" type="button" onClick={requestClose} aria-label={t('actions.cancel')}>
            <X size={18} />
          </button>
        </header>

        <div className="modal-body">
          <fieldset className="form-section">
            <legend>{t('sections.identity')}</legend>
            <div className="form-grid">
              <Field label={t('fields.employeeNumber')}>
                <input required inputMode="numeric" value={draft.employeeNumber} onChange={(e) => set('employeeNumber', e.target.value)} />
              </Field>
              <Field label={t('fields.department')}>
                <select required value={draft.departmentId} onChange={(e) => set('departmentId', e.target.value)}>
                  <option value="" />
                  {departments.map((department) => (
                    <option key={department.id} value={department.id}>
                      {department.name}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label={t('fields.firstName')}>
                <input required value={draft.firstName} onChange={(e) => set('firstName', e.target.value)} />
              </Field>
              <Field label={t('fields.lastName')}>
                <input required value={draft.lastName} onChange={(e) => set('lastName', e.target.value)} />
              </Field>
              <Field label={t('fields.birthDate')}>
                <input required type="date" value={draft.birthDate} onChange={(e) => set('birthDate', e.target.value)} />
              </Field>
            </div>
          </fieldset>

          <fieldset className="form-section">
            <legend>{t('sections.employment')}</legend>
            <div className="form-grid">
              <Field label={t('fields.hireDate')}>
                <input type="date" value={draft.hireDate} onChange={(e) => set('hireDate', e.target.value)} />
              </Field>
              <Field label={t('fields.terminationDate')}>
                <input type="date" value={draft.terminationDate} onChange={(e) => set('terminationDate', e.target.value)} />
              </Field>
              <Field label={t('fields.fte')}>
                <input required inputMode="decimal" value={draft.fte} onChange={(e) => set('fte', e.target.value)} />
              </Field>
              <Field label={t('fields.status')}>
                <select value={draft.status} onChange={(e) => set('status', e.target.value as EmployeeStatus)}>
                  {EMPLOYEE_STATUSES.map((option) => (
                    <option key={option} value={option}>
                      {t(`status.${option}`)}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label={t('fields.retirementDate')} full>
                <div className="inline-field">
                  <input type="date" value={draft.retirementDate} onChange={(e) => set('retirementDate', e.target.value)} />
                  <label className="checkbox-row">
                    <input
                      type="checkbox"
                      checked={draft.resetRetirementDate}
                      onChange={(e) => set('resetRetirementDate', e.target.checked)}
                    />
                    {t('actions.resetRetirement')}
                  </label>
                </div>
              </Field>
            </div>
          </fieldset>

          <fieldset className="form-section">
            <legend>{t('sections.classification')}</legend>
            <div className="form-grid">
              <Field label={t('fields.contractType')}>
                <select value={draft.contractType} onChange={(e) => set('contractType', e.target.value as ContractType)}>
                  {CONTRACT_TYPES.map((option) => (
                    <option key={option} value={option}>
                      {t(`contractType.${option}`)}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label={t('fields.usaCategory')}>
                <select value={draft.usaCategory} onChange={(e) => set('usaCategory', e.target.value as UsaCategory)}>
                  {USA_CATEGORIES.map((option) => (
                    <option key={option} value={option}>
                      {t(`usaCategory.${option}`)}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
          </fieldset>
        </div>

        <footer className="modal-footer">
          <button className="button ghost" type="button" onClick={requestClose}>
            {t('actions.cancel')}
          </button>
          <button className="button primary" type="submit" disabled={isSaving}>
            <Save size={16} />
            {t('actions.save')}
          </button>
        </footer>
      </form>
    </div>
  );
}

function DepartmentsPage() {
  const { t } = useTranslation();
  const api = useApi();
  const queryClient = useQueryClient();
  const departments = useDepartments(api);
  const [name, setName] = useState('');
  const [editing, setEditing] = useState<Department | null>(null);
  const saveDepartment = useMutation({
    mutationFn: async () =>
      editing ? api.updateDepartment(editing.id, { name }) : api.createDepartment({ name }),
    onSuccess: () => {
      setName('');
      setEditing(null);
      void queryClient.invalidateQueries({ queryKey: ['departments'] });
      toast.success(t('actions.save'));
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : 'Error'),
  });
  const deleteDepartment = useMutation({
    mutationFn: api.deleteDepartment,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['departments'] });
      toast.success(t('actions.delete'));
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : 'Error'),
  });

  return (
    <section className="page-grid">
      <div className="section-heading">
        <div>
          <p className="eyebrow">{t('nav.departments')}</p>
          <h2>{t('copy.emptyDepartments')}</h2>
        </div>
      </div>
      <form
        className="toolbar department-form"
        onSubmit={(event) => {
          event.preventDefault();
          saveDepartment.mutate();
        }}
      >
        <input value={name} onChange={(event) => setName(event.target.value)} placeholder={t('fields.department')} required />
        <button className="button primary" type="submit">
          <Save size={16} />
          {t('actions.save')}
        </button>
        {editing ? (
          <button
            className="button ghost"
            type="button"
            onClick={() => {
              setEditing(null);
              setName('');
            }}
          >
            {t('actions.cancel')}
          </button>
        ) : null}
      </form>
      <div className="data-surface">
        <table>
          <thead>
            <tr>
              <th>{t('fields.department')}</th>
              <th>Updated</th>
              <th aria-label="Actions" />
            </tr>
          </thead>
          <tbody>
            {departments.data?.map((department) => (
              <tr key={department.id}>
                <td>{department.name}</td>
                <td>{new Date(department.updatedAt).toLocaleDateString()}</td>
                <td className="row-actions">
                  <button
                    className="text-button"
                    type="button"
                    onClick={() => {
                      setEditing(department);
                      setName(department.name);
                    }}
                  >
                    Edit
                  </button>
                  <button className="icon-danger" type="button" onClick={() => deleteDepartment.mutate(department.id)}>
                    <Trash2 size={16} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function ImportPage() {
  const { t } = useTranslation();
  const api = useApi();
  const queryClient = useQueryClient();
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [selectedRows, setSelectedRows] = useState<number[]>([]);
  const previewImport = useMutation({
    mutationFn: async () => {
      if (!file) throw new Error('CSV required.');
      return api.previewImport(file);
    },
    onSuccess: (data) => {
      setPreview(data);
      setSelectedRows(data.rows.filter((row) => row.selected).map((row) => row.rowNumber));
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : 'Error'),
  });
  const commitImport = useMutation({
    mutationFn: async () => {
      if (!preview) throw new Error('Preview required.');
      return api.commitImport(preview.batchId, selectedRows);
    },
    onSuccess: (result) => {
      toast.success(`${result.data.committed.length} rows committed`);
      setPreview(null);
      setSelectedRows([]);
      setFile(null);
      void queryClient.invalidateQueries({ queryKey: ['employees'] });
      void queryClient.invalidateQueries({ queryKey: ['audit'] });
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : 'Error'),
  });

  return (
    <section className="page-grid">
      <div className="section-heading">
        <div>
          <p className="eyebrow">{t('nav.import')}</p>
          <h2>{t('copy.importInstructions')}</h2>
        </div>
      </div>
      <form
        className="toolbar import-toolbar"
        onSubmit={(event) => {
          event.preventDefault();
          previewImport.mutate();
        }}
      >
        <input type="file" accept=".csv,text/csv" onChange={(event) => setFile(event.target.files?.[0] ?? null)} />
        <button className="button primary" type="submit" disabled={!file || previewImport.isPending}>
          <FileCheck2 size={16} />
          {t('actions.preview')}
        </button>
      </form>
      {preview ? (
        <div className="data-surface">
          <div className="table-topline">
            <strong>{preview.rows.length} rows</strong>
            <button
              className="button primary"
              type="button"
              onClick={() => commitImport.mutate()}
              disabled={selectedRows.length === 0 || commitImport.isPending}
            >
              <ClipboardList size={16} />
              {t('actions.commit')}
            </button>
          </div>
          <table>
            <thead>
              <tr>
                <th aria-label="Select" />
                <th>Row</th>
                <th>{t('fields.employeeNumber')}</th>
                <th>{t('fields.lastName')}</th>
                <th>{t('fields.department')}</th>
                <th>Action</th>
                <th>Errors</th>
              </tr>
            </thead>
            <tbody>
              {preview.rows.map((row) => (
                <tr key={row.rowNumber} className={row.errors.length ? 'row-error' : undefined}>
                  <td>
                    <input
                      type="checkbox"
                      disabled={row.errors.length > 0}
                      checked={selectedRows.includes(row.rowNumber)}
                      onChange={(event) => {
                        setSelectedRows((current) =>
                          event.target.checked
                            ? [...current, row.rowNumber]
                            : current.filter((rowNumber) => rowNumber !== row.rowNumber)
                        );
                      }}
                    />
                  </td>
                  <td>{row.rowNumber}</td>
                  <td>{row.normalized?.employeeNumber}</td>
                  <td>{row.normalized?.lastName}</td>
                  <td>{row.normalized?.departmentId}</td>
                  <td>{row.proposedAction}</td>
                  <td>{row.errors.join(' ')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </section>
  );
}

function AuditPage() {
  const { t } = useTranslation();
  const api = useApi();
  const [employeeNumber, setEmployeeNumber] = useState('');
  const audit = useQuery({
    queryKey: ['audit', employeeNumber],
    queryFn: () => api.auditLogs(employeeNumber || undefined),
  });

  return (
    <section className="page-grid">
      <div className="section-heading">
        <div>
          <p className="eyebrow">{t('nav.audit')}</p>
          <h2>Append-only change history</h2>
        </div>
      </div>
      <div className="toolbar">
        <label className="search-field">
          <Search size={16} />
          <input value={employeeNumber} onChange={(event) => setEmployeeNumber(event.target.value)} placeholder={t('fields.employeeNumber')} />
        </label>
      </div>
      <div className="data-surface">
        <table>
          <thead>
            <tr>
              <th>Time</th>
              <th>Actor</th>
              <th>Entity</th>
              <th>Action</th>
              <th>{t('fields.employeeNumber')}</th>
            </tr>
          </thead>
          <tbody>
            {audit.data?.map((entry) => (
              <tr key={entry.id}>
                <td>{new Date(entry.createdAt).toLocaleString()}</td>
                <td>{entry.actorEmail ?? entry.actorSub}</td>
                <td>{entry.entityType}</td>
                <td>{entry.action}</td>
                <td>{entry.employeeNumber}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export function SettingsPage() {
  const { t } = useTranslation();
  const api = useApi();
  const queryClient = useQueryClient();
  const settings = useQuery({ queryKey: ['settings'], queryFn: api.settings });

  const [years, setYears] = useState('');
  const [months, setMonths] = useState('');
  const [edited, setEdited] = useState(false);

  const loaded = settings.data;

  // Seed the inputs once the setting loads, unless the user is already editing.
  useEffect(() => {
    if (loaded && !edited) {
      setYears(String(loaded.retirementPolicy.years));
      setMonths(String(loaded.retirementPolicy.months));
    }
  }, [loaded, edited]);

  const savePolicy = useMutation({
    mutationFn: async () =>
      api.updateRetirementPolicy({ years: Number(years), months: Number(months) }),
    onSuccess: (result) => {
      setEdited(false);
      toast.success(t('settings.recalcDone', { count: result.recalculatedEmployees }));
      void queryClient.invalidateQueries({ queryKey: ['settings'] });
      void queryClient.invalidateQueries({ queryKey: ['employees'] });
      void queryClient.invalidateQueries({ queryKey: ['audit'] });
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : 'Error'),
  });

  return (
    <section className="page-grid settings-grid">
      <div className="section-heading">
        <div>
          <p className="eyebrow">{t('nav.settings')}</p>
          <h2>{t('settings.title')}</h2>
        </div>
      </div>

      <form
        className="settings-card"
        onSubmit={(event) => {
          event.preventDefault();
          savePolicy.mutate();
        }}
      >
        <p className="settings-description">{t('settings.description')}</p>

        <div className="settings-fields">
          <Field label={t('settings.years')}>
            <input
              required
              type="number"
              inputMode="numeric"
              min={RETIREMENT_YEARS_MIN}
              max={RETIREMENT_YEARS_MAX}
              value={years}
              onChange={(e) => {
                setEdited(true);
                setYears(e.target.value);
              }}
            />
          </Field>
          <Field label={t('settings.months')}>
            <input
              required
              type="number"
              inputMode="numeric"
              min={RETIREMENT_MONTHS_MIN}
              max={RETIREMENT_MONTHS_MAX}
              value={months}
              onChange={(e) => {
                setEdited(true);
                setMonths(e.target.value);
              }}
            />
          </Field>
        </div>

        <p className="settings-meta">
          {loaded?.updatedAt
            ? `${t('settings.lastUpdated')}: ${new Date(loaded.updatedAt).toLocaleString()}`
            : t('settings.neverUpdated')}
        </p>
        <p className="settings-note">{t('settings.recalcNote')}</p>

        <div className="action-row">
          <button className="button primary" type="submit" disabled={savePolicy.isPending}>
            <Save size={16} />
            {t('actions.save')}
          </button>
        </div>
      </form>
    </section>
  );
}

function Field({ label, children, full }: { label: string; children: React.ReactNode; full?: boolean }) {
  return (
    <label className={full ? 'field field-full' : 'field'}>
      <span>{label}</span>
      {children}
    </label>
  );
}

export default function App() {
  return <Shell />;
}

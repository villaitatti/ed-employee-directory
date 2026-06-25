import type {
  AuditLog,
  Department,
  DepartmentCreateInput,
  Employee,
  EmployeeOption,
  EmployeeWriteInput,
  ImportPreview,
  PaginatedEmployees,
  RetirementPolicyInput,
  Settings,
} from '@itatti/shared';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '';

type TokenGetter = () => Promise<string | null>;

type ListEmployeeParams = {
  q?: string | undefined;
  status?: string | undefined;
  departmentId?: string | undefined;
};

function queryString(params: Record<string, string | undefined>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value) search.set(key, value);
  }
  const raw = search.toString();
  return raw ? `?${raw}` : '';
}

export function createApiClient(getToken: TokenGetter) {
  async function authorizedFetch(path: string, init: RequestInit = {}) {
    const token = await getToken();
    const headers = new Headers(init.headers);
    if (!headers.has('content-type') && init.body && !(init.body instanceof FormData)) {
      headers.set('content-type', 'application/json');
    }
    if (token) headers.set('authorization', `Bearer ${token}`);

    return fetch(`${API_BASE_URL}${path}`, { ...init, headers });
  }

  async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const response = await authorizedFetch(path, init);
    if (!response.ok) {
      const payload = (await response.json().catch(() => null)) as { error?: { message?: string } } | null;
      throw new Error(payload?.error?.message ?? `Request failed with ${response.status}`);
    }
    if (response.status === 204) return undefined as T;
    return (await response.json()) as T;
  }

  return {
    settings: async () => (await request<{ data: Settings }>('/api/admin/settings')).data,
    updateRetirementPolicy: async (input: RetirementPolicyInput) =>
      (await request<{ data: Settings & { recalculatedEmployees: number } }>(
        '/api/admin/settings/retirement-policy',
        { method: 'PUT', body: JSON.stringify(input) }
      )).data,

    departments: async () => (await request<{ data: Department[] }>('/api/admin/departments')).data,
    createDepartment: async (input: DepartmentCreateInput) =>
      (await request<{ data: Department }>('/api/admin/departments', {
        method: 'POST',
        body: JSON.stringify(input),
      })).data,
    updateDepartment: async (id: string, input: DepartmentCreateInput) =>
      (await request<{ data: Department }>(`/api/admin/departments/${id}`, {
        method: 'PUT',
        body: JSON.stringify(input),
      })).data,
    deleteDepartment: async (id: string) =>
      request<void>(`/api/admin/departments/${id}`, { method: 'DELETE' }),

    employees: async (params: ListEmployeeParams = {}) =>
      request<PaginatedEmployees>(`/api/admin/employees${queryString(params)}`),
    employeeOptions: async (params: { substituteEligible?: boolean } = {}) =>
      (await request<{ data: EmployeeOption[] }>(
        `/api/admin/employee-options${queryString({
          substituteEligible: params.substituteEligible ? 'true' : undefined,
        })}`
      )).data,
    createEmployee: async (input: EmployeeWriteInput) =>
      (await request<{ data: Employee }>('/api/admin/employees', {
        method: 'POST',
        body: JSON.stringify(input),
      })).data,
    updateEmployee: async (id: string, input: EmployeeWriteInput) =>
      (await request<{ data: Employee }>(`/api/admin/employees/${id}`, {
        method: 'PUT',
        body: JSON.stringify(input),
      })).data,
    deleteEmployee: async (id: string) =>
      request<void>(`/api/admin/employees/${id}`, { method: 'DELETE' }),

    exportEmployeesExcel: async (params: ListEmployeeParams = {}) => {
      const response = await authorizedFetch(`/api/admin/employees/export.xlsx${queryString(params)}`);
      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { error?: { message?: string } } | null;
        throw new Error(payload?.error?.message ?? `Request failed with ${response.status}`);
      }
      return response.blob();
    },

    previewImport: async (file: File) => {
      const form = new FormData();
      form.append('file', file);
      return (await request<{ data: ImportPreview }>('/api/admin/imports/preview', {
        method: 'POST',
        body: form,
      })).data;
    },
    commitImport: async (batchId: string, selectedRows: number[]) =>
      request<{ data: { committed: Employee[] } }>(`/api/admin/imports/${batchId}/commit`, {
        method: 'POST',
        body: JSON.stringify({ selectedRows }),
      }),
    auditLogs: async (employeeNumber?: string) =>
      (await request<{ data: AuditLog[] }>(
        `/api/admin/audit-logs${queryString({ employeeNumber })}`
      )).data,
  };
}

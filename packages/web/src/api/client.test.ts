import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApiClient } from './client.js';

describe('api client', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('sends the bearer token when exporting employee Excel data', async () => {
    const fetchMock = vi.fn(async () => new Response('Employee Number\n1001\n', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    const api = createApiClient(async () => 'token-123');
    const workbook = await api.exportEmployeesExcel({ status: 'ATTIVO' });

    expect(await workbook.text()).toBe('Employee Number\n1001\n');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('/api/admin/employees/export.xlsx?status=ATTIVO');
    expect(new Headers(init.headers).get('authorization')).toBe('Bearer token-123');
  });

  it('fetches the retirement-policy settings', async () => {
    const payload = { retirementPolicy: { years: 67, months: 3 }, updatedAt: null };
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ data: payload }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    const api = createApiClient(async () => 'token-123');
    const settings = await api.settings();

    expect(settings).toEqual(payload);
    const [url] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('/api/admin/settings');
  });

  it('PUTs a retirement-policy update as JSON', async () => {
    const result = { retirementPolicy: { years: 68, months: 0 }, updatedAt: '2026-06-05T00:00:00.000Z', recalculatedEmployees: 12 };
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ data: result }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    const api = createApiClient(async () => 'token-123');
    const updated = await api.updateRetirementPolicy({ years: 68, months: 0 });

    expect(updated).toEqual(result);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('/api/admin/settings/retirement-policy');
    expect(init.method).toBe('PUT');
    expect(JSON.parse(init.body as string)).toEqual({ years: 68, months: 0 });
    expect(new Headers(init.headers).get('content-type')).toBe('application/json');
    expect(new Headers(init.headers).get('authorization')).toBe('Bearer token-123');
  });
});

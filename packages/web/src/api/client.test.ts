import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApiClient } from './client.js';

describe('api client', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('sends the bearer token when exporting employee CSV data', async () => {
    const fetchMock = vi.fn(async () => new Response('Employee Number\n1001\n', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    const api = createApiClient(async () => 'token-123');
    const csv = await api.exportEmployeesCsv({ status: 'ATTIVO' });

    expect(await csv.text()).toBe('Employee Number\n1001\n');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('/api/admin/employees/export.csv?status=ATTIVO');
    expect(new Headers(init.headers).get('authorization')).toBe('Bearer token-123');
  });
});

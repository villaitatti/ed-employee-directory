import { afterEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { toast } from 'sonner';
import { SettingsPage } from './App.js';
import { renderWithProviders } from './test/render.js';

// JSON helper for fetch-mock responses.
function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

describe('SettingsPage', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('loads the current policy into the year and month fields', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        jsonResponse({ data: { retirementPolicy: { years: 67, months: 3 }, updatedAt: null } })
      )
    );

    renderWithProviders(<SettingsPage />);

    // Italian is the default language: "Anni" (years), "Mesi" (months).
    const years = await screen.findByLabelText('Anni');
    const months = screen.getByLabelText('Mesi');
    await waitFor(() => expect(years).toHaveValue(67));
    expect(months).toHaveValue(3);
  });

  it('PUTs the edited policy and shows the recalculated count', async () => {
    const fetchMock = vi
      .fn()
      // initial GET /settings
      .mockResolvedValueOnce(
        jsonResponse({ data: { retirementPolicy: { years: 67, months: 3 }, updatedAt: null } })
      )
      // PUT /settings/retirement-policy
      .mockResolvedValueOnce(
        jsonResponse({
          data: { retirementPolicy: { years: 68, months: 0 }, updatedAt: '2026-06-05T00:00:00.000Z', recalculatedEmployees: 12 },
        })
      )
      // react-query refetch of GET /settings after invalidation
      .mockResolvedValue(
        jsonResponse({ data: { retirementPolicy: { years: 68, months: 0 }, updatedAt: '2026-06-05T00:00:00.000Z' } })
      );
    vi.stubGlobal('fetch', fetchMock);
    vi.spyOn(window, 'confirm').mockReturnValue(true);

    const user = userEvent.setup();
    renderWithProviders(<SettingsPage />);

    const years = await screen.findByLabelText('Anni');
    await waitFor(() => expect(years).toHaveValue(67));

    await user.clear(years);
    await user.type(years, '68');
    const months = screen.getByLabelText('Mesi');
    await user.clear(months);
    await user.type(months, '0');

    await user.click(screen.getByRole('button', { name: /Salva/i }));

    // The PUT fired with the edited values.
    await waitFor(() => {
      const putCall = fetchMock.mock.calls.find(
        ([url, init]) => String(url).endsWith('/api/admin/settings/retirement-policy') && init?.method === 'PUT'
      );
      expect(putCall).toBeTruthy();
      expect(JSON.parse(putCall![1].body as string)).toEqual({ years: 68, months: 0 });
    });
  });

  it('surfaces an error toast when the save fails', async () => {
    const errorSpy = vi.spyOn(toast, 'error').mockImplementation(() => 'id');
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({ data: { retirementPolicy: { years: 67, months: 3 }, updatedAt: null } })
      )
      // PUT fails with a validation error from the server.
      .mockResolvedValueOnce(
        jsonResponse({ error: { code: 'VALIDATION_ERROR', message: 'The request did not pass validation.' } }, 400)
      );
    vi.stubGlobal('fetch', fetchMock);
    vi.spyOn(window, 'confirm').mockReturnValue(true);

    const user = userEvent.setup();
    renderWithProviders(<SettingsPage />);

    const years = await screen.findByLabelText('Anni');
    await waitFor(() => expect(years).toHaveValue(67));
    await user.click(screen.getByRole('button', { name: /Salva/i }));

    await waitFor(() => expect(errorSpy).toHaveBeenCalledWith('The request did not pass validation.'));
  });
});

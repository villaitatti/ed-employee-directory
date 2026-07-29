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
    await waitFor(() => expect(years).toHaveValue('67'));
    expect(months).toHaveValue('3');
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

    const user = userEvent.setup();
    renderWithProviders(<SettingsPage />);

    const years = await screen.findByLabelText('Anni');
    await waitFor(() => expect(years).toHaveValue('67'));

    await user.clear(years);
    await user.type(years, '68');
    const months = screen.getByLabelText('Mesi');
    await user.clear(months);
    await user.type(months, '0');

    await user.click(screen.getByRole('button', { name: /Salva/i }));
    await user.click(await screen.findByRole('button', { name: 'Conferma' }));

    // The PUT fired with the edited values.
    await waitFor(() => {
      const putCall = fetchMock.mock.calls.find(
        ([url, init]) => String(url).endsWith('/api/admin/settings/retirement-policy') && init?.method === 'PUT'
      );
      expect(putCall).toBeTruthy();
      expect(JSON.parse(putCall![1].body as string)).toEqual({ years: 68, months: 0 });
    });
  });

  it('translates a server rejection instead of echoing its English sentence', async () => {
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

    const user = userEvent.setup();
    renderWithProviders(<SettingsPage />);

    const years = await screen.findByLabelText('Anni');
    await waitFor(() => expect(years).toHaveValue('67'));
    await user.click(screen.getByRole('button', { name: /Salva/i }));
    await user.click(await screen.findByRole('button', { name: 'Conferma' }));

    // The operator sees the Italian title and a next step, not the raw
    // "The request did not pass validation." the server sent.
    await waitFor(() =>
      expect(errorSpy).toHaveBeenCalledWith(
        'Alcuni campi non sono validi',
        expect.objectContaining({
          description: 'Controlla i campi evidenziati nel modulo e salva di nuovo.',
        })
      )
    );
  });

  it('blocks an out-of-range policy before it reaches the server, marking the field', async () => {
    const errorSpy = vi.spyOn(toast, 'error').mockImplementation(() => 'id');
    const fetchMock = vi.fn(async (_url: RequestInfo | URL, _init?: RequestInit) =>
      jsonResponse({ data: { retirementPolicy: { years: 67, months: 3 }, updatedAt: null } })
    );
    vi.stubGlobal('fetch', fetchMock);

    const user = userEvent.setup();
    const { container } = renderWithProviders(<SettingsPage />);

    const years = await screen.findByLabelText('Anni');
    await waitFor(() => expect(years).toHaveValue('67'));
    await user.clear(years);
    await user.type(years, '120');
    await user.click(screen.getByRole('button', { name: /Salva/i }));

    // No confirmation modal, no PUT — the form stops it and says which field.
    expect(screen.queryByRole('button', { name: 'Conferma' })).not.toBeInTheDocument();
    expect(fetchMock.mock.calls.some(([, init]) => init?.method === 'PUT')).toBe(false);
    expect(errorSpy).toHaveBeenCalledWith(
      'Controlla i campi evidenziati',
      expect.objectContaining({ description: expect.stringContaining('Anni') })
    );
    expect(container.querySelector('.field-invalid')).not.toBeNull();
    expect(years).toHaveAttribute('aria-invalid', 'true');
  });

  // `Number()` reads all of these as an in-range 64. Dropping the native
  // type="number" also dropped the browser's refusal to accept them, so the
  // grammar has to be checked before the conversion — otherwise a typo silently
  // recalculates every employee's retirement date from a value nobody typed.
  it.each(['0x40', '6.4e1', '0b1000000', '64abc'])(
    'refuses %s in the retirement age rather than coercing it to a number',
    async (value) => {
      vi.spyOn(toast, 'error').mockImplementation(() => 'id');
      const fetchMock = vi.fn(async (_url: RequestInfo | URL, _init?: RequestInit) =>
        jsonResponse({ data: { retirementPolicy: { years: 67, months: 3 }, updatedAt: null } })
      );
      vi.stubGlobal('fetch', fetchMock);

      const user = userEvent.setup();
      renderWithProviders(<SettingsPage />);
      const years = await screen.findByLabelText('Anni');
      await waitFor(() => expect(years).toHaveValue('67'));

      await user.clear(years);
      await user.type(years, value);
      await user.click(screen.getByRole('button', { name: /Salva/i }));

      expect(screen.queryByRole('button', { name: 'Conferma' })).not.toBeInTheDocument();
      expect(fetchMock.mock.calls.some(([, init]) => init?.method === 'PUT')).toBe(false);
      expect(years).toHaveAttribute('aria-invalid', 'true');
    }
  );

  it('accepts a plain decimal integer', async () => {
    const fetchMock = vi.fn(async (_url: RequestInfo | URL, _init?: RequestInit) =>
      jsonResponse({ data: { retirementPolicy: { years: 67, months: 3 }, updatedAt: null } })
    );
    vi.stubGlobal('fetch', fetchMock);

    const user = userEvent.setup();
    renderWithProviders(<SettingsPage />);
    const years = await screen.findByLabelText('Anni');
    await waitFor(() => expect(years).toHaveValue('67'));

    await user.clear(years);
    await user.type(years, '64');
    await user.click(screen.getByRole('button', { name: /Salva/i }));

    // Reaches the confirmation, which is where a valid policy should get to.
    expect(await screen.findByRole('button', { name: 'Conferma' })).toBeInTheDocument();
  });
});

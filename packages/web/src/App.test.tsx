import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { I18nextProvider } from 'react-i18next';
import i18n from './i18n/config.js';

describe('i18n', () => {
  it('uses Italian as the default language', () => {
    render(
      <I18nextProvider i18n={i18n}>
        <span>{i18n.t('nav.employees')}</span>
      </I18nextProvider>
    );
    expect(screen.getByText('Dipendenti')).toBeInTheDocument();
  });
});

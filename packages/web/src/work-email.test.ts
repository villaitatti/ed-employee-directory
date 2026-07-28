import { describe, expect, it } from 'vitest';
import { deriveWorkEmail } from './work-email.js';

describe('deriveWorkEmail', () => {
  it('uses the first initial and the full surname', () => {
    expect(deriveWorkEmail('Andrea', 'Caselli')).toBe('acaselli@itatti.harvard.edu');
  });

  it('lowercases whatever case the name was typed in', () => {
    expect(deriveWorkEmail('ANDREA', 'CASELLI')).toBe('acaselli@itatti.harvard.edu');
  });

  it('takes the initial of the first given name only', () => {
    expect(deriveWorkEmail('Maria Teresa', 'Rossi')).toBe('mrossi@itatti.harvard.edu');
  });

  it('strips accents rather than emitting them into an address', () => {
    expect(deriveWorkEmail('Élena', 'Rossì')).toBe('erossi@itatti.harvard.edu');
  });

  it('drops spaces and apostrophes from a compound surname', () => {
    expect(deriveWorkEmail('Luca', 'De Luca')).toBe('ldeluca@itatti.harvard.edu');
    expect(deriveWorkEmail('Sara', "D'Angelo")).toBe('sdangelo@itatti.harvard.edu');
  });

  it('keeps a hyphenated surname, which an address may carry', () => {
    expect(deriveWorkEmail('Anna', 'Rossi-Bianchi')).toBe('arossi-bianchi@itatti.harvard.edu');
  });

  it('ignores surrounding whitespace', () => {
    expect(deriveWorkEmail('  Andrea ', ' Caselli  ')).toBe('acaselli@itatti.harvard.edu');
  });

  it('suggests nothing when either name is missing', () => {
    expect(deriveWorkEmail('', 'Caselli')).toBe('');
    expect(deriveWorkEmail('Andrea', '')).toBe('');
    expect(deriveWorkEmail('   ', '   ')).toBe('');
  });

  it('suggests nothing when a name folds away to no Latin letters', () => {
    // Better an empty field the operator fills in than a malformed address.
    expect(deriveWorkEmail('安', '安')).toBe('');
  });
});

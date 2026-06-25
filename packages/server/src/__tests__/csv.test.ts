import { describe, expect, it } from 'vitest';
import {
  csvEscape,
  parseBoolean,
  parseContractType,
  parseEmployeeNumberList,
  parseNullableDate,
  parseOptionalBoolean,
  parseStatus,
  parseTfr,
  parseUsaCategory,
  readFirst,
} from '../services/csv.js';

describe('parseNullableDate', () => {
  it('passes ISO dates through unchanged', () => {
    expect(parseNullableDate('2024-01-15')).toBe('2024-01-15');
  });

  it('converts Italian DD/MM/YYYY to ISO with zero-padding', () => {
    expect(parseNullableDate('5/3/2024')).toBe('2024-03-05');
    expect(parseNullableDate('15/03/2024')).toBe('2024-03-15');
  });

  it('returns null for empty input', () => {
    expect(parseNullableDate('')).toBeNull();
    expect(parseNullableDate('   ')).toBeNull();
  });

  it('leaves unrecognized input as-is for the schema to reject', () => {
    // Calendar validity is enforced downstream by dateStringSchema, not here.
    expect(parseNullableDate('31/02/2024')).toBe('2024-02-31');
    expect(parseNullableDate('not a date')).toBe('not a date');
  });
});

describe('readFirst', () => {
  it('matches header aliases case- and accent-insensitively', () => {
    const row = { 'Numero Matrìcola': '1001', Nome: 'Ada' };
    expect(readFirst(row, ['numero matricola'])).toBe('1001');
    expect(readFirst(row, ['nome', 'first name'])).toBe('Ada');
  });

  it('returns empty string when no alias matches', () => {
    expect(readFirst({ Foo: 'bar' }, ['nome'])).toBe('');
  });
});

describe('enum mappers', () => {
  it('maps USA categories from Italian and English aliases', () => {
    expect(parseUsaCategory('Exempt')).toBe('EXEMPT');
    expect(parseUsaCategory('Non Exempt')).toBe('NON_EXEMPT');
    expect(parseUsaCategory('Altro')).toBe('OTHER');
    expect(parseUsaCategory('garbage')).toBeUndefined();
  });

  it('maps contract types from Italian and English aliases', () => {
    expect(parseContractType('Indeterminato')).toBe('INDETERMINATO');
    expect(parseContractType('Fixed term')).toBe('DETERMINATO');
    expect(parseContractType('Contratto USA')).toBe('CONTRATTO_USA');
    expect(parseContractType('Collaborator')).toBe('COLLABORATORE');
    expect(parseContractType('')).toBeUndefined();
  });

  it('maps statuses from Italian and English aliases', () => {
    expect(parseStatus('Attivo')).toBe('ATTIVO');
    expect(parseStatus('Terminated')).toBe('CESSATO');
    expect(parseStatus('Da Assumere')).toBe('DA_ASSUMERE');
    expect(parseStatus('unknown')).toBeUndefined();
  });

  it('maps TFR options from display labels and codes', () => {
    expect(parseTfr('I Tatti')).toBe('I_TATTI');
    expect(parseTfr('i_tatti')).toBe('I_TATTI');
    expect(parseTfr('Fondo Pensione')).toBe('FONDO_PENSIONE');
    expect(parseTfr('')).toBeUndefined();
    expect(parseTfr('unknown')).toBe('unknown');
  });
});

describe('parseBoolean', () => {
  it('recognizes Italian and English truthy tokens', () => {
    for (const truthy of ['true', 'TRUE', 'Si', 'sì', 'yes', 'Y', 'x', '1', 'Vero']) {
      expect(parseBoolean(truthy)).toBe(true);
    }
  });

  it('treats blank, false, and unknown tokens as false', () => {
    for (const falsy of ['', '   ', 'false', 'no', '0', 'maybe']) {
      expect(parseBoolean(falsy)).toBe(false);
    }
  });
});

describe('parseOptionalBoolean', () => {
  it('preserves blank values as omitted and parses explicit false', () => {
    expect(parseOptionalBoolean('')).toBeUndefined();
    expect(parseOptionalBoolean('false')).toBe(false);
    expect(parseOptionalBoolean('no')).toBe(false);
    expect(parseOptionalBoolean('si')).toBe(true);
  });

  it('treats unrecognized tokens as omitted rather than false', () => {
    expect(parseOptionalBoolean('n/a')).toBeUndefined();
    expect(parseOptionalBoolean('-')).toBeUndefined();
    expect(parseOptionalBoolean('maybe')).toBeUndefined();
  });
});

describe('parseEmployeeNumberList', () => {
  it('parses semicolon-separated Employee Numbers', () => {
    expect(parseEmployeeNumberList('1001; 1002;1003')).toEqual({
      values: [1001, 1002, 1003],
      errors: [],
    });
  });

  it('also accepts comma-separated Employee Numbers', () => {
    expect(parseEmployeeNumberList('1001, 1002,1003')).toEqual({
      values: [1001, 1002, 1003],
      errors: [],
    });
  });

  it('reports invalid and duplicate Employee Numbers', () => {
    const result = parseEmployeeNumberList('1001; nope; 1001');
    expect(result.values).toEqual([1001, 1001]);
    expect(result.errors).toContain('Invalid Employee Number in approver list: nope.');
    expect(result.errors).toContain('Employee Number 1001 appears more than once in the same approver list.');
  });
});

describe('csvEscape', () => {
  it('passes plain values through unquoted', () => {
    expect(csvEscape('Ada')).toBe('Ada');
    expect(csvEscape(1001)).toBe('1001');
    expect(csvEscape(null)).toBe('');
  });

  it('quotes and doubles embedded quotes, commas, and newlines', () => {
    expect(csvEscape('a,b')).toBe('"a,b"');
    expect(csvEscape('say "hi"')).toBe('"say ""hi"""');
    expect(csvEscape('line1\nline2')).toBe('"line1\nline2"');
  });

  it('neutralizes spreadsheet formula injection', () => {
    expect(csvEscape('=HYPERLINK("http://evil")')).toBe('"\'=HYPERLINK(""http://evil"")"');
    expect(csvEscape('+1')).toBe("'+1");
    expect(csvEscape('-1')).toBe("'-1");
    expect(csvEscape('@SUM(A1)')).toBe("'@SUM(A1)");
  });
});

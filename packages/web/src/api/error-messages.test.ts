import { afterEach, describe, expect, it } from 'vitest';
import i18n from '../i18n/config.js';
import type { Translate } from '../i18n/types.js';
import { ApiError } from './client.js';
import { describeError } from './error-messages.js';

const t = i18n.t.bind(i18n) as unknown as Translate;

async function withLanguage(language: 'it' | 'en', run: () => void) {
  await i18n.changeLanguage(language);
  run();
}

describe('describeError', () => {
  afterEach(async () => {
    await i18n.changeLanguage('it');
  });

  it('translates a known code and keeps the server-supplied specifics', async () => {
    const error = new ApiError('Ada Rossi is not an active employee.', 400, 'APPROVER_MUST_BE_ACTIVE', {
      approverName: 'Ada Rossi',
    });

    await withLanguage('it', () => {
      const described = describeError(error, t);
      expect(described.title).toBe('Ada Rossi non è un dipendente attivo');
      expect(described.description).toContain('Solo i dipendenti Attivi');
    });

    await withLanguage('en', () => {
      const described = describeError(error, t);
      expect(described.title).toBe('Ada Rossi is not an active employee');
      expect(described.description).toContain('Only Active employees');
    });
  });

  it('names the people an approver is still assigned to, rather than their numbers', async () => {
    // The API sends them structured so the name order stays this app's decision.
    // "Remove the assignment on 1003" makes the operator go and look up who 1003
    // is before they can act on it.
    const error = new ApiError('This employee is used in approval workflows.', 409, 'APPROVER_IN_USE', {
      employees: [
        { employeeNumber: 1003, firstName: 'Carla', lastName: 'Verdi' },
        { employeeNumber: 1002, firstName: 'Bruno', lastName: 'Bianchi' },
      ],
    });

    await withLanguage('it', () => {
      const described = describeError(error, t);
      expect(described.description).toContain('Carla Verdi (1003), Bruno Bianchi (1002)');
      expect(described.description).not.toContain('Numeri Matricola');
    });

    await withLanguage('en', () => {
      expect(describeError(error, t).description).toContain('Carla Verdi (1003), Bruno Bianchi (1002)');
    });
  });

  it('never shows the operator an unfilled placeholder', async () => {
    // The server always names them, so this is the belt to that braces: a detail
    // that goes missing should thin the sentence, not print the template at
    // someone and make the app look broken.
    const error = new ApiError('This employee is used in approval workflows.', 409, 'APPROVER_IN_USE', {});

    await withLanguage('it', () => {
      const described = describeError(error, t);
      expect(described.title).toBe('Questo dipendente è responsabile di altre persone');
      expect(described.description).not.toContain('{{');
    });
  });

  it('names the clashing field on a duplicate, and points the form at it', async () => {
    const error = new ApiError('A record with these values already exists.', 409, 'DUPLICATE_VALUE', {
      field: 'workEmail',
    });

    await withLanguage('it', () => {
      const described = describeError(error, t);
      expect(described.title).toBe('Email di lavoro già in uso');
      expect(described.fieldErrors).toEqual({ workEmail: 'Già assegnata a un altro dipendente.' });
    });

    await withLanguage('en', () => {
      expect(describeError(error, t).title).toBe('Work Email already in use');
    });
  });

  it('falls back to the generic duplicate message when the field is unknown', () => {
    const described = describeError(new ApiError('dup', 409, 'DUPLICATE_VALUE'), t);
    expect(described.title).toBe('Valore già presente');
    expect(described.fieldErrors).toEqual({});
  });

  it('lists the rejected fields by their form labels and marks them', () => {
    const error = new ApiError('The request did not pass validation.', 400, 'VALIDATION_ERROR', {
      fieldErrors: { hireDate: ['Required'], fte: ['Bad'] },
      formErrors: [],
    });
    const described = describeError(error, t);
    expect(described.description).toBe('Controlla e correggi: Data assunzione, FTE.');
    expect(Object.keys(described.fieldErrors).sort()).toEqual(['fte', 'hireDate']);
  });

  it('treats 401 as an expired session whatever the endpoint called it', () => {
    const described = describeError(new ApiError('A valid bearer token is required.', 401, 'UNAUTHORIZED'), t);
    expect(described.title).toBe('Sessione scaduta');
    expect(described.description).toContain('Esci e accedi di nuovo');
  });

  it('does not tell a user missing the staff role to sign in again', () => {
    // 403 is the `requireStaff` rejection. Re-authenticating cannot grant a role,
    // so advising it sends the operator round a loop instead of to IT.
    const described = describeError(new ApiError('Role staff-IT is required.', 403, 'FORBIDDEN'), t);
    expect(described.title).toBe('Non hai i permessi per questa operazione');
    expect(described.description).toContain('assistenza IT');
    expect(described.description).not.toContain('Esci e accedi di nuovo');
  });

  it('reports a failed fetch as a connection problem rather than a server error', () => {
    const described = describeError(new TypeError('Failed to fetch'), t);
    expect(described.title).toBe('Nessuna connessione al server');
    expect(described.reassure).toBe(true);
  });

  it('keeps an unknown code readable by leading with the server sentence', () => {
    const described = describeError(new ApiError('Something specific broke.', 500, 'BRAND_NEW_CODE'), t);
    expect(described.title).toBe('Something specific broke.');
    expect(described.description).toContain('assistenza IT');
    expect(described.reassure).toBe(true);
  });

  it('does not claim nothing was saved when the value itself was rejected', () => {
    expect(describeError(new ApiError('dup', 409, 'DUPLICATE_VALUE'), t).reassure).toBe(false);
  });

  /**
   * Payloads captured verbatim from the running server against Postgres. The
   * mapping above is only worth anything if the shapes it keys on are the shapes
   * the API actually emits — in particular the P2002 `details.field`, which is
   * derived from a Prisma constraint name and so is invisible to a unit test that
   * invents its own fixtures.
   */
  describe('against real API payloads', () => {
    const cases = [
      {
        name: 'duplicate employee number',
        payload: { code: 'DUPLICATE_VALUE', message: 'A record with these values already exists.', details: { field: 'employeeNumber' } },
        status: 409,
        title: 'Numero Matricola già in uso',
        fieldErrors: ['employeeNumber'],
      },
      {
        name: 'duplicate work email',
        payload: { code: 'DUPLICATE_VALUE', message: 'A record with these values already exists.', details: { field: 'workEmail' } },
        status: 409,
        title: 'Email di lavoro già in uso',
        fieldErrors: ['workEmail'],
      },
      {
        name: 'duplicate department name',
        payload: { code: 'DUPLICATE_VALUE', message: 'A record with these values already exists.', details: { field: 'departmentName' } },
        status: 409,
        title: 'Dipartimento già esistente',
        fieldErrors: ['name'],
      },
      {
        name: 'termination before hire',
        payload: {
          code: 'VALIDATION_ERROR',
          message: 'The request did not pass validation.',
          details: { formErrors: [], fieldErrors: { terminationDate: ['Termination date cannot be before hire date.'] } },
        },
        status: 400,
        title: 'Alcuni campi non sono validi',
        fieldErrors: ['terminationDate'],
      },
      {
        name: 'ineligible responsabile',
        payload: {
          code: 'APPROVER_NOT_RESPONSABILE_ELIGIBLE',
          message: 'Bea Verdi is not marked as Responsabile eligible.',
          details: { approverName: 'Bea Verdi' },
        },
        status: 400,
        title: 'Bea Verdi non è abilitato come Responsabile',
        fieldErrors: ['responsabileIds'],
      },
      {
        name: 'missing responsabile',
        payload: { code: 'RESPONSABILE_REQUIRED', message: 'Active employees require at least one Responsabile.' },
        status: 400,
        title: 'Manca il Responsabile',
        fieldErrors: ['responsabileIds'],
      },
      {
        name: 'missing substitute',
        payload: {
          code: 'SOSTITUTO_RESPONSABILE_REQUIRED',
          message: 'Active employees require at least one Sostituto-Responsabile.',
        },
        status: 400,
        title: 'Manca il Sostituto-Responsabile',
        fieldErrors: ['substituteResponsabileIds'],
      },
    ];

    for (const testCase of cases) {
      it(`translates ${testCase.name} and points at the right field`, () => {
        const described = describeError(
          new ApiError(testCase.payload.message, testCase.status, testCase.payload.code, testCase.payload.details),
          t
        );
        expect(described.title).toBe(testCase.title);
        expect(Object.keys(described.fieldErrors)).toEqual(testCase.fieldErrors);
        // Every one of these tells the operator what to do next.
        expect(described.description).toBeTruthy();
        // And none of them leaks the English sentence to an Italian operator.
        expect(described.title).not.toBe(testCase.payload.message);
      });
    }
  });
});

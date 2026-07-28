import { describe, expect, it } from 'vitest';
import {
  auth0SubjectFor,
  dailyWorkIntervals,
  flattenApprovers,
  parseAppRoleAssignments,
  timeOffStatus,
  weeklyWorkIntervals,
} from '../services/time-off-directory.js';

/**
 * Pure mapping rules for the Ferie projection. The clock intervals in particular
 * must always re-add to the contracted minutes: Ferie deducts hourly permesso from
 * them, so a split that loses or gains a minute silently miscounts leave balances.
 */

function totalMinutes(intervals: { start: string; end: string }[]): number {
  return intervals.reduce((sum, interval) => {
    const [startHour = 0, startMinute = 0] = interval.start.split(':').map(Number);
    const [endHour = 0, endMinute = 0] = interval.end.split(':').map(Number);
    return sum + (endHour * 60 + endMinute) - (startHour * 60 + startMinute);
  }, 0);
}

describe('daily work intervals', () => {
  it('skips a day with no contracted time', () => {
    expect(dailyWorkIntervals(1, 0)).toEqual([]);
  });

  it('emits one interval for a short day, without a break', () => {
    expect(dailyWorkIntervals(2, 240)).toEqual([{ weekday: 2, start: '09:00', end: '13:00' }]);
  });

  it('splits a full-time day around a 30-minute break', () => {
    expect(dailyWorkIntervals(1, 450)).toEqual([
      { weekday: 1, start: '09:00', end: '12:45' },
      { weekday: 1, start: '13:15', end: '17:00' },
    ]);
  });

  it('gives the odd minute to the morning', () => {
    const intervals = dailyWorkIntervals(3, 401);
    expect(intervals).toEqual([
      { weekday: 3, start: '09:00', end: '12:21' },
      { weekday: 3, start: '12:51', end: '16:11' },
    ]);
    expect(totalMinutes(intervals)).toBe(401);
  });

  it('always totals the contracted minutes', () => {
    for (const minutes of [1, 60, 239, 240, 241, 300, 450, 480, 600, 720, 869, 900, 1_409]) {
      expect(totalMinutes(dailyWorkIntervals(1, minutes))).toBe(minutes);
    }
  });

  it('keeps a 09:00 start for the longest day that still fits', () => {
    expect(dailyWorkIntervals(4, 869)).toEqual([
      { weekday: 4, start: '09:00', end: '16:15' },
      { weekday: 4, start: '16:45', end: '23:59' },
    ]);
  });

  it('starts earlier rather than ending at the unrepresentable 24:00', () => {
    const intervals = dailyWorkIntervals(4, 900);
    expect(intervals[0]?.start).toBe('08:29');
    expect(intervals.at(-1)?.end).toBe('23:59');
    expect(totalMinutes(intervals)).toBe(900);
  });

  it('refuses a day that cannot be represented within one calendar day', () => {
    expect(() => dailyWorkIntervals(1, 1_410)).toThrow(/cannot be represented/);
  });
});

describe('weekly work intervals', () => {
  it('numbers weekdays 1-5 and omits empty days', () => {
    const intervals = weeklyWorkIntervals({
      mondayMinutes: 450,
      tuesdayMinutes: 0,
      wednesdayMinutes: 240,
      thursdayMinutes: 0,
      fridayMinutes: 120,
    });
    expect(intervals.map((interval) => interval.weekday)).toEqual([1, 1, 3, 5]);
  });
});

describe('status mapping', () => {
  it('treats only ATTIVO as active', () => {
    expect(timeOffStatus('ATTIVO')).toBe('ACTIVE');
    expect(timeOffStatus('CESSATO')).toBe('INACTIVE');
    // Not yet hired is not yet active, so the portal must not let them book leave.
    expect(timeOffStatus('DA_ASSUMERE')).toBe('INACTIVE');
  });
});

describe('auth0 subject', () => {
  it('derives a stable subject from the employee number', () => {
    expect(auth0SubjectFor(201)).toBe('auth0|ed-201');
  });
});

describe('application role assignments', () => {
  it('treats an unset or blank value as no grants', () => {
    expect(parseAppRoleAssignments(undefined).size).toBe(0);
    expect(parseAppRoleAssignments('   ').size).toBe(0);
  });

  it('parses multiple employees each with multiple roles', () => {
    const assignments = parseAppRoleAssignments('201:STAFF_IT|FERIE_PORTAL_ADMIN, 202:FERIE_FINAL_APPROVER');
    expect(assignments.get(201)).toEqual(['STAFF_IT', 'FERIE_PORTAL_ADMIN']);
    expect(assignments.get(202)).toEqual(['FERIE_FINAL_APPROVER']);
  });

  it('deduplicates repeated grants for the same employee', () => {
    expect(parseAppRoleAssignments('201:STAFF_IT,201:STAFF_IT|FERIE_PORTAL_ADMIN').get(201)).toEqual([
      'STAFF_IT',
      'FERIE_PORTAL_ADMIN',
    ]);
  });

  it('rejects an unknown role rather than dropping the grant', () => {
    expect(() => parseAppRoleAssignments('201:SUPERUSER')).toThrow(/Unknown application role/);
  });

  it('rejects a malformed employee number and a roleless entry', () => {
    expect(() => parseAppRoleAssignments('abc:STAFF_IT')).toThrow(/Invalid employee number/);
    expect(() => parseAppRoleAssignments('201:')).toThrow(/No roles listed/);
  });
});

describe('approver flattening', () => {
  it('flattens every role into one list, ordered by role then approver', () => {
    const assignments = [
      { approverId: 'sub_b', role: 'SUBSTITUTE_RESPONSABILE' as const },
      { approverId: 'resp_a', role: 'RESPONSABILE' as const },
      { approverId: 'pre_a', role: 'PRE_APPROVER' as const },
      { approverId: 'sub_a', role: 'SUBSTITUTE_RESPONSABILE' as const },
    ];
    expect(flattenApprovers(assignments)).toEqual([
      { employeeSourceId: 'pre_a', role: 'PRE_APPROVER' },
      { employeeSourceId: 'resp_a', role: 'RESPONSABILE' },
      { employeeSourceId: 'sub_a', role: 'SUBSTITUTE_RESPONSABILE' },
      { employeeSourceId: 'sub_b', role: 'SUBSTITUTE_RESPONSABILE' },
    ]);
  });

  it('returns an empty list when nobody approves for this employee', () => {
    expect(flattenApprovers([])).toEqual([]);
  });
});

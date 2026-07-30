import { useTranslation } from 'react-i18next';
import type { Employee, EmployeeApprovalReference } from '@itatti/shared';
import { employeeFullName } from '../employee-draft.js';

/**
 * Who approves this person's leave. Named for the people it lists rather than
 * for the downstream time-off system's routing — ED holds three role slots, with
 * no sequence or states to make a "workflow" of.
 *
 * This column used to read "R 1 / S 2" — a count of approvers, which answers a
 * question nobody has. The one thing worth knowing from the directory is *who*
 * to go to, so it names them; and because an Active employee is supposed to have
 * both a Responsabile and a Sostituto, the missing half is called out rather
 * than simply left blank, which would read as "nothing to see here".
 */
export function Approvers({ employee }: { employee: Employee }) {
  const { t } = useTranslation();

  // The rule only binds Active employees, so for anyone else there is nothing
  // to be missing and nothing to report.
  if (employee.status !== 'ATTIVO') return <span className="text-ink-muted">-</span>;

  const { preApprovers, responsabili, substituteResponsabili } = employee.approvalRoles;

  return (
    <div className="grid min-w-56 gap-1">
      <ApprovalRole short={t('roleShort.responsabile')} label={t('fields.responsabili')} people={responsabili} />
      <ApprovalRole
        short={t('roleShort.substitute')}
        label={t('fields.substituteResponsabili')}
        people={substituteResponsabili}
      />
      {/* Optional by design, so its absence is not a gap worth flagging. */}
      {preApprovers.length > 0 ? (
        <ApprovalRole
          short={t('roleShort.preApprover')}
          label={t('fields.preApprovers')}
          people={preApprovers}
          optional
        />
      ) : null}
    </div>
  );
}

function ApprovalRole({
  short,
  label,
  people,
  optional,
}: {
  /** The tag in the cell — there is no room for "Sostituto-Responsabile". */
  short: string;
  /** The full role name, for anyone the tag would leave guessing. */
  label: string;
  people: EmployeeApprovalReference[];
  optional?: boolean;
}) {
  const { t } = useTranslation();
  return (
    <div className="flex items-baseline gap-2">
      <span className="w-10 shrink-0 text-[0.68rem] font-extrabold tracking-wide text-ink-muted uppercase">
        {/* The abbreviation is a visual shorthand; a screen reader gets the role
            spelled out, since "Sost." read aloud is not a word. */}
        <span className="sr-only">{label}: </span>
        <span aria-hidden="true">{short}</span>
      </span>
      {people.length > 0 ? (
        <span>{people.map(employeeFullName).join(', ')}</span>
      ) : (
        // Red, not amber. An Active employee without a Responsabile has nobody to
        // approve their leave, which is a broken record rather than something to
        // look at eventually — and `--warning-ink` is a dark khaki that reads as
        // ordinary text in a column of names. An absent pre-approver stays muted:
        // that one is optional, so it is not a gap at all.
        <span className={optional ? 'text-ink-muted' : 'font-semibold text-danger'}>
          {t('copy.approverMissing')}
        </span>
      )}
    </div>
  );
}

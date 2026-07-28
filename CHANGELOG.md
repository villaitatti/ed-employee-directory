# Changelog

## 0.8.0 - 2026-07-28

### Added

- Every employee now carries a **Work Email** — required, unique, and entered by HR. It is never derived from an employee's name and has no fallback, because mail routing and the Ferie portal both depend on it being correct.
- Every employee now carries a **Preferred Language** (Italiano or Inglese, default Italiano): the language the Ferie time-off portal greets them in.
- Both fields appear on the employee card, in `/api/v1` responses, and as "Work Email" and "Preferred Language" columns in the Excel and CSV export and import.
- New time-off directory projection for the Ferie portal, `GET /api/v1/time-off-directory/employees`, with cursor pagination up to 100 rows a page. It derives clock intervals from the stored weekly hours — anchored at 09:00, with a 30-minute break once a day runs past four hours — so the portal can deduct hourly permesso against the contracted time.
- New `PATCH /api/v1/time-off-directory/employees/:id/preferred-language`, the only field the portal may write back. It is guarded by its own `write:time-off-directory` scope rather than the read scope, rejects any other field in the request body, and is recorded in the audit log with the calling client as the actor.
- New `TIME_OFF_DIRECTORY_ROLES` setting maps Employee Numbers to Ferie application roles (ED holds no application-role master data). A malformed entry or unknown role stops the server at boot rather than silently syncing employees with no roles.

### Fixed

- An import that omitted the "Responsabile Abilitato" column silently revoked Responsabile eligibility on every employee it updated, contradicting the documented partial-import behaviour. The flag is now preserved, as its Sostituto counterpart already was.

### Changed

- Work Email is stored and compared in lowercase, so uniqueness holds regardless of how the address was typed. The import reports a per-row error for a missing or malformed address, an address repeated within the file, and one already belonging to another employee — rather than failing the whole commit on the unique index.
- Server test suites now run one file at a time, because they share a single Postgres database and truncate it between cases.

### Upgrade notes

- The migration backfills Work Email for the known roster (Employee Number 201) and then **aborts if any employee is left without an address**, rather than inventing one. If it stops, add the missing employees' real addresses to `packages/server/prisma/migrations/20260728120000_add_work_email_and_preferred_language/migration.sql` and re-run; the table is left untouched on abort.
- Spreadsheets exported before 0.8.0 have no "Work Email" column. Because the field is required, importing such a file reports "Work Email is required." on every row — export a fresh file first. Preferred Language may be omitted safely: an existing employee keeps their stored value and a new one defaults to Italiano.
- The Ferie portal needs a client granted `write:time-off-directory` in Auth0 for the language write; the read sync continues to use `AUTH0_READ_SCOPE`.

## 0.7.1 - 2026-07-27

### Added

- The hire date and termination date fields now carry hints explaining when each is required and that a termination date cannot precede the hire date.

### Changed

- The FTE hint now states the accepted input format: both `0,5` and `0.5` are read, with at most three decimals.
- The weekly schedule hint now shows a worked example of the sessantesimi format, `7,30` for seven hours and thirty minutes, instead of only naming it.

## 0.7.0 - 2026-07-27

### Added

- Employees can now be marked as eligible to serve as a Responsabile, alongside the existing Sostituto-Responsabile eligibility. A new "Ruoli e abilitazioni" section on the employee card groups both role capabilities and explains what they control.
- Imports and exports carry the new "Responsabile Abilitato" column.

### Changed

- The employee, department, and settings screens were rebuilt on Mantine, with searchable pickers, date inputs, and a restyled employee card.
- The approval section is now "Responsabili del dipendente" and covers only who approves this employee; its Responsabile and Sostituto-Responsabile pickers list only people enabled for that role.
- Only someone marked "Può essere Responsabile" can be chosen as a Responsabile, the same rule that already applied to the Sostituto-Responsabile. Everyone currently assigned as a Responsabile is marked eligible automatically, so existing assignments keep working.
- The requirement that active employees have a Responsabile and a Sostituto-Responsabile is now skipped while setting up the company, when nobody is eligible for that role yet and there is therefore nobody to pick. It applies again as soon as the first eligible person exists.
- Categoria USA appears only for a Contratto USA, and TFR is hidden for it.

### Fixed

- Local development now reads the repository-root `.env` from both the API and the web dev server, and the web dev server port follows `CORS_ORIGIN` so the two stay in sync. A `packages/server/.env` still takes precedence when present.

### Upgrade notes

- Spreadsheets exported before 0.7.0 have no "Responsabile Abilitato" column. Re-importing one keeps the flag as it stands for employees who already exist, but any *new* employee it creates starts out not eligible — export a fresh file first if the import is meant to establish Responsabili.

## 0.6.0 - 2026-07-20

### Fixed

- Fixed the employee create/edit form being unsubmittable in a real browser: a double-escaped date validation pattern rejected every valid date.
- Fixed production serving of the web app, whose bundle path was resolved incorrectly and served nothing; unknown `/api/*` routes now return a JSON 404 instead of the app shell.
- The employee directory now loads every employee instead of silently stopping after the first 50.
- Data-loading failures, including an expired session, now show a retryable error message instead of an empty page.
- Approver eligibility is re-checked per role, so adding an existing approver to a different role can no longer skip the active / substitute-eligibility rules.
- Duplicate Employee Numbers, other unique-constraint violations, oversized uploads, and out-of-range Employee Numbers now return clear 4xx errors instead of 500s.
- A partial import that omits the retirement columns no longer overwrites confirmed retirement dates; import files are capped at 2000 rows.
- An unchanged retirement-age save no longer bumps the settings timestamp or writes a no-op audit entry, and a corrupt stored policy is now surfaced on the Settings page.

### Changed

- The retirement-date field is editable only when "Confirmed" is checked; unchecking a confirmed date warns before it is recalculated.
- Deleting an employee or department, and saving a retirement-age change, now ask for confirmation.
- **Breaking (deployment):** `NODE_ENV` is now required at server startup with no silent `development` default, so a misconfigured deployment fails immediately instead of running with permissive CORS/CSP. Set `NODE_ENV` in every environment.
- Localized the remaining interface strings and weekday labels, remembered the selected language across reloads, and preserved deep links through Auth0 sign-in.

### Security

- The production Docker image now runs as a non-root user and contains only production dependencies and compiled output — no source or build tooling.
- The local development database now listens on loopback only.
- Added a modal focus trap with keyboard focus management, a top-level error boundary, and a cap on the client-supplied request id.

## 0.5.0 - 2026-06-25

### Added

- Added employee approval-role master data for future time-off workflows, including pre-approvers, responsabili, substitute responsabili, substitute eligibility, and validation against self-approval, inactive approvers, duplicates, and invalid substitutes.
- Added Monday-Friday scheduled hours stored as minutes and displayed in Italian sessantesimi format, with full-time defaults, weekly totals, and FTE consistency warnings in the employee form.
- Added approval-role and weekly-hours fields to admin import/export, read-only v1 employee APIs, OpenAPI documentation, audit snapshots, and employee list setup indicators.

### Fixed

- Prevented deleting, inactivating, or disabling substitute eligibility for employees still referenced by other employees' approval assignments.
- Tightened import preview and commit validation so same-file approver references only pass when the referenced rows are valid and selected, including transitive chains and rows shadowing existing employees.
- Surfaced "approver still in use" conflicts during import preview instead of aborting the whole commit transaction, and excluded same-import reaffirmed assignments from the conflict check.
- Stopped re-importing or editing an employee from failing when a previously-assigned approver later went inactive or lost eligibility; existing approvers are now grandfathered unless the row changes them.
- Defaulted blank weekday columns to full-time hours on import rather than rejecting the row, and accepted comma-separated approver lists in addition to semicolons.
- Treated unrecognized boolean cells (for example `n/a`) as unspecified on import so they no longer silently disable substitute eligibility.
- Kept already-selected approvers visible and removable in the employee form even after they lose eligibility, instead of dropping them silently while still submitting them.
- Refreshed employee picker options after employee saves, deletes, and imports so approval selectors do not use stale eligibility data.

## 0.4.0 - 2026-06-15

### Added

- Added TFR as an employee field with the options "I Tatti" and "Fondo Pensione", including API validation, Prisma persistence, audit snapshots, and import/export support.
- Added Excel `.xlsx` export and import preview for employee data, with readable labels and Italian `dd/mm/yyyy` date formatting.
- Added audit change details that show the modified employee name, matricola, changed field, previous value, and new value.

### Changed

- Updated Italian and English copy around the employee list, import/export actions, and audit table labels.
- Employee date fields now use `dd/mm/yyyy` entry, while tables and audit history display dates as `20 Jun 2026`.
- The retirement-date checkbox now means "confirmed retirement date"; confirmed dates are preserved when the pension-age setting changes.

## 0.3.0 - 2026-06-08

### Changed

- Adding and editing a department now uses the same modal dialog as employees: a "New department" button opens a centered popup with the name field, and saving shows a confirmation toast. Replaces the inline add/edit bar so both flows feel consistent. Edit, Escape/backdrop close, and the unsaved-changes prompt work the same as the employee form.

### Removed

- Dropped the unused `.department-form` styles left over from the old inline department bar.

## 0.2.1 - 2026-06-08

### Changed

- Signing in is now one step: visiting the app sends you straight to the Auth0 login instead of showing a separate welcome screen first.

### Fixed

- Signing out now keeps you signed out. Previously the app could immediately send you back into Auth0 and silently sign you back in, making it impossible to log out or switch accounts.
- A failed or denied sign-in no longer traps you in an endless redirect. The app now shows the sign-in screen with a clear message and a button to try again, instead of looping back to Auth0 or hanging on a blank loading screen.

## 0.2.0 - 2026-06-05

### Added

- Added a Settings page where staff can edit the statutory retirement age as separate year and month fields. Saving recalculates the projected retirement date for every employee whose date was not manually overridden, and records the change in the audit log.
- CSV import now reads the "Retirement Date Overridden" column: rows marked overridden keep their imported retirement date, while the rest recalculate from the current retirement age (so re-importing an export after a policy change no longer freezes stale dates).

### Changed

- Reworked the "New employee" form into a centered modal dialog with grouped, evenly spaced fields, a sticky header and footer, Escape/backdrop close, and an unsaved-changes prompt.

### Fixed

- Settings save skips the table-wide recalculation when the retirement age is unchanged, and a malformed stored policy now logs an error before falling back to the statutory default instead of failing silently.

## 0.1.0 - 2026-06-04

### Added

- Scaffolded ED - Employee Directory as a Dockerized pnpm workspace with React/Vite, Express, Prisma, PostgreSQL, Auth0, and shared TypeScript/Zod schemas.
- Added staff-IT protected admin CRUD for departments and employees, CSV preview/commit import, CSV export, and audit logging with delete tombstones.
- Added read-only `/api/v1` department and employee endpoints with checked-in OpenAPI documentation.
- Added Italian-first bilingual UI with English toggle, sidebar navigation, employee management, department management, CSV import review, audit history, and visible app version.
- Added Docker, Docker Compose, environment examples, Prisma migration, and local development documentation.

### Fixed

- Made CSV export use authenticated API requests so Auth0 sessions can download exports.
- Rejected duplicate Employee Numbers in CSV imports and made import row commits safer against repeat submissions.
- Tightened shared date validation so impossible calendar dates are rejected at the API boundary.
- Aligned local development auth flags across frontend and backend examples.

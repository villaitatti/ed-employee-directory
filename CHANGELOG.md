# Changelog

## 0.10.0 - 2026-07-29

### Changed

- The web app is rebuilt on **shadcn/ui over Base UI, with Tailwind**, replacing Mantine and the 1,500-line hand-written stylesheet. Nothing about what the app does changes: the same fields, the same rules, the same messages, verified against 0.9.0 side by side in the browser. What changes is where the styling lives — the design tokens are declared once and the components read them, instead of the brand blue being restated in a Mantine palette because the library wrote a filled button's background as an inline custom property no stylesheet could override.
- Every date in the app now reads the same way: localized `DD MMMM YYYY`. The tables previously used a format of their own — fixed en-GB "30 Jun 2050", chosen for column width — so an Italian operator read one spelling of a date in the directory and a different one in the field they were about to edit. The directory now says "30 giugno 2050", as the field does, and the timestamps in the audit log, the departments table and the retirement-age card follow the same convention with the time appended ("29 luglio 2026, 14:52").
- Closed enum lists (status, preferred language, contract type, TFR) are listboxes rather than searchable dropdowns. A text box to filter three options is a step, not a shortcut, and typing still jumps to an option. Department and the two directory filters stay searchable and clearable, because those lists grow and "no filter" is a real answer.
- Confirmation prompts are announced as alert dialogs rather than plain dialogs, which is what they are: a question that has to be answered before anything else can happen. They are also laid out to be stopped at rather than clicked through: a large circular mark above centred text, and the two answers side by side as equal halves rather than tucked into a footer bar. An irreversible one — deleting an employee or a department, discarding unsaved edits — carries a red warning mark and a solid red confirm button; a reversible one carries a neutral question mark and the ordinary brand button, so the two never look alike at a glance.
- The date field now shows a single calendar button — the one that opens the picker — where the previous control drew a decorative icon as well.

### Fixed

- Field-level error messages are now wired to their input with `aria-describedby`. Mantine computed that attribute from its own internals and discarded anything passed in, so per-field descriptions were unavailable and a screen reader had only the live-region announcement to go on.
- A field's caption is no longer a `<label>` wrapping the entire control. It had been read out as part of the input's accessible name, error message included.
- The remove button on an approver chip has an accessible name. It is an icon, and there is one per chip, so unnamed they were indistinguishable.

### Internal

- `App.tsx`, 2,462 lines, is split into per-route and per-form modules with the draft type, the date formatting and the shared hooks extracted alongside. This also breaks an import cycle: `employee-validation.ts` imported the draft type from `App.tsx`, which imported the validator back.
- Invalid state is reported through data attributes (`data-invalid`, `data-has-errors`, `data-ineligible`) rather than styling classes, which is both the shadcn convention and a hook that survives having no stylesheet to name. The tests that pin those marks were updated, not removed.
- `@mantine/core`, `@mantine/dates`, `@mantine/hooks` and `@mantine/modals` are gone. The CSS bundle drops from 348 kB to 98 kB.

## 0.9.0 - 2026-07-28

### Added

- Forms now say **which** field is wrong, not just that something is. A rejected save marks each offending input — tinted, red label, a message with a warning icon — lists every problem in a panel above the form where each field name is a button that scrolls to and focuses that input, and badges each numbered section with a count so a problem six sections down is not invisible. The marks stay quiet until the first save attempt, then clear one by one as each field is fixed.
- Every failure now explains **what to do next**, not only what happened. "Numero Matricola già in uso" is followed by "Un altro dipendente ha già questo Numero Matricola. Inseriscine uno diverso." Where the outcome is ambiguous — a dropped connection, a 500 — the message says outright that nothing was saved, which is the first thing anyone wants to know after a red toast.
- The failed-data-load banner, which previously had no styling rule at all and rendered unstyled, is now a proper alert with a headline, a next step, and the retry button.

### Changed

- Error messages are now written in the language the operator chose. Previously every error toast showed the server's raw English sentence — an Italian user saw "A record with these values already exists." or "The request did not pass validation." — with `Errore` as the fallback. The server still speaks in codes; the web app now translates each one and interpolates the specifics (which approver, which employee numbers, which rows) so nothing is lost in the process.
- Native browser form UI is gone. The constraint-validation bubble ("Please fill out this field.", in the *browser's* language, one field at a time, unable to express this domain's cross-field rules) is replaced by the app's own reporting; the Excel picker is no longer the browser's "Choose File / No file chosen" widget; the retirement-age fields are no longer `type="number"`, whose spinner arrows differ per browser and whose scroll-wheel could silently change a value that rewrites every employee's retirement date; and icon-button tooltips no longer use `title`.
- Confirmations and success messages now name the record they concern. Deleting asks about "Rossi Ada (matricola 1001)" rather than "this employee", un-confirming a retirement date quotes the date being discarded, and saving the retirement age states the values being applied — so a misclick is catchable before it touches every row. Saving reports "Dipendente creato — Rossi Ada è stato aggiunto alla lista" in place of a bare "Salvato", and the Excel export, which previously gave no feedback at all, now confirms the download started.
- Toasts are wider, dismissible, and errors stay up for ten seconds, because a two-line explanation cannot be read in four.

### Fixed

- An active employee needs a Sostituto-Responsabile as soon as one is eligible, but the form did not enforce it. A card that looked complete was still rejected on save with `SOSTITUTO_RESPONSABILE_REQUIRED` after a round trip. Both halves of the rule are now checked before saving, and the field is marked required and explained.
- The Responsabile requirement showed the *error* sentence as a grey hint before any save was attempted, so it read as a failure with nothing highlighted. It now reads as guidance up front and becomes a red error, on a marked field, only once saving has been tried.
- A termination date before the hire date came back from the API as an unattributable sentence with no field to blame, so it could not be highlighted. The rule now names the field it blames, and the same applies to the other cross-field date rules.
- A duplicate value now identifies which field collided. The API previously answered "A record with these values already exists." without saying whether the Employee Number, the Work Email, or the department name was the problem; the field name (never the stored value) now travels with the error and the form marks it.
- The sign-out button had no accessible name of its own, relying on the `title` attribute that has now been replaced.
- A field marked by the server stopped being marked if the operator edited it, changed it back, and saved the same value again: the second rejection is byte-identical to the first, and the form had been treating "identical payload" as "same verdict the operator already dismissed". Rejections are now counted rather than compared.
- A user whose account lacks the required role was told their session had expired and to sign in again, which cannot grant a role. A 403 is now reported separately from a 401 and points at IT support instead.
- The retirement age and Employee Number fields accepted values that only look like numbers to JavaScript. `0x40`, `0b1000000`, and `6.4e1` were each read as 64 and submitted, so a typo in the retirement age could recalculate every employee's projected date from a figure nobody typed. Both fields now require plain decimal digits before any conversion happens.
- The prompt shown when un-confirming a retirement date quoted the date in fixed English abbreviations (`30 Jun 2050`) even in Italian, disagreeing with the field directly above it. It now uses the same localized `DD MMMM YYYY` the field does.

## 0.8.0 - 2026-07-28

### Added

- Every employee now carries a **Work Email** — required, unique, and entered by HR. No server-side code derives it and it has no fallback, because mail routing and the Ferie portal both depend on it being correct: to the API and the importer, a missing address is an error rather than a guess.
- While a new employee's name is typed, the form fills the Work Email in with the house convention — first initial, surname, `@itatti.harvard.edu`, so Andrea Caselli becomes `acaselli@itatti.harvard.edu` — and shimmers the field so the change is visible. It is only a suggestion: accents are stripped and spaces dropped, anyone the convention does not fit can simply be typed over, and once the address is edited by hand the form stops suggesting. An employee who already has an address is never touched.
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

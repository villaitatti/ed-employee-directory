# Changelog

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

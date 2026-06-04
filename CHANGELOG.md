# Changelog

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

# ED - Employee Directory

ED is an internal employee and department master-data app. It replaces spreadsheet maintenance with authenticated CRUD, CSV import review, CSV export, audit logging, and stable read-only `/api/v1` endpoints for future finance apps.

## Stack

- pnpm workspace with `@itatti/web`, `@itatti/server`, and `@itatti/shared`
- React 19, Vite, TypeScript, TanStack Query, react-hook-form, Zod
- Express, Prisma, PostgreSQL, Auth0 bearer-token auth
- Docker and Docker Compose for VM deployment behind Cloudflare Tunnel

## Local Development

```bash
cp .env.example .env
pnpm install
pnpm db:generate
docker compose -f docker-compose.dev.yml up -d db
pnpm db:push
pnpm dev
```

The dev defaults set `DEV_SKIP_AUTH=true` and `VITE_DEV_SKIP_AUTH=true`, which render a local `staff-IT` user and let the backend accept local API calls. Set both flags to `false` to test bearer-token auth locally.

For production Docker Compose, set `DB_PASSWORD` for the Postgres service and set `DATABASE_URL` to the internal `db:5432` connection string in the deployment `.env`.

## Checks

```bash
pnpm typecheck
pnpm test
pnpm build
docker build .
```

## V1 Scope

- Department and employee CRUD
- Italian-first bilingual UI
- Staff-only admin and write access
- Settings page for the statutory retirement age, with table-wide retirement-date recalculation for non-overridden employees
- CSV preview/commit by `Employee Number`, honoring the per-row "Retirement Date Overridden" flag
- Audit log with delete tombstones
- Read-only `/api/v1/departments`, `/api/v1/employees`, and `/api/v1/employees/:employeeNumber`

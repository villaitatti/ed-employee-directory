# ED - Employee Directory

ED is an internal employee and department master-data app. It replaces spreadsheet maintenance with authenticated CRUD, Excel import review, Excel export, audit logging, and stable read-only `/api/v1` endpoints for future finance apps.

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
- Employee approval-role master data for future time-off workflows
- Monday-Friday scheduled hours in Italian sessantesimi payroll format
- Italian-first bilingual UI
- Staff-only admin and write access
- Settings page for the statutory retirement age, with table-wide retirement-date recalculation for non-overridden employees
- Excel preview/commit by `Employee Number`, honoring the per-row "Retirement Date Confirmed" flag
- Audit log with delete tombstones
- Read-only `/api/v1/departments`, `/api/v1/employees`, and `/api/v1/employees/:employeeNumber`
- Time-off directory projection for the Ferie portal (see below)

## Time-off directory (Ferie portal integration)

The Ferie time-off portal mirrors ED rather than holding its own employee master
data. Two endpoints serve it, documented in `docs/openapi/time-off-directory.yaml`:

- `GET /api/v1/time-off-directory/employees` — paginated projection (`cursor`,
  `limit` up to 100), responding with `items` rather than `data` because the shape
  is fixed by the consumer contract. Requires the read scope or the staff role.
- `PATCH /api/v1/time-off-directory/employees/:id/preferred-language` — the only
  field an external client may write.

Two employee fields exist for this integration:

- **Work Email** — HR-entered, required, and unique. No server-side code derives
  it and it has no fallback: to the API and the importer a missing address is an
  error, never a guess. The employee form does offer the house convention
  (first initial + surname + `@itatti.harvard.edu`) as an editable suggestion
  while a new employee's name is typed, so a person still reads and approves the
  value before it is saved. The suggestion stops as soon as the field is edited
  by hand, and never touches an employee who already has an address.
- **Preferred Language** (`IT` or `EN`) — the language the portal greets the
  employee in. ED stays authoritative; the portal writes changes back here.

### Configuration

| Variable | Default | Purpose |
| --- | --- | --- |
| `AUTH0_WRITE_SCOPE` | `write:time-off-directory` | Scope required by the preferred-language endpoint. Deliberately distinct from `AUTH0_READ_SCOPE` so read-only sync credentials cannot mutate anything. |
| `TIME_OFF_DIRECTORY_ROLES` | *(empty)* | Employee-number-to-application-role grants, e.g. `201:STAFF_IT\|FERIE_PORTAL_ADMIN,202:FERIE_FINAL_APPROVER`. ED holds no application-role master data, so without this the portal syncs everyone with no roles. A typo fails at boot rather than silently dropping a grant. |

With `DEV_SKIP_AUTH=true` the local dev user carries both the read and write
scopes, so the portal's sync and language write both work locally without Auth0.

### Trust boundary

The preferred-language endpoint is called with a machine-to-machine token, which
carries no end-user identity. **The portal asserts which employee a change is
for, and ED cannot verify that the change actually came from that employee.** The
route is therefore restricted to that one field, rejects any other property in the
body, and records every call in the audit log with the calling client as the actor.

### Synthetic Auth0 subject

The projection's `auth0Subject` is `auth0|ed-<employeeNumber>`. ED does not model
Auth0 identities yet, and Ferie keys its mirror rows on this value, so it must stay
stable across syncs. Replace it with the real tenant subject once ED stores Auth0
identities — that is a coordinated change with the portal, not a drop-in swap.

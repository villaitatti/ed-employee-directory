# TODOS

## Retirement policy

### Serialize policy writes against concurrent employee edits
**Priority:** P2

When two staff change the retirement policy at the same time, or one changes it
while another edits an employee, the operations can interleave so the stored
policy and some employee retirement dates disagree, with no error surfaced. The
`updateMany` predicate already re-checks `retirementDateOverridden=false` so a
concurrent override is not clobbered, but the broader read-recalc-write window is
not serialized. Take a Postgres advisory lock (or `SELECT ... FOR UPDATE` on the
Setting row) at the top of the PUT `/settings/retirement-policy` transaction, and
have employee create/update/import acquire the same lock before reading the
policy. Low real-world likelihood for a 1-2 person IT team; revisit if staff grows.

### Index Employee.retirementDateOverridden for large orgs
**Priority:** P3

The bulk recalc filters employees on `retirementDateOverridden = false`, which has
no index (the column is new). Fine as a sequential scan at the current org size
(<300 employees); add an `@@index([retirementDateOverridden])` with a migration if
the directory grows large enough for the recalc scan to matter.

## Completed

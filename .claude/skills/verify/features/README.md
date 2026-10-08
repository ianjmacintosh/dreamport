# dreamport verification map

This directory is the maintained source for verifying dreamport's
user-facing behavior. Read this index first, then follow the matching feature
file as the recipe. The launch, doctor, evidence and cleanup mechanics are in
`../SKILL.md`.

## Baseline preconditions

- `scripts/up.sh` printed `ready: http://localhost:5175`, and
  `scripts/doctor.sh` exits 0.
- The shell has run `source .claude/skills/verify/scripts/lib.sh`
  (it sets `$BASE_URL`, `$EVIDENCE_DIR`, and the `verify` axi session).
- The database is empty apart from seeded Paths, Milestones, Tasks and
  Worksheets. `up.sh` always starts from fresh migrations.
- Drive only an instance that this run started.

## Driving conventions

- Every feature except Sign in starts signed in (see `sign-in.md`).
- Act through `scripts/act.sh <verb> <role> "<name>"` and wait with
  `scripts/wait.sh "<text>"`. Never reuse a raw uid from an earlier
  command, and start a new recipe from a copy of `scripts/smoke.sh`.
- Give each run's data a unique name (`Verify <thing> $(date +%s)`) so
  rows from this run can be told apart.

## Proof and skip reporting

- Capture the action and the resulting state: a snapshot after the action,
  plus a snapshot after `location.reload()`.
- A mutation needs a second, read-only view: a `scripts/db.sh` SELECT.
- Record the feature ID and the entry point next to each artifact.
- Report an entry point you couldn't reach, with the command you tried and
  the precondition that wasn't met. Don't report it as verified through a
  different path.

## Feature entry contract

Each file has an H1 and one paragraph, then four H2s in this order:
`Sub-features`, `How to get to it (user POV)`,
`Driving it with chrome-devtools-axi`, and `Gotchas`.

## Features

- [Sign in](./sign-in.md): email OTP with Turnstile, the code step, and
  wrong-code and request-new-code handling.
- [Products](./products.md): add, open, describe, and delete a Product
  on `/app`.
- [Ideas](./ideas.md): add, rename, tag, and delete Ideas on a Product home.
- [Journeys](./journeys.md): start, advance, return and finish a Journey,
  tick Tasks, and fill in the Product Summary Worksheet.
- [Account](./account.md): the account menu, sign out, Settings, and
  delete account.

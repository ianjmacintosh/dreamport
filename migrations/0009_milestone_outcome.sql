-- Issue #137: each Milestone's outcome line — a few words shown under its
-- name on the Journey page's route, before you reach it (the full
-- description only shows once it's current).
--
-- Not null with an empty default only so the column can be added to
-- existing rows; `0010` seeds every Milestone's line. Kept to this one
-- statement so it applies all-or-nothing: SQLite has no `add column if not
-- exists`, so this can't be re-run, but it can't half-apply either.

alter table "milestones" add column "outcome" text not null default '';

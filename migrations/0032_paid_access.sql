-- Paid as a third Access value (issue #231, parent #229).
--
-- 'paid': a User buys a version through Stripe Checkout, and the
-- purchase Adds it for them. Only a Guide whose Stripe account is ready
-- can choose it; the Worker checks that, not the database.
--
-- `0028` declared `access` with a CHECK allowing only 'everyone' and
-- 'request', and SQLite can't change a CHECK in place. A full
-- create-copy-drop-rename rebuild of `paths` isn't safe here: dropping
-- the old table runs an implicit DELETE, which fires the ON DELETE CASCADE
-- of every child table (`path_versions`, `draft_milestones`,
-- `path_requests`) and takes their rows with it, and renaming it first
-- repoints those children's foreign keys at the old table (see `0019`).
--
-- So only the column is rebuilt: a new column with the wider CHECK takes
-- the data, the old column goes, and the new one takes its name. SQLite
-- lets a column be dropped when the only CHECK naming it is its own. Every
-- other column, default, index, trigger and foreign key of `paths` is
-- untouched, and `access` stays the table's last column, with the same
-- default and NOT NULL.
--
-- Not re-runnable (adds and drops a column).

alter table "paths" add column "access_paid" text not null default 'everyone' check ("access_paid" in ('everyone', 'request', 'paid'));
update "paths" set "access_paid" = "access";
alter table "paths" drop column "access";
alter table "paths" rename column "access_paid" to "access";

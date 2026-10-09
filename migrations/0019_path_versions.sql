-- Paths and saved Path versions as data (issue #166, spec #164).
--
-- The `paths` row `0007` seeded was always a Path version in today's terms:
-- a name and an ordered set of Milestones that never change except by a
-- migration. So it's renamed `path_versions`, and SQLite rewrites every
-- foreign key that points at it. The four columns pointing at it are
-- renamed `versionId` to match. A new `paths` table sits above it: one row
-- per Path, with its owner (`userId`, null for Dreamport). No id changes,
-- so Dream Sequence version 1 keeps the id `starter`, and every Journey,
-- Worksheet answer and checked Task on it stays as it was.
--
-- Renamed, not rebuilt: a create-copy-drop-rename rebuild of a table with
-- child rows fails on commit even with `defer_foreign_keys`, since dropping
-- the old table counts each orphaned child as a violation.
--
-- `path_versions."pathId"` can't be declared not null: SQLite only adds a
-- referencing column with a null default. The Paths module always sets it.
--
-- Not re-runnable (renames).

alter table "paths" rename to "path_versions";
alter table "milestones" rename column "pathId" to "versionId";
alter table "journeys" rename column "pathId" to "versionId";
alter table "worksheet_instances" rename column "pathId" to "versionId";
alter table "task_completions" rename column "pathId" to "versionId";

create table "paths" ("id" text not null primary key, "userId" text references "user" ("id") on delete cascade, "createdAt" date not null);
create index "paths_userId_idx" on "paths" ("userId");

alter table "path_versions" add column "pathId" text references "paths" ("id") on delete cascade;
alter table "path_versions" add column "number" integer not null default 1 check ("number" >= 1);
alter table "path_versions" add column "description" text not null default '';
alter table "path_versions" add column "savedAt" date not null default '';

insert into "paths" ("id", "userId", "createdAt") values ('dream-sequence', null, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));
update "path_versions" set "pathId" = 'dream-sequence', "number" = 1, "savedAt" = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') where "id" = 'starter';
create unique index "path_versions_pathId_number_idx" on "path_versions" ("pathId", "number");

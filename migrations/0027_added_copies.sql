-- Adding a published Path version as a read-only copy (issue #192, parent
-- #189; ADR-0016 extended in #188, ADR-0017).
--
-- A User's copies of one Path sit under one `paths` row of theirs, its
-- `addedFrom` the Path they were Added from. Each version they Add is a
-- `path_versions` row under it, with the source's number, name,
-- description and `savedAt`, and `copiedFrom` the version it came from, so
-- a destroy (#193) finds every copy and a Purchase can record what was
-- bought. Its Milestones and Tasks are copied with ids `<copy's id>:<the
-- Draft row's id>`, the same shape `saveVersion` gives, so `0023`'s delete
-- trigger finds them by prefix.
--
-- A copy's `paths` row has no Draft: its name and description stay empty,
-- it never opens, and the Paths module leaves it out of the User's own
-- Paths, the 30-Path cap and Trailblazer.
--
-- Neither column is a foreign key. A Guide's Path can't be deleted while
-- anyone holds a copy, but deleting a Guide's account takes their Paths,
-- and the copies carry on regardless (ADR-0016).
--
-- One copy row per User and Path; own Paths have a null `addedFrom`, and
-- SQLite counts nulls as distinct, so the index never touches them.
--
-- Not re-runnable (adds columns).

alter table "paths" add column "addedFrom" text;
alter table "path_versions" add column "copiedFrom" text;

create unique index "paths_userId_addedFrom_idx" on "paths" ("userId", "addedFrom");
create index "paths_addedFrom_idx" on "paths" ("addedFrom");
create index "path_versions_copiedFrom_idx" on "path_versions" ("copiedFrom");

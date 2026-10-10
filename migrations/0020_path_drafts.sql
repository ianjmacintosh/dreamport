-- A Path's Draft (issue #167, spec #164): the editable working state a
-- User's Path has in Trailblazer.
--
-- The Draft's name and description live on its `paths` row. Dream
-- Sequence's row (userId null) has no Draft and keeps the empty defaults.
--
-- `draft_milestones` holds the Draft's Milestones, apart from the saved
-- versions' `milestones`, which never change. No unique on
-- (pathId, position): a reorder rewrites every position in one batch, and
-- a unique index would refuse the intermediate states.
--
-- Not re-runnable (adds columns).

alter table "paths" add column "name" text not null default '';
alter table "paths" add column "description" text not null default '';

create table "draft_milestones" ("id" text not null primary key, "pathId" text not null references "paths" ("id") on delete cascade, "position" integer not null, "name" text not null, "description" text not null, "doneWhen" text not null, "outcome" text not null default '');
create index "draft_milestones_pathId_idx" on "draft_milestones" ("pathId");

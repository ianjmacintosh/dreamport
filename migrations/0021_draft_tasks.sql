-- A Draft Milestone's Tasks (issue #168, spec #164), in order. No unique
-- on (milestoneId, position), for the same reason `0020` gives.
--
-- Not re-runnable (creates a table).

create table "draft_tasks" ("id" text not null primary key, "milestoneId" text not null references "draft_milestones" ("id") on delete cascade, "position" integer not null, "title" text not null);
create index "draft_tasks_milestoneId_idx" on "draft_tasks" ("milestoneId");

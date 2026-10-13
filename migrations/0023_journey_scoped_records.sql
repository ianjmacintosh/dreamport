-- Several Journeys per Product on one Path (issue #172, spec #164).
--
-- A Journey's Worksheet instances (and so their answers) and checked Tasks
-- now belong to the Journey, not to a (Product, version) pair, so a new
-- Journey on a Path the Product followed before starts blank, and deleting a
-- Journey takes its records with it (`on delete cascade`). `journeys` loses
-- its unique (Product, version): the Journey module allows any number of
-- completed Journeys on a Path and at most one in progress.
--
-- Today a Product has at most one Journey per version, so every existing
-- instance and checked Task moves onto exactly one Journey, found by its
-- (Product, version).
--
-- Each table is rebuilt, since SQLite can't drop a unique constraint or a
-- column in place. Ordered so no drop cascades into kept rows: dropping a
-- table deletes its rows first, firing `on delete cascade` on anything that
-- references it. So the new tables reference `journeys_new` and
-- `worksheet_instances_new`, nothing references the old tables when
-- they're dropped (children first), and the renames at the end rewrite the
-- references. `rowid` is copied so the oldest-first order holds.
--
-- The trigger from `0022` names the old columns, so it's dropped first and
-- made again last; deleting a version's Journeys now takes their records
-- by cascade.
--
-- `BEGIN` and `END` stay in capitals (see `0022`).
--
-- Not re-runnable (rebuilds tables).

drop trigger "path_versions_delete_contents";

create table "journeys_new" ("id" text not null primary key, "productId" text not null references "products" ("id") on delete cascade, "versionId" text not null references "path_versions" ("id"), "currentMilestoneId" text not null references "milestones" ("id"), "startedAt" date not null, "finishedAt" date);
insert into "journeys_new" ("rowid", "id", "productId", "versionId", "currentMilestoneId", "startedAt", "finishedAt")
select "rowid", "id", "productId", "versionId", "currentMilestoneId", "startedAt", "finishedAt" from "journeys";

create table "worksheet_instances_new" ("id" text not null primary key, "journeyId" text not null references "journeys_new" ("id") on delete cascade, "worksheetId" text not null references "worksheets" ("id"), "singleton" integer check ("singleton" = 1), "createdAt" date not null, unique ("journeyId", "worksheetId", "singleton"));
insert into "worksheet_instances_new" ("rowid", "id", "journeyId", "worksheetId", "singleton", "createdAt")
select "worksheet_instances"."rowid", "worksheet_instances"."id", "journeys"."id", "worksheet_instances"."worksheetId", "worksheet_instances"."singleton", "worksheet_instances"."createdAt"
from "worksheet_instances"
join "journeys" on "journeys"."productId" = "worksheet_instances"."productId" and "journeys"."versionId" = "worksheet_instances"."versionId";

create table "worksheet_answers_new" ("instanceId" text not null references "worksheet_instances_new" ("id") on delete cascade, "fieldId" text not null, "value" text not null, primary key ("instanceId", "fieldId"));
insert into "worksheet_answers_new" ("instanceId", "fieldId", "value")
select "instanceId", "fieldId", "value" from "worksheet_answers"
where "instanceId" in (select "id" from "worksheet_instances_new");

create table "task_completions_new" ("journeyId" text not null references "journeys_new" ("id") on delete cascade, "taskId" text not null references "tasks" ("id"), "completedAt" date not null, primary key ("journeyId", "taskId"));
insert into "task_completions_new" ("journeyId", "taskId", "completedAt")
select "journeys"."id", "task_completions"."taskId", "task_completions"."completedAt"
from "task_completions"
join "journeys" on "journeys"."productId" = "task_completions"."productId" and "journeys"."versionId" = "task_completions"."versionId";

drop table "worksheet_answers";
drop table "worksheet_instances";
drop table "task_completions";
drop table "journeys";

alter table "journeys_new" rename to "journeys";
alter table "worksheet_instances_new" rename to "worksheet_instances";
alter table "worksheet_answers_new" rename to "worksheet_answers";
alter table "task_completions_new" rename to "task_completions";

create index "journeys_productId_idx" on "journeys" ("productId");

create trigger "path_versions_delete_contents" before delete on "path_versions"
BEGIN
  delete from "journeys" where "versionId" = old."id";
  delete from "milestone_worksheets" where "milestoneId" in (select "id" from "milestones" where "versionId" = old."id");
  delete from "milestone_tasks" where "milestoneId" in (select "id" from "milestones" where "versionId" = old."id");
  delete from "tasks" where substr("id", 1, length(old."id") + 1) = old."id" || ':';
  delete from "milestones" where "versionId" = old."id";
END;

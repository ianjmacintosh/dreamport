-- Saving a Path's Draft as a new version (issue #169, spec #164).
--
-- `paths."updatedAt"` is when the Draft last changed. Triggers keep it
-- current on every write to the Draft (its name and description, its
-- Milestones and their Tasks), so no write function can forget it. Saving
-- a version writes none of those, so it leaves `updatedAt` alone.
--
-- Deleting a version (only ever by deleting its User: user -> paths ->
-- path_versions) would fail on the foreign keys of everything under it,
-- none of which cascade. The `before delete` trigger removes those rows
-- first, children before parents.
--
-- A saved Task's id is `<versionId>:<draftTaskId>`, and a saved
-- Milestone's `<versionId>:<draftMilestoneId>` (see `saveVersion` in
-- `src/worker/paths.ts`). The trigger deletes a version's `tasks` by that
-- prefix, not through `milestone_tasks`: `tasks` is many-to-many with
-- Milestones, and Dream Sequence's catalog Tasks (ids like
-- `talk-to-five-customers`) can never start with a version's UUID and a
-- colon.
--
-- Not re-runnable (adds a column).

alter table "paths" add column "updatedAt" date not null default '';
update "paths" set "updatedAt" = "createdAt";

create trigger "paths_draft_updated" after update of "name", "description" on "paths"
when old."name" is not new."name" or old."description" is not new."description"
begin
  update "paths" set "updatedAt" = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') where "id" = new."id";
end;

create trigger "draft_milestones_inserted" after insert on "draft_milestones"
begin
  update "paths" set "updatedAt" = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') where "id" = new."pathId";
end;

create trigger "draft_milestones_updated" after update on "draft_milestones"
begin
  update "paths" set "updatedAt" = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') where "id" = new."pathId";
end;

create trigger "draft_milestones_deleted" after delete on "draft_milestones"
begin
  update "paths" set "updatedAt" = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') where "id" = old."pathId";
end;

create trigger "draft_tasks_inserted" after insert on "draft_tasks"
begin
  update "paths" set "updatedAt" = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
  where "id" = (select "pathId" from "draft_milestones" where "id" = new."milestoneId");
end;

create trigger "draft_tasks_updated" after update on "draft_tasks"
begin
  update "paths" set "updatedAt" = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
  where "id" = (select "pathId" from "draft_milestones" where "id" = new."milestoneId");
end;

create trigger "draft_tasks_deleted" after delete on "draft_tasks"
begin
  update "paths" set "updatedAt" = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
  where "id" = (select "pathId" from "draft_milestones" where "id" = old."milestoneId");
end;

create trigger "path_versions_delete_contents" before delete on "path_versions"
begin
  delete from "task_completions" where "versionId" = old."id";
  delete from "worksheet_instances" where "versionId" = old."id";
  delete from "journeys" where "versionId" = old."id";
  delete from "milestone_worksheets" where "milestoneId" in (select "id" from "milestones" where "versionId" = old."id");
  delete from "milestone_tasks" where "milestoneId" in (select "id" from "milestones" where "versionId" = old."id");
  delete from "tasks" where substr("id", 1, length(old."id") + 1) = old."id" || ':';
  delete from "milestones" where "versionId" = old."id";
end;

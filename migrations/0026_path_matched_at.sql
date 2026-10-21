-- When a Path's Draft last matched its latest saved version (issue #191).
--
-- The editor labels the page "Version {n}" while the Draft is exactly
-- what version n saved, and "Draft (unpublished)" after any edit.
-- `paths."updatedAt"` alone can't tell: Discard Changes rewrites the
-- Draft's rows, so `0022`'s triggers move `updatedAt` forward even though
-- the Draft now matches the latest version again.
--
-- `matchedAt` is set by saving a version and by Discard Changes, each as
-- the last statement of its batch, so it is never earlier than the
-- `updatedAt` its own writes stamped. The Draft matches its latest version
-- while `updatedAt <= matchedAt`. Writing `matchedAt` fires none of
-- `0022`'s triggers.
--
-- Existing Paths not edited since their latest save match it. Not
-- re-runnable (adds a column).

alter table "paths" add column "matchedAt" date not null default '';

update "paths" set "matchedAt" = (select max("savedAt") from "path_versions" where "pathId" = "paths"."id")
where "updatedAt" <= (select max("savedAt") from "path_versions" where "pathId" = "paths"."id");

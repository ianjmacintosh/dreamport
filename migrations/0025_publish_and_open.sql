-- Publishing Path versions and opening Paths (issue #191, parent #189).
--
-- `path_versions."published"` is whether a saved version is offered to
-- other Users. Saving one offers it to no one, so it defaults to 0.
-- `paths."open"` is whether the Path accepts new Adds. Every Path starts
-- closed. An open Path always has a published version: the Paths module
-- refuses to open one without, and closes one when its last published
-- version is unpublished. The version a Path's root address offers is the
-- highest-numbered published one, worked out on read, never stored.
--
-- Writing `open` leaves `paths."updatedAt"` alone: `0022`'s trigger only
-- fires on a change to the Draft's name or description.
--
-- Dream Sequence is always open, with its only version published.
--
-- Not re-runnable (adds columns).

alter table "path_versions" add column "published" integer not null default 0 check ("published" in (0, 1));
alter table "paths" add column "open" integer not null default 0 check ("open" in (0, 1));

update "path_versions" set "published" = 1 where "pathId" in (select "id" from "paths" where "userId" is null);
update "paths" set "open" = 1 where "userId" is null;

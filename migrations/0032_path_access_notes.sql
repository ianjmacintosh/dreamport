-- A Path's "Notes About Getting Access" (issues #246, #247).
--
-- Free text a Guide writes for Users who want to Request a By Request
-- Path, such as a price and how to pay. Like the name and description,
-- the notes belong to the Draft (`paths."accessNotes"`) and Save as New
-- Version copies them into the version (`path_versions."accessNotes"`),
-- which never changes afterwards. Empty means no notes. Existing Paths
-- and versions have none.
--
-- `0022`'s `paths_draft_updated` trigger stamps `updatedAt` when the
-- Draft's name or description changes. Editing the notes changes the
-- Draft too, so the trigger is replaced with one that also watches
-- `accessNotes`. `BEGIN` and `END` stay in capitals (see `0022`).
--
-- Not re-runnable (adds columns).

alter table "paths" add column "accessNotes" text not null default '';
alter table "path_versions" add column "accessNotes" text not null default '';

drop trigger "paths_draft_updated";

create trigger "paths_draft_updated" after update of "name", "description", "accessNotes" on "paths"
when old."name" is not new."name" or old."description" is not new."description"
  or old."accessNotes" is not new."accessNotes"
BEGIN
  update "paths" set "updatedAt" = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') where "id" = new."id";
END;

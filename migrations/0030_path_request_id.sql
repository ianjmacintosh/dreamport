-- An id for each pending Request (issue #216, parent #213).
--
-- The Guide's list names a Request by this id, so Approve and Deny can say
-- which one without exposing the requester's user id. Random, not the
-- table's rowid, which SQLite reuses once the newest row is deleted: a
-- stale list could then decide someone else's Request.
--
-- Existing rows get an id here; new ones are given one by the Worker.
--
-- Not re-runnable (adds a column).

alter table "path_requests" add column "id" text;

update "path_requests" set "id" = lower(hex(randomblob(16))) where "id" is null;

create unique index if not exists "path_requests_id_idx" on "path_requests" ("id");

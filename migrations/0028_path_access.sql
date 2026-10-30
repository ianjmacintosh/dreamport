-- A Path's Access (issue #214, parent #213; ADR-0018).
--
-- 'free': any User may Add it straight away. 'permission': a User has to
-- Request it first (#215). Changing it affects only later Adds; copies
-- already Added stay with their Users. Every existing Path starts Free,
-- and so does every new one. Dream Sequence's row is Free and the Worker
-- never changes it.
--
-- Not re-runnable (adds a column).

alter table "paths" add column "access" text not null default 'free' check ("access" in ('free', 'permission'));

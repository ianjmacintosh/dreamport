-- Worksheets (issue #139, parent #133): sets of fields a Path's
-- Milestones hold, filled in per Product.
--
-- `worksheets`, `worksheet_fields` and `milestone_worksheets` are a fixed,
-- Dreamport-curated catalog like `paths`/`milestones` in `0007` — seeded
-- in `0014`, never added by a route. A Worksheet's `cardinality` is
-- `singleton` (exactly one shared copy per Product per Path, reused on
-- every Milestone it's on) or `repeatable` (any number of independent
-- copies). A Field's place in its Worksheet is `position` (1-based).
-- `milestone_worksheets` is many-to-many: one Worksheet can sit on several
-- Milestones, and a Milestone can hold several Worksheets.
--
-- `worksheet_instances` is one filled-in copy, scoped per (Product, Path)
-- the same way `journeys` is, so a second Path later starts fresh.
-- `singleton` is 1 on a singleton Worksheet's copy and null on a
-- repeatable one's: the unique key then allows one singleton copy per
-- (Product, Path, Worksheet) and any number of repeatable ones (SQLite
-- treats nulls as distinct). Cascades off `products` like `journeys`; the
-- Product's own `userId` is still the ownership boundary, checked by the
-- route.
--
-- `worksheet_answers` holds one filled-in field per copy. A blank field
-- has no row.

create table "worksheets" ("id" text not null primary key, "name" text not null, "cardinality" text not null check ("cardinality" in ('singleton', 'repeatable')));

create table "worksheet_fields" ("worksheetId" text not null references "worksheets" ("id"), "id" text not null, "position" integer not null, "name" text not null, "prompt" text not null, primary key ("worksheetId", "id"), unique ("worksheetId", "position"));

create table "milestone_worksheets" ("milestoneId" text not null references "milestones" ("id"), "worksheetId" text not null references "worksheets" ("id"), primary key ("milestoneId", "worksheetId"));

create table "worksheet_instances" ("id" text not null primary key, "productId" text not null references "products" ("id") on delete cascade, "pathId" text not null references "paths" ("id"), "worksheetId" text not null references "worksheets" ("id"), "singleton" integer check ("singleton" = 1), "createdAt" date not null, unique ("productId", "pathId", "worksheetId", "singleton"));

create table "worksheet_answers" ("instanceId" text not null references "worksheet_instances" ("id") on delete cascade, "fieldId" text not null, "value" text not null, primary key ("instanceId", "fieldId"));

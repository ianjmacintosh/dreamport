-- Issue #113: Idea Tags from a fixed, Dreamport-curated catalog.
--
-- `tags` is the catalog itself — a small fixed vocabulary, so a Tag's own
-- name is its primary key (no surrogate id). Seeded with the six starter
-- Tags from #111; there's no route that adds one.
--
-- `idea_tags` joins Ideas to Tags (many-to-many). It cascades off `ideas`
-- the same way `ideas` cascades off `products` in `0004`, so deleting an
-- Idea (or its Product, or its User) takes its tag assignments with it. No
-- ownership column of its own — an Idea's Product's `userId` is still the
-- ownership boundary, checked by the route.

create table "tags" ("name" text not null primary key);

insert into "tags" ("name") values ('Design'), ('Staffing'), ('Functionality'), ('Promotion'), ('Distribution'), ('Pricing');

create table "idea_tags" ("ideaId" text not null references "ideas" ("id") on delete cascade, "tagName" text not null references "tags" ("name"), primary key ("ideaId", "tagName"));

create index "idea_tags_tagName_idx" on "idea_tags" ("tagName");

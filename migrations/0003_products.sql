-- Products v1 slice 1 (issue #88): a signed-in User's flat list of Products.
--
-- One row per Product, owned by exactly one User (`userId`, cascading on
-- delete the same way `session`/`account` already do in `0001`). No Ideas
-- yet (see CONTEXT.md) — just an id and a name.

create table "products" ("id" text not null primary key, "userId" text not null references "user" ("id") on delete cascade, "name" text not null, "createdAt" date not null);

create index "products_userId_idx" on "products" ("userId");

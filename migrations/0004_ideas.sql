-- Ideas v1 slice 1 (issue #99): a Product's own flat list of Ideas.
--
-- One row per Idea, owned by exactly one Product (`productId`, cascading on
-- delete the same way `products.userId` cascades off `user` in `0003`). No
-- ownership column of its own — a Product's own `userId` is the ownership
-- boundary, checked one hop up when a route resolves `productId`.

create table "ideas" ("id" text not null primary key, "productId" text not null references "products" ("id") on delete cascade, "name" text not null, "createdAt" date not null);

create index "ideas_productId_idx" on "ideas" ("productId");

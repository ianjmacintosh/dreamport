-- Issue #112: a Product's free-text description, alongside its name.
--
-- Nullable, no default: `NULL` is the "no description yet" state — every
-- existing row gets it, as does every new Product (the create form doesn't
-- ask for one). An empty description is stored as `NULL`, never `''`.

alter table "products" add column "description" text;

/**
 * Products v1 slice 1 (issue #88): a signed-in User's flat list of Products.
 *
 * Plain data-access functions over the `products` table (`migrations/0003_*.sql`)
 * — the HTTP boundary (session check, request/response shaping) lives in
 * `index.ts`'s `/api/products` routes and, for one Product,
 * `product-routes.ts`; the same split `otp-send-throttle.ts` uses for its D1
 * access.
 */

export interface Product {
  id: string;
  name: string;
  /** Free text; `null` means none yet (never stored as `""`). */
  description: string | null;
  createdAt: string;
}

/**
 * Longest `name` the create endpoint accepts. A Product name is meant to be a
 * short title (longer detail belongs in its description — see CONTEXT.md),
 * and an explicit cap keeps a single row's size bounded rather than accepting
 * whatever a client happens to send.
 */
export const PRODUCT_NAME_MAX_LENGTH = 200;

/**
 * Longest `description` the update endpoint accepts — room for a real
 * description rather than just a longer name (#112), still bounded for the
 * same reason as `PRODUCT_NAME_MAX_LENGTH`.
 */
export const PRODUCT_DESCRIPTION_MAX_LENGTH = 2000;

/** A User's own Products, oldest first. */
export async function listProducts(
  db: D1Database,
  userId: string,
): Promise<Product[]> {
  const { results } = await db
    .prepare(
      'SELECT "id", "name", "description", "createdAt" FROM "products" WHERE "userId" = ? ORDER BY "createdAt" ASC',
    )
    .bind(userId)
    .all<Product>();
  return results;
}

/** Create a Product owned by `userId`. Caller has already validated `name`. */
export async function createProduct(
  db: D1Database,
  userId: string,
  name: string,
): Promise<Product> {
  const product: Product = {
    id: crypto.randomUUID(),
    name,
    description: null,
    createdAt: new Date().toISOString(),
  };
  await db
    .prepare(
      'INSERT INTO "products" ("id", "userId", "name", "createdAt") VALUES (?, ?, ?, ?)',
    )
    .bind(product.id, userId, product.name, product.createdAt)
    .run();
  return product;
}

declare const owned: unique symbol;

/**
 * A Product confirmed to belong to the User asking for it (#154). Only
 * `getProduct` makes one, so every function that reads or writes under a
 * Product takes this rather than a bare id: one nobody checked won't
 * typecheck.
 */
export type OwnedProduct = Product & { readonly [owned]: true };

/**
 * A User's own Product by id, or null if it doesn't exist or isn't theirs.
 * Scoped by both `id` and `userId` in one query — same reasoning as
 * `deleteProduct`: a stranger's Product is indistinguishable from a
 * nonexistent one.
 */
export async function getProduct(
  db: D1Database,
  userId: string,
  id: string,
): Promise<OwnedProduct | null> {
  return db
    .prepare(
      'SELECT "id", "name", "description", "createdAt" FROM "products" WHERE "id" = ? AND "userId" = ?',
    )
    .bind(id, userId)
    .first<OwnedProduct>();
}

/**
 * Delete a Product owned by `userId`. Still scoped by `userId` in the query
 * as well, a second check behind `OwnedProduct`'s. Returns whether a row was
 * actually deleted.
 */
export async function deleteProduct(
  db: D1Database,
  userId: string,
  product: OwnedProduct,
): Promise<boolean> {
  const { meta } = await db
    .prepare('DELETE FROM "products" WHERE "id" = ? AND "userId" = ?')
    .bind(product.id, userId)
    .run();
  return meta.changes > 0;
}

/**
 * Set (or, with `null`, clear) the description of a Product owned by
 * `userId`. Caller has already validated and normalised `description`.
 * Still scoped by `userId` in the query, the same second check
 * `deleteProduct` keeps; returns the updated Product, or null if no row
 * matched.
 */
export async function updateProductDescription(
  db: D1Database,
  userId: string,
  product: OwnedProduct,
  description: string | null,
): Promise<Product | null> {
  return db
    .prepare(
      'UPDATE "products" SET "description" = ? WHERE "id" = ? AND "userId" = ? RETURNING "id", "name", "description", "createdAt"',
    )
    .bind(description, product.id, userId)
    .first<Product>();
}

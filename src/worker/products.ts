/**
 * Products v1 slice 1 (issue #88): a signed-in User's flat list of Products.
 *
 * Plain data-access functions over the `products` table (`migrations/0003_*.sql`)
 * — the HTTP boundary (session check, request/response shaping) lives in
 * `index.ts`'s `/api/products` routes, the same split `otp-send-throttle.ts`
 * uses for its D1 access.
 */

export interface Product {
  id: string;
  name: string;
  createdAt: string;
}

/**
 * Longest `name` the create endpoint accepts. A Product name is meant to be a
 * short title (v1 is a flat list, no detail fields — see CONTEXT.md), and an
 * explicit cap keeps a single row's size bounded rather than accepting
 * whatever a client happens to send.
 */
export const PRODUCT_NAME_MAX_LENGTH = 200;

/** A User's own Products, oldest first. */
export async function listProducts(
  db: D1Database,
  userId: string,
): Promise<Product[]> {
  const { results } = await db
    .prepare(
      'SELECT "id", "name", "createdAt" FROM "products" WHERE "userId" = ? ORDER BY "createdAt" ASC',
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
): Promise<Product | null> {
  return db
    .prepare(
      'SELECT "id", "name", "createdAt" FROM "products" WHERE "id" = ? AND "userId" = ?',
    )
    .bind(id, userId)
    .first<Product>();
}

/**
 * Delete a Product owned by `userId`. Scoped by both `id` and `userId` in
 * the one query — not a select-then-delete — so a stranger's row is
 * indistinguishable from a nonexistent one at the DB layer too. Returns
 * whether a row was actually deleted, so the caller can decide 404 vs 200
 * without a separate existence check.
 */
export async function deleteProduct(
  db: D1Database,
  userId: string,
  id: string,
): Promise<boolean> {
  const { meta } = await db
    .prepare('DELETE FROM "products" WHERE "id" = ? AND "userId" = ?')
    .bind(id, userId)
    .run();
  return meta.changes > 0;
}

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

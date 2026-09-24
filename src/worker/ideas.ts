/**
 * Ideas v1 slice 1 (issue #99): a Product's own flat list of Ideas.
 *
 * Plain data-access functions over the `ideas` table (`migrations/0004_*.sql`)
 * — the HTTP boundary (session check, ownership check, request/response
 * shaping) lives in `index.ts`'s `/api/products/:productId/ideas` routes,
 * the same split `products.ts` has with its own `/api/products` routes.
 * `listIdeas`/`createIdea` don't re-check that `productId` belongs to the
 * caller themselves — the route already will have, via `getProduct` — same
 * division of labor `listProducts`/`createProduct` have with their caller.
 */

export interface Idea {
  id: string;
  name: string;
  createdAt: string;
}

/** Longest `name` the create endpoint accepts. Same cap as Products, own name. */
export const IDEA_NAME_MAX_LENGTH = 200;

/** A Product's own Ideas, oldest first. */
export async function listIdeas(
  db: D1Database,
  productId: string,
): Promise<Idea[]> {
  const { results } = await db
    .prepare(
      'SELECT "id", "name", "createdAt" FROM "ideas" WHERE "productId" = ? ORDER BY "createdAt" ASC',
    )
    .bind(productId)
    .all<Idea>();
  return results;
}

/** Create an Idea under `productId`. Caller has already validated `name`. */
export async function createIdea(
  db: D1Database,
  productId: string,
  name: string,
): Promise<Idea> {
  const idea: Idea = {
    id: crypto.randomUUID(),
    name,
    createdAt: new Date().toISOString(),
  };
  await db
    .prepare(
      'INSERT INTO "ideas" ("id", "productId", "name", "createdAt") VALUES (?, ?, ?, ?)',
    )
    .bind(idea.id, productId, idea.name, idea.createdAt)
    .run();
  return idea;
}

/**
 * Delete an Idea under `productId`. Scoped by both `id` and `productId` in
 * the one query — same reasoning `deleteProduct` gives for itself: an Idea
 * under a different Product is indistinguishable from a nonexistent one at
 * this layer. Caller (the route) has already confirmed `productId` belongs
 * to the requesting User via `getProduct`.
 */
export async function deleteIdea(
  db: D1Database,
  productId: string,
  id: string,
): Promise<boolean> {
  const { meta } = await db
    .prepare('DELETE FROM "ideas" WHERE "id" = ? AND "productId" = ?')
    .bind(id, productId)
    .run();
  return meta.changes > 0;
}

/**
 * Ideas v1 slice 1 (issue #99): a Product's own flat list of Ideas.
 *
 * Plain data-access functions over the `ideas` table (`migrations/0004_*.sql`)
 * — the HTTP boundary (request/response shaping) lives in
 * `product-routes.ts`. Each takes an `OwnedProduct`, so ownership is
 * already settled by the time one runs.
 */

import type { OwnedProduct } from "./products";

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
  product: OwnedProduct,
): Promise<Idea[]> {
  const { results } = await db
    .prepare(
      'SELECT "id", "name", "createdAt" FROM "ideas" WHERE "productId" = ? ORDER BY "createdAt" ASC',
    )
    .bind(product.id)
    .all<Idea>();
  return results;
}

/** Create an Idea under `product`. Caller has already validated `name`. */
export async function createIdea(
  db: D1Database,
  product: OwnedProduct,
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
    .bind(idea.id, product.id, idea.name, idea.createdAt)
    .run();
  return idea;
}

/**
 * Delete an Idea under `product`. Scoped by both `id` and the Product in
 * the one query, so an Idea under a different Product is indistinguishable
 * from a nonexistent one at this layer.
 */
export async function deleteIdea(
  db: D1Database,
  product: OwnedProduct,
  id: string,
): Promise<boolean> {
  const { meta } = await db
    .prepare('DELETE FROM "ideas" WHERE "id" = ? AND "productId" = ?')
    .bind(id, product.id)
    .run();
  return meta.changes > 0;
}

/**
 * Rename an Idea under `product`, returning it with its new name, or
 * `null` if nothing matched. Scoped by both `id` and the Product in the one
 * query — same reasoning `deleteIdea` gives for itself. Caller has already
 * validated `name`.
 */
export async function renameIdea(
  db: D1Database,
  product: OwnedProduct,
  id: string,
  name: string,
): Promise<Idea | null> {
  return db
    .prepare(
      'UPDATE "ideas" SET "name" = ? WHERE "id" = ? AND "productId" = ? RETURNING "id", "name", "createdAt"',
    )
    .bind(name, id, product.id)
    .first<Idea>();
}

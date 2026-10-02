/**
 * Issue #113: Idea Tags from a fixed catalog.
 *
 * Plain data-access functions over the `tags` catalog and the `idea_tags`
 * join table (`migrations/0006_*.sql`) — the HTTP boundary (session check,
 * ownership check, validating submitted names against the catalog) lives in
 * `index.ts`, the same split `ideas.ts` has with its own routes. Nothing
 * here checks that `productId` belongs to the caller; the route already
 * will have, via `getProduct`.
 *
 * Tags come back alphabetical everywhere — the catalog has no ordering of
 * its own beyond the name that keys it.
 */

/** Every Tag name in the catalog, alphabetical. */
export async function listTags(db: D1Database): Promise<string[]> {
  const { results } = await db
    .prepare('SELECT "name" FROM "tags" ORDER BY "name" ASC')
    .all<{ name: string }>();
  return results.map((row) => row.name);
}

/**
 * Every Idea under `productId` that has at least one Tag, mapped to its own
 * Tag names (alphabetical) — one query for the whole Product, not one per
 * Idea. An Idea with no Tags has no entry; callers default it to `[]`.
 */
export async function listTagsByIdea(
  db: D1Database,
  productId: string,
): Promise<Map<string, string[]>> {
  const { results } = await db
    .prepare(
      'SELECT "idea_tags"."ideaId", "idea_tags"."tagName" FROM "idea_tags" JOIN "ideas" ON "ideas"."id" = "idea_tags"."ideaId" WHERE "ideas"."productId" = ? ORDER BY "idea_tags"."tagName" ASC',
    )
    .bind(productId)
    .all<{ ideaId: string; tagName: string }>();
  const byIdea = new Map<string, string[]>();
  for (const { ideaId, tagName } of results) {
    byIdea.set(ideaId, [...(byIdea.get(ideaId) ?? []), tagName]);
  }
  return byIdea;
}

/**
 * Replace an Idea's whole Tag set with `tagNames`, returning the stored set
 * (deduplicated, alphabetical), or `null` if no Idea `id` exists under
 * `productId` — same "a different Product's Idea is indistinguishable from
 * a nonexistent one" scoping `renameIdea` uses. Caller has already
 * validated every name against the catalog.
 *
 * The delete and the inserts go in one `batch`, which D1 runs as a single
 * transaction — a failure partway leaves the old set intact rather than an
 * Idea with half its new Tags.
 */
export async function setIdeaTags(
  db: D1Database,
  productId: string,
  id: string,
  tagNames: readonly string[],
): Promise<string[] | null> {
  const idea = await db
    .prepare('SELECT "id" FROM "ideas" WHERE "id" = ? AND "productId" = ?')
    .bind(id, productId)
    .first();
  if (!idea) {
    return null;
  }

  const tags = [...new Set(tagNames)].sort();
  await db.batch([
    db.prepare('DELETE FROM "idea_tags" WHERE "ideaId" = ?').bind(id),
    ...tags.map((tagName) =>
      db
        .prepare('INSERT INTO "idea_tags" ("ideaId", "tagName") VALUES (?, ?)')
        .bind(id, tagName),
    ),
  ]);
  return tags;
}

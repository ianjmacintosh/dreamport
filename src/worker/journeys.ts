/**
 * Journeys (issue #137, parent #133): a Product following a Path through its
 * ordered Milestones.
 *
 * Plain data-access functions over `paths`/`milestones`/`journeys`
 * (`migrations/0007_*.sql`) — the HTTP boundary (session check, ownership
 * check, request/response shaping) lives in `index.ts`'s
 * `/api/products/:productId/journey` routes, the same split `ideas.ts` has.
 * Nothing here re-checks that `productId` belongs to the caller — the route
 * already will have, via `getProduct`.
 */

export interface Milestone {
  id: string;
  name: string;
  description: string;
  doneWhen: string;
  /** A few words on the Milestone, shown under its name on the route. */
  outcome: string;
}

export interface Path {
  id: string;
  name: string;
  /** Every Milestone on the Path, in order. */
  milestones: Milestone[];
}

/**
 * A Product's progress on one Path. Strictly sequenced: every Milestone
 * before `currentMilestoneId` (in the Path's order) is done, every one
 * after it future. `finishedAt` stays `null` until the Journey advances
 * past the last Milestone (issue #138) — `currentMilestoneId` then keeps
 * pointing at that last Milestone, since there's no Milestone after it to
 * take its place.
 */
export interface Journey {
  startedAt: string;
  currentMilestoneId: string;
  finishedAt: string | null;
}

/**
 * The one Path Phase 1 ships (seeded in `0007`, named Dream Sequence in
 * `0008`). There's no "choose your Path" step yet, so every Journey starts
 * on this one.
 */
export const DEFAULT_PATH_ID = "starter";

/** A Path with its Milestones in order — shown whether or not a Journey has started. */
export async function getPath(db: D1Database, pathId: string): Promise<Path> {
  const [path, { results: milestones }] = await Promise.all([
    db
      .prepare('SELECT "id", "name" FROM "paths" WHERE "id" = ?')
      .bind(pathId)
      .first<Omit<Path, "milestones">>(),
    db
      .prepare(
        'SELECT "id", "name", "description", "doneWhen", "outcome" FROM "milestones" WHERE "pathId" = ? ORDER BY "position" ASC',
      )
      .bind(pathId)
      .all<Milestone>(),
  ]);
  if (!path) {
    throw new Error(`Path ${pathId} is not seeded`);
  }
  return { ...path, milestones };
}

/** A Product's Journey on `pathId`, or `null` if it hasn't started one. */
export async function getJourney(
  db: D1Database,
  productId: string,
  pathId: string,
): Promise<Journey | null> {
  return db
    .prepare(
      'SELECT "startedAt", "currentMilestoneId", "finishedAt" FROM "journeys" WHERE "productId" = ? AND "pathId" = ?',
    )
    .bind(productId, pathId)
    .first<Journey>();
}

/**
 * Start a Product's Journey on `pathId` at its first Milestone. Returns
 * whether a Journey was actually started — `false` means one already
 * existed, and it's left exactly as it was (a repeat start never resets
 * progress).
 */
export async function startJourney(
  db: D1Database,
  productId: string,
  pathId: string,
): Promise<boolean> {
  const { meta } = await db
    .prepare(
      'INSERT INTO "journeys" ("id", "productId", "pathId", "currentMilestoneId", "startedAt") SELECT ?, ?, "pathId", "id", ? FROM "milestones" WHERE "pathId" = ? AND "position" = 1 ON CONFLICT ("productId", "pathId") DO NOTHING',
    )
    .bind(crypto.randomUUID(), productId, new Date().toISOString(), pathId)
    .run();
  return meta.changes > 0;
}

/**
 * Advance a Product's Journey on `pathId` by exactly one Milestone.
 * `null` means there's no Journey to advance (hasn't started). Once
 * finished, this is a no-op — repeat calls just hand back the finished
 * Journey as it was, the same "repeat is harmless" shape `startJourney`
 * has.
 *
 * Advancing from the last Milestone (Growth) has no next Milestone to move
 * to, so it sets `finishedAt` instead (issue #138, confirmed on #133:
 * finished state, not staying on the last Milestone forever).
 *
 * One atomic `UPDATE` — same reasoning as `startJourney`'s single
 * `INSERT ... ON CONFLICT`: D1 has no multi-statement transactions, so a
 * read-then-write split here (read the current Milestone, decide the next
 * one, write it) would race two near-simultaneous advances into computing
 * the same "next" from the same stale read and silently dropping one of
 * them. Every value the write depends on — whether there's a next
 * Milestone, whether the Journey is already finished — is looked up
 * in-statement against the row as it is at write time instead.
 */
export async function advanceJourney(
  db: D1Database,
  productId: string,
  pathId: string,
): Promise<Journey | null> {
  await db
    .prepare(
      `UPDATE "journeys" SET
         "currentMilestoneId" = COALESCE(
           (
             SELECT "id" FROM "milestones" AS "next"
             WHERE "next"."pathId" = "journeys"."pathId"
               AND "next"."position" = (
                 SELECT "position" + 1 FROM "milestones"
                 WHERE "id" = "journeys"."currentMilestoneId"
               )
           ),
           "currentMilestoneId"
         ),
         "finishedAt" = CASE
           WHEN EXISTS (
             SELECT 1 FROM "milestones" AS "next"
             WHERE "next"."pathId" = "journeys"."pathId"
               AND "next"."position" = (
                 SELECT "position" + 1 FROM "milestones"
                 WHERE "id" = "journeys"."currentMilestoneId"
               )
           ) THEN "finishedAt"
           ELSE ?
         END
       WHERE "productId" = ? AND "pathId" = ? AND "finishedAt" IS NULL`,
    )
    .bind(new Date().toISOString(), productId, pathId)
    .run();

  return getJourney(db, productId, pathId);
}

/**
 * Return a Product's Journey on `pathId` by exactly one Milestone — the
 * mirror of `advanceJourney` (see CONTEXT.md's Return). `null` means
 * there's no Journey to return (hasn't started).
 *
 * Mirrors finishing exactly: advancing from the last Milestone only set
 * `finishedAt`, leaving that Milestone current, so returning from a
 * finished Journey only clears `finishedAt` — it takes a second Return to
 * move back to the Milestone before it.
 *
 * On Milestone 1 there's no previous Milestone, so this is a no-op, the
 * same way `advanceJourney` is once finished. The Journey page hides
 * Return there; a request anyway just hands back the Journey as it was.
 *
 * One atomic `UPDATE` for the same race reason `advanceJourney` gives.
 * SQLite evaluates every `SET` expression against the row as it was before
 * the update, so the `CASE` sees the old `finishedAt` even though the same
 * statement clears it.
 */
export async function returnJourney(
  db: D1Database,
  productId: string,
  pathId: string,
): Promise<Journey | null> {
  await db
    .prepare(
      `UPDATE "journeys" SET
         "currentMilestoneId" = CASE
           WHEN "finishedAt" IS NOT NULL THEN "currentMilestoneId"
           ELSE COALESCE(
             (
               SELECT "id" FROM "milestones" AS "previous"
               WHERE "previous"."pathId" = "journeys"."pathId"
                 AND "previous"."position" = (
                   SELECT "position" - 1 FROM "milestones"
                   WHERE "id" = "journeys"."currentMilestoneId"
                 )
             ),
             "currentMilestoneId"
           )
         END,
         "finishedAt" = NULL
       WHERE "productId" = ? AND "pathId" = ?`,
    )
    .bind(productId, pathId)
    .run();

  return getJourney(db, productId, pathId);
}

/**
 * What `/api/products/:productId/journey` answers with: the default Path
 * with its Milestones, and the Product's Journey on it (`null` until
 * started).
 */
export async function journeyState(
  db: D1Database,
  productId: string,
): Promise<{ path: Path; journey: Journey | null }> {
  const [path, journey] = await Promise.all([
    getPath(db, DEFAULT_PATH_ID),
    getJourney(db, productId, DEFAULT_PATH_ID),
  ]);
  return { path, journey };
}

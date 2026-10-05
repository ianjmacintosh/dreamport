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
  /** Free-text note on what the Path is based on — not a modeled entity. */
  methodology: string;
  /** Every Milestone on the Path, in order. */
  milestones: Milestone[];
}

/**
 * A Product's progress on one Path. Strictly sequenced: every Milestone
 * before `currentMilestoneId` (in the Path's order) is done, every one
 * after it future.
 */
export interface Journey {
  startedAt: string;
  currentMilestoneId: string;
}

/**
 * The one Path Phase 1 ships (seeded in `0007`). There's no "choose your
 * Path" step yet, so every Journey starts on this one.
 */
export const STARTER_PATH_ID = "starter";

/** A Path with its Milestones in order — shown whether or not a Journey has started. */
export async function getPath(db: D1Database, pathId: string): Promise<Path> {
  const [path, { results: milestones }] = await Promise.all([
    db
      .prepare('SELECT "id", "name", "methodology" FROM "paths" WHERE "id" = ?')
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
      'SELECT "startedAt", "currentMilestoneId" FROM "journeys" WHERE "productId" = ? AND "pathId" = ?',
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
 * What `/api/products/:productId/journey` answers with: the starter Path
 * with its Milestones, and the Product's Journey on it (`null` until
 * started).
 */
export async function starterJourneyState(
  db: D1Database,
  productId: string,
): Promise<{ path: Path; journey: Journey | null }> {
  const [path, journey] = await Promise.all([
    getPath(db, STARTER_PATH_ID),
    getJourney(db, productId, STARTER_PATH_ID),
  ]);
  return { path, journey };
}

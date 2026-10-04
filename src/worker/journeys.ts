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

export interface Path {
  id: string;
  name: string;
  /** Free-text note on what the Path is based on — not a modeled entity. */
  methodology: string;
}

export type MilestoneStatus = "done" | "current" | "future";

export interface JourneyMilestone {
  id: string;
  name: string;
  description: string;
  doneWhen: string;
  status: MilestoneStatus;
}

export interface Journey {
  startedAt: string;
  /** Every Milestone on the Journey's Path, in order. */
  milestones: JourneyMilestone[];
}

/**
 * The one Path Phase 1 ships (seeded in `0007`). There's no "choose your
 * Path" step yet, so every Journey starts on this one.
 */
export const STARTER_PATH_ID = "starter";

export async function getPath(db: D1Database, pathId: string): Promise<Path> {
  const path = await db
    .prepare('SELECT "id", "name", "methodology" FROM "paths" WHERE "id" = ?')
    .bind(pathId)
    .first<Path>();
  if (!path) {
    throw new Error(`Path ${pathId} is not seeded`);
  }
  return path;
}

/**
 * A Product's Journey on `pathId`, or `null` if it hasn't started one.
 * Each Milestone's status comes from its position relative to the current
 * one: before it done, after it future.
 */
export async function getJourney(
  db: D1Database,
  productId: string,
  pathId: string,
): Promise<Journey | null> {
  const journey = await db
    .prepare(
      'SELECT "j"."startedAt", "m"."position" AS "currentPosition" FROM "journeys" "j" JOIN "milestones" "m" ON "m"."id" = "j"."currentMilestoneId" WHERE "j"."productId" = ? AND "j"."pathId" = ?',
    )
    .bind(productId, pathId)
    .first<{ startedAt: string; currentPosition: number }>();
  if (!journey) {
    return null;
  }

  const { results } = await db
    .prepare(
      'SELECT "id", "name", "description", "doneWhen", "position" FROM "milestones" WHERE "pathId" = ? ORDER BY "position" ASC',
    )
    .bind(pathId)
    .all<Omit<JourneyMilestone, "status"> & { position: number }>();

  return {
    startedAt: journey.startedAt,
    milestones: results.map(({ position, ...milestone }) => ({
      ...milestone,
      status:
        position < journey.currentPosition
          ? "done"
          : position === journey.currentPosition
            ? "current"
            : "future",
    })),
  };
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

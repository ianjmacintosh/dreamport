/**
 * Paths (#166, spec #164): saved Path versions and who may follow them.
 * Plain data access over `paths`, `path_versions` and `milestones`
 * (`migrations/0019_*.sql`).
 *
 * A Path belongs to Dreamport (`paths.userId` null, followable by every
 * User) or to one User (followable only by them). That check lives here and
 * nowhere else: another User's version comes back as `null`, the same as
 * one that doesn't exist.
 *
 * A saved version never changes, so a loaded `PathVersion` never goes
 * stale, unlike a Journey's progress. Callers can hold one and pass it on.
 */

export interface Milestone {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly doneWhen: string;
  /** A few words on the Milestone, shown under its name on the route. */
  readonly outcome: string;
}

/** A Path's saved version: its content exactly as it was saved. */
export interface PathVersion {
  readonly id: string;
  readonly pathId: string;
  /** 1, 2, 3… within its Path, in the order saved. */
  readonly number: number;
  readonly name: string;
  readonly description: string;
  readonly savedAt: string;
  /** In order. A version always has at least one. */
  readonly milestones: readonly [Milestone, ...Milestone[]];
}

declare const followable: unique symbol;

/**
 * A saved version the asking User may follow: Dreamport's or their own.
 * Only this module makes one, so a Journey can't start on a version nobody
 * checked. The same pattern as `OwnedProduct`.
 */
export type FollowableVersion = PathVersion & { readonly [followable]: true };

/** Dream Sequence's version 1, which kept `0007`'s id. */
const DREAM_SEQUENCE_VERSION_ID = "starter";

/**
 * A saved version with its Milestones, if the User may follow it. `null` if
 * it doesn't exist or belongs to another User.
 */
export function getVersion(
  db: D1Database,
  userId: string,
  versionId: string,
): Promise<FollowableVersion | null> {
  return loadVersion(db, versionId, userId);
}

/**
 * Dream Sequence version 1, the version every Journey starts on until #170
 * lets the User pick one. Dreamport's, so it needs no User.
 */
export async function dreamSequence(
  db: D1Database,
): Promise<FollowableVersion> {
  const version = await loadVersion(db, DREAM_SEQUENCE_VERSION_ID, null);
  if (!version) {
    throw new Error("Dream Sequence is not seeded");
  }
  return version;
}

/** `userId` null matches only Dreamport's versions: `NULL = NULL` is never true. */
async function loadVersion(
  db: D1Database,
  versionId: string,
  userId: string | null,
): Promise<FollowableVersion | null> {
  const [version, { results: milestones }] = await Promise.all([
    db
      .prepare(
        `SELECT "path_versions"."id", "path_versions"."pathId", "path_versions"."number",
           "path_versions"."name", "path_versions"."description", "path_versions"."savedAt"
         FROM "path_versions"
         JOIN "paths" ON "paths"."id" = "path_versions"."pathId"
         WHERE "path_versions"."id" = ? AND ("paths"."userId" IS NULL OR "paths"."userId" = ?)`,
      )
      .bind(versionId, userId)
      .first<Omit<PathVersion, "milestones">>(),
    db
      .prepare(
        'SELECT "id", "name", "description", "doneWhen", "outcome" FROM "milestones" WHERE "versionId" = ? ORDER BY "position" ASC',
      )
      .bind(versionId)
      .all<Milestone>(),
  ]);
  if (!version) {
    return null;
  }
  const [first, ...rest] = milestones;
  if (!first) {
    throw new Error(`Path version ${versionId} has no Milestones`);
  }
  const loaded: PathVersion = { ...version, milestones: [first, ...rest] };
  return loaded as FollowableVersion;
}

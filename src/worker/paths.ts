/**
 * A Path belongs to Dreamport (`paths.userId` null, followable by every
 * User) or to one User (followable only by them). That check lives here and
 * nowhere else: another User's version comes back as `null`, the same as
 * one that doesn't exist. The exception is `getTrailhead`: what a Path's
 * addresses show any viewer, which for another User's Path is only ever a
 * published version, and never anything about its owner.
 *
 * A User's Path is one they made, or their copy of another User's (#192):
 * `addVersion` copies a published version into a `paths` row of the
 * Adder's, its `addedFrom` the Path it came from. A copy is theirs to
 * follow, so the owner check holds for it, but it has no Draft, no address
 * of its own (the Trailhead at its source's address shows it), and isn't
 * one of the Paths they made: `getPath`, `listPaths` and the cap leave it
 * out, so it never opens in Trailblazer.
 *
 * A saved version never changes, so a loaded `PathVersion` never goes
 * stale, unlike a Journey's progress. Callers can hold one and pass it on.
 *
 * A Draft is the opposite: its maker edits it in place, with no save step.
 * Only a User's own Path has one. Every Draft write takes an `OwnedPath`,
 * which only `getPath` and `createPath` make.
 */

export const PATHS_PER_USER = 30;
export const PATH_NAME_MAX_LENGTH = 200;
export const PATH_DESCRIPTION_MAX_LENGTH = 2000;
export const MILESTONE_NAME_MAX_LENGTH = 200;
export const MILESTONE_DESCRIPTION_MAX_LENGTH = 2000;
export const MILESTONE_DONE_WHEN_MAX_LENGTH = 2000;
export const MILESTONE_OUTCOME_MAX_LENGTH = 200;
export const TASK_TITLE_MAX_LENGTH = 200;
export const MILESTONES_AND_TASKS_PER_PATH = 150;

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
  /**
   * The Path id its Trailhead's address uses: `pathId`, or for an Added
   * copy, the Path it was Added from.
   */
  readonly trailheadPathId: string;
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
 * Whose a Path is: Dreamport's own (Dream Sequence), the User's own, or
 * the User's copy of another User's.
 */
export type PathOwner = "dreamport" | "user" | "added";

/**
 * Whether a User may Add a Path straight away (`free`), or has to Request
 * it first (`permission`, #215). Only its Guide changes it.
 */
export type Access = "free" | "permission";

/** A Path someone else made, as Pathfinder's "Your Added Paths" lists it. */
export interface AddedPath {
  /** The id its Trailhead's address uses: for a copy, its source's. */
  readonly id: string;
  /** Its latest version's name, or for a copy, its newest copy's. */
  readonly name: string;
}

/**
 * Dream Sequence, then each Path the User has Added, in the order they
 * first Added it: one entry per Path, however many of its versions they
 * hold.
 */
export async function listAddedPaths(
  db: D1Database,
  userId: string,
): Promise<AddedPath[]> {
  const { results } = await db
    .prepare(
      `SELECT coalesce("paths"."addedFrom", "paths"."id") AS "id", "latest"."name"
       FROM "paths"
       JOIN "path_versions" AS "latest" ON "latest"."pathId" = "paths"."id"
         AND "latest"."number" = (SELECT max("number") FROM "path_versions" WHERE "pathId" = "paths"."id")
       WHERE "paths"."userId" IS NULL OR ("paths"."userId" = ? AND "paths"."addedFrom" IS NOT NULL)
       ORDER BY "paths"."userId" IS NOT NULL, "paths"."createdAt" ASC, "paths"."rowid" ASC`,
    )
    .bind(userId)
    .all<AddedPath>();
  return results;
}

/** A version to start a Journey on, with its Path's versions to pick from. */
export interface TrailheadVersion {
  readonly owner: PathOwner;
  readonly version: FollowableVersion;
  /** Every saved version of the Path, newest first. */
  readonly versions: readonly VersionSummary[];
}

/**
 * Version `number` of a Path the User may follow, or its latest for
 * `null`. `null` for another User's Path, an unknown one, one with no
 * saved version, or a number it doesn't have: all read the same. A copy
 * goes by its own id here, so restarting a Journey on one finds the
 * newest copy the User holds.
 */
export async function getTrailheadVersion(
  db: D1Database,
  userId: string,
  pathId: string,
  number: number | null,
): Promise<TrailheadVersion | null> {
  const { results } = await db
    .prepare(
      `SELECT "path_versions"."id", "path_versions"."number", "path_versions"."savedAt",
         "path_versions"."published", "paths"."userId" IS NULL AS "dreamports"
       FROM "path_versions"
       JOIN "paths" ON "paths"."id" = "path_versions"."pathId"
       WHERE "path_versions"."pathId" = ? AND ("paths"."userId" IS NULL OR "paths"."userId" = ?)
       ORDER BY "path_versions"."number" DESC`,
    )
    .bind(pathId, userId)
    .all<VersionRow & { dreamports: number }>();
  const picked =
    number === null ? results[0] : results.find((v) => v.number === number);
  const version = picked ? await loadVersion(db, picked.id, userId) : null;
  if (!picked || !version) {
    return null;
  }
  return {
    owner: picked.dreamports
      ? "dreamport"
      : version.trailheadPathId === version.pathId
        ? "user"
        : "added",
    version,
    versions: results.map(versionSummary),
  };
}

/**
 * What a Path's Trailhead shows the viewer (#205), at its root or at one
 * version's address.
 */
export type Trailhead =
  /** The viewer's own Path with only a Draft: nothing to show yet. */
  | { readonly status: "unsaved" }
  /** Another User's Path that's closed, or a version that isn't published. */
  | { readonly status: "unavailable"; readonly name: string }
  /** Another User's open Path, not followable until Add (#192). */
  | {
      readonly status: "offered";
      readonly access: Access;
      readonly version: PathVersion;
      readonly versions: readonly VersionSummary[];
    }
  /** Dream Sequence, the viewer's own Path, or their copy of another User's. */
  | {
      readonly status: "followable";
      readonly owner: PathOwner;
      readonly version: FollowableVersion;
      readonly versions: readonly VersionSummary[];
    };

type TrailheadRow = Omit<
  PathVersion,
  "pathId" | "trailheadPathId" | "milestones"
> & {
  readonly published: number;
};

/**
 * The Trailhead offers a Path's published versions, newest first, in
 * `versions`, and shows version `number` if it's one of them, or the
 * newest for `null`. The one exception is the viewer's own Path with none
 * published, which offers every saved version: a plain User can't
 * publish. Its owner never sees "unavailable", open or closed: a version
 * it doesn't offer them is `null`, as is an unknown Path, or another
 * User's with nothing published.
 *
 * On another User's Path, the viewer's copies (#192) join the versions
 * offered, and a version they hold shows their copy, followable, whatever
 * became of the original: closed, unpublished or gone. The root shows the
 * newest of the two: a newer version offered, or their newest copy. A
 * copy's own id has no Trailhead.
 */
export async function getTrailhead(
  db: D1Database,
  userId: string,
  pathId: string,
  number: number | null,
): Promise<Trailhead | null> {
  const [{ results }, { results: held }] = await db.batch([
    db
      .prepare(
        `SELECT "paths"."userId", "paths"."addedFrom", "paths"."open", "paths"."access", "path_versions"."id",
           "path_versions"."number", "path_versions"."name", "path_versions"."description",
           "path_versions"."savedAt", "path_versions"."published"
         FROM "paths"
         LEFT JOIN "path_versions" ON "path_versions"."pathId" = "paths"."id"
         WHERE "paths"."id" = ?
         ORDER BY "path_versions"."number" DESC`,
      )
      .bind(pathId),
    db
      .prepare(
        `SELECT "path_versions"."id", "path_versions"."pathId", "path_versions"."number",
           "path_versions"."name", "path_versions"."description", "path_versions"."savedAt",
           "path_versions"."published"
         FROM "paths"
         JOIN "path_versions" ON "path_versions"."pathId" = "paths"."id"
         WHERE "paths"."userId" = ? AND "paths"."addedFrom" = ?
         ORDER BY "path_versions"."number" DESC`,
      )
      .bind(userId, pathId),
  ]);
  const head = results[0] as
    | {
        userId: string | null;
        addedFrom: string | null;
        open: number;
        access: Access;
      }
    | undefined;
  if (head?.addedFrom) {
    return null;
  }
  const saved = (results as (TrailheadRow & { id: string | null })[]).filter(
    (row): row is TrailheadRow & { id: string } => row.id !== null,
  );
  const published = saved.filter((v) => v.published === 1);
  const dreamports = head !== undefined && head.userId === null;
  const own = head !== undefined && head.userId === userId;
  if (dreamports || own) {
    return ownTrailhead(db, pathId, own, saved, published, number);
  }

  const copies = held as (TrailheadRow & { pathId: string })[];
  const offered = head?.open === 1 ? published : [];
  const versions = [
    ...new Set([...copies, ...offered].map((v) => v.number)),
  ].sort((a, b) => b - a);
  const shownNumber = number ?? versions[0];
  const copy = copies.find((v) => v.number === shownNumber);
  const offer = offered.find((v) => v.number === shownNumber);
  const summaries = versions.map((n) =>
    versionSummary(
      copies.find((v) => v.number === n) ??
        (offered.find((v) => v.number === n) as TrailheadRow),
    ),
  );

  if (copy) {
    return {
      status: "followable",
      owner: "added",
      version: (await versionWithMilestones(
        db,
        copy,
        copy.pathId,
        pathId,
      )) as FollowableVersion,
      versions: summaries,
    };
  }
  // Nothing published reads like an unknown Path: no name for a Path its
  // Guide never offered, or has withdrawn.
  const newest = published[0];
  if (!newest) {
    return null;
  }
  if (!offer) {
    return { status: "unavailable", name: newest.name };
  }
  return {
    status: "offered",
    access: head?.access ?? "free",
    version: await versionWithMilestones(db, offer, pathId, pathId),
    versions: summaries,
  };
}

/** `getTrailhead` for Dream Sequence or the viewer's own Path: no copies. */
async function ownTrailhead(
  db: D1Database,
  pathId: string,
  own: boolean,
  saved: readonly TrailheadRow[],
  published: readonly TrailheadRow[],
  number: number | null,
): Promise<Trailhead | null> {
  const shown = own && published.length === 0 ? saved : published;
  const picked =
    number === null ? shown[0] : shown.find((v) => v.number === number);
  if (saved.length === 0) {
    return own ? { status: "unsaved" } : null;
  }
  if (!picked) {
    return null;
  }
  return {
    status: "followable",
    owner: own ? "user" : "dreamport",
    version: (await versionWithMilestones(
      db,
      picked,
      pathId,
      pathId,
    )) as FollowableVersion,
    versions: shown.map(versionSummary),
  };
}

async function versionWithMilestones(
  db: D1Database,
  { id, number, name, description, savedAt }: TrailheadRow,
  pathId: string,
  trailheadPathId: string,
): Promise<PathVersion> {
  return withMilestones(
    { id, pathId, trailheadPathId, number, name, description, savedAt },
    await loadMilestones(db, id),
  );
}

async function loadVersion(
  db: D1Database,
  versionId: string,
  userId: string,
): Promise<FollowableVersion | null> {
  const [version, milestones] = await Promise.all([
    db
      .prepare(
        `SELECT "path_versions"."id", "path_versions"."pathId",
           coalesce("paths"."addedFrom", "paths"."id") AS "trailheadPathId", "path_versions"."number",
           "path_versions"."name", "path_versions"."description", "path_versions"."savedAt"
         FROM "path_versions"
         JOIN "paths" ON "paths"."id" = "path_versions"."pathId"
         WHERE "path_versions"."id" = ? AND ("paths"."userId" IS NULL OR "paths"."userId" = ?)`,
      )
      .bind(versionId, userId)
      .first<Omit<PathVersion, "milestones">>(),
    loadMilestones(db, versionId),
  ]);
  if (!version) {
    return null;
  }
  return withMilestones(version, milestones) as FollowableVersion;
}

async function loadMilestones(
  db: D1Database,
  versionId: string,
): Promise<Milestone[]> {
  const { results } = await db
    .prepare(
      'SELECT "id", "name", "description", "doneWhen", "outcome" FROM "milestones" WHERE "versionId" = ? ORDER BY "position" ASC',
    )
    .bind(versionId)
    .all<Milestone>();
  return results;
}

function withMilestones(
  version: Omit<PathVersion, "milestones">,
  milestones: readonly Milestone[],
): PathVersion {
  const [first, ...rest] = milestones;
  if (!first) {
    throw new Error(`Path version ${version.id} has no Milestones`);
  }
  return { ...version, milestones: [first, ...rest] };
}

/** A User's Path as their list of Paths shows it. */
export interface PathSummary {
  readonly id: string;
  readonly name: string;
  readonly createdAt: string;
}

/** The fields a User sets on a Path's Draft. */
export interface PathFields {
  readonly name: string;
  readonly description: string;
}

/** The fields a User sets on one of a Draft's Milestones. */
export interface MilestoneFields {
  readonly name: string;
  readonly description: string;
  readonly doneWhen: string;
  readonly outcome: string;
}

export interface TaskFields {
  readonly title: string;
}

export interface DraftTask extends TaskFields {
  readonly id: string;
}

export interface DraftMilestone extends MilestoneFields {
  readonly id: string;
  readonly tasks: readonly DraftTask[];
}

export interface VersionSummary {
  readonly id: string;
  readonly number: number;
  readonly savedAt: string;
  /** Offered to other Users. Saving a version doesn't publish it. */
  readonly published: boolean;
}

/** A `VersionSummary` as D1 returns it, with SQLite's 0 or 1 for a boolean. */
type VersionRow = Omit<VersionSummary, "published"> & {
  readonly published: number;
};

function versionSummary({
  id,
  number,
  savedAt,
  published,
}: VersionRow): VersionSummary {
  return { id, number, savedAt, published: published === 1 };
}

/** A Path's Draft: its name, description and Milestones, as last edited. */
export interface Draft extends PathSummary {
  readonly description: string;
  /** In order. A Draft may have none. */
  readonly milestones: readonly DraftMilestone[];
  /** When the Draft last changed. Saving a version doesn't change it. */
  readonly updatedAt: string;
  /**
   * Whether the Draft is exactly what its latest version saved: nothing
   * edited since that save or since Discard Changes. False with nothing saved.
   */
  readonly matchesLatest: boolean;
  /** Whether the Path accepts new Adds. Only ever true with a version published. */
  readonly open: boolean;
  /** Whether Users Add the Path straight away or Request it (#214). */
  readonly access: Access;
  /** Every saved version, newest first. */
  readonly versions: readonly VersionSummary[];
  readonly latestVersion: VersionSummary | null;
}

declare const owned: unique symbol;

/**
 * A Path confirmed to belong to the User asking for it. Only `getPath` and
 * `createPath` make one, so every Draft write takes this rather than a bare
 * id. The same pattern as `OwnedProduct`.
 */
export type OwnedPath = PathSummary & {
  readonly description: string;
  readonly [owned]: true;
};

export type Parsed<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: string };

interface FieldRule {
  readonly required: boolean;
  readonly max: number;
}

const PATH_FIELDS: { readonly [K in keyof PathFields]: FieldRule } = {
  name: { required: true, max: PATH_NAME_MAX_LENGTH },
  description: { required: false, max: PATH_DESCRIPTION_MAX_LENGTH },
};

const MILESTONE_FIELDS: { readonly [K in keyof MilestoneFields]: FieldRule } = {
  name: { required: true, max: MILESTONE_NAME_MAX_LENGTH },
  description: { required: true, max: MILESTONE_DESCRIPTION_MAX_LENGTH },
  doneWhen: { required: true, max: MILESTONE_DONE_WHEN_MAX_LENGTH },
  outcome: { required: false, max: MILESTONE_OUTCOME_MAX_LENGTH },
};

const TASK_FIELDS: { readonly [K in keyof TaskFields]: FieldRule } = {
  title: { required: true, max: TASK_TITLE_MAX_LENGTH },
};

/**
 * Each field trimmed. A left-out optional field reads as empty; a required
 * one left out or blank, a non-string, or one over its cap is refused.
 */
function parseFields<K extends string>(
  rules: { readonly [P in K]: FieldRule },
  body: unknown,
): Parsed<Record<K, string>> {
  if (!body || typeof body !== "object") {
    return { ok: false, error: "body must be a JSON object" };
  }
  const values = {} as Record<K, string>;
  for (const key of Object.keys(rules) as K[]) {
    const { required, max } = rules[key];
    const raw: unknown = (body as Record<string, unknown>)[key];
    if (raw !== undefined && typeof raw !== "string") {
      return { ok: false, error: `${key} must be text` };
    }
    const value = (raw ?? "").trim();
    if (required && !value) {
      return { ok: false, error: `${key} is required` };
    }
    if (value.length > max) {
      return { ok: false, error: `${key} must be ${max} characters or fewer` };
    }
    values[key] = value;
  }
  return { ok: true, value: values };
}

/** A Path's name (required) and description, from a request body. */
export function parsePathFields(body: unknown): Parsed<PathFields> {
  return parseFields(PATH_FIELDS, body);
}

/**
 * A Milestone's name, description and Done when (required) and outcome,
 * from a request body. Adding and editing a Milestone both use this.
 */
export function parseMilestoneFields(body: unknown): Parsed<MilestoneFields> {
  return parseFields(MILESTONE_FIELDS, body);
}

export function parseTaskFields(body: unknown): Parsed<TaskFields> {
  return parseFields(TASK_FIELDS, body);
}

/** The Paths a User made, oldest first. Never Dreamport's, nor their copies. */
export async function listPaths(
  db: D1Database,
  userId: string,
): Promise<PathSummary[]> {
  const { results } = await db
    .prepare(
      'SELECT "id", "name", "createdAt" FROM "paths" WHERE "userId" = ? AND "addedFrom" IS NULL ORDER BY "createdAt" ASC, "rowid" ASC',
    )
    .bind(userId)
    .all<PathSummary>();
  return results;
}

/**
 * A Path the User made, by id, or null if it doesn't exist, is another
 * User's, is Dreamport's (`"userId" = ?` never matches a null owner), or is
 * their copy of another User's, which nobody edits.
 */
export function getPath(
  db: D1Database,
  userId: string,
  pathId: string,
): Promise<OwnedPath | null> {
  return db
    .prepare(
      'SELECT "id", "name", "description", "createdAt" FROM "paths" WHERE "id" = ? AND "userId" = ? AND "addedFrom" IS NULL',
    )
    .bind(pathId, userId)
    .first<OwnedPath>();
}

export type CreatePathResult =
  | { readonly ok: true; readonly path: OwnedPath }
  | { readonly ok: false; readonly reason: "cap" };

/**
 * Make a Path with an empty Draft, unless the User already made
 * `PATHS_PER_USER`; their copies don't count. The count and the insert are one
 * statement, so two creates at once can't both land at the cap.
 */
export async function createPath(
  db: D1Database,
  userId: string,
  { name, description }: PathFields,
): Promise<CreatePathResult> {
  const path = {
    id: crypto.randomUUID(),
    name,
    description,
    createdAt: new Date().toISOString(),
  };
  const { meta } = await db
    .prepare(
      `INSERT INTO "paths" ("id", "userId", "name", "description", "createdAt", "updatedAt")
       SELECT ?, ?, ?, ?, ?, ?
       WHERE (SELECT count(*) FROM "paths" WHERE "userId" = ? AND "addedFrom" IS NULL) < ?`,
    )
    .bind(
      path.id,
      userId,
      path.name,
      path.description,
      path.createdAt,
      path.createdAt,
      userId,
      PATHS_PER_USER,
    )
    .run();
  if (meta.changes === 0) {
    return { ok: false, reason: "cap" };
  }
  return { ok: true, path: path as OwnedPath };
}

export type DeletePathResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly reason: "not-found" | "open" | "added" };

/**
 * Delete a Path for good. The rows under it cascade: its Draft's
 * Milestones and Tasks, and its saved versions, each of which takes its
 * Journeys and their records with it (migration `0022`'s trigger). Saved
 * versions belong to one Path, so no other Path loses anything. Refused,
 * deleting nothing, while the Path is open (its Guide closes it first) or
 * once anyone has Added it (#192): then it can only be closed.
 */
export async function deletePath(
  db: D1Database,
  path: OwnedPath,
): Promise<DeletePathResult> {
  const { meta } = await db
    .prepare(
      `DELETE FROM "paths" WHERE "id" = ?1 AND "open" = 0
         AND NOT EXISTS (SELECT 1 FROM "paths" WHERE "addedFrom" = ?1)`,
    )
    .bind(path.id)
    .run();
  if (meta.changes > 0) {
    return { ok: true };
  }
  const still = await db
    .prepare(
      `SELECT "open", EXISTS (SELECT 1 FROM "paths" WHERE "addedFrom" = ?1) AS "added"
       FROM "paths" WHERE "id" = ?1`,
    )
    .bind(path.id)
    .first<{ open: number; added: number }>();
  if (!still) {
    return { ok: false, reason: "not-found" };
  }
  return { ok: false, reason: still.open === 1 ? "open" : "added" };
}

export type AddVersionResult =
  /** `added` is false when the User already held a copy of it. */
  | { readonly ok: true; readonly added: boolean }
  /**
   * `not-found`: no such version of another User's Path, which takes in
   * the User's own and Dream Sequence, neither needing an Add.
   * `unavailable`: the Path is closed or the version isn't published.
   * `permission`: the Path's Access is Permission required (#214) and the
   * User holds no copy of the version: they Request it instead (#215).
   */
  | {
      readonly ok: false;
      readonly reason: "not-found" | "unavailable" | "permission";
    };

/**
 * Add version `number` of another User's Path (#192): copy its name,
 * description, Milestones and Tasks to the User, under their one copy of
 * the Path, made with the first Add. Adding a version they hold changes
 * nothing.
 *
 * One batch is one transaction. Every insert re-checks that the Path is
 * open and the version published, so a Close landing first stops it, and
 * the copy's contents go in only if its version row landed in this batch,
 * the same pattern as `saveVersion`. The unique indexes on (User, source
 * Path) and (copy, number) make two Adds at once land one copy.
 */
export async function addVersion(
  db: D1Database,
  userId: string,
  pathId: string,
  number: number,
): Promise<AddVersionResult> {
  const source = await db
    .prepare(
      `SELECT "path_versions"."id", "paths"."open", "paths"."access", "path_versions"."published",
         EXISTS (SELECT 1 FROM "paths" AS "copy"
           JOIN "path_versions" AS "held" ON "held"."pathId" = "copy"."id"
           WHERE "copy"."userId" = ?3 AND "copy"."addedFrom" = ?1 AND "held"."number" = ?2) AS "held"
       FROM "paths"
       JOIN "path_versions" ON "path_versions"."pathId" = "paths"."id" AND "path_versions"."number" = ?2
       WHERE "paths"."id" = ?1 AND "paths"."userId" <> ?3 AND "paths"."addedFrom" IS NULL`,
    )
    .bind(pathId, number, userId)
    .first<{
      id: string;
      open: number;
      access: Access;
      published: number;
      held: number;
    }>();
  if (!source) {
    return { ok: false, reason: "not-found" };
  }
  if (source.held === 1) {
    return { ok: true, added: false };
  }
  if (source.open !== 1 || source.published !== 1) {
    return { ok: false, reason: "unavailable" };
  }
  if (source.access !== "free") {
    return { ok: false, reason: "permission" };
  }

  // ?1 the version Added, ?2 its copy's id, ?3 the Path, ?4 the User. Each
  // statement binds as many as its highest number, as D1 requires.
  const offered = `EXISTS (SELECT 1 FROM "paths"
    JOIN "path_versions" ON "path_versions"."pathId" = "paths"."id"
    WHERE "paths"."id" = ?3 AND "paths"."open" = 1 AND "paths"."access" = 'free'
      AND "path_versions"."id" = ?1 AND "path_versions"."published" = 1)`;
  const landed = `EXISTS (SELECT 1 FROM "path_versions" WHERE "id" = ?2)`;
  /** A source row's id with the copy's version id in place of the source's. */
  const copied = (column: string) => `?2 || substr(${column}, length(?1) + 1)`;
  const copyId = crypto.randomUUID();
  const now = new Date().toISOString();
  const [, version] = await db.batch([
    db
      .prepare(
        `INSERT OR IGNORE INTO "paths" ("id", "userId", "addedFrom", "createdAt", "updatedAt")
         SELECT ?5, ?4, ?3, ?6, ?6 WHERE ${offered}`,
      )
      .bind(source.id, copyId, pathId, userId, crypto.randomUUID(), now),
    db
      .prepare(
        `INSERT OR IGNORE INTO "path_versions" ("id", "pathId", "number", "name", "description", "savedAt", "copiedFrom")
         SELECT ?2, "copy"."id", "source"."number", "source"."name", "source"."description",
           "source"."savedAt", "source"."id"
         FROM "path_versions" AS "source", "paths" AS "copy"
         WHERE "source"."id" = ?1 AND "copy"."userId" = ?4 AND "copy"."addedFrom" = ?3
           AND ${offered}`,
      )
      .bind(source.id, copyId, pathId, userId),
    db
      .prepare(
        `INSERT INTO "milestones" ("id", "versionId", "position", "name", "description", "doneWhen", "outcome")
         SELECT ${copied('"id"')}, ?2, "position", "name", "description", "doneWhen", "outcome"
         FROM "milestones"
         WHERE "versionId" = ?1 AND ${landed}`,
      )
      .bind(source.id, copyId),
    db
      .prepare(
        `INSERT INTO "tasks" ("id", "title")
         SELECT ${copied('"tasks"."id"')}, "tasks"."title"
         FROM "milestone_tasks"
         JOIN "milestones" ON "milestones"."id" = "milestone_tasks"."milestoneId"
         JOIN "tasks" ON "tasks"."id" = "milestone_tasks"."taskId"
         WHERE "milestones"."versionId" = ?1 AND ${landed}`,
      )
      .bind(source.id, copyId),
    db
      .prepare(
        `INSERT INTO "milestone_tasks" ("milestoneId", "taskId", "position")
         SELECT ${copied('"milestone_tasks"."milestoneId"')}, ${copied('"milestone_tasks"."taskId"')},
           "milestone_tasks"."position"
         FROM "milestone_tasks"
         JOIN "milestones" ON "milestones"."id" = "milestone_tasks"."milestoneId"
         WHERE "milestones"."versionId" = ?1 AND ${landed}`,
      )
      .bind(source.id, copyId),
  ]);
  if (version.meta.changes > 0) {
    return { ok: true, added: true };
  }

  const held = await db
    .prepare(
      `SELECT 1 FROM "paths"
       JOIN "path_versions" ON "path_versions"."pathId" = "paths"."id"
       WHERE "paths"."userId" = ? AND "paths"."addedFrom" = ? AND "path_versions"."number" = ?`,
    )
    .bind(userId, pathId, number)
    .first();
  return held
    ? { ok: true, added: false }
    : { ok: false, reason: "unavailable" };
}

export async function getDraft(
  db: D1Database,
  path: OwnedPath,
): Promise<Draft> {
  const [
    { results: milestones },
    { results: tasks },
    edited,
    { results: saved },
  ] = await Promise.all([
    db
      .prepare(
        'SELECT "id", "name", "description", "doneWhen", "outcome" FROM "draft_milestones" WHERE "pathId" = ? ORDER BY "position" ASC, "rowid" ASC',
      )
      .bind(path.id)
      .all<Omit<DraftMilestone, "tasks">>(),
    db
      .prepare(
        `SELECT "draft_tasks"."id", "draft_tasks"."milestoneId", "draft_tasks"."title"
         FROM "draft_tasks"
         JOIN "draft_milestones" ON "draft_milestones"."id" = "draft_tasks"."milestoneId"
         WHERE "draft_milestones"."pathId" = ?
         ORDER BY "draft_tasks"."position" ASC, "draft_tasks"."rowid" ASC`,
      )
      .bind(path.id)
      .all<DraftTask & { milestoneId: string }>(),
    db
      .prepare(
        'SELECT "updatedAt", "matchedAt", "open", "access" FROM "paths" WHERE "id" = ?',
      )
      .bind(path.id)
      .first<{
        updatedAt: string;
        matchedAt: string;
        open: number;
        access: Access;
      }>(),
    db
      .prepare(
        'SELECT "id", "number", "savedAt", "published" FROM "path_versions" WHERE "pathId" = ? ORDER BY "number" DESC',
      )
      .bind(path.id)
      .all<VersionRow>(),
  ]);
  const versions = saved.map(versionSummary);
  const tasksOf = new Map<string, DraftTask[]>();
  for (const { milestoneId, ...task } of tasks) {
    tasksOf.set(milestoneId, [...(tasksOf.get(milestoneId) ?? []), task]);
  }
  return {
    id: path.id,
    name: path.name,
    description: path.description,
    createdAt: path.createdAt,
    milestones: milestones.map((m) => ({
      ...m,
      tasks: tasksOf.get(m.id) ?? [],
    })),
    updatedAt: edited?.updatedAt ?? path.createdAt,
    matchesLatest:
      versions.length > 0 && !!edited && edited.updatedAt <= edited.matchedAt,
    open: edited?.open === 1,
    access: edited?.access ?? "free",
    versions,
    latestVersion: versions[0] ?? null,
  };
}

export type DraftGap = "name" | "description" | "milestone";

export type SaveVersionResult =
  | { readonly ok: true; readonly version: VersionSummary }
  | {
      readonly ok: false;
      readonly reason: "incomplete";
      readonly missing: readonly DraftGap[];
    };

/**
 * Copy the Draft into a new saved version, numbered one past the Path's
 * latest. Refused, saving nothing, unless the Draft has a name, a
 * description and at least one Milestone.
 *
 * One batch is one transaction, so every statement reads the same Draft
 * and a failure leaves no half-saved version. The first statement carries
 * the guard, and the rest copy only if its row landed. A saved row's id is
 * the version's id, a colon and the Draft row's id, so the statements join
 * without reading anything back, and `0022`'s delete trigger finds a
 * version's Tasks by that prefix. Positions are renumbered 1..n, since the
 * Draft's may have gaps or ties.
 */
export async function saveVersion(
  db: D1Database,
  path: OwnedPath,
): Promise<SaveVersionResult> {
  const versionId = crypto.randomUUID();
  const versionSaved = `EXISTS (SELECT 1 FROM "path_versions" WHERE "id" = ?2)`;
  const pathsDraftTasks = `FROM "draft_tasks"
    JOIN "draft_milestones" ON "draft_milestones"."id" = "draft_tasks"."milestoneId"
    WHERE "draft_milestones"."pathId" = ?1 AND ${versionSaved}`;
  const [saved] = await db.batch<VersionRow>([
    db
      .prepare(
        `INSERT INTO "path_versions" ("id", "pathId", "number", "name", "description", "savedAt")
         SELECT ?2, "id",
           (SELECT coalesce(max("number"), 0) + 1 FROM "path_versions" WHERE "pathId" = ?1),
           "name", "description", ?3
         FROM "paths"
         WHERE "id" = ?1 AND "name" <> '' AND "description" <> ''
           AND EXISTS (SELECT 1 FROM "draft_milestones" WHERE "pathId" = ?1)
         RETURNING "id", "number", "savedAt", "published"`,
      )
      .bind(path.id, versionId, new Date().toISOString()),
    db
      .prepare(
        `INSERT INTO "milestones" ("id", "versionId", "position", "name", "description", "doneWhen", "outcome")
         SELECT ?2 || ':' || "id", ?2, row_number() OVER (ORDER BY "position", "rowid"),
           "name", "description", "doneWhen", "outcome"
         FROM "draft_milestones"
         WHERE "pathId" = ?1 AND ${versionSaved}`,
      )
      .bind(path.id, versionId),
    db
      .prepare(
        `INSERT INTO "tasks" ("id", "title")
         SELECT ?2 || ':' || "draft_tasks"."id", "draft_tasks"."title"
         ${pathsDraftTasks}`,
      )
      .bind(path.id, versionId),
    db
      .prepare(
        `INSERT INTO "milestone_tasks" ("milestoneId", "taskId", "position")
         SELECT ?2 || ':' || "draft_tasks"."milestoneId", ?2 || ':' || "draft_tasks"."id",
           row_number() OVER (
             PARTITION BY "draft_tasks"."milestoneId"
             ORDER BY "draft_tasks"."position", "draft_tasks"."rowid"
           )
         ${pathsDraftTasks}`,
      )
      .bind(path.id, versionId),
    markMatched(db, path, versionSaved, versionId),
  ]);
  const [version] = saved.results;
  if (version) {
    return { ok: true, version: versionSummary(version) };
  }

  const draft = await db
    .prepare(
      `SELECT "name", "description",
         EXISTS (SELECT 1 FROM "draft_milestones" WHERE "pathId" = ?1) AS "hasMilestone"
       FROM "paths" WHERE "id" = ?1`,
    )
    .bind(path.id)
    .first<{ name: string; description: string; hasMilestone: number }>();
  const missing: DraftGap[] = [];
  if (!draft?.name) missing.push("name");
  if (!draft?.description) missing.push("description");
  if (!draft?.hasMilestone) missing.push("milestone");
  return { ok: false, reason: "incomplete", missing };
}

/**
 * Stamp the Draft as matching its latest version, if `condition` holds.
 * Last in its batch, after any trigger has stamped `updatedAt`, so the
 * two compare `updatedAt <= matchedAt` (migration `0026`).
 */
function markMatched(
  db: D1Database,
  path: OwnedPath,
  condition: string,
  ...params: string[]
): D1PreparedStatement {
  return db
    .prepare(
      `UPDATE "paths" SET "matchedAt" = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
       WHERE "id" = ?1 AND ${condition}`,
    )
    .bind(path.id, ...params);
}

export type PublishResult =
  | { readonly ok: true; readonly version: VersionSummary }
  | { readonly ok: false; readonly reason: "not-found" };

/**
 * Offer saved version `number` to other Users. Publishing a published
 * version changes nothing, and publishing never opens a closed Path.
 */
export async function publishVersion(
  db: D1Database,
  path: OwnedPath,
  number: number,
): Promise<PublishResult> {
  const version = await db
    .prepare(
      `UPDATE "path_versions" SET "published" = 1 WHERE "pathId" = ? AND "number" = ?
       RETURNING "id", "number", "savedAt", "published"`,
    )
    .bind(path.id, number)
    .first<VersionRow>();
  return version
    ? { ok: true, version: versionSummary(version) }
    : { ok: false, reason: "not-found" };
}

export type UnpublishResult =
  | {
      readonly ok: true;
      readonly version: VersionSummary;
      /** Whether this closed the Path: it was open, and nothing's published now. */
      readonly closed: boolean;
    }
  | { readonly ok: false; readonly reason: "not-found" };

/**
 * Stop offering saved version `number` to Users who haven't Added it.
 * Unpublishing an unpublished version changes nothing. If no version is
 * left published, the Path closes in the same transaction, so an open Path
 * always has a published version.
 */
export async function unpublishVersion(
  db: D1Database,
  path: OwnedPath,
  number: number,
): Promise<UnpublishResult> {
  const [unpublished, closed] = await db.batch<VersionRow>([
    db
      .prepare(
        `UPDATE "path_versions" SET "published" = 0 WHERE "pathId" = ?1 AND "number" = ?2
         RETURNING "id", "number", "savedAt", "published"`,
      )
      .bind(path.id, number),
    db
      .prepare(
        `UPDATE "paths" SET "open" = 0
         WHERE "id" = ?1 AND "open" = 1
           AND NOT EXISTS (SELECT 1 FROM "path_versions" WHERE "pathId" = ?1 AND "published" = 1)
         RETURNING "id"`,
      )
      .bind(path.id),
  ]);
  const [version] = unpublished.results;
  if (!version) {
    return { ok: false, reason: "not-found" };
  }
  return {
    ok: true,
    version: versionSummary(version),
    closed: closed.results.length > 0,
  };
}

export type OpenPathResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly reason: "none-published" };

/**
 * Let other Users Add the Path's published versions. Refused, changing
 * nothing, while none is published. Opening an open Path changes nothing.
 */
export async function openPath(
  db: D1Database,
  path: OwnedPath,
): Promise<OpenPathResult> {
  const opened = await db
    .prepare(
      `UPDATE "paths" SET "open" = 1
       WHERE "id" = ?1
         AND EXISTS (SELECT 1 FROM "path_versions" WHERE "pathId" = ?1 AND "published" = 1)
       RETURNING "id"`,
    )
    .bind(path.id)
    .first();
  return opened ? { ok: true } : { ok: false, reason: "none-published" };
}

/** Stop the Path accepting new Adds. Closing a closed Path changes nothing. */
export async function closePath(
  db: D1Database,
  path: OwnedPath,
): Promise<void> {
  await db
    .prepare('UPDATE "paths" SET "open" = 0 WHERE "id" = ?')
    .bind(path.id)
    .run();
}

/** Set the Path's Access. Affects only later Adds; held copies are untouched. */
export async function setAccess(
  db: D1Database,
  path: OwnedPath,
  access: Access,
): Promise<void> {
  await db
    .prepare('UPDATE "paths" SET "access" = ? WHERE "id" = ?')
    .bind(access, path.id)
    .run();
}

export function parseAccess(body: unknown): Access | null {
  const access =
    body && typeof body === "object"
      ? (body as { access?: unknown }).access
      : null;
  return access === "free" || access === "permission" ? access : null;
}

export type DiscardChangesResult =
  | { readonly ok: true; readonly draft: Draft }
  | { readonly ok: false; readonly reason: "no-version" };

/**
 * Put the Draft back the way the Path's latest saved version has it: its
 * name, description, Milestones and Tasks. Refused, changing nothing, if
 * the Path has no saved version. Saved versions and Journeys are untouched.
 *
 * One batch is one transaction, and every statement finds the latest
 * version itself, so with none they all do nothing. A saved row's id is
 * the version's id, a colon and the Draft row's id it was saved from (see
 * `saveVersion`), so stripping the prefix gives back the Draft's ids. The
 * old Draft rows are deleted first, so those ids are free again, and the
 * restored Tasks find their Milestones without reading anything back.
 */
export async function discardChanges(
  db: D1Database,
  path: OwnedPath,
): Promise<DiscardChangesResult> {
  const latest = `(SELECT "id" FROM "path_versions" WHERE "pathId" = ?1 ORDER BY "number" DESC LIMIT 1)`;
  const [restored] = await db.batch<OwnedPath>([
    db
      .prepare(
        `UPDATE "paths" SET
           "name" = (SELECT "name" FROM "path_versions" WHERE "id" = ${latest}),
           "description" = (SELECT "description" FROM "path_versions" WHERE "id" = ${latest})
         WHERE "id" = ?1 AND ${latest} IS NOT NULL
         RETURNING "id", "name", "description", "createdAt"`,
      )
      .bind(path.id),
    db
      .prepare(
        `DELETE FROM "draft_milestones" WHERE "pathId" = ?1 AND ${latest} IS NOT NULL`,
      )
      .bind(path.id),
    db
      .prepare(
        `INSERT INTO "draft_milestones" ("id", "pathId", "position", "name", "description", "doneWhen", "outcome")
         SELECT substr("id", length("versionId") + 2), ?1, "position",
           "name", "description", "doneWhen", "outcome"
         FROM "milestones"
         WHERE "versionId" = ${latest}`,
      )
      .bind(path.id),
    db
      .prepare(
        `INSERT INTO "draft_tasks" ("id", "milestoneId", "position", "title")
         SELECT substr("tasks"."id", length("milestones"."versionId") + 2),
           substr("milestones"."id", length("milestones"."versionId") + 2),
           "milestone_tasks"."position", "tasks"."title"
         FROM "milestone_tasks"
         JOIN "milestones" ON "milestones"."id" = "milestone_tasks"."milestoneId"
         JOIN "tasks" ON "tasks"."id" = "milestone_tasks"."taskId"
         WHERE "milestones"."versionId" = ${latest}`,
      )
      .bind(path.id),
    markMatched(db, path, `${latest} IS NOT NULL`),
  ]);
  const [head] = restored.results;
  if (!head) {
    return { ok: false, reason: "no-version" };
  }
  return { ok: true, draft: await getDraft(db, head) };
}

/**
 * One of the Draft's Milestones in an Update Path list: an existing one by
 * its id, or a new one by its fields.
 */
export type MilestoneEntry = { readonly id: string } | MilestoneFields;

/** Everything Update Path sets on a Draft at once. */
export interface PathUpdate extends PathFields {
  /** The Draft's Milestones in their new order. */
  readonly milestones: readonly MilestoneEntry[];
}

/**
 * A Path's name, description and Milestones from a request body. An entry
 * with an `id` names an existing Milestone; any other entry is a new one,
 * parsed with the same rules as editing a Milestone.
 */
export function parsePathUpdate(body: unknown): Parsed<PathUpdate> {
  const fields = parsePathFields(body);
  if (!fields.ok) {
    return fields;
  }
  const raw: unknown = (body as Record<string, unknown>).milestones;
  if (!Array.isArray(raw)) {
    return { ok: false, error: "milestones must be an array" };
  }
  const milestones: MilestoneEntry[] = [];
  for (const entry of raw as unknown[]) {
    if (entry && typeof entry === "object" && "id" in entry) {
      if (typeof entry.id !== "string") {
        return { ok: false, error: "a Milestone's id must be text" };
      }
      milestones.push({ id: entry.id });
      continue;
    }
    const milestone = parseMilestoneFields(entry);
    if (!milestone.ok) {
      return milestone;
    }
    milestones.push(milestone.value);
  }
  return { ok: true, value: { ...fields.value, milestones } };
}

export type UpdatePathResult =
  | { readonly ok: true; readonly draft: Draft }
  | { readonly ok: false; readonly reason: "stale" | "cap" | "not-found" };

/**
 * Set the Draft's name, description and Milestones at once: put the
 * existing Milestones in their new places and add the new ones among them.
 * Refused, with nothing changed, if the Path is gone, if the existing
 * entries aren't exactly the Draft's Milestones once each (a caller
 * holding a stale list must reload, not have the server guess), or if the
 * new Milestones would take the Path over the cap.
 *
 * One batch is one transaction. Every statement carries the same guard,
 * which leaves out the new Milestones' ids, so the batch's own inserts
 * can't change its answer: either every statement runs or none does. The
 * lists go in as JSON, since a Path's Milestones can outnumber D1's bound
 * parameters. Positions are set 1..n, so running it twice gives the same
 * result.
 */
export async function updatePath(
  db: D1Database,
  path: OwnedPath,
  { name, description, milestones }: PathUpdate,
): Promise<UpdatePathResult> {
  const placed = milestones.map((entry, i) =>
    "id" in entry
      ? { id: entry.id, position: i + 1, isNew: false as const }
      : {
          ...entry,
          id: crypto.randomUUID(),
          position: i + 1,
          isNew: true as const,
        },
  );
  const existingIds = placed.filter((m) => !m.isNew).map((m) => m.id);
  if (new Set(existingIds).size !== existingIds.length) {
    return { ok: false, reason: "stale" };
  }
  const added = placed.filter((m) => m.isNew);

  // ?1 the Path, ?2 the existing ids, ?3 the new ids, ?4 the cap. Once the
  // existing ids are known to be the Draft's, the Draft's size after the
  // update is both lists plus its Tasks.
  const guard = `EXISTS (SELECT 1 FROM "paths" WHERE "id" = ?1)
    AND (SELECT count(*) FROM "draft_milestones"
      WHERE "pathId" = ?1 AND "id" NOT IN (SELECT "value" FROM json_each(?3))) = json_array_length(?2)
    AND (SELECT count(*) FROM "draft_milestones"
      WHERE "pathId" = ?1 AND "id" IN (SELECT "value" FROM json_each(?2))) = json_array_length(?2)
    AND json_array_length(?2) + json_array_length(?3) + (SELECT count(*) FROM "draft_tasks"
      JOIN "draft_milestones" ON "draft_milestones"."id" = "draft_tasks"."milestoneId"
      WHERE "draft_milestones"."pathId" = ?1) <= ?4`;
  const guardParams = [
    path.id,
    JSON.stringify(existingIds),
    JSON.stringify(added.map((m) => m.id)),
    MILESTONES_AND_TASKS_PER_PATH,
  ];
  const [updated] = await db.batch<OwnedPath>([
    db
      .prepare(
        `UPDATE "paths" SET "name" = ?5, "description" = ?6
         WHERE "id" = ?1 AND ${guard}
         RETURNING "id", "name", "description", "createdAt"`,
      )
      .bind(...guardParams, name, description),
    db
      .prepare(
        `UPDATE "draft_milestones"
         SET "position" = (SELECT json_extract("value", '$.position') FROM json_each(?5)
           WHERE json_extract("value", '$.id') = "draft_milestones"."id")
         WHERE "pathId" = ?1 AND "id" IN (SELECT "value" FROM json_each(?2)) AND ${guard}`,
      )
      .bind(
        ...guardParams,
        JSON.stringify(placed.map(({ id, position }) => ({ id, position }))),
      ),
    db
      .prepare(
        `INSERT INTO "draft_milestones" ("id", "pathId", "position", "name", "description", "doneWhen", "outcome")
         SELECT json_extract("value", '$.id'), ?1, json_extract("value", '$.position'),
           json_extract("value", '$.name'), json_extract("value", '$.description'),
           json_extract("value", '$.doneWhen'), json_extract("value", '$.outcome')
         FROM json_each(?5)
         WHERE ${guard}`,
      )
      .bind(...guardParams, JSON.stringify(added)),
  ]);
  const [head] = updated.results;
  if (head) {
    return { ok: true, draft: await getDraft(db, head) };
  }

  const [{ results: stillThere }, { results: current }] = await db.batch<{
    id: string;
  }>([
    db.prepare('SELECT "id" FROM "paths" WHERE "id" = ?').bind(path.id),
    db
      .prepare('SELECT "id" FROM "draft_milestones" WHERE "pathId" = ?')
      .bind(path.id),
  ]);
  if (stillThere.length === 0) {
    return { ok: false, reason: "not-found" };
  }
  if (!namesEachOnce(existingIds, current)) {
    return { ok: false, reason: "stale" };
  }
  return { ok: false, reason: "cap" };
}

/**
 * Replace one of the Draft's Milestones' fields. Null if the Path has no
 * Milestone with that id, including one on another Path.
 */
export function updateMilestone(
  db: D1Database,
  path: OwnedPath,
  milestoneId: string,
  { name, description, doneWhen, outcome }: MilestoneFields,
): Promise<Omit<DraftMilestone, "tasks"> | null> {
  return db
    .prepare(
      `UPDATE "draft_milestones" SET "name" = ?, "description" = ?, "doneWhen" = ?, "outcome" = ?
       WHERE "id" = ? AND "pathId" = ?
       RETURNING "id", "name", "description", "doneWhen", "outcome"`,
    )
    .bind(name, description, doneWhen, outcome, milestoneId, path.id)
    .first<Omit<DraftMilestone, "tasks">>();
}

export async function deleteMilestone(
  db: D1Database,
  path: OwnedPath,
  milestoneId: string,
): Promise<boolean> {
  const { meta } = await db
    .prepare('DELETE FROM "draft_milestones" WHERE "id" = ? AND "pathId" = ?')
    .bind(milestoneId, path.id)
    .run();
  return meta.changes > 0;
}

function namesEachOnce(
  orderedIds: readonly string[],
  rows: readonly { id: string }[],
): boolean {
  const current = new Set(rows.map(({ id }) => id));
  const proposed = new Set(orderedIds);
  return (
    proposed.size === orderedIds.length &&
    proposed.size === current.size &&
    orderedIds.every((id) => current.has(id))
  );
}

/** The Draft's Milestones and Tasks together, for the Path bound as `?1`. */
const DRAFT_SIZE = `(SELECT count(*) FROM "draft_milestones" WHERE "pathId" = ?1)
  + (SELECT count(*) FROM "draft_tasks"
     JOIN "draft_milestones" ON "draft_milestones"."id" = "draft_tasks"."milestoneId"
     WHERE "draft_milestones"."pathId" = ?1)`;

export type AddTaskResult =
  | { readonly ok: true; readonly task: DraftTask }
  | { readonly ok: false; readonly reason: "cap" | "not-found" };

export async function addTask(
  db: D1Database,
  path: OwnedPath,
  milestoneId: string,
  { title }: TaskFields,
): Promise<AddTaskResult> {
  const task: DraftTask = { id: crypto.randomUUID(), title };
  const { meta } = await db
    .prepare(
      `INSERT INTO "draft_tasks" ("id", "milestoneId", "position", "title")
       SELECT ?4, "id", (SELECT coalesce(max("position"), 0) + 1 FROM "draft_tasks" WHERE "milestoneId" = ?3), ?5
       FROM "draft_milestones"
       WHERE "id" = ?3 AND "pathId" = ?1 AND ${DRAFT_SIZE} < ?2`,
    )
    .bind(
      path.id,
      MILESTONES_AND_TASKS_PER_PATH,
      milestoneId,
      task.id,
      task.title,
    )
    .run();
  if (meta.changes > 0) {
    return { ok: true, task };
  }
  const milestone = await db
    .prepare('SELECT 1 FROM "draft_milestones" WHERE "id" = ? AND "pathId" = ?')
    .bind(milestoneId, path.id)
    .first();
  return { ok: false, reason: milestone ? "cap" : "not-found" };
}

/** The Task bound as `?3`, on the Milestone `?2`, on the Path `?1`. */
const TASK_ON_PATH = `"id" = ?3 AND "milestoneId" = ?2
  AND "milestoneId" IN (SELECT "id" FROM "draft_milestones" WHERE "pathId" = ?1)`;

export function updateTask(
  db: D1Database,
  path: OwnedPath,
  milestoneId: string,
  taskId: string,
  { title }: TaskFields,
): Promise<DraftTask | null> {
  return db
    .prepare(
      `UPDATE "draft_tasks" SET "title" = ?4 WHERE ${TASK_ON_PATH} RETURNING "id", "title"`,
    )
    .bind(path.id, milestoneId, taskId, title)
    .first<DraftTask>();
}

export async function deleteTask(
  db: D1Database,
  path: OwnedPath,
  milestoneId: string,
  taskId: string,
): Promise<boolean> {
  const { meta } = await db
    .prepare(`DELETE FROM "draft_tasks" WHERE ${TASK_ON_PATH}`)
    .bind(path.id, milestoneId, taskId)
    .run();
  return meta.changes > 0;
}

export async function reorderTasks(
  db: D1Database,
  path: OwnedPath,
  milestoneId: string,
  orderedIds: readonly string[],
): Promise<boolean> {
  const { results } = await db
    .prepare(
      `SELECT "draft_tasks"."id" FROM "draft_tasks"
       JOIN "draft_milestones" ON "draft_milestones"."id" = "draft_tasks"."milestoneId"
       WHERE "draft_tasks"."milestoneId" = ? AND "draft_milestones"."pathId" = ?`,
    )
    .bind(milestoneId, path.id)
    .all<{ id: string }>();
  if (!namesEachOnce(orderedIds, results)) {
    return false;
  }
  if (orderedIds.length === 0) {
    return true;
  }
  const update = db.prepare(
    'UPDATE "draft_tasks" SET "position" = ? WHERE "id" = ? AND "milestoneId" = ?',
  );
  await db.batch(
    orderedIds.map((id, i) => update.bind(i + 1, id, milestoneId)),
  );
  return true;
}

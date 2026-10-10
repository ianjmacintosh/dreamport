/**
 * A Path belongs to Dreamport (`paths.userId` null, followable by every
 * User) or to one User (followable only by them). That check lives here and
 * nowhere else: another User's version comes back as `null`, the same as
 * one that doesn't exist.
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

/** A Path's Draft: its name, description and Milestones, as last edited. */
export interface Draft extends PathSummary {
  readonly description: string;
  /** In order. A Draft may have none. */
  readonly milestones: readonly DraftMilestone[];
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

/** A User's own Paths, oldest first. Never Dreamport's. */
export async function listPaths(
  db: D1Database,
  userId: string,
): Promise<PathSummary[]> {
  const { results } = await db
    .prepare(
      'SELECT "id", "name", "createdAt" FROM "paths" WHERE "userId" = ? ORDER BY "createdAt" ASC, "rowid" ASC',
    )
    .bind(userId)
    .all<PathSummary>();
  return results;
}

/**
 * A User's own Path by id, or null if it doesn't exist, is another User's,
 * or is Dreamport's: `"userId" = ?` never matches a null owner.
 */
export function getPath(
  db: D1Database,
  userId: string,
  pathId: string,
): Promise<OwnedPath | null> {
  return db
    .prepare(
      'SELECT "id", "name", "description", "createdAt" FROM "paths" WHERE "id" = ? AND "userId" = ?',
    )
    .bind(pathId, userId)
    .first<OwnedPath>();
}

export type CreatePathResult =
  | { readonly ok: true; readonly path: OwnedPath }
  | { readonly ok: false; readonly reason: "cap" };

/**
 * Make a Path with an empty Draft, unless the User already has
 * `PATHS_PER_USER`. The count and the insert are one statement, so two
 * creates at once can't both land at the cap.
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
      `INSERT INTO "paths" ("id", "userId", "name", "description", "createdAt")
       SELECT ?, ?, ?, ?, ?
       WHERE (SELECT count(*) FROM "paths" WHERE "userId" = ?) < ?`,
    )
    .bind(
      path.id,
      userId,
      path.name,
      path.description,
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

export async function getDraft(
  db: D1Database,
  path: OwnedPath,
): Promise<Draft> {
  const [{ results: milestones }, { results: tasks }] = await Promise.all([
    db
      .prepare(
        'SELECT "id", "name", "description", "doneWhen", "outcome" FROM "draft_milestones" WHERE "pathId" = ? ORDER BY "position" ASC',
      )
      .bind(path.id)
      .all<Omit<DraftMilestone, "tasks">>(),
    db
      .prepare(
        `SELECT "draft_tasks"."id", "draft_tasks"."milestoneId", "draft_tasks"."title"
         FROM "draft_tasks"
         JOIN "draft_milestones" ON "draft_milestones"."id" = "draft_tasks"."milestoneId"
         WHERE "draft_milestones"."pathId" = ?
         ORDER BY "draft_tasks"."position" ASC`,
      )
      .bind(path.id)
      .all<DraftTask & { milestoneId: string }>(),
  ]);
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
  };
}

/** Set the Draft's name and description. Null if the Path is gone. */
export function updatePath(
  db: D1Database,
  path: OwnedPath,
  { name, description }: PathFields,
): Promise<OwnedPath | null> {
  return db
    .prepare(
      'UPDATE "paths" SET "name" = ?, "description" = ? WHERE "id" = ? RETURNING "id", "name", "description", "createdAt"',
    )
    .bind(name, description, path.id)
    .first<OwnedPath>();
}

const DRAFT_SIZE = `(SELECT count(*) FROM "draft_milestones" WHERE "pathId" = ?)
  + (SELECT count(*) FROM "draft_tasks"
     JOIN "draft_milestones" ON "draft_milestones"."id" = "draft_tasks"."milestoneId"
     WHERE "draft_milestones"."pathId" = ?)`;

export type AddMilestoneResult =
  | { readonly ok: true; readonly milestone: DraftMilestone }
  | { readonly ok: false; readonly reason: "cap" };

export async function addMilestone(
  db: D1Database,
  path: OwnedPath,
  fields: MilestoneFields,
): Promise<AddMilestoneResult> {
  const milestone: DraftMilestone = {
    id: crypto.randomUUID(),
    ...fields,
    tasks: [],
  };
  const { meta } = await db
    .prepare(
      `INSERT INTO "draft_milestones" ("id", "pathId", "position", "name", "description", "doneWhen", "outcome")
       SELECT ?, ?, (SELECT coalesce(max("position"), 0) + 1 FROM "draft_milestones" WHERE "pathId" = ?), ?, ?, ?, ?
       WHERE ${DRAFT_SIZE} < ?`,
    )
    .bind(
      milestone.id,
      path.id,
      path.id,
      milestone.name,
      milestone.description,
      milestone.doneWhen,
      milestone.outcome,
      path.id,
      path.id,
      MILESTONES_AND_TASKS_PER_PATH,
    )
    .run();
  if (meta.changes === 0) {
    return { ok: false, reason: "cap" };
  }
  return { ok: true, milestone };
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

/**
 * Put the Draft's Milestones in `orderedIds`' order. Refused (false), with
 * nothing changed, unless `orderedIds` is exactly the Draft's Milestone ids
 * once each: a caller holding a stale list must reload, not guess. Sets
 * positions 1..n, so running it twice gives the same result.
 */
export async function reorderMilestones(
  db: D1Database,
  path: OwnedPath,
  orderedIds: readonly string[],
): Promise<boolean> {
  const { results } = await db
    .prepare('SELECT "id" FROM "draft_milestones" WHERE "pathId" = ?')
    .bind(path.id)
    .all<{ id: string }>();
  if (!namesEachOnce(orderedIds, results)) {
    return false;
  }
  if (orderedIds.length === 0) {
    return true;
  }
  const update = db.prepare(
    'UPDATE "draft_milestones" SET "position" = ? WHERE "id" = ? AND "pathId" = ?',
  );
  await db.batch(orderedIds.map((id, i) => update.bind(i + 1, id, path.id)));
  return true;
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
       SELECT ?, "id", (SELECT coalesce(max("position"), 0) + 1 FROM "draft_tasks" WHERE "milestoneId" = ?), ?
       FROM "draft_milestones"
       WHERE "id" = ? AND "pathId" = ? AND ${DRAFT_SIZE} < ?`,
    )
    .bind(
      task.id,
      milestoneId,
      task.title,
      milestoneId,
      path.id,
      path.id,
      path.id,
      MILESTONES_AND_TASKS_PER_PATH,
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

const TASK_ON_PATH = `"id" = ? AND "milestoneId" = ?
  AND "milestoneId" IN (SELECT "id" FROM "draft_milestones" WHERE "pathId" = ?)`;

export function updateTask(
  db: D1Database,
  path: OwnedPath,
  milestoneId: string,
  taskId: string,
  { title }: TaskFields,
): Promise<DraftTask | null> {
  return db
    .prepare(
      `UPDATE "draft_tasks" SET "title" = ? WHERE ${TASK_ON_PATH} RETURNING "id", "title"`,
    )
    .bind(title, taskId, milestoneId, path.id)
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
    .bind(taskId, milestoneId, path.id)
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

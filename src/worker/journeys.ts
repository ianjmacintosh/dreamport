/**
 * Journeys (issues #137-#140, deepened in #156): everything about one
 * Product's progress on a Path — starting it, Advance and Return, the
 * Product's Worksheet instances, Task check-off, and the combined state
 * the Journey page shows.
 *
 * Plain data-access functions over `journeys` (`migrations/0007_*.sql`),
 * `worksheet_instances`/`worksheet_answers` (`0013`) and `task_completions`
 * (`0017`). The HTTP boundary lives in `product-routes.ts`. The fixed
 * Worksheet content (`getWorksheet`, `parseAnswers`) lives in
 * `worksheets.ts`.
 *
 * A Journey is on one saved Path version, which callers pass in as a
 * `FollowableVersion` from `paths.ts`, so a route can't start a Journey on
 * a version the User may not follow. A Product can be on several Paths at
 * once (#170) and follow one Path again once it's completed (#172), so a
 * Journey is addressed by its own id. Everything that needs a Journey takes
 * a `StartedJourney`, which only `loadJourney` makes, so a route can't skip
 * that check either. A Journey's Worksheet instances and checked Tasks
 * belong to it (`0023`) and go when it's deleted.
 */

import { getVersion, type FollowableVersion, type Milestone } from "./paths";
import type { OwnedProduct } from "./products";
import {
  getWorksheet,
  type Worksheet,
  type WorksheetAnswers,
} from "./worksheets";

/**
 * A Product's progress on one Path version. Strictly sequenced: every
 * Milestone before `currentMilestoneId` (in the version's order) is done,
 * every one after it future. `finishedAt` stays `null` until the Journey advances
 * past the last Milestone (issue #138) — `currentMilestoneId` then keeps
 * pointing at that last Milestone, since there's no Milestone after it to
 * take its place. `abandonedAt` is set when the User abandons it partway
 * (#172), and never alongside `finishedAt`.
 */
export interface Journey {
  id: string;
  startedAt: string;
  currentMilestoneId: string;
  finishedAt: string | null;
  abandonedAt: string | null;
}

/** A Journey neither completed nor abandoned, as a condition on `journeys`. */
const IN_PROGRESS = `"journeys"."finishedAt" IS NULL AND "journeys"."abandonedAt" IS NULL`;

declare const started: unique symbol;

/**
 * One of a Product's Journeys, confirmed to exist on a version the
 * Product's User may follow. Only `loadJourney` makes one, so Advance,
 * Return, Worksheet read/save and Task check-off, which all take this,
 * can't run against a Journey nobody checked.
 *
 * It names the Journey rather than holding its progress, which would go
 * stale the moment it advanced; `journeyState` reads that.
 */
export type StartedJourney = {
  readonly id: string;
  readonly product: OwnedProduct;
  readonly version: FollowableVersion;
  readonly [started]: true;
};

/**
 * What the Journey page needs to link to a Worksheet: where it's on and how
 * much of the Product's instance is filled in.
 */
export interface WorksheetSummary {
  id: string;
  name: string;
  milestoneIds: string[];
  filled: number;
  total: number;
}

/** What the Journey page needs to show a Task: where it's on and whether it's checked off. */
export interface TaskSummary {
  id: string;
  title: string;
  /** The Milestones it's on, in their version's order. */
  milestoneIds: string[];
  done: boolean;
}

/** Where a Journey stands: under way, Advanced past its end, or Abandoned (#172). */
export type JourneyStatus = "in-progress" | "completed" | "abandoned";

const STATUS_SQL = `CASE WHEN "journeys"."finishedAt" IS NOT NULL THEN 'completed'
  WHEN "journeys"."abandonedAt" IS NOT NULL THEN 'abandoned'
  ELSE 'in-progress' END`;

/** A Journey as the Product's list of Journeys shows it. */
export interface JourneySummary {
  id: string;
  pathId: string;
  /** The name of the version it's on. */
  pathName: string;
  versionNumber: number;
  currentMilestoneName: string;
  startedAt: string;
  status: JourneyStatus;
}

/**
 * The Product's Journey `journeyId`, or `null` if the Product has no such
 * Journey or its version isn't one the Product's User may follow: the
 * version comes through `getVersion`, so the owner rule stays in
 * `paths.ts`.
 */
export async function loadJourney(
  db: D1Database,
  product: OwnedProduct,
  journeyId: string,
): Promise<StartedJourney | null> {
  const row = await db
    .prepare(
      `SELECT "journeys"."versionId", "products"."userId"
       FROM "journeys" JOIN "products" ON "products"."id" = "journeys"."productId"
       WHERE "journeys"."id" = ? AND "journeys"."productId" = ?`,
    )
    .bind(journeyId, product.id)
    .first<{ versionId: string; userId: string }>();
  const version = row ? await getVersion(db, row.userId, row.versionId) : null;
  return version
    ? ({ id: journeyId, product, version } as StartedJourney)
    : null;
}

/**
 * Every one of the Product's Journeys, oldest first. Each was started on a
 * `FollowableVersion` of its Product's User, and a Path never changes
 * hands, so there's no owner rule to repeat here.
 */
export async function listJourneys(
  db: D1Database,
  product: OwnedProduct,
): Promise<JourneySummary[]> {
  const { results } = await db
    .prepare(
      `SELECT "journeys"."id", "path_versions"."pathId", "path_versions"."name" AS "pathName",
         "path_versions"."number" AS "versionNumber", "milestones"."name" AS "currentMilestoneName", "journeys"."startedAt",
         ${STATUS_SQL} AS "status"
       FROM "journeys"
       JOIN "path_versions" ON "path_versions"."id" = "journeys"."versionId"
       JOIN "milestones" ON "milestones"."id" = "journeys"."currentMilestoneId"
       WHERE "journeys"."productId" = ?
       ORDER BY "journeys"."startedAt" ASC, "journeys"."rowid" ASC`,
    )
    .bind(product.id)
    .all<JourneySummary>();
  return results;
}

/** One of the User's Products, as a Trailhead's picker lists it (#205). */
export interface ProductOnPath {
  readonly id: string;
  readonly name: string;
  /** Its Journey in progress on the Path, on any version, if it has one. */
  readonly journeyId: string | null;
}

/** Every one of the User's Products, oldest first, with its Journey in progress on the Path. */
export async function productsOnPath(
  db: D1Database,
  userId: string,
  pathId: string,
): Promise<ProductOnPath[]> {
  const { results } = await db
    .prepare(
      `SELECT "products"."id", "products"."name",
         (SELECT "journeys"."id" FROM "journeys"
          JOIN "path_versions" ON "path_versions"."id" = "journeys"."versionId"
          WHERE "journeys"."productId" = "products"."id" AND "path_versions"."pathId" = ? AND ${IN_PROGRESS}
          LIMIT 1) AS "journeyId"
       FROM "products"
       WHERE "products"."userId" = ?
       ORDER BY "products"."createdAt" ASC`,
    )
    .bind(pathId, userId)
    .all<ProductOnPath>();
  return results;
}

/**
 * Start a Journey for the Product on `version`, at its first Milestone,
 * with its one instance of each singleton Worksheet on the version (#139).
 * A Product has at most one Journey in progress per Path, counting every
 * version, and any number of completed ones (#172). So when one is already
 * in progress, nothing starts and that Journey comes back with `started:
 * false`, its progress as it was. The check sits in the insert itself, so
 * two starts at once can't both get through.
 */
export async function startJourney(
  db: D1Database,
  product: OwnedProduct,
  version: FollowableVersion,
): Promise<{ journeyId: string; versionId: string; started: boolean }> {
  const inProgress = `SELECT "journeys"."id", "journeys"."versionId" FROM "journeys"
    JOIN "path_versions" ON "path_versions"."id" = "journeys"."versionId"
    WHERE "journeys"."productId" = ? AND "path_versions"."pathId" = ?
      AND ${IN_PROGRESS}`;
  const [inserted, current] = await db.batch<{ id: string; versionId: string }>(
    [
      db
        .prepare(
          `INSERT INTO "journeys" ("id", "productId", "versionId", "currentMilestoneId", "startedAt")
           SELECT ?, ?, ?, ?, ? WHERE NOT EXISTS (${inProgress})`,
        )
        .bind(
          crypto.randomUUID(),
          product.id,
          version.id,
          version.milestones[0].id,
          new Date().toISOString(),
          product.id,
          version.pathId,
        ),
      db.prepare(inProgress).bind(product.id, version.pathId),
    ],
  );
  const [journey] = current.results;
  if (!journey) {
    throw new Error(
      `No Journey in progress on ${version.pathId} after a start`,
    );
  }
  // Also fills in a Journey started before #139, which has none.
  await createSingletonInstances(db, journey.id, journey.versionId);
  return {
    journeyId: journey.id,
    versionId: journey.versionId,
    started: inserted.meta.changes > 0,
  };
}

/**
 * Restart (CONTEXT.md): a new, blank Journey on `latest`, the Path's latest
 * version, from a completed or abandoned one, which stays as it was.
 * `null` while `journey` is still in progress. Otherwise it's a start, so a
 * Journey already in progress on the Path is the one that comes back.
 */
export async function restartJourney(
  db: D1Database,
  journey: StartedJourney,
  latest: FollowableVersion,
): Promise<{ journeyId: string; started: boolean } | null> {
  if (await isInProgress(db, journey)) {
    return null;
  }
  const { journeyId, started } = await startJourney(
    db,
    journey.product,
    latest,
  );
  return { journeyId, started };
}

/**
 * Abandon (CONTEXT.md): the User steps away from a Journey in progress.
 * It keeps its answers and checked Tasks, and stays on its Milestone until
 * it's resumed. A no-op on a completed or abandoned Journey.
 */
export async function abandonJourney(
  db: D1Database,
  journey: StartedJourney,
): Promise<void> {
  await db
    .prepare(
      `UPDATE "journeys" SET "abandonedAt" = ? WHERE "id" = ? AND ${IN_PROGRESS}`,
    )
    .bind(new Date().toISOString(), journey.id)
    .run();
}

/**
 * Resume (CONTEXT.md): an abandoned Journey goes back in progress, on the
 * Milestone it was left on, and so does one already in progress. While
 * another of the Product's Journeys on the Path is in progress, since only
 * one can be, nothing changes and that one's id comes back; the check sits
 * in the update itself. A completed Journey doesn't resume, with no other.
 */
export async function resumeJourney(
  db: D1Database,
  journey: StartedJourney,
): Promise<
  { resumed: true } | { resumed: false; activeJourneyId: string | null }
> {
  const { meta } = await db
    .prepare(
      `UPDATE "journeys" SET "abandonedAt" = NULL
       WHERE "id" = ? AND "abandonedAt" IS NOT NULL AND NOT EXISTS (
         SELECT 1 FROM "journeys" AS "other"
         JOIN "path_versions" ON "path_versions"."id" = "other"."versionId"
         WHERE "other"."productId" = "journeys"."productId"
           AND "path_versions"."pathId" = ?
           AND "other"."finishedAt" IS NULL AND "other"."abandonedAt" IS NULL
       )`,
    )
    .bind(journey.id, journey.version.pathId)
    .run();
  if (meta.changes > 0 || (await isInProgress(db, journey))) {
    return { resumed: true };
  }
  const active = await db
    .prepare(
      `SELECT "journeys"."id" FROM "journeys"
       JOIN "path_versions" ON "path_versions"."id" = "journeys"."versionId"
       WHERE "journeys"."productId" = ? AND "path_versions"."pathId" = ?
         AND ${IN_PROGRESS}`,
    )
    .bind(journey.product.id, journey.version.pathId)
    .first<{ id: string }>();
  return { resumed: false, activeJourneyId: active?.id ?? null };
}

/**
 * Delete a Journey for good, with its Worksheet answers and checked Tasks.
 * Only a completed or abandoned one: `false`, deleting nothing, for one in
 * progress, which has to be abandoned first (#172).
 */
export async function deleteJourney(
  db: D1Database,
  journey: StartedJourney,
): Promise<boolean> {
  const { meta } = await db
    .prepare(`DELETE FROM "journeys" WHERE "id" = ? AND NOT (${IN_PROGRESS})`)
    .bind(journey.id)
    .run();
  return meta.changes > 0;
}

async function isInProgress(
  db: D1Database,
  journey: StartedJourney,
): Promise<boolean> {
  return (
    (await db
      .prepare(`SELECT 1 FROM "journeys" WHERE "id" = ? AND ${IN_PROGRESS}`)
      .bind(journey.id)
      .first()) !== null
  );
}

/**
 * Advance the Journey by exactly one Milestone. Once completed or
 * abandoned, this is a no-op — the same "repeat is harmless" shape
 * `startJourney` has.
 *
 * Advancing from the last Milestone (Growth) has no next Milestone to move
 * to, so it sets `finishedAt` instead (issue #138, confirmed on #133:
 * completed state, not staying on the last Milestone forever).
 *
 * One atomic `UPDATE` — same reasoning as `startJourney`'s single
 * `INSERT ... ON CONFLICT`: D1 has no multi-statement transactions, so a
 * read-then-write split here (read the current Milestone, decide the next
 * one, write it) would race two near-simultaneous advances into computing
 * the same "next" from the same stale read and silently dropping one of
 * them. Every value the write depends on — whether there's a next
 * Milestone, whether the Journey is already completed — is looked up
 * in-statement against the row as it is at write time instead.
 */
export async function advanceJourney(
  db: D1Database,
  journey: StartedJourney,
): Promise<void> {
  await db
    .prepare(
      `UPDATE "journeys" SET
         "currentMilestoneId" = COALESCE(
           (
             SELECT "id" FROM "milestones" AS "next"
             WHERE "next"."versionId" = "journeys"."versionId"
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
             WHERE "next"."versionId" = "journeys"."versionId"
               AND "next"."position" = (
                 SELECT "position" + 1 FROM "milestones"
                 WHERE "id" = "journeys"."currentMilestoneId"
               )
           ) THEN "finishedAt"
           ELSE ?
         END
       WHERE "id" = ? AND ${IN_PROGRESS}`,
    )
    .bind(new Date().toISOString(), journey.id)
    .run();
}

/**
 * Return the Journey by exactly one Milestone — the mirror of
 * `advanceJourney` (see CONTEXT.md's Return).
 *
 * Mirrors completing exactly: advancing from the last Milestone only set
 * `finishedAt`, leaving that Milestone current, so returning from a
 * completed Journey only clears `finishedAt` — it takes a second Return to
 * move back to the Milestone before it.
 *
 * On Milestone 1 there's no previous Milestone, so this is a no-op, the
 * same way `advanceJourney` is once completed. The Journey page hides
 * Return there; a request anyway leaves the Journey as it was. So it is on
 * an abandoned Journey, which can't be picked up again.
 *
 * One atomic `UPDATE` for the same race reason `advanceJourney` gives.
 * SQLite evaluates every `SET` expression against the row as it was before
 * the update, so the `CASE` sees the old `finishedAt` even though the same
 * statement clears it.
 */
export async function returnJourney(
  db: D1Database,
  journey: StartedJourney,
): Promise<void> {
  await db
    .prepare(
      `UPDATE "journeys" SET
         "currentMilestoneId" = CASE
           WHEN "finishedAt" IS NOT NULL THEN "currentMilestoneId"
           ELSE COALESCE(
             (
               SELECT "id" FROM "milestones" AS "previous"
               WHERE "previous"."versionId" = "journeys"."versionId"
                 AND "previous"."position" = (
                   SELECT "position" - 1 FROM "milestones"
                   WHERE "id" = "journeys"."currentMilestoneId"
                 )
             ),
             "currentMilestoneId"
           )
         END,
         "finishedAt" = NULL
       WHERE "id" = ? AND "abandonedAt" IS NULL`,
    )
    .bind(journey.id)
    .run();
}

/**
 * The Worksheet and the Journey's answers on its instance, or `null` if there's
 * no such Worksheet. The answers can be changed at any point in the
 * Journey, not just on the Milestones the Worksheet is on — those are only
 * where it's checked (#139).
 */
export async function worksheetState(
  db: D1Database,
  journey: StartedJourney,
  worksheetId: string,
): Promise<{ worksheet: Worksheet; answers: WorksheetAnswers } | null> {
  const [worksheet, { results }] = await Promise.all([
    getWorksheet(db, worksheetId),
    db
      .prepare(
        `SELECT "worksheet_answers"."fieldId", "worksheet_answers"."value"
         FROM "worksheet_answers"
         JOIN "worksheet_instances" ON "worksheet_instances"."id" = "worksheet_answers"."instanceId"
         WHERE "worksheet_instances"."journeyId" = ?
           AND "worksheet_instances"."worksheetId" = ? AND "worksheet_instances"."singleton" = 1`,
      )
      .bind(journey.id, worksheetId)
      .all<{ fieldId: string; value: string }>(),
  ]);
  if (!worksheet) {
    return null;
  }
  return {
    worksheet,
    answers: Object.fromEntries(results.map((r) => [r.fieldId, r.value])),
  };
}

/**
 * Replace every answer on the Journey's instance of a singleton Worksheet with
 * `answers` — a field left out reads as blank afterwards. Creates the instance
 * first if it's missing (a Journey started before #139 has none).
 *
 * Only singleton Worksheets have any content yet (the Product Summary), so
 * the instance is addressed by (Journey, Worksheet). A
 * repeatable Worksheet's instances will need their own ids once one is
 * authored (#151).
 *
 * One `batch`, which D1 runs as a single transaction, so a save never
 * half-applies (old answers deleted, new ones not yet written).
 */
export async function saveAnswers(
  db: D1Database,
  journey: StartedJourney,
  worksheetId: string,
  answers: WorksheetAnswers,
): Promise<void> {
  const instanceId = `(SELECT "id" FROM "worksheet_instances" WHERE "journeyId" = ? AND "worksheetId" = ? AND "singleton" = 1)`;
  await db.batch([
    db
      .prepare(
        'INSERT INTO "worksheet_instances" ("id", "journeyId", "worksheetId", "singleton", "createdAt") VALUES (?, ?, ?, 1, ?) ON CONFLICT DO NOTHING',
      )
      .bind(
        crypto.randomUUID(),
        journey.id,
        worksheetId,
        new Date().toISOString(),
      ),
    db
      .prepare(
        `DELETE FROM "worksheet_answers" WHERE "instanceId" = ${instanceId}`,
      )
      .bind(journey.id, worksheetId),
    ...Object.entries(answers).map(([fieldId, value]) =>
      db
        .prepare(
          `INSERT INTO "worksheet_answers" ("instanceId", "fieldId", "value") VALUES (${instanceId}, ?, ?)`,
        )
        .bind(journey.id, worksheetId, fieldId, value),
    ),
  ]);
}

/**
 * Check off (`done`) or uncheck a Task. Returns `false` if the Task isn't
 * on any of the version's Milestones, changing nothing. Repeating either is
 * harmless: checking an already-checked Task keeps its first
 * `completedAt`.
 *
 * Every Task is standalone for now: the User checks it off by hand.
 * Checking one off is purely informational — Advance never reads it, so it
 * never gates the Journey (#133).
 */
export async function setTaskDone(
  db: D1Database,
  journey: StartedJourney,
  taskId: string,
  done: boolean,
): Promise<boolean> {
  const versionId = journey.version.id;
  const onPath = await db
    .prepare(
      'SELECT 1 FROM "milestone_tasks" JOIN "milestones" ON "milestones"."id" = "milestone_tasks"."milestoneId" WHERE "milestone_tasks"."taskId" = ? AND "milestones"."versionId" = ?',
    )
    .bind(taskId, versionId)
    .first();
  if (!onPath) {
    return false;
  }

  await (
    done
      ? db
          .prepare(
            'INSERT INTO "task_completions" ("journeyId", "taskId", "completedAt") VALUES (?, ?, ?) ON CONFLICT DO NOTHING',
          )
          .bind(journey.id, taskId, new Date().toISOString())
      : db
          .prepare(
            'DELETE FROM "task_completions" WHERE "journeyId" = ? AND "taskId" = ?',
          )
          .bind(journey.id, taskId)
  ).run();
  return true;
}

/** Where the Journey stands now. */
export async function journeyStatus(
  db: D1Database,
  started: StartedJourney,
): Promise<JourneyStatus> {
  const row = await db
    .prepare(`SELECT ${STATUS_SQL} AS "status" FROM "journeys" WHERE "id" = ?`)
    .bind(started.id)
    .first<{ status: JourneyStatus }>();
  if (!row) {
    throw new Error(`Journey ${started.id} is gone`);
  }
  return row.status;
}

/**
 * What `/api/products/:productId/journeys/:journeyId` answers with: the
 * Path version with its Milestones and its Path's id (still under `path`,
 * which the page reads), the Journey's progress on it, the Worksheets on its Milestones
 * with how much of each is filled in (#139), and the Tasks on them with
 * whether each is checked off (#140).
 */
export async function journeyState(
  db: D1Database,
  started: StartedJourney,
): Promise<{
  path: {
    id: string;
    pathId: string;
    name: string;
    milestones: readonly Milestone[];
  };
  journey: Journey;
  worksheets: WorksheetSummary[];
  tasks: TaskSummary[];
}> {
  const { version } = started;
  const [journey, worksheets, tasks] = await Promise.all([
    db
      .prepare(
        'SELECT "id", "startedAt", "currentMilestoneId", "finishedAt", "abandonedAt" FROM "journeys" WHERE "id" = ?',
      )
      .bind(started.id)
      .first<Journey>(),
    worksheetSummaries(db, started.id, version.id),
    taskSummaries(db, started.id, version.id),
  ]);
  if (!journey) {
    throw new Error(`Journey ${started.id} is gone`);
  }
  // `pathId` links to the Trailhead, which for a copy is its source's.
  const { id, trailheadPathId: pathId, name, milestones } = version;
  return { path: { id, pathId, name, milestones }, journey, worksheets, tasks };
}

/**
 * Create the Journey's one instance of every singleton Worksheet on
 * `versionId`'s Milestones, skipping any it already has — so it's safe to
 * call on every Journey start, repeat or not. Ids come from SQLite's
 * `randomblob`, since one `INSERT ... SELECT` can't call
 * `crypto.randomUUID()` per row.
 */
async function createSingletonInstances(
  db: D1Database,
  journeyId: string,
  versionId: string,
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO "worksheet_instances" ("id", "journeyId", "worksheetId", "singleton", "createdAt")
       SELECT lower(hex(randomblob(16))), ?, "worksheets"."id", 1, ?
       FROM "worksheets"
       WHERE "worksheets"."cardinality" = 'singleton'
         AND "worksheets"."id" IN (
           SELECT "milestone_worksheets"."worksheetId" FROM "milestone_worksheets"
           JOIN "milestones" ON "milestones"."id" = "milestone_worksheets"."milestoneId"
           WHERE "milestones"."versionId" = ?
         )
       ON CONFLICT DO NOTHING`,
    )
    .bind(journeyId, new Date().toISOString(), versionId)
    .run();
}

/**
 * Every Worksheet on `versionId`'s Milestones, in the order its first
 * Milestone comes, with how many of the Journey's answers are filled in.
 */
async function worksheetSummaries(
  db: D1Database,
  journeyId: string,
  versionId: string,
): Promise<WorksheetSummary[]> {
  const [{ results: links }, { results: filledCounts }] = await Promise.all([
    db
      .prepare(
        `SELECT "worksheets"."id", "worksheets"."name", "milestone_worksheets"."milestoneId",
           (SELECT COUNT(*) FROM "worksheet_fields" WHERE "worksheetId" = "worksheets"."id") AS "total"
         FROM "milestone_worksheets"
         JOIN "milestones" ON "milestones"."id" = "milestone_worksheets"."milestoneId"
         JOIN "worksheets" ON "worksheets"."id" = "milestone_worksheets"."worksheetId"
         WHERE "milestones"."versionId" = ?
         ORDER BY "milestones"."position" ASC, "worksheets"."id" ASC`,
      )
      .bind(versionId)
      .all<{ id: string; name: string; milestoneId: string; total: number }>(),
    db
      .prepare(
        `SELECT "worksheet_instances"."worksheetId", COUNT(*) AS "filled"
         FROM "worksheet_answers"
         JOIN "worksheet_instances" ON "worksheet_instances"."id" = "worksheet_answers"."instanceId"
         WHERE "worksheet_instances"."journeyId" = ? AND "worksheet_instances"."singleton" = 1
         GROUP BY "worksheet_instances"."worksheetId"`,
      )
      .bind(journeyId)
      .all<{ worksheetId: string; filled: number }>(),
  ]);

  const filled = new Map(filledCounts.map((r) => [r.worksheetId, r.filled]));
  const summaries = new Map<string, WorksheetSummary>();
  for (const { id, name, milestoneId, total } of links) {
    const summary = summaries.get(id) ?? {
      id,
      name,
      milestoneIds: [],
      filled: filled.get(id) ?? 0,
      total,
    };
    summary.milestoneIds.push(milestoneId);
    summaries.set(id, summary);
  }
  return [...summaries.values()];
}

/**
 * Every Task on `versionId`'s Milestones, in the order its first Milestone
 * comes (then its place on that Milestone), with whether it's checked off
 * on the Journey.
 */
async function taskSummaries(
  db: D1Database,
  journeyId: string,
  versionId: string,
): Promise<TaskSummary[]> {
  const { results } = await db
    .prepare(
      `SELECT "tasks"."id", "tasks"."title", "milestone_tasks"."milestoneId",
         EXISTS (
           SELECT 1 FROM "task_completions"
           WHERE "journeyId" = ? AND "taskId" = "tasks"."id"
         ) AS "done"
       FROM "milestone_tasks"
       JOIN "milestones" ON "milestones"."id" = "milestone_tasks"."milestoneId"
       JOIN "tasks" ON "tasks"."id" = "milestone_tasks"."taskId"
       WHERE "milestones"."versionId" = ?
       ORDER BY "milestones"."position" ASC, "milestone_tasks"."position" ASC`,
    )
    .bind(journeyId, versionId)
    .all<{ id: string; title: string; milestoneId: string; done: number }>();

  const summaries = new Map<string, TaskSummary>();
  for (const { id, title, milestoneId, done } of results) {
    const summary = summaries.get(id) ?? {
      id,
      title,
      milestoneIds: [],
      done: done === 1,
    };
    summary.milestoneIds.push(milestoneId);
    summaries.set(id, summary);
  }
  return [...summaries.values()];
}

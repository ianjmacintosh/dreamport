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
 * a version the User may not follow. And everything that needs a Journey
 * to have started takes a `StartedJourney`, which only `loadJourney`
 * makes, so a route can't skip that check either.
 */

import type { FollowableVersion, Milestone } from "./paths";
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
 * take its place.
 */
export interface Journey {
  startedAt: string;
  currentMilestoneId: string;
  finishedAt: string | null;
}

declare const started: unique symbol;

/**
 * A Product's Journey, confirmed to have started. Only `loadJourney` makes
 * one, so Advance, Return, Worksheet read/save and Task check-off — which
 * all take this — can't run against a Product that hasn't started.
 *
 * It names the Journey rather than holding its progress, which would go
 * stale the moment it advanced; `journeyState` reads that.
 */
export type StartedJourney = {
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

/** The Product's Journey on `version`, or `null` if it hasn't started one. */
export async function loadJourney(
  db: D1Database,
  product: OwnedProduct,
  version: FollowableVersion,
): Promise<StartedJourney | null> {
  const row = await db
    .prepare(
      'SELECT 1 FROM "journeys" WHERE "productId" = ? AND "versionId" = ?',
    )
    .bind(product.id, version.id)
    .first();
  return row ? ({ product, version } as StartedJourney) : null;
}

/**
 * Start the Product's Journey on `version` at its first Milestone, with its
 * one instance of each singleton Worksheet on the version (#139). Returns
 * whether a Journey was actually started — `false` means one already
 * existed, and it's left exactly as it was (a repeat start never resets
 * progress). A repeat start still creates any singleton instance that's
 * missing, which a Journey started before #139 would be.
 */
export async function startJourney(
  db: D1Database,
  product: OwnedProduct,
  version: FollowableVersion,
): Promise<boolean> {
  const { meta } = await db
    .prepare(
      'INSERT INTO "journeys" ("id", "productId", "versionId", "currentMilestoneId", "startedAt") VALUES (?, ?, ?, ?, ?) ON CONFLICT ("productId", "versionId") DO NOTHING',
    )
    .bind(
      crypto.randomUUID(),
      product.id,
      version.id,
      version.milestones[0].id,
      new Date().toISOString(),
    )
    .run();
  await createSingletonInstances(db, product, version.id);
  return meta.changes > 0;
}

/**
 * Advance the Journey by exactly one Milestone. Once completed, this is a
 * no-op — the same "repeat is harmless" shape `startJourney` has.
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
       WHERE "productId" = ? AND "versionId" = ? AND "finishedAt" IS NULL`,
    )
    .bind(new Date().toISOString(), journey.product.id, journey.version.id)
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
 * Return there; a request anyway leaves the Journey as it was.
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
       WHERE "productId" = ? AND "versionId" = ?`,
    )
    .bind(journey.product.id, journey.version.id)
    .run();
}

/**
 * The Worksheet and the Product's answers on its instance, or `null` if there's
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
         WHERE "worksheet_instances"."productId" = ? AND "worksheet_instances"."versionId" = ?
           AND "worksheet_instances"."worksheetId" = ? AND "worksheet_instances"."singleton" = 1`,
      )
      .bind(journey.product.id, journey.version.id, worksheetId)
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
 * Replace every answer on the Product's instance of a singleton Worksheet with
 * `answers` — a field left out reads as blank afterwards. Creates the instance
 * first if it's missing (a Journey started before #139 has none).
 *
 * Only singleton Worksheets have any content yet (the Product Summary), so
 * the instance is addressed by (Product, Path version, Worksheet). A
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
  const { product } = journey;
  const versionId = journey.version.id;
  const instanceId = `(SELECT "id" FROM "worksheet_instances" WHERE "productId" = ? AND "versionId" = ? AND "worksheetId" = ? AND "singleton" = 1)`;
  await db.batch([
    db
      .prepare(
        'INSERT INTO "worksheet_instances" ("id", "productId", "versionId", "worksheetId", "singleton", "createdAt") VALUES (?, ?, ?, ?, 1, ?) ON CONFLICT DO NOTHING',
      )
      .bind(
        crypto.randomUUID(),
        product.id,
        versionId,
        worksheetId,
        new Date().toISOString(),
      ),
    db
      .prepare(
        `DELETE FROM "worksheet_answers" WHERE "instanceId" = ${instanceId}`,
      )
      .bind(product.id, versionId, worksheetId),
    ...Object.entries(answers).map(([fieldId, value]) =>
      db
        .prepare(
          `INSERT INTO "worksheet_answers" ("instanceId", "fieldId", "value") VALUES (${instanceId}, ?, ?)`,
        )
        .bind(product.id, versionId, worksheetId, fieldId, value),
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
  const { product } = journey;
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
            'INSERT INTO "task_completions" ("productId", "versionId", "taskId", "completedAt") VALUES (?, ?, ?, ?) ON CONFLICT DO NOTHING',
          )
          .bind(product.id, versionId, taskId, new Date().toISOString())
      : db
          .prepare(
            'DELETE FROM "task_completions" WHERE "productId" = ? AND "versionId" = ? AND "taskId" = ?',
          )
          .bind(product.id, versionId, taskId)
  ).run();
  return true;
}

/**
 * What `/api/products/:productId/journey` answers with: the Path version
 * with its Milestones (still under `path`, which the page reads), the
 * Product's Journey on it (`null` until started), the Worksheets on its
 * Milestones with how much of each is filled in (#139), and the Tasks on
 * them with whether each is checked off (#140).
 */
export async function journeyState(
  db: D1Database,
  product: OwnedProduct,
  version: FollowableVersion,
): Promise<{
  path: { id: string; name: string; milestones: readonly Milestone[] };
  journey: Journey | null;
  worksheets: WorksheetSummary[];
  tasks: TaskSummary[];
}> {
  const [journey, worksheets, tasks] = await Promise.all([
    db
      .prepare(
        'SELECT "startedAt", "currentMilestoneId", "finishedAt" FROM "journeys" WHERE "productId" = ? AND "versionId" = ?',
      )
      .bind(product.id, version.id)
      .first<Journey>(),
    worksheetSummaries(db, product, version.id),
    taskSummaries(db, product, version.id),
  ]);
  const { id, name, milestones } = version;
  return { path: { id, name, milestones }, journey, worksheets, tasks };
}

/**
 * Create the Product's one instance of every singleton Worksheet on
 * `versionId`'s Milestones, skipping any it already has — so it's safe to
 * call on every Journey start, repeat or not. Ids come from SQLite's
 * `randomblob`, since one `INSERT ... SELECT` can't call
 * `crypto.randomUUID()` per row.
 */
async function createSingletonInstances(
  db: D1Database,
  product: OwnedProduct,
  versionId: string,
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO "worksheet_instances" ("id", "productId", "versionId", "worksheetId", "singleton", "createdAt")
       SELECT lower(hex(randomblob(16))), ?, ?, "worksheets"."id", 1, ?
       FROM "worksheets"
       WHERE "worksheets"."cardinality" = 'singleton'
         AND "worksheets"."id" IN (
           SELECT "milestone_worksheets"."worksheetId" FROM "milestone_worksheets"
           JOIN "milestones" ON "milestones"."id" = "milestone_worksheets"."milestoneId"
           WHERE "milestones"."versionId" = ?
         )
       ON CONFLICT DO NOTHING`,
    )
    .bind(product.id, versionId, new Date().toISOString(), versionId)
    .run();
}

/**
 * Every Worksheet on `versionId`'s Milestones, in the order its first
 * Milestone comes, with how many of the Product's answers are filled in.
 */
async function worksheetSummaries(
  db: D1Database,
  product: OwnedProduct,
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
         WHERE "worksheet_instances"."productId" = ? AND "worksheet_instances"."versionId" = ?
           AND "worksheet_instances"."singleton" = 1
         GROUP BY "worksheet_instances"."worksheetId"`,
      )
      .bind(product.id, versionId)
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
 * comes (then its place on that Milestone), with whether the Product has
 * checked it off.
 */
async function taskSummaries(
  db: D1Database,
  product: OwnedProduct,
  versionId: string,
): Promise<TaskSummary[]> {
  const { results } = await db
    .prepare(
      `SELECT "tasks"."id", "tasks"."title", "milestone_tasks"."milestoneId",
         EXISTS (
           SELECT 1 FROM "task_completions"
           WHERE "productId" = ? AND "versionId" = ? AND "taskId" = "tasks"."id"
         ) AS "done"
       FROM "milestone_tasks"
       JOIN "milestones" ON "milestones"."id" = "milestone_tasks"."milestoneId"
       JOIN "tasks" ON "tasks"."id" = "milestone_tasks"."taskId"
       WHERE "milestones"."versionId" = ?
       ORDER BY "milestones"."position" ASC, "milestone_tasks"."position" ASC`,
    )
    .bind(product.id, versionId, versionId)
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

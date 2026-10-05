/**
 * Worksheets (issue #139, parent #133): sets of fields a Path's
 * Milestones hold, filled in per Product.
 *
 * Plain data-access functions over the `worksheets`/`worksheet_*` tables
 * (`migrations/0013_*.sql`) — the HTTP boundary lives in `index.ts`'s
 * `/api/products/:productId/worksheets/:worksheetId` routes, the same split
 * `journeys.ts` has. Nothing here re-checks that `productId` belongs to the
 * caller — the route already will have, via `getProduct`.
 *
 * Only singleton Worksheets have any content yet (the Rough One-Pager), so
 * reading and saving answers addresses a Worksheet's one copy by
 * (Product, Path, Worksheet). A repeatable Worksheet's copies will need
 * their own ids in the URL once one is authored.
 */

import type { Journey } from "./journeys";

/** Longest answer a Worksheet field takes, in characters. */
export const WORKSHEET_ANSWER_MAX_LENGTH = 1000;

export interface WorksheetField {
  id: string;
  name: string;
  /** The question the field asks, shown under its name. */
  prompt: string;
}

export interface Worksheet {
  id: string;
  name: string;
  cardinality: "singleton" | "repeatable";
  /** Every field, in order. */
  fields: WorksheetField[];
  /** The Milestones it's on, in their Path's order. */
  milestoneIds: string[];
}

/** A Worksheet's filled-in fields, by field id. A blank field is absent. */
export type WorksheetAnswers = Record<string, string>;

/**
 * What the Journey page needs to link to a Worksheet: where it's on and how
 * much of the Product's copy is filled in.
 */
export interface WorksheetSummary {
  id: string;
  name: string;
  milestoneIds: string[];
  filled: number;
  total: number;
}

/** A Worksheet from the catalog, or `null` if there's no such Worksheet. */
export async function getWorksheet(
  db: D1Database,
  worksheetId: string,
): Promise<Worksheet | null> {
  const [worksheet, { results: fields }, { results: milestones }] =
    await Promise.all([
      db
        .prepare(
          'SELECT "id", "name", "cardinality" FROM "worksheets" WHERE "id" = ?',
        )
        .bind(worksheetId)
        .first<Omit<Worksheet, "fields" | "milestoneIds">>(),
      db
        .prepare(
          'SELECT "id", "name", "prompt" FROM "worksheet_fields" WHERE "worksheetId" = ? ORDER BY "position" ASC',
        )
        .bind(worksheetId)
        .all<WorksheetField>(),
      db
        .prepare(
          'SELECT "milestones"."id" FROM "milestone_worksheets" JOIN "milestones" ON "milestones"."id" = "milestone_worksheets"."milestoneId" WHERE "milestone_worksheets"."worksheetId" = ? ORDER BY "milestones"."position" ASC',
        )
        .bind(worksheetId)
        .all<{ id: string }>(),
    ]);
  if (!worksheet) {
    return null;
  }
  return { ...worksheet, fields, milestoneIds: milestones.map((m) => m.id) };
}

/**
 * Create the Product's one copy of every singleton Worksheet on `pathId`'s
 * Milestones, skipping any it already has — so it's safe to call on every
 * Journey start, repeat or not. Ids come from SQLite's `randomblob`, since
 * one `INSERT ... SELECT` can't call `crypto.randomUUID()` per row.
 */
export async function createSingletonInstances(
  db: D1Database,
  productId: string,
  pathId: string,
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO "worksheet_instances" ("id", "productId", "pathId", "worksheetId", "singleton", "createdAt")
       SELECT lower(hex(randomblob(16))), ?, ?, "worksheets"."id", 1, ?
       FROM "worksheets"
       WHERE "worksheets"."cardinality" = 'singleton'
         AND "worksheets"."id" IN (
           SELECT "milestone_worksheets"."worksheetId" FROM "milestone_worksheets"
           JOIN "milestones" ON "milestones"."id" = "milestone_worksheets"."milestoneId"
           WHERE "milestones"."pathId" = ?
         )
       ON CONFLICT DO NOTHING`,
    )
    .bind(productId, pathId, new Date().toISOString(), pathId)
    .run();
}

/** The Product's answers on its copy of a singleton Worksheet. */
export async function getAnswers(
  db: D1Database,
  productId: string,
  pathId: string,
  worksheetId: string,
): Promise<WorksheetAnswers> {
  const { results } = await db
    .prepare(
      `SELECT "worksheet_answers"."fieldId", "worksheet_answers"."value"
       FROM "worksheet_answers"
       JOIN "worksheet_instances" ON "worksheet_instances"."id" = "worksheet_answers"."instanceId"
       WHERE "worksheet_instances"."productId" = ? AND "worksheet_instances"."pathId" = ?
         AND "worksheet_instances"."worksheetId" = ? AND "worksheet_instances"."singleton" = 1`,
    )
    .bind(productId, pathId, worksheetId)
    .all<{ fieldId: string; value: string }>();
  return Object.fromEntries(results.map((r) => [r.fieldId, r.value]));
}

/**
 * Replace every answer on the Product's copy of a singleton Worksheet with
 * `answers` — a field left out reads as blank afterwards. Creates the copy
 * first if it's missing (a Journey started before #139 has none).
 *
 * One `batch`, which D1 runs as a single transaction, so a save never
 * half-applies (old answers deleted, new ones not yet written).
 */
export async function saveAnswers(
  db: D1Database,
  productId: string,
  pathId: string,
  worksheetId: string,
  answers: WorksheetAnswers,
): Promise<void> {
  const instanceId = `(SELECT "id" FROM "worksheet_instances" WHERE "productId" = ? AND "pathId" = ? AND "worksheetId" = ? AND "singleton" = 1)`;
  await db.batch([
    db
      .prepare(
        'INSERT INTO "worksheet_instances" ("id", "productId", "pathId", "worksheetId", "singleton", "createdAt") VALUES (?, ?, ?, ?, 1, ?) ON CONFLICT DO NOTHING',
      )
      .bind(
        crypto.randomUUID(),
        productId,
        pathId,
        worksheetId,
        new Date().toISOString(),
      ),
    db
      .prepare(
        `DELETE FROM "worksheet_answers" WHERE "instanceId" = ${instanceId}`,
      )
      .bind(productId, pathId, worksheetId),
    ...Object.entries(answers).map(([fieldId, value]) =>
      db
        .prepare(
          `INSERT INTO "worksheet_answers" ("instanceId", "fieldId", "value") VALUES (${instanceId}, ?, ?)`,
        )
        .bind(productId, pathId, worksheetId, fieldId, value),
    ),
  ]);
}

/**
 * Every Worksheet on `pathId`'s Milestones, in the order its first
 * Milestone comes, with how many of the Product's answers are filled in.
 */
export async function worksheetSummaries(
  db: D1Database,
  productId: string,
  pathId: string,
): Promise<WorksheetSummary[]> {
  const [{ results: links }, { results: filledCounts }] = await Promise.all([
    db
      .prepare(
        `SELECT "worksheets"."id", "worksheets"."name", "milestone_worksheets"."milestoneId",
           (SELECT COUNT(*) FROM "worksheet_fields" WHERE "worksheetId" = "worksheets"."id") AS "total"
         FROM "milestone_worksheets"
         JOIN "milestones" ON "milestones"."id" = "milestone_worksheets"."milestoneId"
         JOIN "worksheets" ON "worksheets"."id" = "milestone_worksheets"."worksheetId"
         WHERE "milestones"."pathId" = ?
         ORDER BY "milestones"."position" ASC, "worksheets"."id" ASC`,
      )
      .bind(pathId)
      .all<{ id: string; name: string; milestoneId: string; total: number }>(),
    db
      .prepare(
        `SELECT "worksheet_instances"."worksheetId", COUNT(*) AS "filled"
         FROM "worksheet_answers"
         JOIN "worksheet_instances" ON "worksheet_instances"."id" = "worksheet_answers"."instanceId"
         WHERE "worksheet_instances"."productId" = ? AND "worksheet_instances"."pathId" = ?
           AND "worksheet_instances"."singleton" = 1
         GROUP BY "worksheet_instances"."worksheetId"`,
      )
      .bind(productId, pathId)
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
 * What `/api/products/:productId/worksheets/:worksheetId` answers with: the
 * Worksheet, the Product's answers on it, and whether they can be changed
 * right now — only while the Journey's current Milestone is one the
 * Worksheet is on (#139: the one-pager is editable on Milestones 1-4, not
 * once the product itself is the evidence). `null` when there's no such
 * Worksheet or no Journey to fill it in on.
 */
export async function worksheetState(
  db: D1Database,
  productId: string,
  pathId: string,
  worksheetId: string,
  journey: Journey | null,
): Promise<{
  worksheet: Worksheet;
  answers: WorksheetAnswers;
  editable: boolean;
} | null> {
  if (!journey) {
    return null;
  }
  const [worksheet, answers] = await Promise.all([
    getWorksheet(db, worksheetId),
    getAnswers(db, productId, pathId, worksheetId),
  ]);
  if (!worksheet) {
    return null;
  }
  const editable =
    journey.finishedAt === null &&
    worksheet.milestoneIds.includes(journey.currentMilestoneId);
  return { worksheet, answers, editable };
}

/**
 * Check a submitted `answers` body against a Worksheet's fields: an object
 * of strings, every key one of its fields, none over
 * `WORKSHEET_ANSWER_MAX_LENGTH` once trimmed. Returns the trimmed answers
 * with blanks dropped, or `null` if the body doesn't fit.
 */
export function parseAnswers(
  worksheet: Worksheet,
  submitted: unknown,
): WorksheetAnswers | null {
  if (
    typeof submitted !== "object" ||
    submitted === null ||
    Array.isArray(submitted)
  ) {
    return null;
  }
  const fieldIds = new Set(worksheet.fields.map((f) => f.id));
  const answers: WorksheetAnswers = {};
  for (const [fieldId, value] of Object.entries(submitted)) {
    if (!fieldIds.has(fieldId) || typeof value !== "string") {
      return null;
    }
    const trimmed = value.trim();
    if (trimmed.length > WORKSHEET_ANSWER_MAX_LENGTH) {
      return null;
    }
    if (trimmed) {
      answers[fieldId] = trimmed;
    }
  }
  return answers;
}

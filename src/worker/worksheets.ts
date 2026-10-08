/**
 * Worksheets (issue #139, parent #133): sets of fields a Path's
 * Milestones hold. This is the fixed content every Product shares — the
 * catalog over `worksheets`/`worksheet_fields` (`migrations/0013_*.sql`)
 * and the rule for what a filled-in field may hold. A Product's own instances
 * and answers belong to its Journey, in `journeys.ts`.
 */

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

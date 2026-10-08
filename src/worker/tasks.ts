/**
 * Tasks (issue #140, parent #133): things a Path's Milestones ask the User
 * to do, checked off per Product.
 *
 * Plain data-access functions over `tasks`/`milestone_tasks`/
 * `task_completions` (`migrations/0017_*.sql`) — the HTTP boundary lives in
 * `product-routes.ts`'s `/tasks/:taskId` route, the same split
 * `worksheets.ts` has. Each takes an `OwnedProduct`, so ownership is
 * already settled by the time one runs.
 *
 * Every Task is standalone for now: the User checks it off by hand.
 * Checking one off is purely informational — nothing in `journeys.ts`
 * reads it, so it never gates Advance (#133).
 */

import type { OwnedProduct } from "./products";

/** What the Journey page needs to show a Task: where it's on and whether it's checked off. */
export interface TaskSummary {
  id: string;
  title: string;
  /** The Milestones it's on, in their Path's order. */
  milestoneIds: string[];
  done: boolean;
}

/**
 * Every Task on `pathId`'s Milestones, in the order its first Milestone
 * comes (then its place on that Milestone), with whether the Product has
 * checked it off.
 */
export async function taskSummaries(
  db: D1Database,
  product: OwnedProduct,
  pathId: string,
): Promise<TaskSummary[]> {
  const { results } = await db
    .prepare(
      `SELECT "tasks"."id", "tasks"."title", "milestone_tasks"."milestoneId",
         EXISTS (
           SELECT 1 FROM "task_completions"
           WHERE "productId" = ? AND "pathId" = ? AND "taskId" = "tasks"."id"
         ) AS "done"
       FROM "milestone_tasks"
       JOIN "milestones" ON "milestones"."id" = "milestone_tasks"."milestoneId"
       JOIN "tasks" ON "tasks"."id" = "milestone_tasks"."taskId"
       WHERE "milestones"."pathId" = ?
       ORDER BY "milestones"."position" ASC, "milestone_tasks"."position" ASC`,
    )
    .bind(product.id, pathId, pathId)
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

/**
 * Check off (`done`) or uncheck a Task for the Product's Journey on
 * `pathId`. Returns `false` if the Task isn't on any of the Path's
 * Milestones, changing nothing. Repeating either is harmless: checking an
 * already-checked Task keeps its first `completedAt`.
 */
export async function setTaskDone(
  db: D1Database,
  product: OwnedProduct,
  pathId: string,
  taskId: string,
  done: boolean,
): Promise<boolean> {
  const onPath = await db
    .prepare(
      'SELECT 1 FROM "milestone_tasks" JOIN "milestones" ON "milestones"."id" = "milestone_tasks"."milestoneId" WHERE "milestone_tasks"."taskId" = ? AND "milestones"."pathId" = ?',
    )
    .bind(taskId, pathId)
    .first();
  if (!onPath) {
    return false;
  }

  await (
    done
      ? db
          .prepare(
            'INSERT INTO "task_completions" ("productId", "pathId", "taskId", "completedAt") VALUES (?, ?, ?, ?) ON CONFLICT DO NOTHING',
          )
          .bind(product.id, pathId, taskId, new Date().toISOString())
      : db
          .prepare(
            'DELETE FROM "task_completions" WHERE "productId" = ? AND "pathId" = ? AND "taskId" = ?',
          )
          .bind(product.id, pathId, taskId)
  ).run();
  return true;
}

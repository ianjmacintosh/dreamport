import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";

import { TEST_EMAILS } from "../../test/emails";
import {
  advanceJourney,
  journeyState,
  loadJourney,
  returnJourney,
  saveAnswers,
  setTaskDone,
  startJourney,
  worksheetState,
  type StartedJourney,
} from "./journeys";
import { createProduct, getProduct, type OwnedProduct } from "./products";

/**
 * The Journey module at its own interface (#156): called directly against
 * the real, migrated D1 test database, with no sign-in or HTTP. The routes
 * over it are covered, one test each, in `index.worker.test.ts`.
 */

const USER_ID = "journeys-module-user";

/** A fresh Product, owned by this file's one User. */
async function newProduct(): Promise<OwnedProduct> {
  const now = new Date().toISOString();
  await env.DB.prepare(
    'INSERT INTO "user" ("id", "name", "email", "emailVerified", "createdAt", "updatedAt") VALUES (?, ?, ?, 1, ?, ?) ON CONFLICT DO NOTHING',
  )
    .bind(USER_ID, "Journeys", TEST_EMAILS.journeysModule, now, now)
    .run();
  const { id } = await createProduct(env.DB, USER_ID, "A phone-scale app");
  const product = await getProduct(env.DB, USER_ID, id);
  if (!product) throw new Error("the Product just created isn't there");
  return product;
}

/** A fresh Product with its Journey started. */
async function started(): Promise<{
  product: OwnedProduct;
  journey: StartedJourney;
  milestoneIds: string[];
}> {
  const product = await newProduct();
  await startJourney(env.DB, product);
  const journey = await loadJourney(env.DB, product);
  if (!journey) throw new Error("the Journey just started isn't there");
  const { path } = await journeyState(env.DB, product);
  return { product, journey, milestoneIds: path.milestones.map((m) => m.id) };
}

/** Where the Product's Journey stands, as the Journey page reads it. */
async function progress(product: OwnedProduct) {
  return (await journeyState(env.DB, product)).journey;
}

async function advanceTimes(journey: StartedJourney, times: number) {
  for (let i = 0; i < times; i++) {
    await advanceJourney(env.DB, journey);
  }
}

const PRODUCT_SUMMARY = "product-summary";
const COMPLETE_SUMMARY_TASK = "complete-product-summary";
const EVENT_TASK = "event-schedule-product-summary";
const TALK_TASK = "talk-to-five-customers";

/** How many instances of a Worksheet a Product has. */
async function countWorksheetInstances(productId: string, worksheetId: string) {
  const row = await env.DB.prepare(
    'SELECT COUNT(*) AS n FROM "worksheet_instances" WHERE "productId" = ? AND "worksheetId" = ?',
  )
    .bind(productId, worksheetId)
    .first<{ n: number }>();
  return row?.n;
}

describe("starting a Journey", () => {
  it("has no Journey to load before it starts, but still shows the Path", async () => {
    const product = await newProduct();

    expect(await loadJourney(env.DB, product)).toBeNull();
    const state = await journeyState(env.DB, product);
    expect(state.journey).toBeNull();
    expect(state.path.milestones.map((m) => m.name)).toEqual([
      "Rough One-Pager",
      "Real Talk",
      "Solution Matchmaking",
      "Make It Real",
      "Observe & Refine",
      "Open Enrollment",
      "Growth",
    ]);
  });

  it("starts on Milestone 1 with one instance of each singleton Worksheet", async () => {
    const product = await newProduct();

    expect(await startJourney(env.DB, product)).toBe(true);
    const { path, journey, worksheets, tasks } = await journeyState(
      env.DB,
      product,
    );
    expect(journey).toEqual({
      startedAt: expect.any(String),
      currentMilestoneId: path.milestones[0].id,
      finishedAt: null,
    });
    expect(await countWorksheetInstances(product.id, PRODUCT_SUMMARY)).toBe(1);
    expect(worksheets).toEqual([
      {
        id: PRODUCT_SUMMARY,
        name: "Product Summary",
        milestoneIds: path.milestones.slice(0, 4).map((m) => m.id),
        filled: 0,
        total: 8,
      },
    ]);
    expect(tasks).toEqual([
      {
        id: COMPLETE_SUMMARY_TASK,
        title: "Complete the Product Summary",
        milestoneIds: [path.milestones[0].id],
        done: false,
      },
      {
        id: EVENT_TASK,
        title: "EVENT: Schedule time to write the Product Summary (optional)",
        milestoneIds: [path.milestones[0].id],
        done: false,
      },
      {
        id: TALK_TASK,
        title: "Talk to 5 potential customers",
        milestoneIds: [path.milestones[1].id],
        done: false,
      },
    ]);
  });

  it("leaves a started Journey as it was on a repeat start", async () => {
    const { product, journey } = await started();
    await advanceJourney(env.DB, journey);
    const before = await progress(product);

    expect(await startJourney(env.DB, product)).toBe(false);
    expect(await progress(product)).toEqual(before);
    expect(await countWorksheetInstances(product.id, PRODUCT_SUMMARY)).toBe(1);
  });
});

describe("Advance", () => {
  it("moves one Milestone at a time through every Milestone, then completes on the last", async () => {
    const { product, journey, milestoneIds } = await started();
    expect(milestoneIds).toHaveLength(7);

    for (const milestoneId of milestoneIds.slice(1)) {
      await advanceJourney(env.DB, journey);
      expect(await progress(product)).toEqual({
        startedAt: expect.any(String),
        currentMilestoneId: milestoneId,
        finishedAt: null,
      });
    }

    // Growth is last: advancing from it completes the Journey and leaves
    // Growth current, since there's no Milestone after it.
    await advanceJourney(env.DB, journey);
    expect(await progress(product)).toEqual({
      startedAt: expect.any(String),
      currentMilestoneId: milestoneIds[6],
      finishedAt: expect.any(String),
    });
  });

  it("leaves a completed Journey as it was", async () => {
    const { product, journey } = await started();
    await advanceTimes(journey, 7);
    const completed = await progress(product);

    await advanceJourney(env.DB, journey);
    expect(await progress(product)).toEqual(completed);
  });
});

describe("Return", () => {
  it("puts a completed Journey back in progress first, then moves back one Milestone at a time", async () => {
    const { product, journey, milestoneIds } = await started();
    await advanceTimes(journey, 7);

    await returnJourney(env.DB, journey);
    expect(await progress(product)).toEqual({
      startedAt: expect.any(String),
      currentMilestoneId: milestoneIds[6],
      finishedAt: null,
    });

    for (const milestoneId of milestoneIds.slice(0, 6).reverse()) {
      await returnJourney(env.DB, journey);
      expect((await progress(product))?.currentMilestoneId).toBe(milestoneId);
    }
  });

  it("leaves a Journey on Milestone 1 as it was", async () => {
    const { product, journey } = await started();
    const before = await progress(product);

    await returnJourney(env.DB, journey);
    expect(await progress(product)).toEqual(before);
  });
});

describe("Worksheets", () => {
  it("reads the Worksheet with no answers on a fresh Journey", async () => {
    const { journey, milestoneIds } = await started();

    const state = await worksheetState(env.DB, journey, PRODUCT_SUMMARY);
    expect(state?.worksheet).toMatchObject({
      id: PRODUCT_SUMMARY,
      name: "Product Summary",
      cardinality: "singleton",
      milestoneIds: milestoneIds.slice(0, 4),
    });
    expect(state?.answers).toEqual({});
  });

  it("has no state for a Worksheet that doesn't exist", async () => {
    const { journey } = await started();

    expect(await worksheetState(env.DB, journey, "not-a-worksheet")).toBeNull();
  });

  it("saves on any Milestone, past the ones it's on, and once completed, into the one instance", async () => {
    const { product, journey } = await started();

    for (let milestone = 1; milestone <= 7; milestone++) {
      await saveAnswers(env.DB, journey, PRODUCT_SUMMARY, {
        problem: `On ${milestone}`,
      });
      expect(
        (await worksheetState(env.DB, journey, PRODUCT_SUMMARY))?.answers,
      ).toEqual({ problem: `On ${milestone}` });
      await advanceJourney(env.DB, journey);
    }
    expect((await progress(product))?.finishedAt).not.toBeNull();

    await saveAnswers(env.DB, journey, PRODUCT_SUMMARY, {
      problem: "Completed",
      customer: "Home bakers",
    });
    expect(
      (await worksheetState(env.DB, journey, PRODUCT_SUMMARY))?.answers,
    ).toEqual({ problem: "Completed", customer: "Home bakers" });
    expect(await countWorksheetInstances(product.id, PRODUCT_SUMMARY)).toBe(1);
  });

  it("replaces every answer on a save, and the Journey page counts what's filled", async () => {
    const { product, journey } = await started();
    await saveAnswers(env.DB, journey, PRODUCT_SUMMARY, {
      problem: "Kitchen scales are clunky",
      customer: "Home bakers",
    });

    await saveAnswers(env.DB, journey, PRODUCT_SUMMARY, {
      problem: "Scales are clunky",
      solution: "An app",
    });
    expect(
      (await worksheetState(env.DB, journey, PRODUCT_SUMMARY))?.answers,
    ).toEqual({ problem: "Scales are clunky", solution: "An app" });
    expect((await journeyState(env.DB, product)).worksheets[0]).toMatchObject({
      id: PRODUCT_SUMMARY,
      filled: 2,
      total: 8,
    });
  });

  it("creates the instance on save when a Journey started without one", async () => {
    const { product, journey } = await started();
    // A Journey started before #139 has no Worksheet instances.
    await env.DB.prepare(
      'DELETE FROM "worksheet_instances" WHERE "productId" = ?',
    )
      .bind(product.id)
      .run();

    await saveAnswers(env.DB, journey, PRODUCT_SUMMARY, { problem: "Late" });
    expect(
      (await worksheetState(env.DB, journey, PRODUCT_SUMMARY))?.answers,
    ).toEqual({ problem: "Late" });
    expect(await countWorksheetInstances(product.id, PRODUCT_SUMMARY)).toBe(1);
  });
});

describe("Tasks", () => {
  /** Whether the Product has `taskId` checked off, as the Journey page reads it. */
  async function isDone(product: OwnedProduct, taskId: string) {
    const { tasks } = await journeyState(env.DB, product);
    return tasks.find((t) => t.id === taskId)?.done;
  }

  it("checks and unchecks one Task, and a repeat of either is harmless", async () => {
    const { product, journey } = await started();

    expect(await setTaskDone(env.DB, journey, TALK_TASK, true)).toBe(true);
    expect(await setTaskDone(env.DB, journey, TALK_TASK, true)).toBe(true);
    expect(await isDone(product, TALK_TASK)).toBe(true);
    expect(await isDone(product, EVENT_TASK)).toBe(false);

    expect(await setTaskDone(env.DB, journey, TALK_TASK, false)).toBe(true);
    expect(await setTaskDone(env.DB, journey, TALK_TASK, false)).toBe(true);
    expect(await isDone(product, TALK_TASK)).toBe(false);
  });

  it("changes nothing for a Task that isn't on the Path", async () => {
    const { product, journey } = await started();

    expect(await setTaskDone(env.DB, journey, "not-a-task", true)).toBe(false);
    const { tasks } = await journeyState(env.DB, product);
    expect(tasks.every((t) => !t.done)).toBe(true);
  });

  it("never gates Advance, and moving the Journey never clears a check", async () => {
    const { product, journey, milestoneIds } = await started();

    // Milestone 1's Tasks unchecked: Advance still moves on.
    await advanceJourney(env.DB, journey);
    expect((await progress(product))?.currentMilestoneId).toBe(milestoneIds[1]);

    // A Task on a Milestone that isn't current can be checked, and checking
    // it doesn't move the Journey.
    await setTaskDone(env.DB, journey, EVENT_TASK, true);
    expect((await progress(product))?.currentMilestoneId).toBe(milestoneIds[1]);

    await returnJourney(env.DB, journey);
    expect(await isDone(product, EVENT_TASK)).toBe(true);

    await advanceJourney(env.DB, journey);
    expect((await progress(product))?.currentMilestoneId).toBe(milestoneIds[1]);
    expect(await isDone(product, EVENT_TASK)).toBe(true);
  });
});

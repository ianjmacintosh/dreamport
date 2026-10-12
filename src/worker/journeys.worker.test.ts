import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";

import { TEST_EMAILS } from "../../test/emails";
import {
  advanceJourney,
  journeyState,
  listJourneys,
  loadJourney,
  returnJourney,
  saveAnswers,
  setTaskDone,
  startJourney,
  worksheetState,
  type StartedJourney,
} from "./journeys";
import {
  addTask,
  createPath,
  type FollowableVersion,
  getVersion,
  saveVersion,
  updatePath,
} from "./paths";
import { createProduct, getProduct, type OwnedProduct } from "./products";

/**
 * The Journey module at its own interface (#156): called directly against
 * the real, migrated D1 test database, with no sign-in or HTTP. The routes
 * over it are covered, one test each, in `index.worker.test.ts`.
 */

const USER_ID = "journeys-module-user";
const STRANGER_ID = "journeys-module-stranger";

const EMAILS: Record<string, string> = {
  [USER_ID]: TEST_EMAILS.journeysModule,
  [STRANGER_ID]: TEST_EMAILS.journeysModuleStranger,
};

/** Storage resets between tests, so each one seeds the Users it needs. */
async function seedUser(id: string) {
  const now = new Date().toISOString();
  await env.DB.prepare(
    'INSERT INTO "user" ("id", "name", "email", "emailVerified", "createdAt", "updatedAt") VALUES (?, ?, ?, 1, ?, ?) ON CONFLICT DO NOTHING',
  )
    .bind(id, "Journeys", EMAILS[id], now, now)
    .run();
}

/** Dream Sequence version 1, the version most Journeys here are on. */
const version = await followable(USER_ID, "starter");

async function followable(userId: string, versionId: string) {
  const found = await getVersion(env.DB, userId, versionId);
  if (!found) throw new Error(`${userId} can't follow ${versionId}`);
  return found;
}

/** A fresh Product, owned by `userId`. */
async function newProduct(userId = USER_ID): Promise<OwnedProduct> {
  await seedUser(userId);
  const { id } = await createProduct(env.DB, userId, "A phone-scale app");
  const product = await getProduct(env.DB, userId, id);
  if (!product) throw new Error("the Product just created isn't there");
  return product;
}

/**
 * A saved version of `userId`'s own Path, made in Trailblazer's Paths
 * module: two Milestones, the first with one Task.
 */
async function ownVersion(userId = USER_ID): Promise<FollowableVersion> {
  await seedUser(userId);
  const created = await createPath(env.DB, userId, {
    name: "Weekend Launch",
    description: "Two days to sign-ups.",
  });
  if (!created.ok) throw new Error("at the Path cap");
  const milestone = (name: string) => ({
    name,
    description: `${name}, all of it.`,
    doneWhen: `${name} is done.`,
    outcome: "",
  });
  const updated = await updatePath(env.DB, created.path, {
    name: "Weekend Launch",
    description: "Two days to sign-ups.",
    milestones: [milestone("Pick a Problem"), milestone("Ship a Page")],
  });
  if (!updated.ok) throw new Error(`not updated: ${updated.reason}`);
  await addTask(env.DB, created.path, updated.draft.milestones[0].id, {
    title: "Write it down",
  });
  const saved = await saveVersion(env.DB, created.path);
  if (!saved.ok) throw new Error(`not saved: ${saved.missing.join(", ")}`);
  return followable(userId, saved.version.id);
}

/** A Journey on `on`, started and loaded the way the routes do it. */
async function startOn(
  product: OwnedProduct,
  on: FollowableVersion,
): Promise<StartedJourney> {
  const { journeyId } = await startJourney(env.DB, product, on);
  const journey = await loadJourney(env.DB, product, journeyId);
  if (!journey) throw new Error("the Journey just started isn't there");
  return journey;
}

/** A fresh Product with its Journey on Dream Sequence started. */
async function started(): Promise<{
  product: OwnedProduct;
  journey: StartedJourney;
  milestoneIds: string[];
}> {
  const product = await newProduct();
  const journey = await startOn(product, version);
  return {
    product,
    journey,
    milestoneIds: version.milestones.map((m) => m.id),
  };
}

/** Where the Journey stands, as the Journey page reads it. */
async function progress(journey: StartedJourney) {
  return (await journeyState(env.DB, journey)).journey;
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
  it("has no Journeys before one starts", async () => {
    const product = await newProduct();

    expect(await listJourneys(env.DB, product)).toEqual([]);
    expect(await loadJourney(env.DB, product, "not-a-journey")).toBeNull();
  });

  it("starts on Milestone 1 with one instance of each singleton Worksheet", async () => {
    const product = await newProduct();

    const { journeyId, started } = await startJourney(env.DB, product, version);
    expect(started).toBe(true);
    const journey = await loadJourney(env.DB, product, journeyId);
    if (!journey) throw new Error("the Journey just started isn't there");
    const { path, worksheets, tasks, ...state } = await journeyState(
      env.DB,
      journey,
    );
    expect(path.milestones.map((m) => m.name)).toEqual([
      "Rough One-Pager",
      "Real Talk",
      "Solution Matchmaking",
      "Make It Real",
      "Observe & Refine",
      "Open Enrollment",
      "Growth",
    ]);
    expect(state.journey).toEqual({
      id: journeyId,
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

  it("starts on Milestone 1 of a User's own saved version, with its Tasks", async () => {
    const product = await newProduct();
    const own = await ownVersion();

    const journey = await startOn(product, own);
    const state = await journeyState(env.DB, journey);
    expect(state.path).toEqual({
      id: own.id,
      name: "Weekend Launch",
      milestones: own.milestones,
    });
    expect(state.journey.currentMilestoneId).toBe(own.milestones[0].id);
    expect(state.tasks).toEqual([
      {
        id: expect.any(String),
        title: "Write it down",
        milestoneIds: [own.milestones[0].id],
        done: false,
      },
    ]);
  });

  it("leaves a started Journey as it was on a repeat start, and names it again", async () => {
    const { product, journey } = await started();
    await advanceJourney(env.DB, journey);
    const before = await progress(journey);

    expect(await startJourney(env.DB, product, version)).toEqual({
      journeyId: journey.id,
      started: false,
    });
    expect(await progress(journey)).toEqual(before);
    expect(await countWorksheetInstances(product.id, PRODUCT_SUMMARY)).toBe(1);
  });

  it("keeps a Journey per version: Dream Sequence and the User's own, listed oldest first", async () => {
    const product = await newProduct();
    const own = await ownVersion();
    const dream = await startOn(product, version);
    await advanceJourney(env.DB, dream);
    const mine = await startOn(product, own);

    expect(mine.id).not.toBe(dream.id);
    expect(await listJourneys(env.DB, product)).toEqual([
      {
        id: dream.id,
        pathId: "dream-sequence",
        pathName: "Dream Sequence",
        currentMilestoneName: "Real Talk",
        finishedAt: null,
      },
      {
        id: mine.id,
        pathId: own.pathId,
        pathName: "Weekend Launch",
        currentMilestoneName: "Pick a Problem",
        finishedAt: null,
      },
    ]);
  });
});

describe("another User's", () => {
  it("Journey is not found under this User's Product", async () => {
    const theirs = await startOn(await newProduct(STRANGER_ID), version);
    const mine = await newProduct();

    expect(await loadJourney(env.DB, mine, theirs.id)).toBeNull();
    expect(await listJourneys(env.DB, mine)).toEqual([]);
  });

  it("version can't carry a Journey of this User's Product", async () => {
    const theirs = await ownVersion(STRANGER_ID);
    const mine = await newProduct();
    // No route starts one (theirs isn't a FollowableVersion for this User),
    // so the row is written the way a bug would write it.
    await env.DB.prepare(
      'INSERT INTO "journeys" ("id", "productId", "versionId", "currentMilestoneId", "startedAt") VALUES (?, ?, ?, ?, ?)',
    )
      .bind(
        "stray-journey",
        mine.id,
        theirs.id,
        theirs.milestones[0].id,
        new Date().toISOString(),
      )
      .run();

    expect(await getVersion(env.DB, USER_ID, theirs.id)).toBeNull();
    expect(await loadJourney(env.DB, mine, "stray-journey")).toBeNull();
  });
});

describe("a Journey on a User's own version", () => {
  it("advances, completes, returns, and checks off its Tasks", async () => {
    const own = await ownVersion();
    const journey = await startOn(await newProduct(), own);
    const [first, second] = own.milestones.map((m) => m.id);

    await advanceJourney(env.DB, journey);
    expect((await progress(journey)).currentMilestoneId).toBe(second);
    await advanceJourney(env.DB, journey);
    expect(await progress(journey)).toMatchObject({
      currentMilestoneId: second,
      finishedAt: expect.any(String),
    });

    await returnJourney(env.DB, journey);
    await returnJourney(env.DB, journey);
    expect(await progress(journey)).toMatchObject({
      currentMilestoneId: first,
      finishedAt: null,
    });

    const [task] = (await journeyState(env.DB, journey)).tasks;
    expect(await setTaskDone(env.DB, journey, task.id, true)).toBe(true);
    expect((await journeyState(env.DB, journey)).tasks[0].done).toBe(true);
    expect(await setTaskDone(env.DB, journey, TALK_TASK, true)).toBe(false);
  });
});

describe("Advance", () => {
  it("moves one Milestone at a time through every Milestone, then completes on the last", async () => {
    const { journey, milestoneIds } = await started();
    expect(milestoneIds).toHaveLength(7);

    for (const milestoneId of milestoneIds.slice(1)) {
      await advanceJourney(env.DB, journey);
      expect(await progress(journey)).toEqual({
        id: journey.id,
        startedAt: expect.any(String),
        currentMilestoneId: milestoneId,
        finishedAt: null,
      });
    }

    // Growth is last: advancing from it completes the Journey and leaves
    // Growth current, since there's no Milestone after it.
    await advanceJourney(env.DB, journey);
    expect(await progress(journey)).toEqual({
      id: journey.id,
      startedAt: expect.any(String),
      currentMilestoneId: milestoneIds[6],
      finishedAt: expect.any(String),
    });
  });

  it("leaves a completed Journey as it was", async () => {
    const { journey } = await started();
    await advanceTimes(journey, 7);
    const completed = await progress(journey);

    await advanceJourney(env.DB, journey);
    expect(await progress(journey)).toEqual(completed);
  });
});

describe("Return", () => {
  it("puts a completed Journey back in progress first, then moves back one Milestone at a time", async () => {
    const { journey, milestoneIds } = await started();
    await advanceTimes(journey, 7);

    await returnJourney(env.DB, journey);
    expect(await progress(journey)).toEqual({
      id: journey.id,
      startedAt: expect.any(String),
      currentMilestoneId: milestoneIds[6],
      finishedAt: null,
    });

    for (const milestoneId of milestoneIds.slice(0, 6).reverse()) {
      await returnJourney(env.DB, journey);
      expect((await progress(journey)).currentMilestoneId).toBe(milestoneId);
    }
  });

  it("leaves a Journey on Milestone 1 as it was", async () => {
    const { journey } = await started();
    const before = await progress(journey);

    await returnJourney(env.DB, journey);
    expect(await progress(journey)).toEqual(before);
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
    expect((await progress(journey)).finishedAt).not.toBeNull();

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
    const { journey } = await started();
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
    expect((await journeyState(env.DB, journey)).worksheets[0]).toMatchObject({
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
  /** Whether the Journey has `taskId` checked off, as the Journey page reads it. */
  async function isDone(journey: StartedJourney, taskId: string) {
    const { tasks } = await journeyState(env.DB, journey);
    return tasks.find((t) => t.id === taskId)?.done;
  }

  it("checks and unchecks one Task, and a repeat of either is harmless", async () => {
    const { journey } = await started();

    expect(await setTaskDone(env.DB, journey, TALK_TASK, true)).toBe(true);
    expect(await setTaskDone(env.DB, journey, TALK_TASK, true)).toBe(true);
    expect(await isDone(journey, TALK_TASK)).toBe(true);
    expect(await isDone(journey, EVENT_TASK)).toBe(false);

    expect(await setTaskDone(env.DB, journey, TALK_TASK, false)).toBe(true);
    expect(await setTaskDone(env.DB, journey, TALK_TASK, false)).toBe(true);
    expect(await isDone(journey, TALK_TASK)).toBe(false);
  });

  it("changes nothing for a Task that isn't on the Path", async () => {
    const { journey } = await started();

    expect(await setTaskDone(env.DB, journey, "not-a-task", true)).toBe(false);
    const { tasks } = await journeyState(env.DB, journey);
    expect(tasks.every((t) => !t.done)).toBe(true);
  });

  it("never gates Advance, and moving the Journey never clears a check", async () => {
    const { journey, milestoneIds } = await started();

    // Milestone 1's Tasks unchecked: Advance still moves on.
    await advanceJourney(env.DB, journey);
    expect((await progress(journey)).currentMilestoneId).toBe(milestoneIds[1]);

    // A Task on a Milestone that isn't current can be checked, and checking
    // it doesn't move the Journey.
    await setTaskDone(env.DB, journey, EVENT_TASK, true);
    expect((await progress(journey)).currentMilestoneId).toBe(milestoneIds[1]);

    await returnJourney(env.DB, journey);
    expect(await isDone(journey, EVENT_TASK)).toBe(true);

    await advanceJourney(env.DB, journey);
    expect((await progress(journey)).currentMilestoneId).toBe(milestoneIds[1]);
    expect(await isDone(journey, EVENT_TASK)).toBe(true);
  });
});

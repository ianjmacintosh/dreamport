import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";

import { TEST_EMAILS } from "../../test/emails";
import {
  advanceJourney,
  loadJourney,
  returnJourney,
  saveAnswers,
  setTaskDone,
  startJourney,
} from "./journeys";
import {
  addMilestone,
  addTask,
  createPath,
  deleteMilestone,
  deleteTask,
  dreamSequence,
  getDraft,
  getPath,
  getVersion,
  listPaths,
  MILESTONE_NAME_MAX_LENGTH,
  type MilestoneFields,
  MILESTONES_AND_TASKS_PER_PATH,
  type OwnedPath,
  parseMilestoneFields,
  parsePathFields,
  parseTaskFields,
  PATHS_PER_USER,
  reorderMilestones,
  reorderTasks,
  TASK_TITLE_MAX_LENGTH,
  updateMilestone,
  updatePath,
  updateTask,
} from "./paths";
import { createProduct, getProduct } from "./products";

/**
 * The Paths module at its own interface (#166): called directly against
 * the real, migrated D1 test database, with no sign-in or HTTP.
 */

const FOLLOWER_ID = "paths-module-follower";
const OWNER_ID = "paths-module-owner";
const OWNERS_VERSION_ID = "owners-version";

async function seedUser(id: string, email: string) {
  const now = new Date().toISOString();
  await env.DB.prepare(
    'INSERT INTO "user" ("id", "name", "email", "emailVerified", "createdAt", "updatedAt") VALUES (?, ?, ?, 1, ?, ?) ON CONFLICT DO NOTHING',
  )
    .bind(id, "Paths", email, now, now)
    .run();
}

/**
 * A Path of the owner's own with one saved version. Raw SQL, since nothing
 * in the Worker makes one until a User can save a version (#169).
 */
async function seedOwnersPath() {
  await seedUser(OWNER_ID, TEST_EMAILS.pathsModuleOwner);
  const now = new Date().toISOString();
  await env.DB.batch([
    env.DB.prepare(
      'INSERT INTO "paths" ("id", "userId", "createdAt") VALUES (?, ?, ?) ON CONFLICT DO NOTHING',
    ).bind("owners-path", OWNER_ID, now),
    env.DB.prepare(
      'INSERT INTO "path_versions" ("id", "pathId", "number", "name", "description", "savedAt") VALUES (?, ?, 1, ?, ?, ?) ON CONFLICT DO NOTHING',
    ).bind(OWNERS_VERSION_ID, "owners-path", "Bakery Path", "For bakers", now),
    env.DB.prepare(
      'INSERT INTO "milestones" ("id", "versionId", "position", "name", "description", "doneWhen", "outcome") VALUES (?, ?, 1, ?, ?, ?, ?) ON CONFLICT DO NOTHING',
    ).bind(
      "owners-first",
      OWNERS_VERSION_ID,
      "Bake",
      "Bake a loaf.",
      "A loaf exists.",
      "Bread",
    ),
  ]);
}

describe("Dream Sequence", () => {
  it("is version 1 of Dreamport's Dream Sequence Path, with its seven Milestones in order", async () => {
    const version = await dreamSequence(env.DB);

    expect(version).toMatchObject({
      id: "starter",
      pathId: "dream-sequence",
      number: 1,
      name: "Dream Sequence",
    });
    expect(version.milestones.map((m) => [m.id, m.name, m.outcome])).toEqual([
      [
        "rough-one-pager",
        "Rough One-Pager",
        "Make a one-page summary of your understanding",
      ],
      [
        "real-talk",
        "Real Talk",
        "Learn from future customers by hearing their perspective",
      ],
      [
        "solution-matchmaking",
        "Solution Matchmaking",
        "Show a prototype and find its value",
      ],
      [
        "make-it-real",
        "Make It Real",
        "Build the essential core of your product",
      ],
      [
        "observe-and-refine",
        "Observe & Refine",
        "Hone your product to meet real user needs",
      ],
      [
        "open-enrollment",
        "Open Enrollment",
        "Watch real users and make your product essential",
      ],
      ["growth", "Growth", "Find your growth path"],
    ]);
  });

  it("can be followed by any User", async () => {
    await seedUser(FOLLOWER_ID, TEST_EMAILS.pathsModuleFollower);
    await seedOwnersPath();
    const version = await dreamSequence(env.DB);

    expect(await getVersion(env.DB, FOLLOWER_ID, "starter")).toEqual(version);
    expect(await getVersion(env.DB, OWNER_ID, "starter")).toEqual(version);
  });

  it("is the same after a Journey has been driven through every write", async () => {
    await seedUser(FOLLOWER_ID, TEST_EMAILS.pathsModuleFollower);
    const before = await dreamSequence(env.DB);
    const { id } = await createProduct(env.DB, FOLLOWER_ID, "A bakery app");
    const product = await getProduct(env.DB, FOLLOWER_ID, id);
    if (!product) throw new Error("the Product just created isn't there");

    await startJourney(env.DB, product, before);
    const journey = await loadJourney(env.DB, product, before);
    if (!journey) throw new Error("the Journey just started isn't there");
    await saveAnswers(env.DB, journey, "product-summary", { problem: "Dough" });
    await setTaskDone(env.DB, journey, "talk-to-five-customers", true);
    for (let i = 0; i < before.milestones.length; i++) {
      await advanceJourney(env.DB, journey);
    }
    await returnJourney(env.DB, journey);

    expect(await dreamSequence(env.DB)).toEqual(before);
  });
});

describe("a User's own Path version", () => {
  it("can be followed by its owner, with its Milestones", async () => {
    await seedOwnersPath();

    expect(await getVersion(env.DB, OWNER_ID, OWNERS_VERSION_ID)).toEqual({
      id: OWNERS_VERSION_ID,
      pathId: "owners-path",
      number: 1,
      name: "Bakery Path",
      description: "For bakers",
      savedAt: expect.any(String),
      milestones: [
        {
          id: "owners-first",
          name: "Bake",
          description: "Bake a loaf.",
          doneWhen: "A loaf exists.",
          outcome: "Bread",
        },
      ],
    });
  });

  it("is not found for another User", async () => {
    await seedUser(FOLLOWER_ID, TEST_EMAILS.pathsModuleFollower);
    await seedOwnersPath();

    expect(await getVersion(env.DB, FOLLOWER_ID, OWNERS_VERSION_ID)).toBeNull();
  });
});

it("finds no version for an unknown id", async () => {
  await seedUser(FOLLOWER_ID, TEST_EMAILS.pathsModuleFollower);

  expect(await getVersion(env.DB, FOLLOWER_ID, "not-a-version")).toBeNull();
});

const MAKER_ID = "paths-module-maker";
const STRANGER_ID = "paths-module-stranger";

const BAKE = {
  name: "Bake",
  description: "Bake a loaf.",
  doneWhen: "A loaf exists.",
  outcome: "Bread",
};
const SELL = {
  name: "Sell",
  description: "Sell the loaf.",
  doneWhen: "Someone paid.",
  outcome: "",
};
const SHIP = {
  name: "Ship",
  description: "Deliver the loaf.",
  doneWhen: "It arrived.",
  outcome: "",
};

/** A new Path of the maker's own, as `getPath` hands it back. */
async function makersPath(name = "Bakery Path") {
  await seedUser(MAKER_ID, TEST_EMAILS.pathsModuleMaker);
  const created = await createPath(env.DB, MAKER_ID, {
    name,
    description: "For bakers",
  });
  if (!created.ok) throw new Error("the maker is at the Path cap");
  const path = await getPath(env.DB, MAKER_ID, created.path.id);
  if (!path) throw new Error("the Path just created isn't there");
  return path;
}

async function milestoneOn(path: OwnedPath, fields: MilestoneFields) {
  const added = await addMilestone(env.DB, path, fields);
  if (!added.ok) throw new Error("the Draft is at the cap");
  return added.milestone;
}

async function taskOn(path: OwnedPath, milestoneId: string, title: string) {
  const added = await addTask(env.DB, path, milestoneId, { title });
  if (!added.ok) throw new Error(`no Task added: ${added.reason}`);
  return added.task;
}

async function milestoneNames(path: OwnedPath) {
  return (await getDraft(env.DB, path)).milestones.map((m) => m.name);
}

async function taskTitles(path: OwnedPath) {
  return Object.fromEntries(
    (await getDraft(env.DB, path)).milestones.map((m) => [
      m.name,
      m.tasks.map((t) => t.title),
    ]),
  );
}

async function draftSize(path: OwnedPath) {
  const { milestones } = await getDraft(env.DB, path);
  return milestones.reduce((n, m) => n + 1 + m.tasks.length, 0);
}

async function fillDraft(path: OwnedPath, count: number) {
  const milestoneId = crypto.randomUUID();
  await env.DB.batch([
    env.DB.prepare(
      'INSERT INTO "draft_milestones" ("id", "pathId", "position", "name", "description", "doneWhen") VALUES (?, ?, 1, ?, ?, ?)',
    ).bind(milestoneId, path.id, "Full", "A full Milestone.", "It's full."),
    ...Array.from({ length: count - 1 }, (_, i) =>
      env.DB.prepare(
        'INSERT INTO "draft_tasks" ("id", "milestoneId", "position", "title") VALUES (?, ?, ?, ?)',
      ).bind(crypto.randomUUID(), milestoneId, i + 1, `Task ${i + 1}`),
    ),
  ]);
  return milestoneId;
}

describe("a User's Paths", () => {
  it(`accepts a ${PATHS_PER_USER}th Path and refuses the next, creating nothing`, async () => {
    const userId = "paths-module-cap";
    await seedUser(userId, TEST_EMAILS.pathsModuleCap);
    for (let i = 1; i < PATHS_PER_USER; i++) {
      const created = await createPath(env.DB, userId, {
        name: `Path ${i}`,
        description: "",
      });
      expect(created.ok).toBe(true);
    }

    // Two at once, one under the cap: exactly one lands.
    const results = await Promise.all([
      createPath(env.DB, userId, { name: "Last A", description: "" }),
      createPath(env.DB, userId, { name: "Last B", description: "" }),
    ]);
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(results.filter((r) => !r.ok)).toEqual([
      { ok: false, reason: "cap" },
    ]);

    expect(
      await createPath(env.DB, userId, { name: "One more", description: "" }),
    ).toEqual({ ok: false, reason: "cap" });
    expect(await listPaths(env.DB, userId)).toHaveLength(PATHS_PER_USER);
  });

  it("lists a User's own Paths, oldest first, and not another User's", async () => {
    await seedUser(STRANGER_ID, TEST_EMAILS.pathsModuleStranger);
    const first = await makersPath("First");
    const second = await makersPath("Second");

    const listed = await listPaths(env.DB, MAKER_ID);
    expect(listed.find((p) => p.id === first.id)).toEqual({
      id: first.id,
      name: "First",
      createdAt: first.createdAt,
    });
    expect(listed.findIndex((p) => p.id === first.id)).toBeLessThan(
      listed.findIndex((p) => p.id === second.id),
    );
    expect(await listPaths(env.DB, STRANGER_ID)).toEqual([]);
  });

  it("finds no Path for another User, nor Dreamport's own", async () => {
    await seedUser(STRANGER_ID, TEST_EMAILS.pathsModuleStranger);
    const path = await makersPath();

    expect(await getPath(env.DB, STRANGER_ID, path.id)).toBeNull();
    expect(await getPath(env.DB, MAKER_ID, "dream-sequence")).toBeNull();
    expect(await getPath(env.DB, MAKER_ID, "no-such-path")).toBeNull();
  });

  it("goes, with its Draft Milestones, when its User is deleted", async () => {
    const userId = "paths-module-deleted";
    await seedUser(userId, TEST_EMAILS.pathsModuleDeleted);
    const created = await createPath(env.DB, userId, {
      name: "Doomed",
      description: "",
    });
    if (!created.ok) throw new Error("at the Path cap");
    await milestoneOn(created.path, BAKE);

    await env.DB.prepare('DELETE FROM "user" WHERE "id" = ?')
      .bind(userId)
      .run();

    const remaining = await env.DB.prepare(
      'SELECT count(*) AS n FROM "draft_milestones" WHERE "pathId" = ?',
    )
      .bind(created.path.id)
      .first<{ n: number }>();
    expect(remaining?.n).toBe(0);
    expect(await getPath(env.DB, userId, created.path.id)).toBeNull();
  });
});

describe("a Path's Draft", () => {
  it("starts with its name and description and no Milestones", async () => {
    const path = await makersPath();

    expect(await getDraft(env.DB, path)).toEqual({
      id: path.id,
      name: "Bakery Path",
      description: "For bakers",
      createdAt: path.createdAt,
      milestones: [],
    });
  });

  it("takes a new name and description", async () => {
    const path = await makersPath();

    const updated = await updatePath(env.DB, path, {
      name: "Bread Path",
      description: "",
    });

    expect(updated).toMatchObject({ name: "Bread Path", description: "" });
    expect(await getPath(env.DB, MAKER_ID, path.id)).toMatchObject({
      name: "Bread Path",
      description: "",
    });
  });

  it("adds, edits, deletes and reorders Milestones", async () => {
    const path = await makersPath();
    const bake = await milestoneOn(path, BAKE);
    const sell = await milestoneOn(path, SELL);
    const ship = await milestoneOn(path, SHIP);
    expect(await milestoneNames(path)).toEqual(["Bake", "Sell", "Ship"]);

    const edited = { ...SELL, name: "Sell It", outcome: "Money" };
    expect(await updateMilestone(env.DB, path, sell.id, edited)).toEqual({
      id: sell.id,
      ...edited,
    });

    expect(await deleteMilestone(env.DB, path, bake.id)).toBe(true);
    expect(await deleteMilestone(env.DB, path, bake.id)).toBe(false);

    expect(await reorderMilestones(env.DB, path, [ship.id, sell.id])).toBe(
      true,
    );
    expect(await reorderMilestones(env.DB, path, [ship.id, sell.id])).toBe(
      true,
    );
    expect((await getDraft(env.DB, path)).milestones).toEqual([
      { id: ship.id, ...SHIP, tasks: [] },
      { id: sell.id, ...edited, tasks: [] },
    ]);

    // A Milestone added after a reorder goes on the end.
    await milestoneOn(path, BAKE);
    expect(await milestoneNames(path)).toEqual(["Ship", "Sell It", "Bake"]);
  });

  it("refuses a reorder that isn't exactly its Milestones, changing nothing", async () => {
    const path = await makersPath();
    const other = await makersPath("Other");
    const bake = await milestoneOn(path, BAKE);
    const sell = await milestoneOn(path, SELL);
    const foreign = await milestoneOn(other, SHIP);

    for (const ids of [
      [sell.id],
      [sell.id, bake.id, "no-such-milestone"],
      [sell.id, sell.id],
      [sell.id, foreign.id],
      [sell.id, bake.id, foreign.id],
    ]) {
      expect(await reorderMilestones(env.DB, path, ids)).toBe(false);
    }
    expect(await milestoneNames(path)).toEqual(["Bake", "Sell"]);
    expect(await milestoneNames(other)).toEqual(["Ship"]);
  });

  it("can't reach another Path's Milestone", async () => {
    const path = await makersPath();
    const other = await makersPath("Other");
    const foreign = await milestoneOn(other, SHIP);

    expect(
      await updateMilestone(env.DB, path, foreign.id, { ...SHIP, name: "X" }),
    ).toBeNull();
    expect(await deleteMilestone(env.DB, path, foreign.id)).toBe(false);
    expect((await getDraft(env.DB, other)).milestones).toEqual([
      { id: foreign.id, ...SHIP, tasks: [] },
    ]);
  });

  it("adds, edits, deletes and reorders a Milestone's Tasks, apart from another Milestone's", async () => {
    const path = await makersPath();
    const bake = await milestoneOn(path, BAKE);
    const sell = await milestoneOn(path, SELL);
    const flour = await taskOn(path, bake.id, "Buy flour");
    const knead = await taskOn(path, bake.id, "Knead");
    const proof = await taskOn(path, bake.id, "Proof");
    const price = await taskOn(path, sell.id, "Set a price");
    expect(await taskTitles(path)).toEqual({
      Bake: ["Buy flour", "Knead", "Proof"],
      Sell: ["Set a price"],
    });

    expect(
      await updateTask(env.DB, path, bake.id, knead.id, { title: "Knead it" }),
    ).toEqual({ id: knead.id, title: "Knead it" });
    expect(
      await updateTask(env.DB, path, sell.id, knead.id, { title: "X" }),
    ).toBeNull();

    expect(await deleteTask(env.DB, path, bake.id, flour.id)).toBe(true);
    expect(await deleteTask(env.DB, path, bake.id, flour.id)).toBe(false);

    expect(
      await reorderTasks(env.DB, path, bake.id, [proof.id, knead.id]),
    ).toBe(true);
    expect(
      await reorderTasks(env.DB, path, bake.id, [proof.id, knead.id]),
    ).toBe(true);
    await taskOn(path, bake.id, "Bake");
    expect((await getDraft(env.DB, path)).milestones).toEqual([
      {
        id: bake.id,
        ...BAKE,
        tasks: [
          { id: proof.id, title: "Proof" },
          { id: knead.id, title: "Knead it" },
          { id: expect.any(String), title: "Bake" },
        ],
      },
      { id: sell.id, ...SELL, tasks: [{ id: price.id, title: "Set a price" }] },
    ]);
  });

  it("refuses a Task reorder that isn't exactly that Milestone's Tasks, changing nothing", async () => {
    const path = await makersPath();
    const bake = await milestoneOn(path, BAKE);
    const sell = await milestoneOn(path, SELL);
    const flour = await taskOn(path, bake.id, "Buy flour");
    const knead = await taskOn(path, bake.id, "Knead");
    const price = await taskOn(path, sell.id, "Set a price");

    for (const ids of [
      [knead.id],
      [knead.id, flour.id, "no-such-task"],
      [knead.id, knead.id],
      [knead.id, price.id],
      [knead.id, flour.id, price.id],
    ]) {
      expect(await reorderTasks(env.DB, path, bake.id, ids)).toBe(false);
    }
    expect(await taskTitles(path)).toEqual({
      Bake: ["Buy flour", "Knead"],
      Sell: ["Set a price"],
    });
  });

  it("can't reach another Path's Milestone or Task", async () => {
    const path = await makersPath();
    const other = await makersPath("Other");
    const foreign = await milestoneOn(other, SHIP);
    const task = await taskOn(other, foreign.id, "Pack it");

    expect(
      await addTask(env.DB, path, foreign.id, { title: "Sneak in" }),
    ).toEqual({ ok: false, reason: "not-found" });
    expect(
      await addTask(env.DB, path, "no-such-milestone", { title: "Lost" }),
    ).toEqual({ ok: false, reason: "not-found" });
    expect(
      await updateTask(env.DB, path, foreign.id, task.id, { title: "X" }),
    ).toBeNull();
    expect(await deleteTask(env.DB, path, foreign.id, task.id)).toBe(false);
    expect(await reorderTasks(env.DB, path, foreign.id, [task.id])).toBe(false);
    expect(await taskTitles(other)).toEqual({ Ship: ["Pack it"] });
  });

  it("removes a Milestone's Tasks with it", async () => {
    const path = await makersPath();
    const bake = await milestoneOn(path, BAKE);
    await taskOn(path, bake.id, "Buy flour");
    await taskOn(path, bake.id, "Knead");

    expect(await deleteMilestone(env.DB, path, bake.id)).toBe(true);

    const remaining = await env.DB.prepare(
      'SELECT count(*) AS n FROM "draft_tasks" WHERE "milestoneId" = ?',
    )
      .bind(bake.id)
      .first<{ n: number }>();
    expect(remaining?.n).toBe(0);
  });

  it(`accepts a Milestone as the ${MILESTONES_AND_TASKS_PER_PATH}th Milestone or Task and refuses the next, adding nothing`, async () => {
    const path = await makersPath();
    await fillDraft(path, MILESTONES_AND_TASKS_PER_PATH - 1);

    expect((await addMilestone(env.DB, path, BAKE)).ok).toBe(true);
    expect(await draftSize(path)).toBe(MILESTONES_AND_TASKS_PER_PATH);

    expect(await addMilestone(env.DB, path, SELL)).toEqual({
      ok: false,
      reason: "cap",
    });
    expect(await draftSize(path)).toBe(MILESTONES_AND_TASKS_PER_PATH);
  });

  it(`accepts a Task as the ${MILESTONES_AND_TASKS_PER_PATH}th Milestone or Task and refuses the next, adding nothing`, async () => {
    const path = await makersPath();
    const full = await fillDraft(path, MILESTONES_AND_TASKS_PER_PATH - 2);
    const bake = await milestoneOn(path, BAKE);

    const results = await Promise.all([
      addTask(env.DB, path, bake.id, { title: "Last A" }),
      addTask(env.DB, path, full, { title: "Last B" }),
    ]);
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(results.filter((r) => !r.ok)).toEqual([
      { ok: false, reason: "cap" },
    ]);
    expect(await draftSize(path)).toBe(MILESTONES_AND_TASKS_PER_PATH);

    expect(await addTask(env.DB, path, bake.id, { title: "More" })).toEqual({
      ok: false,
      reason: "cap",
    });
    expect(await draftSize(path)).toBe(MILESTONES_AND_TASKS_PER_PATH);
  });

  it("counts the cap per Path", async () => {
    const path = await makersPath();
    const other = await makersPath("Other");
    await fillDraft(path, MILESTONES_AND_TASKS_PER_PATH);

    const bake = await milestoneOn(other, BAKE);
    expect((await addTask(env.DB, other, bake.id, { title: "Knead" })).ok).toBe(
      true,
    );
  });

  it("leaves the saved Dream Sequence version as it was", async () => {
    const before = await dreamSequence(env.DB);
    const path = await makersPath();
    const bake = await milestoneOn(path, BAKE);
    const sell = await milestoneOn(path, SELL);
    await updatePath(env.DB, path, { name: "Renamed", description: "New" });
    await updateMilestone(env.DB, path, bake.id, SHIP);
    await reorderMilestones(env.DB, path, [sell.id, bake.id]);
    await deleteMilestone(env.DB, path, sell.id);

    expect(await dreamSequence(env.DB)).toEqual(before);
  });
});

describe("parsing a Milestone's fields", () => {
  it("trims each field and reads a left-out Outcome as empty", () => {
    expect(
      parseMilestoneFields({
        name: "  Bake ",
        description: "Bake a loaf.\n",
        doneWhen: " A loaf exists.",
      }),
    ).toEqual({
      ok: true,
      value: {
        name: "Bake",
        description: "Bake a loaf.",
        doneWhen: "A loaf exists.",
        outcome: "",
      },
    });
  });

  it.each([
    ["a blank name", { ...BAKE, name: "  " }, "name is required"],
    ["no Done when", { ...BAKE, doneWhen: undefined }, "doneWhen is required"],
    ["a non-text Outcome", { ...BAKE, outcome: 3 }, "outcome must be text"],
    [
      "a name over the cap",
      { ...BAKE, name: "x".repeat(MILESTONE_NAME_MAX_LENGTH + 1) },
      `name must be ${MILESTONE_NAME_MAX_LENGTH} characters or fewer`,
    ],
  ])("refuses %s", (_, body, error) => {
    expect(parseMilestoneFields(body)).toEqual({ ok: false, error });
  });
});

describe("parsing a Task's fields", () => {
  it("trims the title, and refuses one blank or over the cap", () => {
    expect(parseTaskFields({ title: " Knead " })).toEqual({
      ok: true,
      value: { title: "Knead" },
    });
    expect(parseTaskFields({ title: " " })).toEqual({
      ok: false,
      error: "title is required",
    });
    expect(
      parseTaskFields({ title: "x".repeat(TASK_TITLE_MAX_LENGTH + 1) }),
    ).toEqual({
      ok: false,
      error: `title must be ${TASK_TITLE_MAX_LENGTH} characters or fewer`,
    });
  });
});

describe("parsing a Path's fields", () => {
  it("needs a name but not a description", () => {
    expect(parsePathFields({ name: " Bread " })).toEqual({
      ok: true,
      value: { name: "Bread", description: "" },
    });
    expect(parsePathFields({ description: "x" })).toEqual({
      ok: false,
      error: "name is required",
    });
    expect(parsePathFields(null)).toEqual({
      ok: false,
      error: "body must be a JSON object",
    });
  });
});

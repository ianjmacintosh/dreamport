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
} from "./journeys";
import {
  addTask,
  closePath,
  createPath,
  deleteMilestone,
  deletePath,
  deleteTask,
  discardChanges,
  type FollowableVersion,
  getDraft,
  getOfferedVersion,
  getPath,
  getTrailheadVersion,
  getVersion,
  listFollowable,
  listPaths,
  MILESTONE_NAME_MAX_LENGTH,
  type MilestoneFields,
  MILESTONES_AND_TASKS_PER_PATH,
  offeredNumber,
  openPath,
  type OwnedPath,
  type PathUpdate,
  parseMilestoneFields,
  parsePathFields,
  parseTaskFields,
  PATHS_PER_USER,
  publishVersion,
  reorderTasks,
  saveVersion,
  TASK_TITLE_MAX_LENGTH,
  unpublishVersion,
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

/** Dream Sequence's latest version, as any User's Trailhead opens it. */
async function dreamSequence(): Promise<FollowableVersion> {
  const trailhead = await getTrailheadVersion(
    env.DB,
    FOLLOWER_ID,
    "dream-sequence",
    null,
  );
  if (!trailhead) throw new Error("Dream Sequence is not seeded");
  return trailhead.version;
}

describe("Dream Sequence", () => {
  it("is version 1 of Dreamport's Dream Sequence Path, with its seven Milestones in order", async () => {
    const version = await dreamSequence();

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
    const version = await dreamSequence();

    expect(await getVersion(env.DB, FOLLOWER_ID, "starter")).toEqual(version);
    expect(await getVersion(env.DB, OWNER_ID, "starter")).toEqual(version);
  });

  it("is the same after a Journey has been driven through every write", async () => {
    await seedUser(FOLLOWER_ID, TEST_EMAILS.pathsModuleFollower);
    const before = await dreamSequence();
    const { id } = await createProduct(env.DB, FOLLOWER_ID, "A bakery app");
    const product = await getProduct(env.DB, FOLLOWER_ID, id);
    if (!product) throw new Error("the Product just created isn't there");

    const start = await startJourney(env.DB, product, before);
    if (!start) throw new Error("the Journey didn't start");
    const journey = await loadJourney(env.DB, product, start.journeyId);
    if (!journey) throw new Error("the Journey just started isn't there");
    await saveAnswers(env.DB, journey, "product-summary", { problem: "Dough" });
    await setTaskDone(env.DB, journey, "talk-to-five-customers", true);
    for (let i = 0; i < before.milestones.length; i++) {
      await advanceJourney(env.DB, journey);
    }
    await returnJourney(env.DB, journey);

    expect(await dreamSequence()).toEqual(before);
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

/**
 * The Draft as it stands now. `getDraft` takes the name and description
 * from the `OwnedPath` it's given, so this loads that afresh.
 */
async function currentDraft(path: OwnedPath) {
  const fresh = await env.DB.prepare(
    'SELECT "id", "name", "description", "createdAt" FROM "paths" WHERE "id" = ?',
  )
    .bind(path.id)
    .first<OwnedPath>();
  if (!fresh) throw new Error("the Path is gone");
  return getDraft(env.DB, fresh);
}

/** An update that leaves the Draft as it stands, for a test to change. */
async function asItStands(path: OwnedPath): Promise<PathUpdate> {
  const { name, description, milestones } = await currentDraft(path);
  return {
    name,
    description,
    milestones: milestones.map(({ id }) => ({ id })),
  };
}

async function updated(path: OwnedPath, update: PathUpdate) {
  const result = await updatePath(env.DB, path, update);
  if (!result.ok) throw new Error(`not updated: ${result.reason}`);
  return result.draft;
}

async function rename(path: OwnedPath, name: string, description: string) {
  return updated(path, { ...(await asItStands(path)), name, description });
}

async function reorder(path: OwnedPath, ids: readonly string[]) {
  return updated(path, {
    ...(await asItStands(path)),
    milestones: ids.map((id) => ({ id })),
  });
}

/** Add a Milestone at the end of the Draft, the way Update Path does. */
async function milestoneOn(path: OwnedPath, fields: MilestoneFields) {
  const current = await asItStands(path);
  const { milestones } = await updated(path, {
    ...current,
    milestones: [...current.milestones, fields],
  });
  const added = milestones.at(-1);
  if (!added) throw new Error("no Milestone added");
  return added;
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
  it(`accepts a ${PATHS_PER_USER}th Path and refuses the next, creating nothing, until one is deleted`, async () => {
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

    const [oldest] = await listPaths(env.DB, userId);
    const path = await getPath(env.DB, userId, oldest.id);
    if (!path) throw new Error("the listed Path isn't there");
    expect(await deletePath(env.DB, path)).toBe(true);
    expect(
      (await createPath(env.DB, userId, { name: "Room", description: "" })).ok,
    ).toBe(true);
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
  it("starts closed, with its name and description and no Milestones or versions", async () => {
    const path = await makersPath();

    expect(await getDraft(env.DB, path)).toEqual({
      id: path.id,
      name: "Bakery Path",
      description: "For bakers",
      createdAt: path.createdAt,
      milestones: [],
      updatedAt: path.createdAt,
      open: false,
      versions: [],
      latestVersion: null,
    });
  });

  it("takes a new name and description", async () => {
    const path = await makersPath();

    const draft = await rename(path, "Bread Path", "");

    expect(draft).toMatchObject({ name: "Bread Path", description: "" });
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

    await reorder(path, [ship.id, sell.id]);
    expect(await reorder(path, [ship.id, sell.id])).toMatchObject({
      milestones: [
        { id: ship.id, ...SHIP, tasks: [] },
        { id: sell.id, ...edited, tasks: [] },
      ],
    });
    expect((await getDraft(env.DB, path)).milestones).toEqual([
      { id: ship.id, ...SHIP, tasks: [] },
      { id: sell.id, ...edited, tasks: [] },
    ]);
  });

  it("takes a new name, description and Milestones at once, placing new Milestones among the existing ones", async () => {
    const path = await makersPath();
    const bake = await milestoneOn(path, BAKE);
    const ship = await milestoneOn(path, SHIP);
    await taskOn(path, bake.id, "Knead");

    const draft = await updated(path, {
      name: "Bread Path",
      description: "Loaves",
      milestones: [{ id: ship.id }, SELL, { id: bake.id }, BAKE],
    });

    const expected = [
      { id: ship.id, ...SHIP, tasks: [] },
      { id: expect.any(String), ...SELL, tasks: [] },
      {
        id: bake.id,
        ...BAKE,
        tasks: [{ id: expect.any(String), title: "Knead" }],
      },
      { id: expect.any(String), ...BAKE, tasks: [] },
    ];
    expect(draft).toMatchObject({
      name: "Bread Path",
      description: "Loaves",
      milestones: expected,
    });
    expect(await currentDraft(path)).toEqual(draft);
    const positions = await env.DB.prepare(
      'SELECT "position" FROM "draft_milestones" WHERE "pathId" = ? ORDER BY "position"',
    )
      .bind(path.id)
      .all<{ position: number }>();
    expect(positions.results.map((r) => r.position)).toEqual([1, 2, 3, 4]);
  });

  it("is not found once the Path is gone", async () => {
    const path = await makersPath();
    await env.DB.prepare('DELETE FROM "paths" WHERE "id" = ?')
      .bind(path.id)
      .run();

    expect(
      await updatePath(env.DB, path, {
        name: "Gone",
        description: "",
        milestones: [BAKE],
      }),
    ).toEqual({ ok: false, reason: "not-found" });
    const { n } = (await env.DB.prepare(
      'SELECT count(*) AS n FROM "draft_milestones" WHERE "pathId" = ?',
    )
      .bind(path.id)
      .first<{ n: number }>())!;
    expect(n).toBe(0);
  });

  it("refuses a list whose existing Milestones aren't exactly its own, changing nothing", async () => {
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
      expect(
        await updatePath(env.DB, path, {
          name: "Renamed",
          description: "New",
          milestones: [...ids.map((id) => ({ id })), SHIP],
        }),
      ).toEqual({ ok: false, reason: "stale" });
    }
    expect(await milestoneNames(path)).toEqual(["Bake", "Sell"]);
    expect(await getPath(env.DB, MAKER_ID, path.id)).toMatchObject({
      name: "Bakery Path",
      description: "For bakers",
    });
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

  it(`accepts new Milestones up to the ${MILESTONES_AND_TASKS_PER_PATH}th Milestone or Task and refuses one more, changing nothing`, async () => {
    const path = await makersPath();
    await fillDraft(path, MILESTONES_AND_TASKS_PER_PATH - 2);
    const current = await asItStands(path);

    const over = await updatePath(env.DB, path, {
      ...current,
      name: "Renamed",
      milestones: [...current.milestones, BAKE, SELL, SHIP],
    });
    expect(over).toEqual({ ok: false, reason: "cap" });
    expect(await draftSize(path)).toBe(MILESTONES_AND_TASKS_PER_PATH - 2);
    expect((await currentDraft(path)).name).toBe("Bakery Path");

    await updated(path, {
      ...current,
      milestones: [...current.milestones, BAKE, SELL],
    });
    expect(await draftSize(path)).toBe(MILESTONES_AND_TASKS_PER_PATH);

    const full = await asItStands(path);
    expect(
      await updatePath(env.DB, path, {
        ...full,
        milestones: [...full.milestones, BAKE],
      }),
    ).toEqual({ ok: false, reason: "cap" });
    // Reordering or renaming at the cap still works: it adds nothing.
    await rename(path, "Full Path", "");
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
    const before = await dreamSequence();
    const path = await makersPath();
    const bake = await milestoneOn(path, BAKE);
    const sell = await milestoneOn(path, SELL);
    await rename(path, "Renamed", "New");
    await updateMilestone(env.DB, path, bake.id, SHIP);
    await reorder(path, [sell.id, bake.id]);
    await deleteMilestone(env.DB, path, sell.id);

    expect(await dreamSequence()).toEqual(before);
  });
});

async function productOf(userId: string) {
  const { id } = await createProduct(env.DB, userId, "A bakery app");
  const product = await getProduct(env.DB, userId, id);
  if (!product) throw new Error("the Product just created isn't there");
  return product;
}

async function saved(path: OwnedPath, userId = MAKER_ID) {
  const result = await saveVersion(env.DB, path);
  if (!result.ok) throw new Error(`not saved: ${result.missing.join(", ")}`);
  const version = await getVersion(env.DB, userId, result.version.id);
  if (!version) throw new Error("the version just saved isn't there");
  return version;
}

/** A Journey on `version`, on a fresh Product of `userId`'s. */
async function journeyOn(version: FollowableVersion, userId: string) {
  const product = await productOf(userId);
  const start = await startJourney(env.DB, product, version);
  if (!start) throw new Error("the Journey didn't start");
  const journey = await loadJourney(env.DB, product, start.journeyId);
  if (!journey) throw new Error("the Journey just started isn't there");
  return journey;
}

/** The Tasks on `version`'s Milestones, as a Journey on it reads them. */
async function tasksOn(version: FollowableVersion, userId: string) {
  return (await journeyState(env.DB, await journeyOn(version, userId))).tasks;
}

/** A saved version as a follower reads it: its Milestones in order, each with its Tasks. */
async function contentOf(versionId: string, userId = MAKER_ID) {
  const version = await getVersion(env.DB, userId, versionId);
  if (!version) throw new Error(`no version ${versionId}`);
  const tasks = await tasksOn(version, userId);
  return {
    number: version.number,
    name: version.name,
    description: version.description,
    milestones: version.milestones.map(({ id, ...fields }) => ({
      ...fields,
      tasks: tasks
        .filter((t) => t.milestoneIds.includes(id))
        .map((t) => t.title),
    })),
  };
}

async function dreamSequenceTasks() {
  const tasks = await tasksOn(await dreamSequence(), MAKER_ID);
  return tasks.map((t) => [t.title, t.milestoneIds]);
}

/** Every row a saved version or a Journey on one can leave behind. */
async function versionRowCounts() {
  const tables = [
    "path_versions",
    "milestones",
    "tasks",
    "milestone_tasks",
    "journeys",
    "task_completions",
    "worksheet_instances",
  ];
  const rows = await env.DB.batch<{ n: number }>(
    tables.map((table) =>
      env.DB.prepare(`SELECT count(*) AS n FROM "${table}"`),
    ),
  );
  return Object.fromEntries(
    tables.map((table, i) => [table, rows[i].results[0].n]),
  );
}

const tick = () => new Promise((resolve) => setTimeout(resolve, 5));

describe("saving a Path's Draft as a version", () => {
  it("captures its name, description, and Milestones and Tasks in Draft order", async () => {
    const path = await makersPath();
    const bake = await milestoneOn(path, BAKE);
    const ship = await milestoneOn(path, SHIP);
    const sell = await milestoneOn(path, SELL);
    const flour = await taskOn(path, bake.id, "Buy flour");
    const knead = await taskOn(path, bake.id, "Knead");
    await taskOn(path, sell.id, "Set a price");
    await deleteMilestone(env.DB, path, ship.id);
    await reorder(path, [sell.id, bake.id]);
    await reorderTasks(env.DB, path, bake.id, [knead.id, flour.id]);

    const result = await saveVersion(env.DB, path);

    expect(result).toEqual({
      ok: true,
      version: {
        id: expect.any(String),
        number: 1,
        savedAt: expect.any(String),
        published: false,
      },
    });
    if (!result.ok) return;
    expect(await contentOf(result.version.id)).toEqual({
      number: 1,
      name: "Bakery Path",
      description: "For bakers",
      milestones: [
        { ...SELL, tasks: ["Set a price"] },
        { ...BAKE, tasks: ["Knead", "Buy flour"] },
      ],
    });
  });

  it("is untouched by later edits to the Draft", async () => {
    const path = await makersPath();
    const bake = await milestoneOn(path, BAKE);
    const sell = await milestoneOn(path, SELL);
    const flour = await taskOn(path, bake.id, "Buy flour");
    const knead = await taskOn(path, bake.id, "Knead");
    const version = await saved(path);
    const before = await contentOf(version.id);

    await rename(path, "Renamed", "New");
    await updateMilestone(env.DB, path, bake.id, SHIP);
    await reorder(path, [sell.id, bake.id]);
    await updateTask(env.DB, path, bake.id, knead.id, { title: "Knead it" });
    await reorderTasks(env.DB, path, bake.id, [knead.id, flour.id]);
    await deleteTask(env.DB, path, bake.id, flour.id);
    await taskOn(path, sell.id, "Set a price");
    await deleteMilestone(env.DB, path, sell.id);

    expect(await contentOf(version.id)).toEqual(before);
  });

  it("is refused, naming what's missing and saving nothing, without a description or a Milestone", async () => {
    const path = await makersPath();
    const refused = (missing: string[]) => ({
      ok: false,
      reason: "incomplete",
      missing,
    });

    expect(await saveVersion(env.DB, path)).toEqual(refused(["milestone"]));

    await rename(path, path.name, "");
    expect(await saveVersion(env.DB, path)).toEqual(
      refused(["description", "milestone"]),
    );

    await milestoneOn(path, BAKE);
    expect(await saveVersion(env.DB, path)).toEqual(refused(["description"]));

    expect((await getDraft(env.DB, path)).latestVersion).toBeNull();
  });

  it("numbers a second save 2, each version keeping its own content", async () => {
    const path = await makersPath();
    const bake = await milestoneOn(path, BAKE);
    const first = await saved(path);
    await updateMilestone(env.DB, path, bake.id, { ...BAKE, name: "Bake It" });
    await milestoneOn(path, SELL);

    const second = await saved(path);

    expect((await contentOf(first.id)).milestones).toEqual([
      { ...BAKE, tasks: [] },
    ]);
    expect(await contentOf(second.id)).toMatchObject({
      number: 2,
      milestones: [
        { ...BAKE, name: "Bake It", tasks: [] },
        { ...SELL, tasks: [] },
      ],
    });
    const draft = await getDraft(env.DB, path);
    expect(draft.versions).toEqual([
      { id: second.id, number: 2, savedAt: second.savedAt, published: false },
      { id: first.id, number: 1, savedAt: first.savedAt, published: false },
    ]);
    expect(draft.latestVersion).toEqual(draft.versions[0]);
  });

  it("leaves when the Draft was last edited alone, while every Draft edit moves it forward", async () => {
    const path = await makersPath();
    const updatedAt = async () => (await getDraft(env.DB, path)).updatedAt;
    let last = await updatedAt();
    expect(last).toBe(path.createdAt);
    const expectMovedForward = async () => {
      const now = await updatedAt();
      expect(now > last).toBe(true);
      last = now;
      await tick();
    };
    await tick();

    await rename(path, "Renamed", "New");
    await expectMovedForward();
    const bake = await milestoneOn(path, BAKE);
    await expectMovedForward();
    const sell = await milestoneOn(path, SELL);
    await expectMovedForward();
    await updateMilestone(env.DB, path, bake.id, SHIP);
    await expectMovedForward();
    await reorder(path, [sell.id, bake.id]);
    await expectMovedForward();
    const knead = await taskOn(path, bake.id, "Knead");
    await expectMovedForward();
    await updateTask(env.DB, path, bake.id, knead.id, { title: "Knead it" });
    await expectMovedForward();
    await reorderTasks(env.DB, path, bake.id, [knead.id]);
    await expectMovedForward();
    await deleteTask(env.DB, path, bake.id, knead.id);
    await expectMovedForward();
    await deleteMilestone(env.DB, path, sell.id);
    await expectMovedForward();

    await saved(path);
    expect(await updatedAt()).toBe(last);
  });

  it("goes, with a Journey on it, when its User is deleted, leaving Dream Sequence and other Users' versions", async () => {
    const othersPath = await makersPath();
    await milestoneOn(othersPath, BAKE);
    const othersVersion = await saved(othersPath);
    const othersBefore = await contentOf(othersVersion.id);
    const dreamBefore = await dreamSequence();
    const dreamTasksBefore = await dreamSequenceTasks();
    const rowsBefore = await versionRowCounts();

    const userId = "paths-module-saver-deleted";
    await seedUser(userId, TEST_EMAILS.pathsModuleSaverDeleted);
    const created = await createPath(env.DB, userId, {
      name: "Doomed",
      description: "Soon gone",
    });
    if (!created.ok) throw new Error("at the Path cap");
    const bake = await milestoneOn(created.path, BAKE);
    await taskOn(created.path, bake.id, "Knead");
    const version: FollowableVersion = await saved(created.path, userId);
    const journey = await journeyOn(version, userId);
    const { tasks } = await journeyState(env.DB, journey);
    await setTaskDone(env.DB, journey, tasks[0].id, true);
    expect(await versionRowCounts()).not.toEqual(rowsBefore);

    await env.DB.prepare('DELETE FROM "user" WHERE "id" = ?')
      .bind(userId)
      .run();

    expect(await getPath(env.DB, userId, created.path.id)).toBeNull();
    expect(await getVersion(env.DB, userId, version.id)).toBeNull();
    expect(await versionRowCounts()).toEqual(rowsBefore);
    expect(await contentOf(othersVersion.id)).toEqual(othersBefore);
    expect(await dreamSequence()).toEqual(dreamBefore);
    expect(await dreamSequenceTasks()).toEqual(dreamTasksBefore);
  });
});

const DISCARDER_ID = "paths-module-discarder";

/** The Draft in the same shape `contentOf` gives a saved version. */
async function draftContent(path: OwnedPath) {
  const { name, description, milestones } = await currentDraft(path);
  return {
    name,
    description,
    milestones: milestones.map(
      ({ name, description, doneWhen, outcome, tasks }) => ({
        name,
        description,
        doneWhen,
        outcome,
        tasks: tasks.map((t) => t.title),
      }),
    ),
  };
}

/** A version of the discarder's in `draftContent`'s shape: `contentOf` without its number. */
async function savedContent(versionId: string) {
  const { name, description, milestones } = await contentOf(
    versionId,
    DISCARDER_ID,
  );
  return { name, description, milestones };
}

async function discarded(path: OwnedPath) {
  const result = await discardChanges(env.DB, path);
  if (!result.ok) throw new Error(`not discarded: ${result.reason}`);
  return result.draft;
}

/** A new Path of the discarder's, apart from the maker's, who nears the Path cap. */
async function discardersPath() {
  await seedUser(DISCARDER_ID, TEST_EMAILS.pathsModuleDiscarder);
  const created = await createPath(env.DB, DISCARDER_ID, {
    name: "Bakery Path",
    description: "For bakers",
  });
  if (!created.ok) throw new Error("the discarder is at the Path cap");
  return created.path;
}

/** A Path saved once with two Milestones and Tasks, then edited all over. */
async function editedSinceSaving() {
  const path = await discardersPath();
  const bake = await milestoneOn(path, BAKE);
  const sell = await milestoneOn(path, SELL);
  const flour = await taskOn(path, bake.id, "Buy flour");
  const knead = await taskOn(path, bake.id, "Knead");
  await taskOn(path, sell.id, "Set a price");
  const version = await saved(path, DISCARDER_ID);

  await rename(path, "Renamed", "New");
  await updateMilestone(env.DB, path, bake.id, { ...BAKE, name: "Bake It" });
  const ship = await milestoneOn(path, SHIP);
  await deleteMilestone(env.DB, path, sell.id);
  await reorder(path, [ship.id, bake.id]);
  await taskOn(path, bake.id, "Proof");
  await updateTask(env.DB, path, bake.id, knead.id, { title: "Knead it" });
  await reorderTasks(env.DB, path, bake.id, [knead.id, flour.id]);
  await deleteTask(env.DB, path, bake.id, flour.id);
  await taskOn(path, ship.id, "Find a van");
  return { path, version };
}

describe("discarding a Draft's changes (#179)", () => {
  it("puts the Draft back exactly as the latest version saved it", async () => {
    const { path, version } = await editedSinceSaving();
    const asSaved = await savedContent(version.id);
    expect(asSaved).toEqual({
      name: "Bakery Path",
      description: "For bakers",
      milestones: [
        { ...BAKE, tasks: ["Buy flour", "Knead"] },
        { ...SELL, tasks: ["Set a price"] },
      ],
    });
    expect(await draftContent(path)).not.toEqual(asSaved);

    const draft = await discarded(path);

    expect(await draftContent(path)).toEqual(asSaved);
    expect(draft).toEqual(await currentDraft(path));
    expect(draft.latestVersion).toEqual({
      id: version.id,
      number: 1,
      savedAt: version.savedAt,
      published: false,
    });
    const orphans = await env.DB.prepare(
      `SELECT count(*) AS n FROM "draft_tasks"
       WHERE "milestoneId" NOT IN (SELECT "id" FROM "draft_milestones")`,
    ).first<{ n: number }>();
    expect(orphans?.n).toBe(0);
  });

  it("leaves a Draft that saves again as an identical version and edits as before", async () => {
    const { path, version } = await editedSinceSaving();
    await discarded(path);

    const again = await saved(path, DISCARDER_ID);

    const firstContent = await savedContent(version.id);
    expect(again.number).toBe(2);
    expect(await savedContent(again.id)).toEqual(firstContent);

    const [bake] = (await currentDraft(path)).milestones;
    await taskOn(path, bake.id, "Proof");
    await updateMilestone(env.DB, path, bake.id, SHIP);
    expect(await taskTitles(path)).toEqual({
      Ship: ["Buy flour", "Knead", "Proof"],
      Sell: ["Set a price"],
    });
  });

  it("leaves saved versions and the Journeys on them alone", async () => {
    const path = await discardersPath();
    const bake = await milestoneOn(path, BAKE);
    await taskOn(path, bake.id, "Knead");
    const first = await saved(path, DISCARDER_ID);
    await milestoneOn(path, SELL);
    const second = await saved(path, DISCARDER_ID);
    const journey = await journeyOn(first, DISCARDER_ID);
    const { tasks } = await journeyState(env.DB, journey);
    await setTaskDone(env.DB, journey, tasks[0].id, true);
    await rename(path, "Renamed", "New");
    await deleteMilestone(env.DB, path, bake.id);
    const firstBefore = await contentOf(first.id, DISCARDER_ID);
    const secondBefore = await contentOf(second.id, DISCARDER_ID);
    const journeyBefore = await journeyState(env.DB, journey);
    const rowsBefore = await versionRowCounts();

    await discarded(path);

    expect(await versionRowCounts()).toEqual(rowsBefore);
    expect(await journeyState(env.DB, journey)).toEqual(journeyBefore);
    expect(await contentOf(first.id, DISCARDER_ID)).toEqual(firstBefore);
    expect(await contentOf(second.id, DISCARDER_ID)).toEqual(secondBefore);
  });

  it("is refused, changing nothing, on a Path with no saved version", async () => {
    const path = await discardersPath();
    const bake = await milestoneOn(path, BAKE);
    await taskOn(path, bake.id, "Knead");
    await rename(path, "Renamed", "New");
    const before = await currentDraft(path);
    await tick();

    expect(await discardChanges(env.DB, path)).toEqual({
      ok: false,
      reason: "no-version",
    });
    expect(await currentDraft(path)).toEqual(before);
  });

  it("goes back to the latest of several versions", async () => {
    const path = await discardersPath();
    const bake = await milestoneOn(path, BAKE);
    await taskOn(path, bake.id, "Knead");
    await saved(path, DISCARDER_ID);
    await rename(path, "Second", "Saved twice");
    await milestoneOn(path, SELL);
    await taskOn(path, bake.id, "Proof");
    const second = await saved(path, DISCARDER_ID);
    await rename(path, "Third", "Never saved");
    await deleteMilestone(env.DB, path, bake.id);

    await discarded(path);

    const secondContent = await savedContent(second.id);
    expect(secondContent).toEqual({
      name: "Second",
      description: "Saved twice",
      milestones: [
        { ...BAKE, tasks: ["Knead", "Proof"] },
        { ...SELL, tasks: [] },
      ],
    });
    expect(await draftContent(path)).toEqual(secondContent);
  });
});

describe("deleting a Path (#171)", () => {
  it("takes its Draft, every version and every Journey on them, leaving other Paths and Journeys alone", async () => {
    const othersPath = await makersPath();
    await milestoneOn(othersPath, BAKE);
    const othersVersion = await saved(othersPath);
    const othersBefore = await contentOf(othersVersion.id);

    await seedUser(STRANGER_ID, TEST_EMAILS.pathsModuleStranger);
    const created = await createPath(env.DB, STRANGER_ID, {
      name: "Stranger's",
      description: "Not the maker's",
    });
    if (!created.ok) throw new Error("the stranger is at the Path cap");
    await milestoneOn(created.path, SELL);
    const strangersJourney = await journeyOn(
      await saved(created.path, STRANGER_ID),
      STRANGER_ID,
    );

    const product = await productOf(MAKER_ID);
    const dreamStart = await startJourney(
      env.DB,
      product,
      await dreamSequence(),
    );
    if (!dreamStart) throw new Error("the Dream Sequence Journey didn't start");

    const rowsBefore = await versionRowCounts();

    const doomed = await makersPath("Doomed");
    const bake = await milestoneOn(doomed, BAKE);
    await taskOn(doomed, bake.id, "Knead");
    const first = await saved(doomed);
    const second = await saved(doomed);
    const start = await startJourney(env.DB, product, first);
    const journey =
      start && (await loadJourney(env.DB, product, start.journeyId));
    if (!journey) throw new Error("the Journey didn't start");
    const { tasks } = await journeyState(env.DB, journey);
    await setTaskDone(env.DB, journey, tasks[0].id, true);
    await journeyOn(second, MAKER_ID);

    expect(await deletePath(env.DB, doomed)).toBe(true);

    expect(await getPath(env.DB, MAKER_ID, doomed.id)).toBeNull();
    expect(await getVersion(env.DB, MAKER_ID, first.id)).toBeNull();
    expect(await getVersion(env.DB, MAKER_ID, second.id)).toBeNull();
    expect(
      await getTrailheadVersion(env.DB, MAKER_ID, doomed.id, null),
    ).toBeNull();
    expect(await loadJourney(env.DB, product, journey.id)).toBeNull();
    const draftRows = await env.DB.prepare(
      'SELECT count(*) AS n FROM "draft_milestones" WHERE "pathId" = ?',
    )
      .bind(doomed.id)
      .first<{ n: number }>();
    expect(draftRows?.n).toBe(0);

    expect(await versionRowCounts()).toEqual(rowsBefore);
    expect(
      await loadJourney(env.DB, product, dreamStart.journeyId),
    ).not.toBeNull();
    expect(await contentOf(othersVersion.id)).toEqual(othersBefore);
    expect(
      await loadJourney(env.DB, strangersJourney.product, strangersJourney.id),
    ).not.toBeNull();
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

const PATHFINDER_ID = "paths-module-pathfinder";
const TRAILHEAD_ID = "paths-module-trailhead";

/** A new Path of `userId`'s, its Draft holding `milestones`. */
async function pathOf(
  userId: string,
  name: string,
  milestones: readonly MilestoneFields[] = [],
) {
  const created = await createPath(env.DB, userId, {
    name,
    description: "For bakers",
  });
  if (!created.ok) throw new Error(`${userId} is at the Path cap`);
  for (const fields of milestones) {
    await milestoneOn(created.path, fields);
  }
  return created.path;
}

describe("Pathfinder (#170)", () => {
  it("lists Dream Sequence first, then the User's Paths with a saved version by their latest name, never another User's", async () => {
    await seedUser(PATHFINDER_ID, TEST_EMAILS.pathsModulePathfinder);
    await seedUser(STRANGER_ID, TEST_EMAILS.pathsModuleStranger);
    const first = await pathOf(PATHFINDER_ID, "First", [BAKE]);
    await saved(first, PATHFINDER_ID);
    await rename(first, "First Again", "For bakers");
    await saved(first, PATHFINDER_ID);
    await pathOf(PATHFINDER_ID, "Draft Only", [BAKE]);
    const second = await pathOf(PATHFINDER_ID, "Second", [BAKE]);
    await saved(second, PATHFINDER_ID);
    await saved(await pathOf(STRANGER_ID, "Theirs", [BAKE]), STRANGER_ID);

    expect(await listFollowable(env.DB, PATHFINDER_ID)).toEqual([
      { id: "dream-sequence", name: "Dream Sequence" },
      { id: first.id, name: "First Again" },
      { id: second.id, name: "Second" },
    ]);
  });
});

describe("a Trailhead (#170)", () => {
  it("opens on a Path's latest version, or an earlier one by number, with every version newest first", async () => {
    await seedUser(TRAILHEAD_ID, TEST_EMAILS.pathsModuleTrailhead);
    const path = await pathOf(TRAILHEAD_ID, "Bakery Path", [BAKE]);
    const one = await saved(path, TRAILHEAD_ID);
    await milestoneOn(path, SELL);
    const two = await saved(path, TRAILHEAD_ID);
    const versions = [two, one].map(({ id, number, savedAt }) => ({
      id,
      number,
      savedAt,
      published: false,
    }));

    expect(
      await getTrailheadVersion(env.DB, TRAILHEAD_ID, path.id, null),
    ).toEqual({ owner: "user", version: two, versions });
    expect(await getTrailheadVersion(env.DB, TRAILHEAD_ID, path.id, 1)).toEqual(
      { owner: "user", version: one, versions },
    );
    expect(
      await getTrailheadVersion(env.DB, TRAILHEAD_ID, path.id, 3),
    ).toBeNull();
  });

  it("opens on Dream Sequence for any User, as Dreamport's", async () => {
    await seedUser(TRAILHEAD_ID, TEST_EMAILS.pathsModuleTrailhead);

    expect(
      await getTrailheadVersion(env.DB, TRAILHEAD_ID, "dream-sequence", null),
    ).toMatchObject({
      owner: "dreamport",
      version: { id: "starter", number: 1, name: "Dream Sequence" },
      versions: [{ id: "starter", number: 1, published: true }],
    });
  });

  it("doesn't open for another User's Path, an unknown one, or one with only a Draft", async () => {
    await seedUser(TRAILHEAD_ID, TEST_EMAILS.pathsModuleTrailhead);
    await seedUser(STRANGER_ID, TEST_EMAILS.pathsModuleStranger);
    const path = await pathOf(TRAILHEAD_ID, "Bakery Path", [BAKE]);
    await saved(path, TRAILHEAD_ID);
    const draftOnly = await pathOf(TRAILHEAD_ID, "Draft Only", [BAKE]);

    expect(
      await getTrailheadVersion(env.DB, STRANGER_ID, path.id, null),
    ).toBeNull();
    expect(
      await getTrailheadVersion(env.DB, STRANGER_ID, path.id, 1),
    ).toBeNull();
    expect(
      await getTrailheadVersion(env.DB, TRAILHEAD_ID, "no-such-path", null),
    ).toBeNull();
    expect(
      await getTrailheadVersion(env.DB, TRAILHEAD_ID, draftOnly.id, null),
    ).toBeNull();
  });
});

const PUBLISHER_ID = "paths-module-publisher";

/** A Path of the publisher's own with `count` saved versions, none published. */
async function publishersPath(count: number) {
  await seedUser(PUBLISHER_ID, TEST_EMAILS.pathsModulePublisher);
  const path = await pathOf(PUBLISHER_ID, "Bakery Path", [BAKE]);
  const versions: FollowableVersion[] = [];
  for (let i = 0; i < count; i++) {
    versions.push(await saved(path, PUBLISHER_ID));
  }
  return { path, versions };
}

async function isOpen(path: OwnedPath) {
  return (await getDraft(env.DB, path)).open;
}

async function publishedNumbers(path: OwnedPath) {
  return (await getDraft(env.DB, path)).versions
    .filter((v) => v.published)
    .map((v) => v.number);
}

async function offered(pathId: string) {
  return (await getOfferedVersion(env.DB, pathId, null))?.version.number;
}

describe("publishing a Path's versions (#191)", () => {
  it("publishes and unpublishes a saved version, each twice changing nothing more", async () => {
    const { path, versions } = await publishersPath(2);

    for (let i = 0; i < 2; i++) {
      expect(await publishVersion(env.DB, path, 1)).toEqual({
        ok: true,
        version: {
          id: versions[0].id,
          number: 1,
          savedAt: versions[0].savedAt,
          published: true,
        },
      });
      expect(await publishedNumbers(path)).toEqual([1]);
    }

    for (let i = 0; i < 2; i++) {
      expect(await unpublishVersion(env.DB, path, 1)).toMatchObject({
        ok: true,
        version: { number: 1, published: false },
        closed: false,
      });
      expect(await publishedNumbers(path)).toEqual([]);
    }
  });

  it("refuses a number the Path has no version for, changing nothing", async () => {
    const { path } = await publishersPath(1);

    expect(await publishVersion(env.DB, path, 2)).toEqual({
      ok: false,
      reason: "not-found",
    });
    expect(await unpublishVersion(env.DB, path, 2)).toEqual({
      ok: false,
      reason: "not-found",
    });
    expect(await publishedNumbers(path)).toEqual([]);
  });

  it("offers the highest-numbered published version at the root, falling back when it's unpublished", async () => {
    const { path } = await publishersPath(3);
    expect(await offered(path.id)).toBeUndefined();

    await publishVersion(env.DB, path, 2);
    expect(await offered(path.id)).toBe(2);
    await publishVersion(env.DB, path, 1);
    expect(await offered(path.id)).toBe(2);

    await unpublishVersion(env.DB, path, 2);
    expect(await offered(path.id)).toBe(1);
  });

  it("works out the offered number from the published versions alone", () => {
    expect(offeredNumber([])).toBeNull();
    expect(
      offeredNumber([
        { number: 3, published: false },
        { number: 2, published: false },
      ]),
    ).toBeNull();
    expect(
      offeredNumber([
        { number: 1, published: true },
        { number: 3, published: false },
        { number: 2, published: true },
      ]),
    ).toBe(2);
  });
});

describe("a Path's offered versions, for any viewer (#191)", () => {
  it("gives a published version by number, or the root's, with its Milestones and whether the Path is open, and nothing about its owner", async () => {
    const { path, versions } = await publishersPath(2);
    await publishVersion(env.DB, path, 1);
    await publishVersion(env.DB, path, 2);
    await openPath(env.DB, path);
    const [one, two] = versions.map(
      ({ id, pathId, number, name, description, savedAt, milestones }) => ({
        id,
        pathId,
        number,
        name,
        description,
        savedAt,
        milestones,
      }),
    );

    const root = await getOfferedVersion(env.DB, path.id, null);
    expect(root).toEqual({ version: two, open: true });
    expect(await getOfferedVersion(env.DB, path.id, 1)).toEqual({
      version: one,
      open: true,
    });
    expect(JSON.stringify(root)).not.toContain(PUBLISHER_ID);
    expect(JSON.stringify(root)).not.toContain(
      TEST_EMAILS.pathsModulePublisher,
    );
  });

  it("gives nothing for an unpublished version, an unknown number or Path, or a Path with none published", async () => {
    const { path } = await publishersPath(2);
    expect(await getOfferedVersion(env.DB, path.id, null)).toBeNull();
    expect(await getOfferedVersion(env.DB, path.id, 1)).toBeNull();

    await publishVersion(env.DB, path, 2);

    expect(await getOfferedVersion(env.DB, path.id, 1)).toBeNull();
    expect(await getOfferedVersion(env.DB, path.id, 3)).toBeNull();
    expect(await getOfferedVersion(env.DB, "no-such-path", null)).toBeNull();
  });

  it("offers Dream Sequence's version 1, open", async () => {
    for (const number of [null, 1]) {
      expect(
        await getOfferedVersion(env.DB, "dream-sequence", number),
      ).toMatchObject({
        version: { id: "starter", number: 1, name: "Dream Sequence" },
        open: true,
      });
    }
  });
});

describe("opening and closing a Path (#191)", () => {
  it("refuses to open a Path with no published version, leaving it closed", async () => {
    const { path } = await publishersPath(1);

    expect(await openPath(env.DB, path)).toEqual({
      ok: false,
      reason: "none-published",
    });
    expect(await isOpen(path)).toBe(false);
  });

  it("opens once a version is published, and closes, each twice changing nothing more", async () => {
    const { path } = await publishersPath(1);
    await publishVersion(env.DB, path, 1);
    expect(await isOpen(path)).toBe(false);

    for (let i = 0; i < 2; i++) {
      expect(await openPath(env.DB, path)).toEqual({ ok: true });
      expect(await isOpen(path)).toBe(true);
    }
    for (let i = 0; i < 2; i++) {
      await closePath(env.DB, path);
      expect(await isOpen(path)).toBe(false);
    }
    expect(await publishedNumbers(path)).toEqual([1]);
  });

  it("stays closed when a version is published", async () => {
    const { path } = await publishersPath(2);
    await publishVersion(env.DB, path, 1);
    await openPath(env.DB, path);
    await closePath(env.DB, path);

    await publishVersion(env.DB, path, 2);

    expect(await isOpen(path)).toBe(false);
  });

  it("closes when its only published version left is unpublished, and says so", async () => {
    const { path } = await publishersPath(2);
    await publishVersion(env.DB, path, 1);
    await publishVersion(env.DB, path, 2);
    await openPath(env.DB, path);

    expect(await unpublishVersion(env.DB, path, 2)).toMatchObject({
      ok: true,
      closed: false,
    });
    expect(await isOpen(path)).toBe(true);

    expect(await unpublishVersion(env.DB, path, 1)).toMatchObject({
      ok: true,
      closed: true,
    });
    expect(await isOpen(path)).toBe(false);
    expect(await unpublishVersion(env.DB, path, 1)).toMatchObject({
      ok: true,
      closed: false,
    });
  });

  it("leaves when the Draft was last edited alone", async () => {
    const { path } = await publishersPath(1);
    const before = (await getDraft(env.DB, path)).updatedAt;
    await tick();

    await publishVersion(env.DB, path, 1);
    await openPath(env.DB, path);
    await closePath(env.DB, path);

    expect((await getDraft(env.DB, path)).updatedAt).toBe(before);
  });
});

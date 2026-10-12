import { Hono, type Context } from "hono";

import { currentSession } from "./auth";
import type { WorkerEnv } from "./env";
import {
  createIdea,
  deleteIdea,
  IDEA_NAME_MAX_LENGTH,
  listIdeas,
  renameIdea,
} from "./ideas";
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
} from "./journeys";
import { getTrailheadVersion, getVersion, listFollowable } from "./paths";
import {
  deleteProduct,
  getProduct,
  type OwnedProduct,
  PRODUCT_DESCRIPTION_MAX_LENGTH,
  updateProductDescription,
} from "./products";
import { listTags, listTagsByIdea, setIdeaTags } from "./tags";
import { parseAnswers } from "./worksheets";

type ProductEnv = {
  Bindings: WorkerEnv;
  Variables: { userId: string; product: OwnedProduct };
};

/**
 * Every route about one Product (#154), mounted at
 * `/api/products/:productId`. The middleware below is the only place a
 * route here learns which Product it's about: it answers 401 with no
 * session, and 404 for a Product that doesn't exist or isn't the caller's —
 * the two read identically, so a stranger can't tell someone else's Product
 * exists. Past it, a handler gets the checked Product as `c.var.product`.
 *
 * The origin check on requests that change data is `index.ts`'s, in front
 * of every `/api/*` route, this one included.
 */
export const productRoutes = new Hono<ProductEnv>();

productRoutes.use(async (c, next) => {
  const session = await currentSession(c.env, c.req.raw);
  if (!session) {
    return c.json({ error: "Not signed in" }, 401);
  }

  const product = await getProduct(
    c.env.DB,
    session.user.id,
    c.req.param("productId") ?? "",
  );
  if (!product) {
    return c.json({ error: "Not found" }, 404);
  }

  c.set("userId", session.user.id);
  c.set("product", product);
  await next();
});

/**
 * Parse and validate an Idea `name` from the request body — shared by
 * create (POST) and rename (PATCH) so both enforce the same rule: a
 * string, non-empty after trimming, at most `IDEA_NAME_MAX_LENGTH`.
 * Returns the trimmed name, or the 400 response to send instead.
 */
async function readIdeaName(c: Context<ProductEnv>) {
  const body = await c.req.json().catch(() => null);
  const name =
    body && typeof body === "object" && typeof body.name === "string"
      ? body.name.trim()
      : "";
  if (!name) {
    return c.json({ error: "name is required" }, 400);
  }
  if (name.length > IDEA_NAME_MAX_LENGTH) {
    return c.json(
      { error: `name must be ${IDEA_NAME_MAX_LENGTH} characters or fewer` },
      400,
    );
  }
  return name;
}

/** Products v1 slice 2 (issue #89): delete the Product. */
productRoutes.delete("/", async (c) => {
  const deleted = await deleteProduct(c.env.DB, c.var.userId, c.var.product);
  if (!deleted) {
    return c.json({ error: "Not found" }, 404);
  }

  return c.json({}, 200);
});

/**
 * Issue #112: set or clear the Product's description. `description` must
 * be a string; it's trimmed, and an empty result is stored as `null` ("no
 * description") — unlike `name`, empty is valid. Responds with the stored
 * Product so the client shows what was saved.
 */
productRoutes.patch("/", async (c) => {
  const body = await c.req.json().catch(() => null);
  if (
    !body ||
    typeof body !== "object" ||
    typeof body.description !== "string"
  ) {
    return c.json({ error: "description must be a string" }, 400);
  }
  const description = body.description.trim();
  if (description.length > PRODUCT_DESCRIPTION_MAX_LENGTH) {
    return c.json(
      {
        error: `description must be ${PRODUCT_DESCRIPTION_MAX_LENGTH} characters or fewer`,
      },
      400,
    );
  }

  const product = await updateProductDescription(
    c.env.DB,
    c.var.userId,
    c.var.product,
    description || null,
  );
  if (!product) {
    return c.json({ error: "Not found" }, 404);
  }

  return c.json({ product }, 200);
});

/**
 * Ideas v1 slice 1 (issue #99): the Product's own flat list of Ideas.
 * Bundles the Product's own `{ id, name, description, createdAt }` into the
 * response rather than a separate endpoint, since the page needs the
 * Product's name for its heading.
 */
productRoutes.get("/ideas", async (c) => {
  const { product } = c.var;
  const [ideas, tagsByIdea] = await Promise.all([
    listIdeas(c.env.DB, product),
    listTagsByIdea(c.env.DB, product),
  ]);
  return c.json({
    product,
    ideas: ideas.map((idea) => ({
      ...idea,
      tags: tagsByIdea.get(idea.id) ?? [],
    })),
  });
});

productRoutes.post("/ideas", async (c) => {
  const name = await readIdeaName(c);
  if (typeof name !== "string") {
    return name;
  }

  const idea = await createIdea(c.env.DB, c.var.product, name);
  // A new Idea has no Tags yet (#113) — the client sets them with a
  // follow-up PUT — but carries the same shape the list response does.
  return c.json({ idea: { ...idea, tags: [] } }, 201);
});

/**
 * Ideas v1 slice 2 (issue #100): delete an Idea under the Product, scoped
 * by both `id` and the Product. Zero rows changed means either the Idea
 * doesn't exist or isn't under this Product — the response never
 * distinguishes the two, so it's always 404, never 403.
 */
productRoutes.delete("/ideas/:id", async (c) => {
  const deleted = await deleteIdea(c.env.DB, c.var.product, c.req.param("id"));
  if (!deleted) {
    return c.json({ error: "Not found" }, 404);
  }

  return c.json({}, 200);
});

/**
 * Issue #102: rename an Idea under the Product, with the same `name`
 * validation as create (`readIdeaName`). Zero rows matched reads as 404,
 * never 403, for the same reason DELETE gives. Responds with the renamed
 * Idea so the client shows the stored (trimmed) name, not its own copy.
 */
productRoutes.patch("/ideas/:id", async (c) => {
  const { product } = c.var;
  const name = await readIdeaName(c);
  if (typeof name !== "string") {
    return name;
  }

  const idea = await renameIdea(c.env.DB, product, c.req.param("id"), name);
  if (!idea) {
    return c.json({ error: "Not found" }, 404);
  }

  // Same shape the list response gives an Idea (#113), so the client can
  // swap the renamed Idea in without dropping its Tags.
  const tagsByIdea = await listTagsByIdea(c.env.DB, product);
  return c.json(
    { idea: { ...idea, tags: tagsByIdea.get(idea.id) ?? [] } },
    200,
  );
});

/**
 * Issue #113: replace one Idea's whole Tag set. Zero Ideas matched reads as
 * 404, never 403, for the same reason as rename. `tags` must be an array of
 * names that all exist in the catalog — anything else is a 400 and changes
 * nothing. Responds with the stored set (deduplicated, alphabetical).
 */
productRoutes.put("/ideas/:id/tags", async (c) => {
  const body = await c.req.json().catch(() => null);
  const submitted: unknown =
    body && typeof body === "object" ? body.tags : undefined;
  if (
    !Array.isArray(submitted) ||
    !submitted.every((tag) => typeof tag === "string")
  ) {
    return c.json({ error: "tags must be an array of tag names" }, 400);
  }
  const catalog = new Set(await listTags(c.env.DB));
  const unknown = submitted.filter((tag) => !catalog.has(tag));
  if (unknown.length > 0) {
    return c.json({ error: `Unknown tags: ${unknown.join(", ")}` }, 400);
  }

  const tags = await setIdeaTags(
    c.env.DB,
    c.var.product,
    c.req.param("id"),
    submitted,
  );
  if (!tags) {
    return c.json({ error: "Not found" }, 404);
  }

  return c.json({ tags }, 200);
});

/**
 * Journeys (#137; several per Product since #170): every Journey the Product is
 * on, each with its Path's name and where it's at. Bundles the Product, as
 * the Ideas list does, for the page's heading.
 */
productRoutes.get("/journeys", async (c) => {
  const { product } = c.var;
  return c.json({ product, journeys: await listJourneys(c.env.DB, product) });
});

/**
 * Start a Journey on the saved version `versionId`, at its Milestone 1.
 * 404s for a version the User may not follow, the same as one that doesn't
 * exist. A repeat start on the same version is harmless: it leaves that
 * Journey's progress as it was and answers 200 rather than 201, with the
 * same id.
 */
productRoutes.post("/journeys", async (c) => {
  const body = await c.req.json().catch(() => null);
  const versionId: unknown =
    body && typeof body === "object" ? body.versionId : undefined;
  if (typeof versionId !== "string") {
    return c.json({ error: "versionId is required" }, 400);
  }
  const version = await getVersion(c.env.DB, c.var.userId, versionId);
  if (!version) {
    return c.json({ error: "Not found" }, 404);
  }

  const { journeyId, started } = await startJourney(
    c.env.DB,
    c.var.product,
    version,
  );
  return c.json({ journeyId }, started ? 201 : 200);
});

/** The Product's Journey named in the URL, or `null` for the 404. */
function journeyIn(c: Context<ProductEnv>) {
  return loadJourney(c.env.DB, c.var.product, c.req.param("journeyId") ?? "");
}

/**
 * One Journey: its version's Milestones, its progress, and its Worksheets
 * and Tasks. Bundles the Product for the Journey page's heading.
 */
productRoutes.get("/journeys/:journeyId", async (c) => {
  const journey = await journeyIn(c);
  if (!journey) {
    return c.json({ error: "Not found" }, 404);
  }

  return c.json({
    product: c.var.product,
    ...(await journeyState(c.env.DB, journey)),
  });
});

/** Advance the Journey one Milestone, or finish it from the last (#138). */
productRoutes.post("/journeys/:journeyId/advance", async (c) => {
  const journey = await journeyIn(c);
  if (!journey) {
    return c.json({ error: "Not found" }, 404);
  }

  await advanceJourney(c.env.DB, journey);
  return c.json(await journeyState(c.env.DB, journey), 200);
});

/**
 * Return the Journey by one Milestone, or put it back in progress if it's
 * completed; see `returnJourney`.
 */
productRoutes.post("/journeys/:journeyId/return", async (c) => {
  const journey = await journeyIn(c);
  if (!journey) {
    return c.json({ error: "Not found" }, 404);
  }

  await returnJourney(c.env.DB, journey);
  return c.json(await journeyState(c.env.DB, journey), 200);
});

/**
 * Worksheets (issue #139): the Product's instance of one Worksheet on the
 * Journey, the Worksheet and its answers. 404s for no such Journey or no
 * such Worksheet. Bundles the Product for the Worksheet page's heading.
 */
productRoutes.get("/journeys/:journeyId/worksheets/:worksheetId", async (c) => {
  const journey = await journeyIn(c);
  if (!journey) {
    return c.json({ error: "Not found" }, 404);
  }

  const state = await worksheetState(
    c.env.DB,
    journey,
    c.req.param("worksheetId"),
  );
  if (!state) {
    return c.json({ error: "Not found" }, 404);
  }

  return c.json({ product: c.var.product, ...state });
});

/**
 * Save the Product's answers on one Worksheet, replacing every field (one
 * left out reads as blank). The same 404s as reading it. Saving works at
 * any point in the Journey, completed or not.
 */
productRoutes.put("/journeys/:journeyId/worksheets/:worksheetId", async (c) => {
  const worksheetId = c.req.param("worksheetId");
  const journey = await journeyIn(c);
  if (!journey) {
    return c.json({ error: "Not found" }, 404);
  }

  const state = await worksheetState(c.env.DB, journey, worksheetId);
  if (!state) {
    return c.json({ error: "Not found" }, 404);
  }

  const body = await c.req.json().catch(() => null);
  const answers = parseAnswers(
    state.worksheet,
    body && typeof body === "object" ? body.answers : null,
  );
  if (!answers) {
    return c.json(
      { error: "answers must map this Worksheet's fields to text" },
      400,
    );
  }

  await saveAnswers(c.env.DB, journey, worksheetId, answers);
  return c.json({ product: c.var.product, ...state, answers }, 200);
});

/**
 * Tasks (issue #140): check off or uncheck one of the Journey's Tasks,
 * with `{ "done": true | false }`. 404s for no such Journey or no such
 * Task on its version. Works on any Task, not just the current
 * Milestone's, and never moves the Journey. Answers with the Journey's
 * state, like Advance and Return.
 */
productRoutes.put("/journeys/:journeyId/tasks/:taskId", async (c) => {
  const journey = await journeyIn(c);
  if (!journey) {
    return c.json({ error: "Not found" }, 404);
  }

  const body = await c.req.json().catch(() => null);
  const done = body && typeof body === "object" ? body.done : null;
  if (typeof done !== "boolean") {
    return c.json({ error: "done must be true or false" }, 400);
  }

  const found = await setTaskDone(
    c.env.DB,
    journey,
    c.req.param("taskId"),
    done,
  );
  if (!found) {
    return c.json({ error: "Not found" }, 404);
  }

  return c.json(await journeyState(c.env.DB, journey), 200);
});

/**
 * The Product's latest Journey on each Path it follows, by Path id. Until
 * #172 a Product has at most one Journey per version, but it can still be
 * on two versions of one Path.
 */
async function journeysByPath(
  db: D1Database,
  product: OwnedProduct,
): Promise<Map<string, string>> {
  const journeys = await listJourneys(db, product);
  return new Map(journeys.map((journey) => [journey.pathId, journey.id]));
}

/**
 * Pathfinder (#170): every Path the User can follow, with the Product's
 * Journey on each one it already follows, so the page can link to that
 * Journey and not invite a second start.
 */
productRoutes.get("/pathfinder", async (c) => {
  const { product } = c.var;
  const [paths, journeys] = await Promise.all([
    listFollowable(c.env.DB, c.var.userId),
    journeysByPath(c.env.DB, product),
  ]);
  return c.json({
    product,
    paths: paths.map(({ id, name }) => ({
      id,
      name,
      journeyId: journeys.get(id) ?? null,
    })),
  });
});

/**
 * A Path's Trailhead (#170): one of its saved versions to start a Journey
 * on, its latest unless `?version=n` names another, with every version's
 * number and save date to pick from, and the Product's Journey on the
 * Path if it already follows it. Another User's Path, an unknown one,
 * one with no saved version and a number it doesn't have all 404 alike.
 */
productRoutes.get("/paths/:pathId/trailhead", async (c) => {
  const raw = c.req.query("version");
  const number = raw === undefined ? null : Number(raw);
  const trailhead =
    number === null || Number.isInteger(number)
      ? await getTrailheadVersion(
          c.env.DB,
          c.var.userId,
          c.req.param("pathId"),
          number,
        )
      : null;
  if (!trailhead) {
    return c.json({ error: "Not found" }, 404);
  }

  const { owner, version, versions } = trailhead;
  const journeys = await journeysByPath(c.env.DB, c.var.product);
  return c.json({
    product: c.var.product,
    path: { id: version.pathId, name: version.name, owner },
    version: {
      id: version.id,
      number: version.number,
      description: version.description,
      milestones: version.milestones,
    },
    versions: versions.map(({ number, savedAt }) => ({ number, savedAt })),
    latestNumber: versions[0].number,
    journeyId: journeys.get(version.pathId) ?? null,
  });
});

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
  loadJourney,
  returnJourney,
  saveAnswers,
  setTaskDone,
  startJourney,
  worksheetState,
} from "./journeys";
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
 * Journeys (issue #137): the Product's Journey on the default Path — the
 * only Path Phase 1 ships, so there's no Path in the URL. `journey` is
 * `null` until the User starts one; `path` is always there so the page can
 * name what starting would mean. Bundles the Product itself, as the Ideas
 * list does, for the Journey page's heading.
 */
productRoutes.get("/journey", async (c) => {
  const { product } = c.var;
  return c.json({ product, ...(await journeyState(c.env.DB, product)) });
});

/**
 * Start the Product's Journey on the default Path, at Milestone 1. A repeat
 * start is harmless: it leaves the existing Journey's progress as it was
 * and answers 200 rather than 201.
 */
productRoutes.post("/journey", async (c) => {
  const { product } = c.var;
  const started = await startJourney(c.env.DB, product);
  return c.json(await journeyState(c.env.DB, product), started ? 201 : 200);
});

/**
 * Advance the Product's Journey one Milestone (issue #138). 404s when
 * there's no Journey to advance — the Journey page only ever shows this
 * action once one's started, so reaching this with none is a stale
 * request, not a real "nothing to do" case worth a 200 for.
 */
productRoutes.post("/journey/advance", async (c) => {
  const { product } = c.var;
  const journey = await loadJourney(c.env.DB, product);
  if (!journey) {
    return c.json({ error: "Not found" }, 404);
  }

  await advanceJourney(c.env.DB, journey);
  return c.json(await journeyState(c.env.DB, product), 200);
});

/**
 * Return the Product's Journey by one Milestone, or put it back in
 * progress if it's completed — see `returnJourney`. The same 404 as
 * advancing when there's no Journey to return.
 */
productRoutes.post("/journey/return", async (c) => {
  const { product } = c.var;
  const journey = await loadJourney(c.env.DB, product);
  if (!journey) {
    return c.json({ error: "Not found" }, 404);
  }

  await returnJourney(c.env.DB, journey);
  return c.json(await journeyState(c.env.DB, product), 200);
});

/**
 * Worksheets (issue #139): the Product's instance of one Worksheet on its
 * Journey — the Worksheet and its answers. 404s when the Product hasn't
 * started its Journey or there's no such Worksheet. Bundles the Product
 * for the Worksheet page's heading.
 */
productRoutes.get("/worksheets/:worksheetId", async (c) => {
  const { product } = c.var;
  const journey = await loadJourney(c.env.DB, product);
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

  return c.json({ product, ...state });
});

/**
 * Save the Product's answers on one Worksheet, replacing every field (one
 * left out reads as blank). The same 404s as reading it. Saving works at
 * any point in the Journey, completed or not.
 */
productRoutes.put("/worksheets/:worksheetId", async (c) => {
  const { product } = c.var;
  const worksheetId = c.req.param("worksheetId");
  const journey = await loadJourney(c.env.DB, product);
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
  return c.json({ product, ...state, answers }, 200);
});

/**
 * Tasks (issue #140): check off or uncheck one of the Product's Tasks on
 * its Journey, with `{ "done": true | false }`. The same 404s as a
 * Worksheet when the Product hasn't started its Journey or there's no such
 * Task on the Path. Works on any Task, not just the current Milestone's,
 * and never moves the Journey. Answers with the Journey's state, like
 * Advance and Return.
 */
productRoutes.put("/tasks/:taskId", async (c) => {
  const { product } = c.var;
  const journey = await loadJourney(c.env.DB, product);
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

  return c.json(await journeyState(c.env.DB, product), 200);
});

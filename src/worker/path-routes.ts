import { Hono } from "hono";

import { currentSession } from "./auth";
import type { WorkerEnv } from "./env";
import {
  addMilestone,
  deleteMilestone,
  getDraft,
  getPath,
  MILESTONES_AND_TASKS_PER_PATH,
  type OwnedPath,
  parseMilestoneFields,
  parsePathFields,
  reorderMilestones,
  updateMilestone,
  updatePath,
} from "./paths";

type PathEnv = {
  Bindings: WorkerEnv;
  Variables: { path: OwnedPath };
};

/**
 * Every route about one of the User's Paths and its Draft (#167), mounted
 * at `/api/paths/:pathId`. The middleware is the only place a route here
 * learns which Path it's about, the same as `productRoutes`: 401 with no
 * session, and 404 for a Path that doesn't exist, is another User's, or is
 * Dreamport's, all three alike. Past it, a handler gets `c.var.path`.
 *
 * The origin check on requests that change data is `index.ts`'s, in front
 * of every `/api/*` route.
 */
export const pathRoutes = new Hono<PathEnv>();

pathRoutes.use(async (c, next) => {
  const session = await currentSession(c.env, c.req.raw);
  if (!session) {
    return c.json({ error: "Not signed in" }, 401);
  }

  const path = await getPath(
    c.env.DB,
    session.user.id,
    c.req.param("pathId") ?? "",
  );
  if (!path) {
    return c.json({ error: "Not found" }, 404);
  }

  c.set("path", path);
  await next();
});

/** The Path's Draft: its name, description and Milestones in order. */
pathRoutes.get("/", async (c) => {
  return c.json({ draft: await getDraft(c.env.DB, c.var.path) });
});

/** Set the Draft's name and description. */
pathRoutes.patch("/", async (c) => {
  const fields = parsePathFields(await c.req.json().catch(() => null));
  if (!fields.ok) {
    return c.json({ error: fields.error }, 400);
  }

  const path = await updatePath(c.env.DB, c.var.path, fields.value);
  if (!path) {
    return c.json({ error: "Not found" }, 404);
  }

  return c.json({ path }, 200);
});

const AT_CAP = `A Path can have up to ${MILESTONES_AND_TASKS_PER_PATH} Milestones and Tasks combined. Remove one to make room.`;

pathRoutes.post("/milestones", async (c) => {
  const fields = parseMilestoneFields(await c.req.json().catch(() => null));
  if (!fields.ok) {
    return c.json({ error: fields.error }, 400);
  }

  const added = await addMilestone(c.env.DB, c.var.path, fields.value);
  if (!added.ok) {
    return c.json({ error: AT_CAP }, 409);
  }

  return c.json({ milestone: added.milestone }, 201);
});

/**
 * Put the Draft's Milestones in the order of `{ ids }`, which must name
 * every one of them once. Anything else is a 409: the client's list is
 * stale, and it should reload rather than have the server guess.
 */
pathRoutes.put("/milestones/order", async (c) => {
  const body = await c.req.json().catch(() => null);
  const ids: unknown = body && typeof body === "object" ? body.ids : undefined;
  if (!Array.isArray(ids) || !ids.every((id) => typeof id === "string")) {
    return c.json({ error: "ids must be an array of Milestone ids" }, 400);
  }

  const reordered = await reorderMilestones(c.env.DB, c.var.path, ids);
  if (!reordered) {
    return c.json(
      { error: "The Milestones have changed. Reload to see them." },
      409,
    );
  }

  return c.json({}, 200);
});

/** Replace one Milestone's fields. 404 for one not on this Path. */
pathRoutes.patch("/milestones/:milestoneId", async (c) => {
  const fields = parseMilestoneFields(await c.req.json().catch(() => null));
  if (!fields.ok) {
    return c.json({ error: fields.error }, 400);
  }

  const milestone = await updateMilestone(
    c.env.DB,
    c.var.path,
    c.req.param("milestoneId"),
    fields.value,
  );
  if (!milestone) {
    return c.json({ error: "Not found" }, 404);
  }

  return c.json({ milestone }, 200);
});

pathRoutes.delete("/milestones/:milestoneId", async (c) => {
  const deleted = await deleteMilestone(
    c.env.DB,
    c.var.path,
    c.req.param("milestoneId"),
  );
  if (!deleted) {
    return c.json({ error: "Not found" }, 404);
  }

  return c.json({}, 200);
});

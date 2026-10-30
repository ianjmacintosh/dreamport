import { Hono } from "hono";
import { createMiddleware } from "hono/factory";

import { currentSession } from "./auth";
import type { WorkerEnv } from "./env";
import { isGuide } from "./guides";
import {
  addTask,
  approveRequest,
  closePath,
  deleteMilestone,
  deletePath,
  deleteTask,
  deleteRequest,
  discardChanges,
  getDraft,
  getPath,
  listRequests,
  MILESTONES_AND_TASKS_PER_PATH,
  openPath,
  type OwnedPath,
  parseAccess,
  parseMilestoneFields,
  parsePathUpdate,
  parseTaskFields,
  publishVersion,
  reorderTasks,
  saveVersion,
  setAccess,
  type DraftGap,
  unpublishVersion,
  updateMilestone,
  updatePath,
  updateTask,
} from "./paths";

type PathEnv = {
  Bindings: WorkerEnv;
  Variables: { path: OwnedPath; guide: boolean };
};

/**
 * Every route about one of the User's Paths and its Draft (#167), mounted at
 * `/api/paths/:pathId`. The middleware is the only place a route here learns
 * which Path it's about, the same as `productRoutes`: 401 with no session, and
 * 404 for a Path that doesn't exist, is another User's, is Dreamport's, or is
 * the User's copy of another User's (#192), all alike. Past it, a handler gets
 * `c.var.path`, and `c.var.guide`: whether the User is a Guide.
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
  c.set("guide", isGuide(c.env, session.user.email));
  await next();
});

/** Publish, Unpublish, Open, Close and Access are a Guide's alone (#191): 403 for anyone else. */
const guidesOnly = createMiddleware<PathEnv>(async (c, next) => {
  if (!c.var.guide) {
    return c.json({ error: "Only a Guide can do that." }, 403);
  }
  await next();
});
pathRoutes.use("/versions/:number/published", guidesOnly);
pathRoutes.use("/open", guidesOnly);
pathRoutes.use("/access", guidesOnly);
pathRoutes.use("/requests/*", guidesOnly);
pathRoutes.use("/requests", guidesOnly);

/** A version number from the address: a positive whole number, or null. */
export function versionNumber(raw: string): number | null {
  const number = Number(raw);
  return /^[1-9][0-9]*$/.test(raw) && Number.isSafeInteger(number)
    ? number
    : null;
}

/**
 * The Path's Draft: its name, description and Milestones in order, when it
 * was last edited, whether the Path is open, and its saved versions.
 */
pathRoutes.get("/", async (c) => {
  return c.json({ draft: await getDraft(c.env.DB, c.var.path) });
});

/**
 * Delete the Path, its Draft, every saved version and every Journey on any
 * of them, for good. 409 while the Path is open, or once anyone has Added
 * it (#192).
 */
pathRoutes.delete("/", async (c) => {
  const deleted = await deletePath(c.env.DB, c.var.path);
  if (!deleted.ok) {
    switch (deleted.reason) {
      case "open":
        return c.json({ error: "Close this Path before deleting it." }, 409);
      case "added":
        return c.json(
          { error: "Someone has Added this Path, so it can't be deleted." },
          409,
        );
      case "not-found":
        return c.json({ error: "Not found" }, 404);
    }
  }

  return c.json({}, 200);
});

const AT_CAP = `A Path can have up to ${MILESTONES_AND_TASKS_PER_PATH} Milestones and Tasks combined. Remove one to make room.`;

/**
 * Set the Draft's name, description and Milestones at once (Update Path).
 * `milestones` is the Draft's Milestones in their new order: `{ id }` for
 * an existing one, its fields for a new one. 409 if the existing ones
 * aren't exactly the Draft's (the client's list is stale, and it should
 * reload rather than have the server guess) or the new ones would pass
 * the cap. Answers the Draft as it now stands.
 */
pathRoutes.patch("/", async (c) => {
  const update = parsePathUpdate(await c.req.json().catch(() => null));
  if (!update.ok) {
    return c.json({ error: update.error }, 400);
  }

  const updated = await updatePath(c.env.DB, c.var.path, update.value);
  if (!updated.ok) {
    switch (updated.reason) {
      case "not-found":
        return c.json({ error: "Not found" }, 404);
      case "stale":
        return c.json(
          { error: "The Milestones have changed. Reload to see them." },
          409,
        );
      case "cap":
        return c.json({ error: AT_CAP }, 409);
    }
  }

  return c.json({ draft: updated.draft }, 200);
});

const GAP_NAMES: Record<DraftGap, string> = {
  name: "a name",
  description: "a description",
  milestone: "a Milestone",
};

/** Save the Draft as the Path's next version. 409 if it isn't ready. */
pathRoutes.post("/versions", async (c) => {
  const saved = await saveVersion(c.env.DB, c.var.path);
  if (!saved.ok) {
    const missing = saved.missing.map((gap) => GAP_NAMES[gap]).join(" and ");
    return c.json({ error: `Add ${missing} before saving a version.` }, 409);
  }

  return c.json({ version: saved.version }, 201);
});

/** Publish saved version `:number`. 404 for a number the Path hasn't saved. */
pathRoutes.put("/versions/:number/published", async (c) => {
  const number = versionNumber(c.req.param("number"));
  const published =
    number === null ? null : await publishVersion(c.env.DB, c.var.path, number);
  if (!published?.ok) {
    return c.json({ error: "Not found" }, 404);
  }

  return c.json({ version: published.version }, 200);
});

/**
 * Unpublish saved version `:number`. `closed` says whether that closed the
 * Path, which happens when no published version is left.
 */
pathRoutes.delete("/versions/:number/published", async (c) => {
  const number = versionNumber(c.req.param("number"));
  const unpublished =
    number === null
      ? null
      : await unpublishVersion(c.env.DB, c.var.path, number);
  if (!unpublished?.ok) {
    return c.json({ error: "Not found" }, 404);
  }

  return c.json(
    {
      version: unpublished.version,
      closed: unpublished.closed,
      denied: unpublished.denied,
    },
    200,
  );
});

/** Open the Path to new Adds. 409 while no version is published. */
pathRoutes.put("/open", async (c) => {
  const opened = await openPath(c.env.DB, c.var.path);
  if (!opened.ok) {
    return c.json(
      { error: "Publish a version before opening this Path." },
      409,
    );
  }

  return c.json({}, 200);
});

pathRoutes.delete("/open", async (c) => {
  const denied = await closePath(c.env.DB, c.var.path);
  return c.json({ denied }, 200);
});

/**
 * Set the Path's Access (#214): `{ access: "everyone" | "request" }`. Only
 * later Adds are affected, except that Everyone Approves every pending
 * Request (#215). Answers the Access as it now stands and how many Requests
 * were Approved.
 */
pathRoutes.put("/access", async (c) => {
  const access = parseAccess(await c.req.json().catch(() => null));
  if (!access) {
    return c.json({ error: 'access must be "everyone" or "request".' }, 400);
  }

  const approved = await setAccess(c.env.DB, c.var.path, access);
  return c.json({ access, approved }, 200);
});

/**
 * Every pending Request on the Path, for every version, oldest first (#216):
 * each its id, the requester's email address and the version, and nothing
 * else about them.
 */
pathRoutes.get("/requests", async (c) => {
  return c.json({ requests: await listRequests(c.env.DB, c.var.path) });
});

/**
 * Approve a pending Request (#216): Add its version for its User, through
 * the same Add as ever. 404 if it's no longer pending; 409 where Add would
 * refuse it, leaving the Request.
 */
pathRoutes.post("/requests/:requestId/approve", async (c) => {
  const approved = await approveRequest(
    c.env.DB,
    c.var.path,
    c.req.param("requestId"),
  );
  if (!approved.ok && approved.reason === "gone") {
    return c.json({ error: "That Request is no longer pending." }, 404);
  }
  if (!approved.ok) {
    return c.json({ error: "This Path is no longer available." }, 409);
  }

  return c.json({}, 200);
});

/** Deny a pending Request (#216), leaving no trace. 404 if it's no longer pending. */
pathRoutes.post("/requests/:requestId/deny", async (c) => {
  const denied = await deleteRequest(
    c.env.DB,
    c.var.path,
    c.req.param("requestId"),
  );
  if (!denied) {
    return c.json({ error: "That Request is no longer pending." }, 404);
  }

  return c.json({}, 200);
});

/**
 * Put the Draft back the way its latest saved version has it (Discard
 * Changes). 409 if the Path has no saved version. Answers the Draft as it
 * now stands.
 */
pathRoutes.post("/discard-changes", async (c) => {
  const discarded = await discardChanges(c.env.DB, c.var.path);
  if (!discarded.ok) {
    return c.json({ error: "There's no saved version to go back to." }, 409);
  }

  return c.json({ draft: discarded.draft }, 200);
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

pathRoutes.post("/milestones/:milestoneId/tasks", async (c) => {
  const fields = parseTaskFields(await c.req.json().catch(() => null));
  if (!fields.ok) {
    return c.json({ error: fields.error }, 400);
  }

  const added = await addTask(
    c.env.DB,
    c.var.path,
    c.req.param("milestoneId"),
    fields.value,
  );
  if (!added.ok) {
    return added.reason === "cap"
      ? c.json({ error: AT_CAP }, 409)
      : c.json({ error: "Not found" }, 404);
  }

  return c.json({ task: added.task }, 201);
});

pathRoutes.put("/milestones/:milestoneId/tasks/order", async (c) => {
  const body = await c.req.json().catch(() => null);
  const ids: unknown = body && typeof body === "object" ? body.ids : undefined;
  if (!Array.isArray(ids) || !ids.every((id) => typeof id === "string")) {
    return c.json({ error: "ids must be an array of Task ids" }, 400);
  }

  const reordered = await reorderTasks(
    c.env.DB,
    c.var.path,
    c.req.param("milestoneId"),
    ids,
  );
  if (!reordered) {
    return c.json(
      { error: "The Tasks have changed. Reload to see them." },
      409,
    );
  }

  return c.json({}, 200);
});

pathRoutes.patch("/milestones/:milestoneId/tasks/:taskId", async (c) => {
  const fields = parseTaskFields(await c.req.json().catch(() => null));
  if (!fields.ok) {
    return c.json({ error: fields.error }, 400);
  }

  const task = await updateTask(
    c.env.DB,
    c.var.path,
    c.req.param("milestoneId"),
    c.req.param("taskId"),
    fields.value,
  );
  if (!task) {
    return c.json({ error: "Not found" }, 404);
  }

  return c.json({ task }, 200);
});

pathRoutes.delete("/milestones/:milestoneId/tasks/:taskId", async (c) => {
  const deleted = await deleteTask(
    c.env.DB,
    c.var.path,
    c.req.param("milestoneId"),
    c.req.param("taskId"),
  );
  if (!deleted) {
    return c.json({ error: "Not found" }, 404);
  }

  return c.json({}, 200);
});

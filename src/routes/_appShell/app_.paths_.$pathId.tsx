import { useState, type KeyboardEvent, type ReactNode } from "react";
import { createFileRoute, redirect, useRouter } from "@tanstack/react-router";
import { DotsSixVerticalIcon } from "@phosphor-icons/react";
import { LiveRegion, useAnnouncement } from "@dnd-kit/accessibility";
import {
  closestCenter,
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
  type Announcements,
  type DragEndEvent,
  type UniqueIdentifier,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

import type { BreadcrumbsProps } from "../../components/Breadcrumbs";
import Button from "../../components/Button";
import Dialog from "../../components/Dialog";
import TextArea from "../../components/TextArea";
import TextInput from "../../components/TextInput";

/** As `/api/paths/:pathId` returns them (see `src/worker/paths.ts`). */
interface PathHead {
  id: string;
  name: string;
  description: string;
  createdAt: string;
}

interface VersionSummary {
  id: string;
  number: number;
  savedAt: string;
}

interface MilestoneFields {
  name: string;
  description: string;
  doneWhen: string;
  outcome: string;
}

interface Task {
  id: string;
  title: string;
}

interface Milestone extends MilestoneFields {
  id: string;
  tasks: Task[];
}

/** Mirror `src/worker/paths.ts`; the server enforces the real limits. */
const PATH_NAME_MAX_LENGTH = 200;
const PATH_DESCRIPTION_MAX_LENGTH = 2000;
const MILESTONE_NAME_MAX_LENGTH = 200;
const MILESTONE_DESCRIPTION_MAX_LENGTH = 2000;
const MILESTONE_DONE_WHEN_MAX_LENGTH = 2000;
const MILESTONE_OUTCOME_MAX_LENGTH = 200;
const TASK_TITLE_MAX_LENGTH = 200;

const NO_MILESTONE: MilestoneFields = {
  name: "",
  description: "",
  doneWhen: "",
  outcome: "",
};

/**
 * Plain `fetch` never times out on its own; this aborts after `timeoutMs`
 * so a request to a server that went away lands in a `catch` instead of
 * hanging. Same helper `/app` and the Product pages each keep a copy of.
 */
function fetchWithTimeout(
  input: string,
  init: RequestInit,
  timeoutMs = 5_000,
): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  return fetch(input, { ...init, signal: controller.signal }).finally(() =>
    clearTimeout(timeout),
  );
}

/**
 * Runs `fn`, then waits out the rest of `minMs`, so a pending button state
 * is perceivable rather than a flicker (docs/adr/0013). `Date.now()` stays
 * out of the component for the React Compiler's purity check. Same helper
 * `/app` and the Product pages each keep a copy of.
 */
async function withMinimumDuration<T>(
  fn: () => Promise<T>,
  minMs = 400,
): Promise<T> {
  const startedAt = Date.now();
  try {
    return await fn();
  } finally {
    const remaining = minMs - (Date.now() - startedAt);
    if (remaining > 0) {
      await new Promise((resolve) => setTimeout(resolve, remaining));
    }
  }
}

type Sent<T> =
  | { ok: true; body: T }
  | { ok: false; conflict: string | undefined };

async function send<T>(
  url: string,
  method: string,
  body?: unknown,
): Promise<Sent<T>> {
  const res = await fetchWithTimeout(url, {
    method,
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (res.ok) {
    return { ok: true, body: (await res.json()) as T };
  }
  if (res.status !== 409) {
    return { ok: false, conflict: undefined };
  }
  const { error } = (await res.json().catch(() => ({}))) as {
    error?: string;
  };
  return { ok: false, conflict: error };
}

function announcementsFor<T extends { id: string }>(
  items: readonly T[],
  nameOf: (item: T) => string,
): Announcements {
  const name = (id: UniqueIdentifier) => {
    const item = items.find((i) => i.id === id);
    return item ? nameOf(item) : "";
  };
  const position = (id: UniqueIdentifier) =>
    `${items.findIndex((i) => i.id === id) + 1} of ${items.length}`;
  return {
    onDragStart: ({ active }) =>
      `Picked up ${name(active.id)}, ${position(active.id)}.`,
    onDragOver: ({ active, over }) =>
      over ? `${name(active.id)} is over ${position(over.id)}.` : undefined,
    onDragEnd: ({ active, over }) =>
      over && over.id !== active.id
        ? `Moved ${name(active.id)} to ${position(over.id)}.`
        : `Put ${name(active.id)} back.`,
    onDragCancel: ({ active }) => `Put ${name(active.id)} back.`,
  };
}

// `paths_` so this page is a sibling of `/app/paths` (which renders no
// `<Outlet />`), not its child: the same escape the Journey page uses.
export const Route = createFileRoute("/_appShell/app_/paths_/$pathId")({
  beforeLoad: async ({ params }) => {
    // Not signed in, not this User's Path, offline: back to the list,
    // as an unknown Product goes back to `/app`.
    const res = await fetch(`/api/paths/${params.pathId}`).catch(() => null);
    if (!res || !res.ok) {
      throw redirect({ to: "/app/paths" });
    }
    const { draft } = (await res.json()) as {
      draft: PathHead & {
        milestones: Milestone[];
        updatedAt: string;
        latestVersion: VersionSummary | null;
      };
    };
    return {
      draft,
      breadcrumbs: {
        trail: [{ label: "Paths", href: "/app/paths" }],
        current: draft.name,
      } satisfies BreadcrumbsProps,
    };
  },
  component: PathDraft,
});

const UPDATE_FAILED = "We couldn't update that. Try again in a moment.";
const ADD_FAILED = "We couldn't add that. Try again in a moment.";
const DELETE_FAILED = "We couldn't delete that. Try again in a moment.";
const REORDER_FAILED =
  "We couldn't move that, so it's back where it was. Try again in a moment.";
const SAVE_FAILED = "We couldn't save a version. Try again in a moment.";
const CONNECTION_FAILED =
  "Something went wrong. Check your connection and try again.";

const DATE_TIME = new Intl.DateTimeFormat(undefined, {
  dateStyle: "long",
  timeStyle: "short",
});

/** Which Milestone the Milestone Dialog is open on, if any. */
type MilestoneDialog =
  | { kind: "closed" }
  | { kind: "add" }
  | { kind: "edit"; id: string };

/** What the Milestone Dialog has in flight. */
type MilestonePending = "none" | "saving" | "deleting";

/**
 * Milestones reorder by their handles: dragged by mouse or touch, or with
 * the up and down arrow keys on a focused handle. The new order shows at
 * once and goes to the server whole; if the server refuses it, the old
 * order comes back with an alert line. The handles are off while a
 * reorder is in flight.
 */
function PathDraft() {
  const { draft } = Route.useRouteContext();
  const router = useRouter();
  const [path, setPath] = useState<PathHead>(draft);
  const [milestones, setMilestones] = useState<Milestone[]>(draft.milestones);
  const [updatedAt, setUpdatedAt] = useState(draft.updatedAt);
  const [latestVersion, setLatestVersion] = useState(draft.latestVersion);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState("");

  const [isPathDialogOpen, setIsPathDialogOpen] = useState(false);
  const [pathFields, setPathFields] = useState({ name: "", description: "" });
  const [isUpdatingPath, setIsUpdatingPath] = useState(false);
  const [pathError, setPathError] = useState("");

  const [milestoneDialog, setMilestoneDialog] = useState<MilestoneDialog>({
    kind: "closed",
  });
  const [milestoneFields, setMilestoneFields] =
    useState<MilestoneFields>(NO_MILESTONE);
  const [milestonePending, setMilestonePending] =
    useState<MilestonePending>("none");
  const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);
  const [milestoneError, setMilestoneError] = useState("");

  const [tasksDialogMilestoneId, setTasksDialogMilestoneId] = useState<
    string | null
  >(null);

  const [isReordering, setIsReordering] = useState(false);
  const [reorderError, setReorderError] = useState("");
  const { announce, announcement } = useAnnouncement();
  // A click on a handle only focuses it; a drag starts once the pointer moves.
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
  );

  const base = `/api/paths/${path.id}`;
  const isMilestoneBusy = milestonePending !== "none";

  /** After a Draft write lands: the server's `updatedAt` moved to about now. */
  function touch() {
    setUpdatedAt(new Date().toISOString());
  }

  function openPathDialog() {
    setPathFields({ name: path.name, description: path.description });
    setPathError("");
    setIsPathDialogOpen(true);
  }

  async function updatePath() {
    setPathError("");
    setIsUpdatingPath(true);
    try {
      const updated = await withMinimumDuration(() =>
        send<{ path: PathHead }>(base, "PATCH", pathFields),
      );
      if (!updated.ok) {
        setPathError(UPDATE_FAILED);
        return;
      }
      setPath(updated.body.path);
      touch();
      setIsPathDialogOpen(false);
      // The breadcrumbs come from `beforeLoad`; rerun it for the new name.
      void router.invalidate();
    } catch {
      setPathError(CONNECTION_FAILED);
    } finally {
      setIsUpdatingPath(false);
    }
  }

  function openMilestoneDialog(milestone?: Milestone) {
    setMilestoneFields(
      milestone
        ? {
            name: milestone.name,
            description: milestone.description,
            doneWhen: milestone.doneWhen,
            outcome: milestone.outcome,
          }
        : NO_MILESTONE,
    );
    setMilestoneError("");
    setIsConfirmingDelete(false);
    setMilestoneDialog(
      milestone ? { kind: "edit", id: milestone.id } : { kind: "add" },
    );
  }

  async function saveMilestone() {
    if (milestoneDialog.kind === "closed") return;
    setMilestoneError("");
    setMilestonePending("saving");
    try {
      const saved = await withMinimumDuration(() =>
        milestoneDialog.kind === "add"
          ? send<{ milestone: Omit<Milestone, "tasks"> }>(
              `${base}/milestones`,
              "POST",
              milestoneFields,
            )
          : send<{ milestone: Omit<Milestone, "tasks"> }>(
              `${base}/milestones/${milestoneDialog.id}`,
              "PATCH",
              milestoneFields,
            ),
      );
      if (!saved.ok) {
        setMilestoneError(
          milestoneDialog.kind === "add"
            ? (saved.conflict ?? ADD_FAILED)
            : UPDATE_FAILED,
        );
        return;
      }
      const { milestone } = saved.body;
      setMilestones((prev) =>
        milestoneDialog.kind === "add"
          ? [...prev, { ...milestone, tasks: [] }]
          : prev.map((m) =>
              m.id === milestone.id ? { ...m, ...milestone } : m,
            ),
      );
      touch();
      setMilestoneDialog({ kind: "closed" });
    } catch {
      setMilestoneError(CONNECTION_FAILED);
    } finally {
      setMilestonePending("none");
    }
  }

  async function deleteMilestone(id: string) {
    setMilestoneError("");
    setMilestonePending("deleting");
    try {
      const deleted = await withMinimumDuration(() =>
        send<object>(`${base}/milestones/${id}`, "DELETE"),
      );
      if (!deleted.ok) {
        setMilestoneError(DELETE_FAILED);
        return;
      }
      setMilestones((prev) => prev.filter((m) => m.id !== id));
      touch();
      setMilestoneDialog({ kind: "closed" });
    } catch {
      setMilestoneError(CONNECTION_FAILED);
    } finally {
      setMilestonePending("none");
      setIsConfirmingDelete(false);
    }
  }

  /** Show `next` at once, then send it; put `previous` back if refused. */
  async function reorder(previous: Milestone[], next: Milestone[]) {
    setReorderError("");
    setMilestones(next);
    setIsReordering(true);
    try {
      const saved = await send<object>(`${base}/milestones/order`, "PUT", {
        ids: next.map((m) => m.id),
      });
      if (saved.ok) {
        touch();
      } else {
        setMilestones(previous);
        setReorderError(REORDER_FAILED);
      }
    } catch {
      setMilestones(previous);
      setReorderError(REORDER_FAILED);
    } finally {
      setIsReordering(false);
    }
  }

  async function saveVersion() {
    setSaveError("");
    setIsSaving(true);
    try {
      const saved = await withMinimumDuration(() =>
        send<{ version: VersionSummary }>(`${base}/versions`, "POST"),
      );
      if (!saved.ok) {
        setSaveError(saved.conflict ?? SAVE_FAILED);
        return;
      }
      setLatestVersion(saved.body.version);
    } catch {
      setSaveError(CONNECTION_FAILED);
    } finally {
      setIsSaving(false);
    }
  }

  function onDragEnd({ active, over }: DragEndEvent) {
    if (!over || active.id === over.id) return;
    const from = milestones.findIndex((m) => m.id === active.id);
    const to = milestones.findIndex((m) => m.id === over.id);
    void reorder(milestones, arrayMove(milestones, from, to));
  }

  /** A focused handle's ↑/↓: one place up or down, announced. */
  function moveByKey(index: number, delta: -1 | 1) {
    const to = index + delta;
    if (isReordering || to < 0 || to >= milestones.length) return;
    const moved = milestones[index];
    announce(`Moved ${moved.name} to ${to + 1} of ${milestones.length}.`);
    void reorder(milestones, arrayMove(milestones, index, to));
  }

  const editing =
    milestoneDialog.kind === "edit"
      ? milestones.find((m) => m.id === milestoneDialog.id)
      : undefined;
  const tasksMilestone = milestones.find(
    (m) => m.id === tasksDialogMilestoneId,
  );

  return (
    <>
      <h1>{path.name}</h1>
      {path.description && <p>{path.description}</p>}
      <p>
        <Button variant="secondary" onClick={openPathDialog}>
          Edit
        </Button>
      </p>

      <h2 id="milestones-heading">Milestones</h2>
      {milestones.length === 0 ? (
        <p>No Milestones yet.</p>
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={onDragEnd}
          accessibility={{
            announcements: announcementsFor(milestones, (m) => m.name),
            screenReaderInstructions: {
              draggable:
                "Press the up or down arrow key to move this Milestone, or drag it.",
            },
          }}
        >
          <SortableContext
            items={milestones.map((m) => m.id)}
            strategy={verticalListSortingStrategy}
            disabled={isReordering}
          >
            <ol
              className="list list--ruled"
              aria-labelledby="milestones-heading"
            >
              {milestones.map((milestone, index) => (
                <MilestoneRow
                  key={milestone.id}
                  milestone={milestone}
                  number={index + 1}
                  isReordering={isReordering}
                  onMoveKey={(delta) => moveByKey(index, delta)}
                  onTasks={() => setTasksDialogMilestoneId(milestone.id)}
                  onEdit={() => openMilestoneDialog(milestone)}
                />
              ))}
            </ol>
          </SortableContext>
        </DndContext>
      )}
      <LiveRegion id="milestone-moves" announcement={announcement} />
      {reorderError && <p role="alert">{reorderError}</p>}
      <p>
        <Button onClick={() => openMilestoneDialog()}>Add Milestone</Button>
      </p>

      <p>
        Last edited{" "}
        <time dateTime={updatedAt}>
          {DATE_TIME.format(new Date(updatedAt))}
        </time>
      </p>
      <p role="status">
        {latestVersion ? (
          <>
            Latest version: {latestVersion.number}, saved{" "}
            <time dateTime={latestVersion.savedAt}>
              {DATE_TIME.format(new Date(latestVersion.savedAt))}
            </time>
          </>
        ) : (
          "No saved versions yet."
        )}
      </p>
      <div className="button-group button-group--end">
        <Button
          disabled={isSaving}
          state={isSaving ? "pending" : "ready"}
          onClick={() => void saveVersion()}
        >
          <Button.State name="ready">Save as New Version</Button.State>
          <Button.State name="pending">Saving…</Button.State>
        </Button>
      </div>
      {saveError && <p role="alert">{saveError}</p>}

      <Dialog
        open={isPathDialogOpen}
        onOpenChange={(open) => {
          if (!isUpdatingPath) setIsPathDialogOpen(open);
        }}
        title="Edit Path"
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void updatePath();
          }}
        >
          <TextInput
            id="path-name"
            label="Path name"
            value={pathFields.name}
            onChange={(e) =>
              setPathFields((f) => ({ ...f, name: e.target.value }))
            }
            maxLength={PATH_NAME_MAX_LENGTH}
            disabled={isUpdatingPath}
            required
          />
          <TextArea
            id="path-description"
            label="Description"
            value={pathFields.description}
            onChange={(e) =>
              setPathFields((f) => ({ ...f, description: e.target.value }))
            }
            maxLength={PATH_DESCRIPTION_MAX_LENGTH}
            disabled={isUpdatingPath}
          />
          {pathError && <p role="alert">{pathError}</p>}
          <div className="button-group">
            <Button
              type="submit"
              disabled={isUpdatingPath}
              state={isUpdatingPath ? "pending" : "ready"}
            >
              <Button.State name="ready">Update Path</Button.State>
              <Button.State name="pending">Updating…</Button.State>
            </Button>
            <Button
              variant="secondary"
              disabled={isUpdatingPath}
              onClick={() => setIsPathDialogOpen(false)}
            >
              Cancel
            </Button>
          </div>
        </form>
      </Dialog>

      <Dialog
        open={milestoneDialog.kind !== "closed"}
        onOpenChange={(open) => {
          if (!open && !isMilestoneBusy) {
            setMilestoneDialog({ kind: "closed" });
          }
        }}
        title={
          milestoneDialog.kind === "edit" ? "Edit Milestone" : "Add Milestone"
        }
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void saveMilestone();
          }}
        >
          <TextInput
            id="milestone-name"
            label="Milestone name"
            value={milestoneFields.name}
            onChange={(e) =>
              setMilestoneFields((f) => ({ ...f, name: e.target.value }))
            }
            maxLength={MILESTONE_NAME_MAX_LENGTH}
            disabled={isMilestoneBusy}
            required
          />
          <TextArea
            id="milestone-description"
            label="Description"
            value={milestoneFields.description}
            onChange={(e) =>
              setMilestoneFields((f) => ({
                ...f,
                description: e.target.value,
              }))
            }
            maxLength={MILESTONE_DESCRIPTION_MAX_LENGTH}
            disabled={isMilestoneBusy}
            required
          />
          <TextInput
            id="milestone-done-when"
            label="Done when"
            value={milestoneFields.doneWhen}
            onChange={(e) =>
              setMilestoneFields((f) => ({ ...f, doneWhen: e.target.value }))
            }
            maxLength={MILESTONE_DONE_WHEN_MAX_LENGTH}
            disabled={isMilestoneBusy}
            required
          />
          <TextInput
            id="milestone-outcome"
            label="Outcome"
            helperText="Optional"
            value={milestoneFields.outcome}
            onChange={(e) =>
              setMilestoneFields((f) => ({ ...f, outcome: e.target.value }))
            }
            maxLength={MILESTONE_OUTCOME_MAX_LENGTH}
            disabled={isMilestoneBusy}
          />
          {milestoneError && <p role="alert">{milestoneError}</p>}
          <div className="button-group">
            <Button
              type="submit"
              disabled={isMilestoneBusy}
              state={milestonePending === "saving" ? "pending" : "ready"}
            >
              <Button.State name="ready">
                {editing ? "Update Milestone" : "Add Milestone"}
              </Button.State>
              <Button.State name="pending">
                {editing ? "Updating…" : "Adding…"}
              </Button.State>
            </Button>
            <Button
              variant="secondary"
              disabled={isMilestoneBusy}
              onClick={() => setMilestoneDialog({ kind: "closed" })}
            >
              Cancel
            </Button>
            {editing &&
              (isConfirmingDelete ? (
                <>
                  <Button
                    disabled={isMilestoneBusy}
                    state={
                      milestonePending === "deleting"
                        ? "deleting"
                        : "confirming"
                    }
                    onClick={() => void deleteMilestone(editing.id)}
                  >
                    <Button.State name="confirming">Delete</Button.State>
                    <Button.State name="deleting">Deleting…</Button.State>
                  </Button>
                  <Button
                    variant="secondary"
                    disabled={isMilestoneBusy}
                    onClick={() => setIsConfirmingDelete(false)}
                  >
                    Cancel
                  </Button>
                </>
              ) : (
                <Button
                  variant="secondary"
                  disabled={isMilestoneBusy}
                  onClick={() => setIsConfirmingDelete(true)}
                >
                  Delete
                </Button>
              ))}
          </div>
        </form>
      </Dialog>

      <Dialog
        open={tasksMilestone !== undefined}
        onOpenChange={(open) => {
          if (!open) setTasksDialogMilestoneId(null);
        }}
        title={`Tasks for ${tasksMilestone?.name ?? ""}`}
      >
        {tasksMilestone && (
          <MilestoneTasks
            key={tasksMilestone.id}
            tasksUrl={`${base}/milestones/${tasksMilestone.id}/tasks`}
            tasks={tasksMilestone.tasks}
            onTasksChange={(update) => {
              setMilestones((prev) =>
                prev.map((m) =>
                  m.id === tasksMilestone.id
                    ? { ...m, tasks: update(m.tasks) }
                    : m,
                ),
              );
              touch();
            }}
          />
        )}
        <div className="button-group">
          <Button
            variant="secondary"
            onClick={() => setTasksDialogMilestoneId(null)}
          >
            Done
          </Button>
        </div>
      </Dialog>
    </>
  );
}

function MilestoneTasks({
  tasksUrl,
  tasks,
  onTasksChange,
}: {
  tasksUrl: string;
  tasks: Task[];
  onTasksChange: (update: (tasks: Task[]) => Task[]) => void;
}) {
  const [newTitle, setNewTitle] = useState("");
  const [isAdding, setIsAdding] = useState(false);
  const [isReordering, setIsReordering] = useState(false);
  const [error, setError] = useState("");
  const { announce, announcement } = useAnnouncement();
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
  );

  async function addTask() {
    setError("");
    setIsAdding(true);
    try {
      const added = await withMinimumDuration(() =>
        send<{ task: Task }>(tasksUrl, "POST", { title: newTitle }),
      );
      if (!added.ok) {
        setError(added.conflict ?? ADD_FAILED);
        return;
      }
      onTasksChange((prev) => [...prev, added.body.task]);
      setNewTitle("");
    } catch {
      setError(CONNECTION_FAILED);
    } finally {
      setIsAdding(false);
    }
  }

  async function updateTask(id: string, title: string) {
    setError("");
    try {
      const updated = await withMinimumDuration(() =>
        send<{ task: Task }>(`${tasksUrl}/${id}`, "PATCH", { title }),
      );
      if (!updated.ok) {
        setError(UPDATE_FAILED);
        return false;
      }
      onTasksChange((prev) =>
        prev.map((t) => (t.id === id ? updated.body.task : t)),
      );
      return true;
    } catch {
      setError(CONNECTION_FAILED);
      return false;
    }
  }

  async function deleteTask(id: string) {
    setError("");
    try {
      const deleted = await withMinimumDuration(() =>
        send<object>(`${tasksUrl}/${id}`, "DELETE"),
      );
      if (!deleted.ok) {
        setError(DELETE_FAILED);
        return false;
      }
      onTasksChange((prev) => prev.filter((t) => t.id !== id));
      return true;
    } catch {
      setError(CONNECTION_FAILED);
      return false;
    }
  }

  async function reorder(previous: Task[], next: Task[]) {
    setError("");
    onTasksChange(() => next);
    setIsReordering(true);
    try {
      const saved = await send<object>(`${tasksUrl}/order`, "PUT", {
        ids: next.map((t) => t.id),
      });
      if (!saved.ok) {
        onTasksChange(() => previous);
        setError(REORDER_FAILED);
      }
    } catch {
      onTasksChange(() => previous);
      setError(REORDER_FAILED);
    } finally {
      setIsReordering(false);
    }
  }

  function onDragEnd({ active, over }: DragEndEvent) {
    if (!over || active.id === over.id) return;
    const from = tasks.findIndex((t) => t.id === active.id);
    const to = tasks.findIndex((t) => t.id === over.id);
    void reorder(tasks, arrayMove(tasks, from, to));
  }

  function moveByKey(index: number, delta: -1 | 1) {
    const to = index + delta;
    if (isReordering || to < 0 || to >= tasks.length) return;
    announce(`Moved ${tasks[index].title} to ${to + 1} of ${tasks.length}.`);
    void reorder(tasks, arrayMove(tasks, index, to));
  }

  return (
    <>
      {tasks.length === 0 ? (
        <p>No Tasks yet.</p>
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={onDragEnd}
          accessibility={{
            announcements: announcementsFor(tasks, (t) => t.title),
            screenReaderInstructions: {
              draggable:
                "Press the up or down arrow key to move this Task, or drag it.",
            },
          }}
        >
          <SortableContext
            items={tasks.map((t) => t.id)}
            strategy={verticalListSortingStrategy}
            disabled={isReordering}
          >
            <ol className="list list--ruled" aria-label="Tasks">
              {tasks.map((task, index) => (
                <TaskRow
                  key={task.id}
                  task={task}
                  isReordering={isReordering}
                  onMoveKey={(delta) => moveByKey(index, delta)}
                  onUpdate={(title) => updateTask(task.id, title)}
                  onDelete={() => deleteTask(task.id)}
                />
              ))}
            </ol>
          </SortableContext>
        </DndContext>
      )}
      <LiveRegion id="task-moves" announcement={announcement} />
      {error && <p role="alert">{error}</p>}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void addTask();
        }}
      >
        <div className="field-row">
          <TextInput
            id="new-task-title"
            label="Task title"
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            maxLength={TASK_TITLE_MAX_LENGTH}
            disabled={isAdding}
            required
          />
          <Button
            type="submit"
            disabled={isAdding}
            state={isAdding ? "pending" : "ready"}
          >
            <Button.State name="ready">Add Task</Button.State>
            <Button.State name="pending">Adding…</Button.State>
          </Button>
        </div>
      </form>
    </>
  );
}

type TaskPending = "none" | "updating" | "deleting";

function TaskRow({
  task,
  isReordering,
  onMoveKey,
  onUpdate,
  onDelete,
}: {
  task: Task;
  isReordering: boolean;
  onMoveKey: (delta: -1 | 1) => void;
  onUpdate: (title: string) => Promise<boolean>;
  onDelete: () => Promise<boolean>;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [title, setTitle] = useState("");
  const [pending, setPending] = useState<TaskPending>("none");
  const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);
  const isBusy = pending !== "none";

  async function update() {
    setPending("updating");
    const updated = await onUpdate(title);
    setPending("none");
    if (updated) setIsEditing(false);
  }

  async function remove() {
    setPending("deleting");
    if (await onDelete()) return;
    setPending("none");
    setIsConfirmingDelete(false);
  }

  function stopEditing() {
    setIsEditing(false);
    setIsConfirmingDelete(false);
  }

  return (
    <SortableRow
      id={task.id}
      label={task.title}
      isReordering={isReordering}
      onMoveKey={onMoveKey}
      isEditing={isEditing}
    >
      {isEditing ? (
        <form
          className="field-row"
          onSubmit={(e) => {
            e.preventDefault();
            void update();
          }}
        >
          <TextInput
            id={`task-title-${task.id}`}
            label="Task title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={TASK_TITLE_MAX_LENGTH}
            disabled={isBusy}
            required
          />
          <div className="button-group">
            <Button
              type="submit"
              disabled={isBusy}
              state={pending === "updating" ? "pending" : "ready"}
            >
              <Button.State name="ready">Update Task</Button.State>
              <Button.State name="pending">Updating…</Button.State>
            </Button>
            <Button variant="secondary" disabled={isBusy} onClick={stopEditing}>
              Cancel
            </Button>
            {isConfirmingDelete ? (
              <Button
                disabled={isBusy}
                state={pending === "deleting" ? "deleting" : "confirming"}
                onClick={() => void remove()}
              >
                <Button.State name="confirming">Delete</Button.State>
                <Button.State name="deleting">Deleting…</Button.State>
              </Button>
            ) : (
              <Button
                variant="secondary"
                disabled={isBusy}
                onClick={() => setIsConfirmingDelete(true)}
              >
                Delete
              </Button>
            )}
          </div>
        </form>
      ) : (
        <>
          <span className="list-row-name">{task.title}</span>
          <div className="list-row-action">
            <Button
              variant="secondary"
              onClick={() => {
                setTitle(task.title);
                setIsEditing(true);
              }}
            >
              Edit
            </Button>
          </div>
        </>
      )}
    </SortableRow>
  );
}

function MilestoneRow({
  milestone,
  number,
  isReordering,
  onMoveKey,
  onTasks,
  onEdit,
}: {
  milestone: Milestone;
  number: number;
  isReordering: boolean;
  onMoveKey: (delta: -1 | 1) => void;
  onTasks: () => void;
  onEdit: () => void;
}) {
  return (
    <SortableRow
      id={milestone.id}
      label={milestone.name}
      isReordering={isReordering}
      onMoveKey={onMoveKey}
    >
      <span className="list-row-name">
        {number}. {milestone.name}
      </span>
      <div className="list-row-action">
        <div className="button-group">
          <Button variant="secondary" onClick={onTasks}>
            Tasks
          </Button>
          <Button variant="secondary" onClick={onEdit}>
            Edit
          </Button>
        </div>
      </div>
    </SortableRow>
  );
}

/**
 * A row of a sortable list, moved by its handle. While `isEditing` it's a
 * plain row with no handle, for an in-place edit form, still registered
 * with the list so the rows around it keep their places.
 */
function SortableRow({
  id,
  label,
  isReordering,
  onMoveKey,
  isEditing = false,
  children,
}: {
  id: string;
  /** The item's name, for the handle's "Move …" label. */
  label: string;
  isReordering: boolean;
  onMoveKey: (delta: -1 | 1) => void;
  isEditing?: boolean;
  children: ReactNode;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });

  function onKeyDown(e: KeyboardEvent<HTMLButtonElement>) {
    if (e.key === "ArrowUp" || e.key === "ArrowDown") {
      e.preventDefault();
      onMoveKey(e.key === "ArrowUp" ? -1 : 1);
    }
  }

  if (isEditing) {
    return (
      <li ref={setNodeRef} className="list-row">
        {children}
      </li>
    );
  }

  return (
    <li
      ref={setNodeRef}
      className={
        isDragging
          ? "list-row list-row--sortable list-row--dragging"
          : "list-row list-row--sortable"
      }
      // dnd-kit positions a row mid-drag with an inline transform; it's
      // computed from the pointer, so a class can't carry it.
      style={{
        transform: CSS.Translate.toString(transform && { ...transform, x: 0 }),
        transition,
      }}
    >
      {/* `aria-disabled`, not `disabled`, while a reorder is in flight: a
          disabled button drops focus, and the next arrow key with it. */}
      <button
        type="button"
        ref={setActivatorNodeRef}
        className="list-row-handle"
        {...attributes}
        {...listeners}
        aria-label={`Move ${label}`}
        aria-disabled={isReordering}
        onKeyDown={onKeyDown}
      >
        <DotsSixVerticalIcon aria-hidden="true" />
      </button>
      {children}
    </li>
  );
}

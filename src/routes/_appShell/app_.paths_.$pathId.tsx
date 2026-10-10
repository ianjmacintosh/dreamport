import { useState, type KeyboardEvent } from "react";
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

interface MilestoneFields {
  name: string;
  description: string;
  doneWhen: string;
  outcome: string;
}

interface Milestone extends MilestoneFields {
  id: string;
}

/** Mirror `src/worker/paths.ts`; the server enforces the real limits. */
const PATH_NAME_MAX_LENGTH = 200;
const PATH_DESCRIPTION_MAX_LENGTH = 2000;
const MILESTONE_NAME_MAX_LENGTH = 200;
const MILESTONE_DESCRIPTION_MAX_LENGTH = 2000;
const MILESTONE_DONE_WHEN_MAX_LENGTH = 2000;
const MILESTONE_OUTCOME_MAX_LENGTH = 200;

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

/** A JSON request; the parsed body on a 2xx, `null` on any other status. */
async function send<T>(
  url: string,
  method: string,
  body?: unknown,
): Promise<T | null> {
  const res = await fetchWithTimeout(url, {
    method,
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return res.ok ? ((await res.json()) as T) : null;
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
      draft: PathHead & { milestones: Milestone[] };
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
const CONNECTION_FAILED =
  "Something went wrong. Check your connection and try again.";

/** Which Milestone the Milestone Dialog is open on, if any. */
type MilestoneDialog =
  | { kind: "closed" }
  | { kind: "add" }
  | { kind: "edit"; id: string };

/** What the Milestone Dialog has in flight. */
type MilestonePending = "none" | "saving" | "deleting";

/**
 * One Path's Draft in Trailblazer (#167): its name and description, then
 * its Milestones in order. "Edit" opens the "Edit Path" Dialog; each
 * Milestone's "Edit", and "Add Milestone" after the list, open the
 * Milestone Dialog, which also holds Delete. There's no save step: each
 * change is sent as it's made.
 *
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

  const [isReordering, setIsReordering] = useState(false);
  const [reorderError, setReorderError] = useState("");
  const { announce, announcement } = useAnnouncement();
  // A click on a handle only focuses it; a drag starts once the pointer moves.
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
  );

  const base = `/api/paths/${path.id}`;
  const isMilestoneBusy = milestonePending !== "none";

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
      if (!updated) {
        setPathError(UPDATE_FAILED);
        return;
      }
      setPath(updated.path);
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
          ? send<{ milestone: Milestone }>(
              `${base}/milestones`,
              "POST",
              milestoneFields,
            )
          : send<{ milestone: Milestone }>(
              `${base}/milestones/${milestoneDialog.id}`,
              "PATCH",
              milestoneFields,
            ),
      );
      if (!saved) {
        setMilestoneError(
          milestoneDialog.kind === "add" ? ADD_FAILED : UPDATE_FAILED,
        );
        return;
      }
      setMilestones((prev) =>
        milestoneDialog.kind === "add"
          ? [...prev, saved.milestone]
          : prev.map((m) =>
              m.id === saved.milestone.id ? saved.milestone : m,
            ),
      );
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
      if (!deleted) {
        setMilestoneError(DELETE_FAILED);
        return;
      }
      setMilestones((prev) => prev.filter((m) => m.id !== id));
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
      if (!saved) {
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

  function position(id: UniqueIdentifier) {
    return `${milestones.findIndex((m) => m.id === id) + 1} of ${milestones.length}`;
  }

  function nameOf(id: UniqueIdentifier) {
    return milestones.find((m) => m.id === id)?.name ?? "";
  }

  const announcements: Announcements = {
    onDragStart: ({ active }) =>
      `Picked up ${nameOf(active.id)}, ${position(active.id)}.`,
    onDragOver: ({ active, over }) =>
      over ? `${nameOf(active.id)} is over ${position(over.id)}.` : undefined,
    onDragEnd: ({ active, over }) =>
      over && over.id !== active.id
        ? `Moved ${nameOf(active.id)} to ${position(over.id)}.`
        : `Put ${nameOf(active.id)} back.`,
    onDragCancel: ({ active }) => `Put ${nameOf(active.id)} back.`,
  };

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
            announcements,
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
    </>
  );
}

/**
 * One Milestone's row: its handle, "{n}. {name}", and Edit. Its own
 * component for `useSortable`, which each sortable row calls once.
 */
function MilestoneRow({
  milestone,
  number,
  isReordering,
  onMoveKey,
  onEdit,
}: {
  milestone: Milestone;
  number: number;
  isReordering: boolean;
  onMoveKey: (delta: -1 | 1) => void;
  onEdit: () => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: milestone.id });

  function onKeyDown(e: KeyboardEvent<HTMLButtonElement>) {
    if (e.key === "ArrowUp" || e.key === "ArrowDown") {
      e.preventDefault();
      onMoveKey(e.key === "ArrowUp" ? -1 : 1);
    }
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
        aria-label={`Move ${milestone.name}`}
        aria-disabled={isReordering}
        onKeyDown={onKeyDown}
      >
        <DotsSixVerticalIcon aria-hidden="true" />
      </button>
      <span className="list-row-name">
        {number}. {milestone.name}
      </span>
      <div className="list-row-action">
        <Button variant="secondary" onClick={onEdit}>
          Edit
        </Button>
      </div>
    </li>
  );
}

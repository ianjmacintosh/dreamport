import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
  type RefObject,
} from "react";
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

interface Draft extends PathHead {
  milestones: Milestone[];
  updatedAt: string;
  latestVersion: VersionSummary | null;
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
    const { draft } = (await res.json()) as { draft: Draft };
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

function taskCount(n: number): string {
  return n === 0 ? "No Tasks" : n === 1 ? "1 Task" : `${n} Tasks`;
}

/**
 * The Path's page (docs/design-decisions.md, #169): its name and
 * description, the route of Milestones beside the picked one and its
 * Tasks, then the save state. Name, description and the Milestones' order
 * change together in the Edit Path Dialog; a Milestone's own fields in
 * the Edit Milestone Dialog; its Tasks right there in the panel.
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
  const [pickedId, setPickedId] = useState<string | null>(null);
  const [pathDialog, setPathDialog] = useState<PathDialogOpening | null>(null);
  const [isEditingMilestone, setIsEditingMilestone] = useState(false);

  const base = `/api/paths/${path.id}`;
  // The first Milestone until one is picked, and again if the picked one
  // is deleted.
  const picked = milestones.find((m) => m.id === pickedId) ?? milestones[0];

  /** After a Draft write lands: the server's `updatedAt` moved to about now. */
  function touch() {
    setUpdatedAt(new Date().toISOString());
  }

  function showUpdatedDraft(updated: Draft) {
    setPath(updated);
    setMilestones(updated.milestones);
    setUpdatedAt(updated.updatedAt);
    setPathDialog(null);
    // The breadcrumbs come from `beforeLoad`; rerun it for the new name.
    void router.invalidate();
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

  const manageMilestones = (
    <p>
      <Button variant="secondary" onClick={() => setPathDialog("milestones")}>
        Manage Milestones
      </Button>
    </p>
  );

  return (
    <>
      <div className="heading-row">
        <h1>{path.name}</h1>
        <Button variant="secondary" onClick={() => setPathDialog("top")}>
          Edit Path
        </Button>
      </div>
      {path.description && <p>{path.description}</p>}

      {picked ? (
        <div className="journey-split journey-split--route-first">
          <div>
            <h2 id="milestones-heading">Milestones</h2>
            <ol aria-labelledby="milestones-heading" className="journey-route">
              {milestones.map((m, index) => (
                <RouteStop
                  key={m.id}
                  milestone={m}
                  number={index + 1}
                  isPicked={m.id === picked.id}
                  onPick={() => setPickedId(m.id)}
                />
              ))}
            </ol>
            {manageMilestones}
          </div>
          <section aria-labelledby="picked-milestone-heading">
            <div className="heading-row">
              <h3 id="picked-milestone-heading">{picked.name}</h3>
              <Button
                variant="secondary"
                onClick={() => setIsEditingMilestone(true)}
              >
                Edit Milestone
              </Button>
            </div>
            {picked.outcome && <p>{picked.outcome}</p>}
            <p>{picked.description}</p>
            <h4>Done When</h4>
            <p>{picked.doneWhen}</p>
            <h4>Tasks</h4>
            <MilestoneTasks
              key={picked.id}
              tasksUrl={`${base}/milestones/${picked.id}/tasks`}
              tasks={picked.tasks}
              onTasksChange={(update) =>
                setMilestones((prev) =>
                  prev.map((m) =>
                    m.id === picked.id ? { ...m, tasks: update(m.tasks) } : m,
                  ),
                )
              }
              onWriteLanded={touch}
            />
          </section>
        </div>
      ) : (
        <>
          <h2>Milestones</h2>
          <p>No Milestones yet.</p>
          {manageMilestones}
        </>
      )}

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

      <EditPathDialog
        opening={pathDialog}
        path={path}
        milestones={milestones}
        pathUrl={base}
        onClose={() => setPathDialog(null)}
        onUpdated={showUpdatedDraft}
      />

      <EditMilestoneDialog
        milestone={isEditingMilestone ? picked : undefined}
        milestonesUrl={`${base}/milestones`}
        onClose={() => setIsEditingMilestone(false)}
        onUpdated={(updated) => {
          setMilestones((prev) =>
            prev.map((m) => (m.id === updated.id ? { ...m, ...updated } : m)),
          );
          touch();
          setIsEditingMilestone(false);
        }}
        onDeleted={(id) => {
          setMilestones((prev) => prev.filter((m) => m.id !== id));
          touch();
          setIsEditingMilestone(false);
        }}
      />
    </>
  );
}

function RouteStop({
  milestone,
  number,
  isPicked,
  onPick,
}: {
  milestone: Milestone;
  number: number;
  isPicked: boolean;
  onPick: () => void;
}) {
  return (
    <li
      className="journey-route-stop"
      data-status={isPicked ? "current" : "future"}
    >
      <span className="journey-route-dot">
        <span aria-hidden="true">{number}</span>
      </span>
      <span className="journey-route-name">
        <button
          type="button"
          className="journey-route-pick"
          aria-pressed={isPicked}
          onClick={onPick}
        >
          {milestone.name}
        </button>
      </span>
      <span className="journey-route-outcome">
        {taskCount(milestone.tasks.length)}
      </span>
    </li>
  );
}

/**
 * Where the Edit Path Dialog opens: at its top ("Edit Path"), or with its
 * Milestones in view ("Manage Milestones").
 */
type PathDialogOpening = "top" | "milestones";

/**
 * One of the Edit Path Dialog's Milestones until Update Path: an existing
 * one, sent back as its id, or one added in the Dialog, sent as its
 * fields. `key` names the row for the sortable list either way.
 */
interface StagedMilestone {
  key: string;
  name: string;
  entry: { id: string } | MilestoneFields;
}

function EditPathDialog({
  opening,
  path,
  milestones,
  pathUrl,
  onClose,
  onUpdated,
}: {
  opening: PathDialogOpening | null;
  path: PathHead;
  milestones: Milestone[];
  pathUrl: string;
  onClose: () => void;
  onUpdated: (draft: Draft) => void;
}) {
  const [isUpdating, setIsUpdating] = useState(false);
  const milestonesHeading = useRef<HTMLHeadingElement>(null);
  return (
    <Dialog
      open={opening !== null}
      onOpenChange={(open) => {
        if (!open && !isUpdating) onClose();
      }}
      title="Edit Path"
      // Onto the Milestones' heading, so focusing the first field doesn't
      // scroll the Dialog back to its top.
      initialFocus={opening === "milestones" ? milestonesHeading : undefined}
    >
      <EditPathForm
        path={path}
        milestones={milestones}
        pathUrl={pathUrl}
        milestonesHeading={milestonesHeading}
        scrollToMilestones={opening === "milestones"}
        isUpdating={isUpdating}
        setIsUpdating={setIsUpdating}
        onCancel={onClose}
        onUpdated={onUpdated}
      />
    </Dialog>
  );
}

/**
 * The Edit Path Dialog's contents, mounted afresh each time it opens.
 * Milestones added or moved here wait for Update Path, which sends them
 * with the name and description in one request, so Cancel really cancels.
 */
function EditPathForm({
  path,
  milestones,
  pathUrl,
  milestonesHeading,
  scrollToMilestones,
  isUpdating,
  setIsUpdating,
  onCancel,
  onUpdated,
}: {
  path: PathHead;
  milestones: Milestone[];
  pathUrl: string;
  milestonesHeading: RefObject<HTMLHeadingElement | null>;
  scrollToMilestones: boolean;
  isUpdating: boolean;
  setIsUpdating: (isUpdating: boolean) => void;
  onCancel: () => void;
  onUpdated: (draft: Draft) => void;
}) {
  const [name, setName] = useState(path.name);
  const [description, setDescription] = useState(path.description);
  const [staged, setStaged] = useState<StagedMilestone[]>(() =>
    milestones.map((m) => ({ key: m.id, name: m.name, entry: { id: m.id } })),
  );
  const [isAdding, setIsAdding] = useState(false);
  const [error, setError] = useState("");
  const { announce, announcement } = useAnnouncement();
  // A click on a handle only focuses it; a drag starts once the pointer moves.
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
  );

  // As the Dialog opens from "Manage Milestones": bring the Milestones up
  // to the top if they start out of view.
  useEffect(() => {
    const heading = milestonesHeading.current;
    if (!scrollToMilestones || !heading) return;
    const { top, bottom } = heading.getBoundingClientRect();
    if (top < 0 || bottom > window.innerHeight) {
      heading.scrollIntoView({ block: "start" });
    }
  }, [scrollToMilestones, milestonesHeading]);

  async function update() {
    setError("");
    setIsUpdating(true);
    try {
      const updated = await withMinimumDuration(() =>
        send<{ draft: Draft }>(pathUrl, "PATCH", {
          name,
          description,
          milestones: staged.map((m) => m.entry),
        }),
      );
      if (!updated.ok) {
        setError(updated.conflict ?? UPDATE_FAILED);
        return;
      }
      onUpdated(updated.body.draft);
    } catch {
      setError(CONNECTION_FAILED);
    } finally {
      setIsUpdating(false);
    }
  }

  function onDragEnd({ active, over }: DragEndEvent) {
    if (!over || active.id === over.id) return;
    const from = staged.findIndex((m) => m.key === active.id);
    const to = staged.findIndex((m) => m.key === over.id);
    setStaged(arrayMove(staged, from, to));
  }

  /** A focused handle's ↑/↓: one place up or down, announced. */
  function moveByKey(index: number, delta: -1 | 1) {
    const to = index + delta;
    if (to < 0 || to >= staged.length) return;
    announce(`Moved ${staged[index].name} to ${to + 1} of ${staged.length}.`);
    setStaged(arrayMove(staged, index, to));
  }

  return (
    <>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void update();
        }}
      >
        <TextInput
          id="path-name"
          label="Path name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={PATH_NAME_MAX_LENGTH}
          disabled={isUpdating}
          required
        />
        <TextArea
          id="path-description"
          label="Description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          maxLength={PATH_DESCRIPTION_MAX_LENGTH}
          disabled={isUpdating}
        />
        <h3 id="path-milestones-heading" ref={milestonesHeading} tabIndex={-1}>
          Milestones
        </h3>
        {staged.length === 0 ? (
          <p>No Milestones yet.</p>
        ) : (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={onDragEnd}
            accessibility={{
              announcements: announcementsFor(
                staged.map((m) => ({ id: m.key, name: m.name })),
                (m) => m.name,
              ),
              screenReaderInstructions: {
                draggable:
                  "Press the up or down arrow key to move this Milestone, or drag it.",
              },
            }}
          >
            <SortableContext
              items={staged.map((m) => m.key)}
              strategy={verticalListSortingStrategy}
              disabled={isUpdating}
            >
              <ol
                className="list list--cards"
                aria-labelledby="path-milestones-heading"
              >
                {staged.map((milestone, index) => (
                  <SortableRow
                    key={milestone.key}
                    id={milestone.key}
                    label={milestone.name}
                    isReordering={isUpdating}
                    onMoveKey={(delta) => moveByKey(index, delta)}
                  >
                    <span className="list-row-name">
                      {index + 1}. {milestone.name}
                    </span>
                  </SortableRow>
                ))}
              </ol>
            </SortableContext>
          </DndContext>
        )}
        <LiveRegion id="milestone-moves" announcement={announcement} />
        <p>
          <Button
            variant="secondary"
            disabled={isUpdating}
            onClick={() => setIsAdding(true)}
          >
            Add Milestone
          </Button>
        </p>
        {error && <p role="alert">{error}</p>}
        <div className="button-group button-group--end">
          <Button variant="secondary" disabled={isUpdating} onClick={onCancel}>
            Cancel
          </Button>
          <Button
            type="submit"
            disabled={isUpdating}
            state={isUpdating ? "pending" : "ready"}
          >
            <Button.State name="ready">Update Path</Button.State>
            <Button.State name="pending">Updating…</Button.State>
          </Button>
        </div>
      </form>
      {/* Outside the form above: React passes a submit up the component
          tree even across a portal, so a form nested inside it would
          submit both. */}
      <AddMilestoneDialog
        open={isAdding}
        onClose={() => setIsAdding(false)}
        onAdd={(fields) => {
          setStaged((prev) => [
            ...prev,
            { key: crypto.randomUUID(), name: fields.name, entry: fields },
          ]);
          setIsAdding(false);
        }}
      />
    </>
  );
}

function MilestoneInputs({
  fields,
  onChange,
  disabled,
}: {
  fields: MilestoneFields;
  onChange: (fields: MilestoneFields) => void;
  disabled: boolean;
}) {
  return (
    <>
      <TextInput
        id="milestone-name"
        label="Milestone name"
        value={fields.name}
        onChange={(e) => onChange({ ...fields, name: e.target.value })}
        maxLength={MILESTONE_NAME_MAX_LENGTH}
        disabled={disabled}
        required
      />
      <TextArea
        id="milestone-description"
        label="Description"
        value={fields.description}
        onChange={(e) => onChange({ ...fields, description: e.target.value })}
        maxLength={MILESTONE_DESCRIPTION_MAX_LENGTH}
        disabled={disabled}
        required
      />
      <TextInput
        id="milestone-done-when"
        label="Done when"
        value={fields.doneWhen}
        onChange={(e) => onChange({ ...fields, doneWhen: e.target.value })}
        maxLength={MILESTONE_DONE_WHEN_MAX_LENGTH}
        disabled={disabled}
        required
      />
      <TextInput
        id="milestone-outcome"
        label="Outcome"
        helperText="Optional"
        value={fields.outcome}
        onChange={(e) => onChange({ ...fields, outcome: e.target.value })}
        maxLength={MILESTONE_OUTCOME_MAX_LENGTH}
        disabled={disabled}
      />
    </>
  );
}

/**
 * Opened from the Edit Path Dialog, on top of it. The new Milestone joins
 * that Dialog's list and is sent with Update Path, so adding sends
 * nothing.
 */
function AddMilestoneDialog({
  open,
  onClose,
  onAdd,
}: {
  open: boolean;
  onClose: () => void;
  onAdd: (fields: MilestoneFields) => void;
}) {
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
      title="Add Milestone"
    >
      <AddMilestoneForm onCancel={onClose} onAdd={onAdd} />
    </Dialog>
  );
}

function AddMilestoneForm({
  onCancel,
  onAdd,
}: {
  onCancel: () => void;
  onAdd: (fields: MilestoneFields) => void;
}) {
  const [fields, setFields] = useState<MilestoneFields>(NO_MILESTONE);
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onAdd(fields);
      }}
    >
      <MilestoneInputs fields={fields} onChange={setFields} disabled={false} />
      <div className="button-group button-group--end">
        <Button variant="secondary" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit">Add Milestone</Button>
      </div>
    </form>
  );
}

/** What the Edit Milestone Dialog has in flight. */
type MilestonePending = "none" | "saving" | "deleting";

/**
 * A Milestone's own fields, and Delete, each taking effect when sent.
 * Open while `milestone` is set.
 */
function EditMilestoneDialog({
  milestone,
  milestonesUrl,
  onClose,
  onUpdated,
  onDeleted,
}: {
  milestone: Milestone | undefined;
  milestonesUrl: string;
  onClose: () => void;
  onUpdated: (milestone: Omit<Milestone, "tasks">) => void;
  onDeleted: (id: string) => void;
}) {
  const [pending, setPending] = useState<MilestonePending>("none");
  return (
    <Dialog
      open={milestone !== undefined}
      onOpenChange={(open) => {
        if (!open && pending === "none") onClose();
      }}
      title="Edit Milestone"
    >
      {milestone && (
        <EditMilestoneForm
          milestone={milestone}
          milestonesUrl={milestonesUrl}
          pending={pending}
          setPending={setPending}
          onCancel={onClose}
          onUpdated={onUpdated}
          onDeleted={onDeleted}
        />
      )}
    </Dialog>
  );
}

function EditMilestoneForm({
  milestone,
  milestonesUrl,
  pending,
  setPending,
  onCancel,
  onUpdated,
  onDeleted,
}: {
  milestone: Milestone;
  milestonesUrl: string;
  pending: MilestonePending;
  setPending: (pending: MilestonePending) => void;
  onCancel: () => void;
  onUpdated: (milestone: Omit<Milestone, "tasks">) => void;
  onDeleted: (id: string) => void;
}) {
  const [fields, setFields] = useState<MilestoneFields>({
    name: milestone.name,
    description: milestone.description,
    doneWhen: milestone.doneWhen,
    outcome: milestone.outcome,
  });
  const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);
  const [error, setError] = useState("");
  const isBusy = pending !== "none";
  const milestoneUrl = `${milestonesUrl}/${milestone.id}`;

  async function update() {
    setError("");
    setPending("saving");
    try {
      const saved = await withMinimumDuration(() =>
        send<{ milestone: Omit<Milestone, "tasks"> }>(
          milestoneUrl,
          "PATCH",
          fields,
        ),
      );
      if (!saved.ok) {
        setError(UPDATE_FAILED);
        return;
      }
      onUpdated(saved.body.milestone);
    } catch {
      setError(CONNECTION_FAILED);
    } finally {
      setPending("none");
    }
  }

  async function remove() {
    setError("");
    setPending("deleting");
    try {
      const deleted = await withMinimumDuration(() =>
        send<object>(milestoneUrl, "DELETE"),
      );
      if (!deleted.ok) {
        setError(DELETE_FAILED);
        setIsConfirmingDelete(false);
        return;
      }
      onDeleted(milestone.id);
    } catch {
      setError(CONNECTION_FAILED);
      setIsConfirmingDelete(false);
    } finally {
      setPending("none");
    }
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void update();
      }}
    >
      <MilestoneInputs fields={fields} onChange={setFields} disabled={isBusy} />
      {error && <p role="alert">{error}</p>}
      <div className="button-group button-group--end">
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
        <Button variant="secondary" disabled={isBusy} onClick={onCancel}>
          Cancel
        </Button>
        <Button
          type="submit"
          disabled={isBusy}
          state={pending === "saving" ? "pending" : "ready"}
        >
          <Button.State name="ready">Update Milestone</Button.State>
          <Button.State name="pending">Updating…</Button.State>
        </Button>
      </div>
    </form>
  );
}

/**
 * A Milestone's Tasks, each change sent at once. A reorder shows at once
 * and goes back if the server refuses it. `onWriteLanded` hears only of
 * writes the server took.
 */
function MilestoneTasks({
  tasksUrl,
  tasks,
  onTasksChange,
  onWriteLanded,
}: {
  tasksUrl: string;
  tasks: Task[];
  onTasksChange: (update: (tasks: Task[]) => Task[]) => void;
  onWriteLanded: () => void;
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
      onWriteLanded();
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
      onWriteLanded();
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
      onWriteLanded();
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
      if (saved.ok) {
        onWriteLanded();
      } else {
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
            <ol className="list list--cards" aria-label="Tasks">
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

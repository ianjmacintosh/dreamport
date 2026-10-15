import { useState } from "react";
import {
  createFileRoute,
  redirect,
  useNavigate,
  useRouter,
} from "@tanstack/react-router";
import {
  CalendarBlankIcon,
  CheckIcon,
  FileTextIcon,
} from "@phosphor-icons/react";

import ActionCard from "../../components/ActionCard";
import Button from "../../components/Button";
import Checkbox from "../../components/Checkbox";
import Dialog from "../../components/Dialog";
import Link from "../../components/Link";
import { journeyBreadcrumbs, journeyStatus } from "./-journey-breadcrumbs";

/**
 * Plain `fetch` never times out on its own — if the server accepts the TCP
 * connection but then goes away without closing it, the request hangs
 * forever. This aborts it after `timeoutMs` so `moveJourney` always lands
 * in its `catch` block instead. Same helper the Product home and `/app`
 * each keep their own copy of.
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
 * in this module-level helper to keep it out of the component, where the
 * React Compiler's purity check would flag it. Same helper the Product home
 * and `/app` each keep their own copy of.
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

/** A Milestone as `/api/products/:productId/journeys/:journeyId` returns it (see `Milestone` in `src/worker/paths.ts`). */
interface Milestone {
  id: string;
  name: string;
  description: string;
  doneWhen: string;
  outcome: string;
}

/**
 * `/api/products/:productId/journeys/:journeyId`'s Path version and
 * Journey (#137, #170): the version with its Milestones in order, its
 * Path's id, and the Journey's progress on it. The GET, Advance, Return and Task check-off
 * all answer with this; the GET also bundles the Product.
 */
interface JourneyState {
  path: {
    id: string;
    pathId: string;
    name: string;
    milestones: Milestone[];
  };
  journey: {
    id: string;
    startedAt: string;
    currentMilestoneId: string;
    finishedAt: string | null;
    abandonedAt: string | null;
  };
  /** The Worksheets on the Path's Milestones, with how much is filled in (#139). */
  worksheets: {
    id: string;
    name: string;
    milestoneIds: string[];
    filled: number;
    total: number;
  }[];
  /** The Tasks on the Path's Milestones, each checked off or not (#140). */
  tasks: {
    id: string;
    title: string;
    milestoneIds: string[];
    done: boolean;
  }[];
}

/**
 * A Journey's Milestone status, by position: before the current one done,
 * after it future (strict sequencing, see CONTEXT.md's Journey).
 */
function milestoneStatus(
  index: number,
  currentIndex: number,
): "done" | "current" | "future" {
  if (index > currentIndex) return "future";
  if (index === currentIndex) return "current";
  return "done";
}

/**
 * A Task titled `EVENT: …` stands in for a scheduled Event (#136). The
 * page shows it without the prefix, with an Event Tag instead (#140) —
 * display only; the title itself is unchanged.
 */
const EVENT_PREFIX = "EVENT: ";

function taskDisplay(title: string): { title: string; isEvent: boolean } {
  return title.startsWith(EVENT_PREFIX)
    ? { title: title.slice(EVENT_PREFIX.length), isEvent: true }
    : { title, isEvent: false };
}

/**
 * Advance, Return, Abandon or Resume (CONTEXT.md) — also each one's endpoint under
 * `/api/products/:productId/journeys/:journeyId/`, each answering with the
 * Journey's state.
 */
type JourneyMove = "advance" | "return" | "abandon" | "resume";

const MOVE_JOURNEY_FAILED: Record<JourneyMove, string> = {
  advance: "We couldn't advance on this Path. Try again in a moment.",
  return: "We couldn't go back on this Path. Try again in a moment.",
  abandon: "We couldn't abandon this Path. Try again in a moment.",
  resume: "We couldn't resume this Path. Try again in a moment.",
};
const SET_TASK_FAILED = "We couldn't save that task. Try again in a moment.";
const RESTART_FAILED = "We couldn't restart this Path. Try again in a moment.";
const DELETE_FAILED = "We couldn't delete this Journey. Try again in a moment.";
const CONNECTION_FAILED =
  "Something went wrong. Check your connection and try again.";

// Filename note: the trailing underscore on `$productId_` makes this a
// sibling of the Product home (`app_.products.$productId.tsx`) rather than
// its child, since that page renders no `<Outlet />`, and `journeys_` makes
// it a sibling of the Journeys page the same way. Same escape hatch `app_`
// uses; see `app_.settings.tsx`'s own header comment.
export const Route = createFileRoute(
  "/_appShell/app_/products/$productId_/journeys_/$journeyId",
)({
  beforeLoad: async ({ params }) => {
    // Same "bounce back rather than show a dead-end error screen" convention
    // as the Product home: anything short of a clean 200 (not signed in, not
    // this User's Product or Journey, offline) redirects to `/app`.
    const res = await fetch(
      `/api/products/${params.productId}/journeys/${params.journeyId}`,
    ).catch(() => null);
    if (!res || !res.ok) {
      throw redirect({ to: "/app" });
    }
    const { product, ...journeyState } = (await res.json()) as {
      product: { id: string; name: string };
    } & JourneyState;
    return {
      product,
      journeyState,
      breadcrumbs: journeyBreadcrumbs({
        product,
        path: { id: journeyState.path.pathId, name: journeyState.path.name },
        journeyId: journeyState.journey.id,
        status: journeyStatus(journeyState.journey),
      }),
    };
  },
  // Restart goes from one Journey's page to another's: a fresh component,
  // not the old Journey's state.
  remountDeps: ({ params }) => params.journeyId,
  component: ProductJourney,
});

/**
 * One of a Product's Journeys (#137, #170), reached from the Product's
 * Paths page, or from a Trailhead's "Start on Path".
 *
 * The Path's name is the h1, as on a Path's own page (#198); the Product
 * is named in the `breadcrumbs` (Products › the Product › Paths › the Path
 * › Current, Completed or Abandoned Journey) in the band under `AppNav`
 * (#109). Below them, `.journey-split` (see global.css): a "Milestones" h2
 * over the route on the left, the content for where you are on the right,
 * level with that h2: the current Milestone's name and description, then
 * h4 sections: "Worksheets" (every Worksheet on the Path, #139, as an
 * `ActionCard` link saying Complete or Incomplete), "Tasks" (the
 * Milestone's own, as `ActionCard`s with a `Checkbox`, #140), and "Done
 * When", with Return / Advance at the column's end. A section with nothing
 * in it is left out. The finished state keeps the Worksheets, but no
 * Tasks. The route was picked from the prototype on `prototype/journey-ux`
 * (#137), the Milestone's sections from `prototype/journey-column` (#140).
 *
 * Only the current stop shows its outcome line under its name, so the
 * route stays short beside the work.
 *
 * The route is an `<ol>`, so screen readers already number each stop; the
 * dot's visible number is hidden from them. A done stop's dot shows a check
 * instead, labelled "Done", and the current one is `aria-current="step"`.
 */
function ProductJourney() {
  const { product, journeyState: initialJourneyState } =
    Route.useRouteContext();
  const [journeyState, setJourneyState] =
    useState<JourneyState>(initialJourneyState);
  /** Which way the Journey is mid-move, if it is — one move at a time. */
  const [moving, setMoving] = useState<JourneyMove | "restart" | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isConfirmingAbandon, setIsConfirmingAbandon] = useState(false);
  /** The Journey in progress on this Path that a refused Resume names. */
  const [activeJourneyId, setActiveJourneyId] = useState<string | null>(null);
  const navigate = useNavigate();
  const router = useRouter();
  /** The Task mid-save, if one is — shown as already toggled until it lands. */
  const [savingTaskId, setSavingTaskId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const { path, journey } = journeyState;
  const journeyUrl = `/api/products/${product.id}/journeys/${journey.id}`;
  const currentIndex = path.milestones.findIndex(
    (milestone) => milestone.id === journey.currentMilestoneId,
  );
  const status = journeyStatus(journey);
  const isFinished = status === "completed";
  const currentMilestone = path.milestones[currentIndex];
  const isLastMilestone = currentIndex === path.milestones.length - 1;
  // Nothing comes before Milestone 1, so Return is hidden there rather than
  // disabled — unlike Advance, there's nothing else for it to do instead.
  const canReturn = status !== "abandoned" && (currentIndex > 0 || isFinished);

  /**
   * Advance to the next Milestone, or finish the Journey from the last one
   * (#138); or Return to the previous one, or un-finish it (CONTEXT.md's
   * Return). Each is the same POST to its own endpoint.
   */
  async function moveJourney(direction: JourneyMove) {
    setError("");
    setActiveJourneyId(null);
    setMoving(direction);
    try {
      const moved = await withMinimumDuration(async () => {
        const res = await fetchWithTimeout(`${journeyUrl}/${direction}`, {
          method: "POST",
        });
        if (!res.ok) {
          // A refused Resume names the Journey in progress on the Path.
          const body = (await res.json().catch(() => null)) as {
            activeJourneyId?: string | null;
          } | null;
          return { ok: false as const, activeJourneyId: body?.activeJourneyId };
        }
        return { ok: true as const, state: (await res.json()) as JourneyState };
      });
      if (!moved.ok) {
        if (moved.activeJourneyId) {
          setActiveJourneyId(moved.activeJourneyId);
        } else {
          setError(MOVE_JOURNEY_FAILED[direction]);
        }
        return;
      }
      setJourneyState(moved.state);
      setIsConfirmingAbandon(false);
      // The breadcrumbs name the status from this route's beforeLoad, which
      // only reruns on a load.
      if (journeyStatus(moved.state.journey) !== status) {
        void router.invalidate();
      }
    } catch {
      setError(CONNECTION_FAILED);
    } finally {
      setMoving(null);
    }
  }

  /**
   * Restart (CONTEXT.md): a new, blank Journey on the Path's latest
   * version, which this page then hands over to. This one stays as it is.
   */
  async function restartJourney() {
    setError("");
    setMoving("restart");
    try {
      const journeyId = await withMinimumDuration(async () => {
        const res = await fetchWithTimeout(`${journeyUrl}/restart`, {
          method: "POST",
        });
        if (!res.ok) {
          return null;
        }
        return ((await res.json()) as { journeyId: string }).journeyId;
      });
      if (!journeyId) {
        setError(RESTART_FAILED);
        return;
      }
      await navigate({
        to: "/app/products/$productId/journeys/$journeyId",
        params: { productId: product.id, journeyId },
      });
    } catch {
      setError(CONNECTION_FAILED);
    } finally {
      setMoving(null);
    }
  }

  /**
   * Check off or uncheck one of the current Milestone's Tasks (#140). Purely
   * informational: it never changes what Advance does.
   */
  async function setTaskDone(taskId: string, done: boolean) {
    setError("");
    setSavingTaskId(taskId);
    try {
      const saved = await withMinimumDuration(async () => {
        const res = await fetchWithTimeout(`${journeyUrl}/tasks/${taskId}`, {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ done }),
        });
        if (!res.ok) {
          return null;
        }
        return (await res.json()) as JourneyState;
      });
      if (!saved) {
        setError(SET_TASK_FAILED);
        return;
      }
      setJourneyState(saved);
    } catch {
      setError(CONNECTION_FAILED);
    } finally {
      setSavingTaskId(null);
    }
  }

  // Only the current Milestone's Tasks: unlike a Worksheet, a Task is about
  // one Milestone's work, not something carried along the whole Path.
  const tasks = journeyState.tasks.filter((task) =>
    task.milestoneIds.includes(currentMilestone.id),
  );
  const taskSection = tasks.length > 0 && (
    <>
      <h4>Tasks</h4>
      <ul className="action-card-list">
        {tasks.map((task) => {
          const { title, isEvent } = taskDisplay(task.title);
          const checked = savingTaskId === task.id ? !task.done : task.done;
          return (
            <li key={task.id}>
              <ActionCard
                leading={
                  <Checkbox
                    checked={checked}
                    disabled={savingTaskId !== null}
                    onChange={() => void setTaskDone(task.id, !task.done)}
                  />
                }
                trailing={
                  isEvent && (
                    <span className="tag">
                      <CalendarBlankIcon weight="bold" aria-hidden="true" />
                      Event
                    </span>
                  )
                }
                done={checked}
              >
                {title}
              </ActionCard>
            </li>
          );
        })}
      </ul>
    </>
  );

  // Every Worksheet on the Path stays a click away on every Milestone, and
  // once finished: the Milestones a Worksheet is on are where it's checked,
  // not the only places it can change (#139).
  const worksheetSection = journeyState.worksheets.length > 0 && (
    <>
      <h4>Worksheets</h4>
      <ul className="action-card-list">
        {journeyState.worksheets.map((worksheet) => (
          <li key={worksheet.id}>
            <ActionCard
              href={`/app/products/${product.id}/journeys/${journey.id}/worksheets/${worksheet.id}`}
              icon={FileTextIcon}
              trailing={
                <ActionCard.Status>
                  {worksheet.filled === worksheet.total
                    ? "Complete"
                    : "Incomplete"}
                </ActionCard.Status>
              }
            >
              {worksheet.name}
            </ActionCard>
          </li>
        ))}
      </ul>
    </>
  );

  const restartButton = (
    <Button
      variant={status === "abandoned" ? "secondary" : "primary"}
      disabled={moving !== null}
      state={moving === "restart" ? "pending" : "ready"}
      onClick={() => void restartJourney()}
    >
      <Button.State name="ready">Restart Path</Button.State>
      <Button.State name="pending">Restarting…</Button.State>
    </Button>
  );

  const returnButton = canReturn && (
    <Button
      variant="secondary"
      disabled={moving !== null}
      state={moving === "return" ? "pending" : "ready"}
      onClick={() => void moveJourney("return")}
    >
      <Button.State name="ready">Return to Previous Milestone</Button.State>
      <Button.State name="pending">Returning…</Button.State>
    </Button>
  );

  return (
    <>
      <h1>{path.name}</h1>
      <div className="journey-split">
        <div>
          <h2 id="milestones-heading">Milestones</h2>
          <ol aria-labelledby="milestones-heading" className="journey-route">
            {path.milestones.map((milestone, index) => {
              // Finished: nothing is current any more, every stop (including
              // the last) reads as done.
              const stop = isFinished
                ? "done"
                : milestoneStatus(index, currentIndex);
              return (
                <li
                  key={milestone.id}
                  className="journey-route-stop"
                  data-status={stop}
                  aria-current={stop === "current" ? "step" : undefined}
                >
                  <span className="journey-route-dot">
                    {stop === "done" ? (
                      <CheckIcon weight="bold" role="img" aria-label="Done" />
                    ) : (
                      <span aria-hidden="true">{index + 1}</span>
                    )}
                  </span>
                  <span className="journey-route-name">{milestone.name}</span>
                  {stop === "current" && (
                    <span className="journey-route-outcome">
                      {milestone.outcome}
                    </span>
                  )}
                </li>
              );
            })}
          </ol>
        </div>
        <section>
          {status === "completed" && (
            <>
              <h3>{path.name} complete</h3>
              <p>
                You&apos;ve worked all the way through {path.name}&rsquo;s
                Milestones, ending with {currentMilestone.name}. Nice work!
              </p>
              {worksheetSection}
              <div className="button-group button-group--end">
                {returnButton}
                {restartButton}
              </div>
            </>
          )}
          {status === "abandoned" && (
            <>
              <h3>{path.name} abandoned</h3>
              <p>
                You stepped away from this Journey on {currentMilestone.name}.
                Resume it there, or restart the Path from the beginning.
              </p>
              {worksheetSection}
              <div className="button-group button-group--end">
                {restartButton}
                <Button
                  disabled={moving !== null}
                  state={moving === "resume" ? "pending" : "ready"}
                  onClick={() => void moveJourney("resume")}
                >
                  <Button.State name="ready">Resume Path</Button.State>
                  <Button.State name="pending">Resuming…</Button.State>
                </Button>
              </div>
            </>
          )}
          {status === "in-progress" && (
            <>
              <h3>{currentMilestone.name}</h3>
              <p>{currentMilestone.description}</p>
              {worksheetSection}
              {taskSection}
              <h4>Done When</h4>
              <p>{currentMilestone.doneWhen}</p>
              <div className="button-group button-group--end">
                {returnButton}
                <Button
                  disabled={moving !== null}
                  state={moving === "advance" ? "pending" : "ready"}
                  onClick={() => void moveJourney("advance")}
                >
                  <Button.State name="ready">
                    {isLastMilestone
                      ? "Mark Journey Complete"
                      : "Advance to Next Milestone"}
                  </Button.State>
                  <Button.State name="pending">Advancing…</Button.State>
                </Button>
              </div>
            </>
          )}
          {error && <p role="alert">{error}</p>}
          {activeJourneyId && (
            <p role="alert">
              {product.name} already has an{" "}
              <Link
                href={`/app/products/${product.id}/journeys/${activeJourneyId}`}
              >
                active Journey
              </Link>{" "}
              on the "{path.name}" Path. A Product cannot have multiple
              simultaneous Journeys on the same Path. You can go to that{" "}
              <Link
                href={`/app/products/${product.id}/journeys/${activeJourneyId}`}
              >
                active Journey
              </Link>{" "}
              screen and either continue that Journey or abandon it.
            </p>
          )}
        </section>
      </div>
      {status === "in-progress" ? (
        // Not destructive, so the usual reveal in place: the answers and
        // checked Tasks stay; only the Journey stops being in progress.
        <div className="button-group button-group--end">
          {isConfirmingAbandon ? (
            <>
              <Button
                variant="secondary"
                disabled={moving !== null}
                onClick={() => setIsConfirmingAbandon(false)}
              >
                Cancel
              </Button>
              <Button
                disabled={moving !== null}
                state={moving === "abandon" ? "pending" : "ready"}
                onClick={() => void moveJourney("abandon")}
              >
                <Button.State name="ready">Abandon Path</Button.State>
                <Button.State name="pending">Abandoning…</Button.State>
              </Button>
            </>
          ) : (
            <Button
              variant="secondary"
              disabled={moving !== null}
              onClick={() => setIsConfirmingAbandon(true)}
            >
              Abandon Path
            </Button>
          )}
        </div>
      ) : (
        <div className="button-group button-group--end">
          <Button variant="secondary" onClick={() => setIsDeleting(true)}>
            Delete This Journey
          </Button>
        </div>
      )}

      <DeleteJourneyDialog
        open={isDeleting}
        productName={product.name}
        pathName={path.name}
        journeyUrl={journeyUrl}
        onClose={() => setIsDeleting(false)}
        onDeleted={() =>
          void navigate({
            to: "/app/products/$productId/journeys",
            params: { productId: product.id },
            replace: true,
          })
        }
      />
    </>
  );
}

/**
 * Deleting a Journey takes its Worksheet answers and checked Tasks, which
 * this page doesn't show, so the warning gets a Dialog of its own, and the
 * Dialog's Delete This Journey deletes on one click (decided for Paths in #171).
 */
function DeleteJourneyDialog({
  open,
  productName,
  pathName,
  journeyUrl,
  onClose,
  onDeleted,
}: {
  open: boolean;
  productName: string;
  pathName: string;
  journeyUrl: string;
  onClose: () => void;
  onDeleted: () => void;
}) {
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState("");

  async function remove() {
    setError("");
    setIsPending(true);
    try {
      const ok = await withMinimumDuration(async () => {
        const res = await fetchWithTimeout(journeyUrl, { method: "DELETE" });
        return res.ok;
      });
      if (ok) {
        onDeleted();
        return;
      }
      setError(DELETE_FAILED);
    } catch {
      setError(CONNECTION_FAILED);
    }
    setIsPending(false);
  }

  function close() {
    setError("");
    onClose();
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next && !isPending) close();
      }}
      title="Delete Journey Permanently?"
    >
      <p>
        This will remove {productName}&rsquo;s Journey on "{pathName}" and
        everything in it, including Worksheet answers and checked Tasks. This
        cannot be undone!
      </p>
      {error && <p role="alert">{error}</p>}
      <div className="button-group button-group--end">
        <Button variant="secondary" disabled={isPending} onClick={close}>
          Cancel
        </Button>
        <Button
          disabled={isPending}
          state={isPending ? "deleting" : "ready"}
          onClick={() => void remove()}
        >
          <Button.State name="ready">Delete This Journey</Button.State>
          <Button.State name="deleting">Deleting…</Button.State>
        </Button>
      </div>
    </Dialog>
  );
}

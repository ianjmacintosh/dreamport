import { useState } from "react";
import { createFileRoute, redirect } from "@tanstack/react-router";
import {
  CalendarBlankIcon,
  CheckIcon,
  FileTextIcon,
} from "@phosphor-icons/react";

import ActionCard from "../../components/ActionCard";
import type { BreadcrumbsProps } from "../../components/Breadcrumbs";
import Button from "../../components/Button";
import Checkbox from "../../components/Checkbox";

/**
 * Plain `fetch` never times out on its own — if the server accepts the TCP
 * connection but then goes away without closing it, the request hangs
 * forever. This aborts it after `timeoutMs` so `startJourney` always lands
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

/** A Milestone as `/api/products/:productId/journey` returns it (see `src/worker/journeys.ts`). */
interface Milestone {
  id: string;
  name: string;
  description: string;
  doneWhen: string;
  outcome: string;
}

/**
 * `/api/products/:productId/journey`'s Path and Journey (#137): the Path
 * with its Milestones in order, and the Journey once started. Both the GET
 * and the start POST answer with this; the GET also bundles the Product.
 */
interface JourneyState {
  path: {
    id: string;
    name: string;
    milestones: Milestone[];
  };
  journey: {
    startedAt: string;
    currentMilestoneId: string;
    finishedAt: string | null;
  } | null;
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
 * A started Journey's Milestone status, by position: before the current one
 * done, after it future (strict sequencing, see CONTEXT.md's Journey).
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

const START_JOURNEY_FAILED =
  "We couldn't start the journey. Try again in a moment.";
/**
 * Advance or Return (CONTEXT.md) — also each one's endpoint under
 * `/api/products/:productId/journey/`.
 */
type JourneyMove = "advance" | "return";

const MOVE_JOURNEY_FAILED: Record<JourneyMove, string> = {
  advance: "We couldn't advance the journey. Try again in a moment.",
  return: "We couldn't return the journey. Try again in a moment.",
};
const SET_TASK_FAILED = "We couldn't save that task. Try again in a moment.";
const CONNECTION_FAILED =
  "Something went wrong. Check your connection and try again.";

// Filename note: `app_.products.$productId_.journey.tsx` — the trailing
// underscore on `$productId_` makes this a sibling of the Product home
// (`app_.products.$productId.tsx`) rather than its child, since that page
// renders no `<Outlet />`. Same escape hatch `app_` uses; see
// `app_.settings.tsx`'s own header comment.
export const Route = createFileRoute(
  "/_appShell/app_/products/$productId_/journey",
)({
  beforeLoad: async ({ params }) => {
    // Same "bounce back rather than show a dead-end error screen" convention
    // as the Product home: anything short of a clean 200 (not signed in, not
    // this User's Product, offline) redirects to `/app`.
    const res = await fetch(`/api/products/${params.productId}/journey`).catch(
      () => null,
    );
    if (!res || !res.ok) {
      throw redirect({ to: "/app" });
    }
    const { product, ...journeyState } = (await res.json()) as {
      product: { id: string; name: string };
    } & JourneyState;
    return {
      product,
      journeyState,
      breadcrumbs: {
        trail: [
          { label: "Products", href: "/app" },
          { label: product.name, href: `/app/products/${product.id}` },
        ],
        current: "Journey",
      } satisfies BreadcrumbsProps,
    };
  },
  component: ProductJourney,
});

/**
 * A Product's Journey (#137), reached from the Journey section on the
 * Product home ("Learn More" before starting, "View Journey" after). Its
 * own page so the Product home only needs a line about it.
 *
 * The Product's name is the h1 and "Journey" the h2, so the page reads as
 * part of the Product; its `breadcrumbs` (Products › the Product ›
 * Journey) go in the band under `AppNav` (#109). Below them,
 * `.journey-split` (see global.css): the
 * Milestones as a route on the left, the content for where you are on the
 * right — before starting, the Path's name, the pitch for it, an
 * invitation and "Start Journey"; after,
 * the current Milestone's name and description, then h4 sections:
 * "Worksheets" (every Worksheet on the Path, #139, as an `ActionCard`
 * link saying Complete or Incomplete), "Tasks" (the Milestone's own, as
 * `ActionCard`s with a `Checkbox`, #140), and "Done When", with Return /
 * Advance at the column's end. A section with nothing in it is left out.
 * The finished state keeps the Worksheets, but no Tasks. The route was
 * picked from the prototype on `prototype/journey-ux` (#137), the
 * Milestone's sections from `prototype/journey-column` (#140).
 *
 * Before starting, every stop shows its outcome line under its name; once
 * started, only the current one does, so the route stays short beside the
 * work.
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
  const [isStarting, setIsStarting] = useState(false);
  /** Which way the Journey is mid-move, if it is — one move at a time. */
  const [moving, setMoving] = useState<JourneyMove | null>(null);
  /** The Task mid-save, if one is — shown as already toggled until it lands. */
  const [savingTaskId, setSavingTaskId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const { path, journey } = journeyState;
  const currentIndex = journey
    ? path.milestones.findIndex(
        (milestone) => milestone.id === journey.currentMilestoneId,
      )
    : -1;
  // Before starting, every Milestone is future and the content column shows
  // the pitch instead of a current Milestone.
  const hasStarted = currentIndex >= 0;
  const isFinished = journey?.finishedAt != null;
  const currentMilestone = path.milestones[currentIndex];
  const isLastMilestone = currentIndex === path.milestones.length - 1;
  // Nothing comes before Milestone 1, so Return is hidden there rather than
  // disabled — unlike Advance, there's nothing else for it to do instead.
  const canReturn = currentIndex > 0 || isFinished;

  async function startJourney() {
    setError("");
    setIsStarting(true);
    try {
      const started = await withMinimumDuration(async () => {
        const res = await fetchWithTimeout(
          `/api/products/${product.id}/journey`,
          { method: "POST" },
        );
        if (!res.ok) {
          return null;
        }
        return (await res.json()) as JourneyState;
      });
      if (!started) {
        setError(START_JOURNEY_FAILED);
        return;
      }
      setJourneyState(started);
    } catch {
      setError(CONNECTION_FAILED);
    } finally {
      setIsStarting(false);
    }
  }

  /**
   * Advance to the next Milestone, or finish the Journey from the last one
   * (#138); or Return to the previous one, or un-finish it (CONTEXT.md's
   * Return). Each is the same POST to its own endpoint.
   */
  async function moveJourney(direction: JourneyMove) {
    setError("");
    setMoving(direction);
    try {
      const moved = await withMinimumDuration(async () => {
        const res = await fetchWithTimeout(
          `/api/products/${product.id}/journey/${direction}`,
          { method: "POST" },
        );
        if (!res.ok) {
          return null;
        }
        return (await res.json()) as JourneyState;
      });
      if (!moved) {
        setError(MOVE_JOURNEY_FAILED[direction]);
        return;
      }
      setJourneyState(moved);
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
        const res = await fetchWithTimeout(
          `/api/products/${product.id}/tasks/${taskId}`,
          {
            method: "PUT",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ done }),
          },
        );
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
  const tasks = currentMilestone
    ? journeyState.tasks.filter((task) =>
        task.milestoneIds.includes(currentMilestone.id),
      )
    : [];
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
              href={`/app/products/${product.id}/worksheets/${worksheet.id}`}
              leading={<FileTextIcon weight="bold" aria-hidden="true" />}
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
      <h1>{product.name}</h1>
      <h2>Journey</h2>
      <div className="journey-split">
        <ol aria-label="Milestones" className="journey-route">
          {path.milestones.map((milestone, index) => {
            // Finished: nothing is current any more, every stop (including
            // the last) reads as done.
            const status = !hasStarted
              ? "future"
              : isFinished
                ? "done"
                : milestoneStatus(index, currentIndex);
            return (
              <li
                key={milestone.id}
                className="journey-route-stop"
                data-status={status}
                aria-current={status === "current" ? "step" : undefined}
              >
                <span className="journey-route-dot">
                  {status === "done" ? (
                    <CheckIcon weight="bold" role="img" aria-label="Done" />
                  ) : (
                    <span aria-hidden="true">{index + 1}</span>
                  )}
                </span>
                <span className="journey-route-name">{milestone.name}</span>
                {(!hasStarted || status === "current") && (
                  <span className="journey-route-outcome">
                    {milestone.outcome}
                  </span>
                )}
              </li>
            );
          })}
        </ol>
        <section>
          {isFinished ? (
            <>
              <h3>{path.name} complete</h3>
              <p>
                You&apos;ve worked all the way through {path.name}&rsquo;s
                Milestones, ending with {currentMilestone.name}. Nice work!
              </p>
              {worksheetSection}
              <div className="button-group button-group--end">
                {returnButton}
              </div>
            </>
          ) : hasStarted ? (
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
                      ? "Finish Journey"
                      : "Advance to Next Milestone"}
                  </Button.State>
                  <Button.State name="pending">Advancing…</Button.State>
                </Button>
              </div>
            </>
          ) : (
            <>
              <h3>{path.name}</h3>
              <p>
                Follow our &ldquo;{path.name}&rdquo; path to take your product
                all the way from a rough idea to a profitable success.
              </p>
              <p>
                Start simple by describing your product and the problem it
                solves, adapt as you learn more about your audience and their
                problem with guided exercises, and use that knowledge to make
                better decisions.
              </p>
              <p>
                Instead of spending months building something and hoping someone
                will want to buy it, {path.name} bakes pricing into the product
                from the start. When you finish the last step, you&apos;ll have
                a product people love and a sustainable path to growth.
              </p>
              <p>
                Start by describing your solution. What problem does it solve?
              </p>
              <Button
                disabled={isStarting}
                state={isStarting ? "pending" : "ready"}
                onClick={() => void startJourney()}
              >
                <Button.State name="ready">Start Journey</Button.State>
                <Button.State name="pending">Starting…</Button.State>
              </Button>
            </>
          )}
          {error && <p role="alert">{error}</p>}
        </section>
      </div>
    </>
  );
}

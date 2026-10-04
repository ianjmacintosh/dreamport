import { useState } from "react";
import { createFileRoute, redirect } from "@tanstack/react-router";

import Button from "../../components/Button";
import Link from "../../components/Link";

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
    methodology: string;
    milestones: Milestone[];
  };
  journey: { startedAt: string; currentMilestoneId: string } | null;
}

/**
 * A started Journey's Milestone status, by position: before the current
 * one done, after it future (strict sequencing, see CONTEXT.md's Journey).
 */
function milestoneStatus(index: number, currentIndex: number): string {
  if (index < currentIndex) return "Done";
  if (index === currentIndex) return "Current";
  return "Future";
}

const START_JOURNEY_FAILED =
  "We couldn't start the journey. Try again in a moment.";
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
    return { product, journeyState };
  },
  component: ProductJourney,
});

/**
 * A Product's Journey (#137), reached from the Journey section on the
 * Product home ("Learn More" before starting, "View Journey" after). Its
 * own page so the Product home only needs a line about it.
 *
 * Plain markup, no new CSS, by sign-off: the Path's name and methodology
 * note, then an `<ol>` of its Milestones in order. Before starting, just
 * their names — the whole route at a glance — followed by a line saying
 * what starting does and "Start Journey". Once started, each Milestone is
 * led by its status as text ("Done" / "Current" / "Future"); the current
 * one is bold, marked `aria-current="step"`, and the only one showing its
 * description and "Done when" line. A styled stepper would be its own
 * design decision.
 *
 * Ends with a plain "Back to {Product}" link, the same shape as the
 * Product home's own "Back to Products" (see #109 for whether that grows
 * into a breadcrumb). `current={false}`: this page sits under the Product
 * home's URL, so the router would otherwise mark the link as the current
 * page.
 */
function ProductJourney() {
  const { product, journeyState: initialJourneyState } =
    Route.useRouteContext();
  const [journeyState, setJourneyState] =
    useState<JourneyState>(initialJourneyState);
  const [isStarting, setIsStarting] = useState(false);
  const [error, setError] = useState("");
  const { path, journey } = journeyState;
  const currentIndex = journey
    ? path.milestones.findIndex(
        (milestone) => milestone.id === journey.currentMilestoneId,
      )
    : -1;

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

  return (
    <>
      <h1>Journey: {product.name}</h1>
      <p>
        {path.name} · {path.methodology}
      </p>
      <ol aria-label="Milestones">
        {path.milestones.map((milestone, index) => {
          if (!journey) {
            return <li key={milestone.id}>{milestone.name}</li>;
          }
          const status = milestoneStatus(index, currentIndex);
          return index === currentIndex ? (
            <li key={milestone.id} aria-current="step">
              <strong>
                {status}: {milestone.name}
              </strong>
              <p>{milestone.description}</p>
              <p>Done when: {milestone.doneWhen}</p>
            </li>
          ) : (
            <li key={milestone.id}>
              {status}: {milestone.name}
            </li>
          );
        })}
      </ol>
      {!journey && (
        <>
          <p>
            Starting puts this Product on Milestone 1,{" "}
            {path.milestones[0]?.name}. It doesn't change your Ideas or
            description.
          </p>
          <p>
            <Button
              disabled={isStarting}
              state={isStarting ? "pending" : "ready"}
              onClick={() => void startJourney()}
            >
              <Button.State name="ready">Start Journey</Button.State>
              <Button.State name="pending">Starting…</Button.State>
            </Button>
          </p>
        </>
      )}
      {error && <p role="alert">{error}</p>}

      <p>
        <Link href={`/app/products/${product.id}`} current={false}>
          Back to {product.name}
        </Link>
      </p>
    </>
  );
}

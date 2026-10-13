import { useState } from "react";
import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";

import type { BreadcrumbsProps } from "../../components/Breadcrumbs";
import Button from "../../components/Button";
import Dialog from "../../components/Dialog";
import Link from "../../components/Link";

/**
 * Plain `fetch` never times out on its own; this aborts after `timeoutMs`
 * so `startJourney` always lands in its `catch` block instead of hanging.
 * Same helper `/app` and the Product pages each keep a copy of.
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

/** `/api/products/:productId/paths/:pathId/trailhead`'s answer, less the Product. */
interface Trailhead {
  path: { id: string; name: string; owner: "dreamport" | "user" };
  version: {
    id: string;
    number: number;
    description: string;
    milestones: { id: string; name: string; outcome: string }[];
  };
  /** Newest first. */
  versions: { number: number; savedAt: string }[];
  latestNumber: number;
  /** The Product's Journey on this Path, on whichever version, if it follows it. */
  journey: { id: string; versionNumber: number } | null;
}

const LONG_DATE = new Intl.DateTimeFormat(undefined, { dateStyle: "long" });

const START_JOURNEY_FAILED =
  "We couldn't start the journey. Try again in a moment.";
const CONNECTION_FAILED =
  "Something went wrong. Check your connection and try again.";

// Filename note: `$productId_` makes this a sibling of the Product home
// rather than its child; see the Journey page's own header comment.
export const Route = createFileRoute(
  "/_appShell/app_/products/$productId_/paths/$pathId/trailhead",
)({
  validateSearch: (
    search: Record<string, unknown>,
  ): { version?: number; versions?: true } => ({
    ...(typeof search.version === "number" && { version: search.version }),
    ...(search.versions === true && { versions: true }),
  }),
  beforeLoad: async ({ params, search }) => {
    const query =
      search.version === undefined ? "" : `?version=${search.version}`;
    const res = await fetch(
      `/api/products/${params.productId}/paths/${params.pathId}/trailhead${query}`,
    ).catch(() => null);
    // Not signed in, not this User's Product or Path, no such version,
    // offline: back to `/app`, the same convention as the Product home.
    if (!res || !res.ok) {
      throw redirect({ to: "/app" });
    }
    const { product, ...trailhead } = (await res.json()) as {
      product: { id: string; name: string };
    } & Trailhead;
    return {
      product,
      trailhead,
      breadcrumbs: {
        trail: [
          { label: "Products", href: "/app" },
          { label: product.name, href: `/app/products/${product.id}` },
          {
            label: "Pathfinder",
            href: `/app/products/${product.id}/pathfinder`,
          },
        ],
        current: trailhead.path.name,
      } satisfies BreadcrumbsProps,
    };
  },
  component: TrailheadPage,
});

/**
 * A Path's Trailhead (#170), reached from Pathfinder: one of the Path's
 * saved versions, to read before starting a Journey on it. The Path's name
 * is the h1, then `.journey-split`, as on a Journey page: the version's
 * Milestones as a route on the left, every stop still ahead with its
 * outcome showing, and on the right the pitch (Dream Sequence's own words,
 * or a User's Path's description), then "Start Journey", which starts the
 * Product on Milestone 1 and goes to the new Journey's page.
 *
 * It opens on the latest version. A Path with more than one has "Looking
 * for an older version?" under the button, which opens a Dialog listing
 * every version, and an earlier version says so, linking back to the
 * latest. When the Product already follows the Path, on any version,
 * "View Journey" replaces "Start Journey": a Product has one Journey per
 * Path, and the line above it names the version when it isn't this one.
 */
function TrailheadPage() {
  const { product, trailhead } = Route.useRouteContext();
  const { path, version, versions, latestNumber, journey } = trailhead;
  const search = Route.useSearch();
  const navigate = useNavigate();
  const trailheadHref = `/app/products/${product.id}/paths/${path.id}/trailhead`;
  const [isStarting, setIsStarting] = useState(false);
  const [error, setError] = useState("");

  /** Drop `?versions` without a new history entry, keeping the version shown. */
  function closeVersions() {
    void navigate({
      to: "/app/products/$productId/paths/$pathId/trailhead",
      params: { productId: product.id, pathId: path.id },
      search: { version: search.version },
      replace: true,
    });
  }

  async function startJourney() {
    setError("");
    setIsStarting(true);
    try {
      const journeyId = await withMinimumDuration(async () => {
        const res = await fetchWithTimeout(
          `/api/products/${product.id}/journeys`,
          {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ versionId: version.id }),
          },
        );
        if (!res.ok) {
          return null;
        }
        return ((await res.json()) as { journeyId: string }).journeyId;
      });
      if (!journeyId) {
        setError(START_JOURNEY_FAILED);
        return;
      }
      await navigate({
        to: "/app/products/$productId/journeys/$journeyId",
        params: { productId: product.id, journeyId },
      });
    } catch {
      setError(CONNECTION_FAILED);
    } finally {
      setIsStarting(false);
    }
  }

  return (
    <>
      <h1>{path.name}</h1>
      <div className="journey-split">
        <ol aria-label="Milestones" className="journey-route">
          {version.milestones.map((milestone, index) => (
            <li
              key={milestone.id}
              className="journey-route-stop"
              data-status="future"
            >
              <span className="journey-route-dot">
                <span aria-hidden="true">{index + 1}</span>
              </span>
              <span className="journey-route-name">{milestone.name}</span>
              <span className="journey-route-outcome">{milestone.outcome}</span>
            </li>
          ))}
        </ol>
        <section>
          {path.owner === "dreamport" ? (
            <>
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
            </>
          ) : (
            <p>{version.description}</p>
          )}
          {version.number < latestNumber && (
            <p>
              This is version {version.number}.{" "}
              <Link href={trailheadHref}>A newer version is available.</Link>
            </p>
          )}
          {journey ? (
            <>
              <p>
                {product.name} is already following {path.name}
                {journey.versionNumber !== version.number &&
                  ` (version ${journey.versionNumber})`}
                .
              </p>
              <div className="button-group button-group--end">
                <Link
                  href={`/app/products/${product.id}/journeys/${journey.id}`}
                  className="button button--primary"
                >
                  View Journey
                </Link>
              </div>
            </>
          ) : (
            <div className="button-group button-group--end">
              <Button
                disabled={isStarting}
                state={isStarting ? "pending" : "ready"}
                onClick={() => void startJourney()}
              >
                <Button.State name="ready">Start Journey</Button.State>
                <Button.State name="pending">Starting…</Button.State>
              </Button>
            </div>
          )}
          {versions.length > 1 && (
            <p>
              <Link
                href={`${trailheadHref}?${search.version === undefined ? "" : `version=${search.version}&`}versions=true`}
                className="link-quiet"
              >
                Looking for an older version?
              </Link>
            </p>
          )}
          {error && <p role="alert">{error}</p>}
        </section>
      </div>
      <Dialog
        open={search.versions === true}
        onOpenChange={(open) => {
          if (!open) {
            closeVersions();
          }
        }}
        title={`Versions of ${path.name}`}
      >
        <ul className="list">
          {versions.map((other) => {
            const label = `Version ${other.number}${
              other.number === latestNumber ? " (latest)" : ""
            }, saved ${LONG_DATE.format(new Date(other.savedAt))}`;
            return (
              <li key={other.number} className="list-row">
                {other.number === version.number ? (
                  <span className="list-row-name" aria-current="page">
                    {label}
                  </span>
                ) : (
                  <Link
                    className="list-row-name"
                    href={
                      other.number === latestNumber
                        ? trailheadHref
                        : `${trailheadHref}?version=${other.number}`
                    }
                  >
                    {label}
                  </Link>
                )}
              </li>
            );
          })}
        </ul>
        <div className="button-group button-group--end">
          <Button variant="secondary" onClick={() => closeVersions()}>
            Close
          </Button>
        </div>
      </Dialog>
    </>
  );
}

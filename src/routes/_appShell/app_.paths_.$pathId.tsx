import { useState } from "react";
import {
  createFileRoute,
  redirect,
  useNavigate,
  useRouter,
} from "@tanstack/react-router";

import type { BreadcrumbsProps } from "../../components/Breadcrumbs";
import Button from "../../components/Button";
import Dialog from "../../components/Dialog";
import Link from "../../components/Link";
import Notice from "../../components/Notice";

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

/** `/api/paths/:pathId/trailhead`'s answer for a Path with a version to show. */
interface Shown {
  status: "offered" | "followable";
  path: { id: string; name: string; dreamport: boolean; own: boolean };
  version: {
    id: string;
    number: number;
    description: string;
    milestones: { id: string; name: string; outcome: string }[];
  };
  /** `request` when a User has to Request the Path rather than Add it (#214). */
  access: "everyone" | "request";
  /** A Guide's own Path only: how many Requests are waiting on it (#216). */
  pendingRequests?: number;
  /** Offered only: whether the User has a Request pending for this version (#215). */
  requested?: boolean;
  /** Newest first. */
  versions: { number: number; savedAt: string }[];
  newestNumber: number;
  /** Followable only: the User's Products, each with its Journey in progress on this Path. */
  products?: { id: string; name: string; journeyId: string | null }[];
}

type Trailhead =
  | { status: "unavailable"; path: { id: string; name: string } }
  | Shown;

/** One pending Request in the Guide's list (#216). */
interface PendingRequest {
  id: string;
  email: string;
  number: number;
}

/** Why Start on Path didn't start, shown after it's pressed. */
type Refusal = "no-products" | "on-path";

const LONG_DATE = new Intl.DateTimeFormat(undefined, { dateStyle: "long" });

const START_JOURNEY_FAILED =
  "We couldn't start on this Path. Try again in a moment.";
const ADD_FAILED = "We couldn't add this Path. Try again in a moment.";
const REQUEST_FAILED = "We couldn't send your Request. Try again in a moment.";
const REQUESTS_FAILED = "We couldn't load the Requests. Try again in a moment.";
const DECISION_FAILED = "We couldn't save that. Try again in a moment.";
const NO_LONGER_PENDING = "That Request is no longer pending.";
const CONNECTION_FAILED =
  "Something went wrong. Check your connection and try again.";

export const Route = createFileRoute("/_appShell/app_/paths_/$pathId")({
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
      `/api/paths/${params.pathId}/trailhead${query}`,
    ).catch(() => null);
    // No such Path or version, offline: back to `/app`, the same
    // convention as the Product home.
    if (!res || !res.ok) {
      throw redirect({ to: "/app" });
    }
    const trailhead = (await res.json()) as Trailhead | { status: "unsaved" };
    if (trailhead.status === "unsaved") {
      throw redirect({
        to: "/app/paths/$pathId/edit",
        params: { pathId: params.pathId },
      });
    }
    return {
      trailhead,
      breadcrumbs: {
        trail: [{ label: "Pathfinder", href: "/app/paths" }],
        current: trailhead.path.name,
      } satisfies BreadcrumbsProps,
    };
  },
  component: TrailheadPage,
});

/**
 * A Path's Trailhead (#170, #205): one of its versions, the same page for
 * every User. The Path's name is the h1, with Edit Path beside it on the
 * User's own Path, then a line naming the version and its price, then
 * `.journey-split`: the version's Milestones as a route on the left, and
 * on the right the pitch (Dream Sequence's own words, or the version's
 * description), then, on a Path the User can follow, a Product picker
 * beside Start on Path. On another User's Path, that's Add This Path
 * (#192) until the User holds a copy of the version shown, which the page
 * then shows them. A closed Path or an unpublished version of another
 * User's, with no copy, says it's no longer available.
 *
 * It opens on the newest version offered. "Looking for an older version?"
 * opens a Dialog listing the rest, and an older version says a newer one
 * is available, linking to the newest.
 */
function TrailheadPage() {
  const { trailhead } = Route.useRouteContext();
  if (trailhead.status === "unavailable") {
    return (
      <>
        <h1>{trailhead.path.name}</h1>
        <Notice>
          <p>This Path ({trailhead.path.name}) is no longer available.</p>
        </Notice>
        <p>
          <Link href="/app/paths">Back to Pathfinder</Link>
        </p>
      </>
    );
  }
  // Keyed so an Add, which turns the version shown into the User's copy,
  // starts the Product picker afresh.
  return (
    <ShownVersion
      key={`${trailhead.status}:${trailhead.version.id}`}
      trailhead={trailhead}
    />
  );
}

function ShownVersion({ trailhead }: { trailhead: Shown }) {
  const { path, version, versions, newestNumber, products } = trailhead;
  const search = Route.useSearch();
  const { email } = Route.useRouteContext();
  const navigate = useNavigate();
  const router = useRouter();
  const [isAdding, setIsAdding] = useState(false);
  const [isConfirmingRequest, setIsConfirmingRequest] = useState(false);
  const [isRequesting, setIsRequesting] = useState(false);
  const [requestError, setRequestError] = useState("");
  const pathHref = `/app/paths/${path.id}`;
  const [productId, setProductId] = useState(products?.[0]?.id ?? "");
  const [refusal, setRefusal] = useState<Refusal | null>(null);
  const [isStarting, setIsStarting] = useState(false);
  const [error, setError] = useState("");
  const product = products?.find((p) => p.id === productId);
  const [isListingRequests, setIsListingRequests] = useState(false);
  const [requests, setRequests] = useState<PendingRequest[] | null>(null);
  const [requestsError, setRequestsError] = useState("");
  const [deciding, setDeciding] = useState<{
    id: string;
    verb: "approve" | "deny";
  } | null>(null);
  const [decisionErrors, setDecisionErrors] = useState<Record<string, string>>(
    {},
  );

  /** Drop `?versions` without a new history entry, keeping the version shown. */
  function closeVersions() {
    void navigate({
      to: "/app/paths/$pathId",
      params: { pathId: path.id },
      search: { version: search.version },
      replace: true,
    });
  }

  /** Open the Guide's Request list, loading it fresh. */
  async function openRequests() {
    setRequests(null);
    setRequestsError("");
    setDecisionErrors({});
    setIsListingRequests(true);
    try {
      const res = await fetchWithTimeout(`/api/paths/${path.id}/requests`, {});
      if (!res.ok) {
        setRequestsError(REQUESTS_FAILED);
        return;
      }
      setRequests(
        ((await res.json()) as { requests: PendingRequest[] }).requests,
      );
    } catch {
      setRequestsError(CONNECTION_FAILED);
    }
  }

  /** Close the list, then reload the page so the count is the server's. */
  async function closeRequests() {
    setIsListingRequests(false);
    await router.invalidate();
    setRequests(null);
  }

  /** Approve or Deny one Request: its row leaves once the server confirms. */
  async function decide(request: PendingRequest, verb: "approve" | "deny") {
    setDecisionErrors((errors) => ({ ...errors, [request.id]: "" }));
    setDeciding({ id: request.id, verb });
    const fail = (message: string) =>
      setDecisionErrors((errors) => ({ ...errors, [request.id]: message }));
    try {
      const failed = await withMinimumDuration(async () => {
        const res = await fetchWithTimeout(
          `/api/paths/${path.id}/requests/${request.id}/${verb}`,
          { method: "POST", headers: { "content-type": "application/json" } },
        );
        if (res.status === 404) {
          return NO_LONGER_PENDING;
        }
        if (res.status === 409) {
          return ((await res.json()) as { error: string }).error;
        }
        return res.ok ? null : DECISION_FAILED;
      });
      if (failed) {
        fail(failed);
        return;
      }
      setRequests(
        (current) => current?.filter(({ id }) => id !== request.id) ?? null,
      );
    } catch {
      fail(CONNECTION_FAILED);
    } finally {
      setDeciding(null);
    }
  }

  /** Add the version shown, then load the page again to show the copy. */
  async function addPath() {
    setError("");
    setIsAdding(true);
    try {
      const failed = await withMinimumDuration(async () => {
        const res = await fetchWithTimeout(
          `/api/paths/${path.id}/versions/${version.number}/add`,
          { method: "POST", headers: { "content-type": "application/json" } },
        );
        if (res.status === 409) {
          return ((await res.json()) as { error: string }).error;
        }
        return res.ok ? null : ADD_FAILED;
      });
      if (failed) {
        setError(failed);
        return;
      }
      await router.invalidate();
    } catch {
      setError(CONNECTION_FAILED);
    } finally {
      setIsAdding(false);
    }
  }

  /** Request the version shown, then load the page again to show it Requested. */
  async function sendRequest() {
    setRequestError("");
    setIsRequesting(true);
    try {
      const failed = await withMinimumDuration(async () => {
        const res = await fetchWithTimeout(
          `/api/paths/${path.id}/versions/${version.number}/request`,
          { method: "POST", headers: { "content-type": "application/json" } },
        );
        if (res.status === 409) {
          return ((await res.json()) as { error: string }).error;
        }
        return res.ok ? null : REQUEST_FAILED;
      });
      setIsConfirmingRequest(false);
      if (failed) {
        setRequestError(failed);
        return;
      }
      await router.invalidate();
    } catch {
      setRequestError(CONNECTION_FAILED);
    } finally {
      setIsRequesting(false);
    }
  }

  async function startJourney() {
    setError("");
    if (!product) {
      setRefusal("no-products");
      return;
    }
    if (product.journeyId) {
      setRefusal("on-path");
      return;
    }
    setRefusal(null);
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
      {path.own ? (
        <div className="heading-row">
          <h1>{path.name}</h1>
          <div className="button-group">
            {trailhead.pendingRequests !== undefined &&
              trailhead.access === "request" && (
                <Button variant="secondary" onClick={() => void openRequests()}>
                  Requests ({requests?.length ?? trailhead.pendingRequests})
                </Button>
              )}
            <Link
              href={`${pathHref}/edit`}
              className="button button--secondary"
            >
              Edit Path
            </Link>
          </div>
        </div>
      ) : (
        <h1>{path.name}</h1>
      )}
      <p className="text-sm">
        Version {version.number}
        <span aria-hidden="true"> · </span>
        Access: {trailhead.access === "everyone" ? "Everyone" : "By Request"}
        <span aria-hidden="true"> · </span>
        Price: Free
        {version.number < newestNumber && (
          <>
            <span aria-hidden="true"> · </span>
            <Link href={pathHref}>A newer version is available.</Link>
          </>
        )}
      </p>
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
          {path.dreamport ? (
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
          {trailhead.status === "offered" && trailhead.access !== "request" && (
            <>
              <p>
                <Button
                  disabled={isAdding}
                  state={isAdding ? "pending" : "ready"}
                  onClick={() => void addPath()}
                >
                  <Button.State name="ready">Add This Path</Button.State>
                  <Button.State name="pending">Adding…</Button.State>
                </Button>
              </p>
              {error && <p role="alert">{error}</p>}
            </>
          )}
          {trailhead.status === "offered" && trailhead.access === "request" && (
            <>
              <Notice>
                {trailhead.requested ? (
                  <>
                    <p>You&apos;ve Requested Version {version.number}.</p>
                    <p>
                      Waiting on the Guide. Come back to this page to see their
                      answer.
                    </p>
                  </>
                ) : (
                  <>
                    <p>The Guide of this Path decides who can Add it.</p>
                    <p>
                      Request it, and you&apos;ll find the answer here when you
                      come back. There are no notifications.
                    </p>
                  </>
                )}
              </Notice>
              <div className="button-group button-group--end">
                <Button
                  disabled={trailhead.requested === true}
                  onClick={() => {
                    setRequestError("");
                    setIsConfirmingRequest(true);
                  }}
                >
                  {trailhead.requested ? "Requested" : "Request"}
                </Button>
              </div>
              {requestError && <p role="alert">{requestError}</p>}
            </>
          )}
          {products && (
            <>
              <div className="field-row">
                <div className="input-group">
                  <label className="input-label" htmlFor="trailhead-product">
                    Product
                  </label>
                  <select
                    id="trailhead-product"
                    className="input"
                    value={productId}
                    disabled={isStarting}
                    onChange={(e) => {
                      setProductId(e.target.value);
                      setRefusal(null);
                      setError("");
                    }}
                  >
                    {products.length === 0 && (
                      <option value="">No Products yet</option>
                    )}
                    {products.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </div>
                <Button
                  disabled={isStarting}
                  state={isStarting ? "pending" : "ready"}
                  onClick={() => void startJourney()}
                >
                  <Button.State name="ready">Start on Path</Button.State>
                  <Button.State name="pending">Starting…</Button.State>
                </Button>
              </div>
              {refusal === "no-products" && (
                <Notice>
                  <p>
                    You don&apos;t have a Product yet, and a Journey needs one.{" "}
                    <Link href="/app">Add a Product</Link> first.
                  </p>
                </Notice>
              )}
              {refusal === "on-path" && product?.journeyId && (
                <Notice>
                  <p>
                    {product.name} is already on the {path.name} Path.
                  </p>
                  <p>
                    Would you like to{" "}
                    <Link
                      href={`/app/products/${product.id}/journeys/${product.journeyId}`}
                    >
                      view your current Journey
                    </Link>
                    ? If you&apos;d like to restart, you&apos;ll have to do it
                    from within your current Journey.
                  </p>
                </Notice>
              )}
              {error && <p role="alert">{error}</p>}
            </>
          )}
          {versions.length > 1 && (
            <p>
              <Link
                href={`${pathHref}?${search.version === undefined ? "" : `version=${search.version}&`}versions=true`}
                className="link-quiet"
              >
                Looking for an older version?
              </Link>
            </p>
          )}
        </section>
      </div>
      <Dialog
        open={isConfirmingRequest}
        onOpenChange={(open) => {
          if (!open && !isRequesting) {
            setIsConfirmingRequest(false);
          }
        }}
        title={`Request Version ${version.number}?`}
      >
        <p>
          The Guide will see your email address ({email}) with your Request.
        </p>
        <div className="button-group button-group--end">
          <Button
            variant="secondary"
            disabled={isRequesting}
            onClick={() => setIsConfirmingRequest(false)}
          >
            Cancel
          </Button>
          <Button
            disabled={isRequesting}
            state={isRequesting ? "pending" : "ready"}
            onClick={() => void sendRequest()}
          >
            <Button.State name="ready">Send Request</Button.State>
            <Button.State name="pending">Sending…</Button.State>
          </Button>
        </div>
      </Dialog>
      <Dialog
        open={isListingRequests}
        onOpenChange={(open) => {
          if (!open) {
            void closeRequests();
          }
        }}
        title="Requests"
      >
        {requestsError ? (
          <p role="alert">{requestsError}</p>
        ) : requests === null ? (
          <p>Loading…</p>
        ) : requests.length === 0 ? (
          <p>No one is waiting.</p>
        ) : (
          <ul className="list">
            {requests.map((request) => {
              const isBusy = deciding !== null;
              const mine = deciding?.id === request.id ? deciding.verb : null;
              return (
                <li key={request.id} className="list-row">
                  <span className="list-row-name">
                    {request.email}
                    <span aria-hidden="true"> · </span>
                    Version {request.number}
                  </span>
                  <div className="list-row-action">
                    <div className="button-group">
                      <Button
                        variant="secondary"
                        disabled={isBusy}
                        state={mine === "deny" ? "pending" : "ready"}
                        onClick={() => void decide(request, "deny")}
                      >
                        <Button.State name="ready">Deny</Button.State>
                        <Button.State name="pending">Denying…</Button.State>
                      </Button>
                      <Button
                        variant="secondary"
                        disabled={isBusy}
                        state={mine === "approve" ? "pending" : "ready"}
                        onClick={() => void decide(request, "approve")}
                      >
                        <Button.State name="ready">Approve</Button.State>
                        <Button.State name="pending">Approving…</Button.State>
                      </Button>
                    </div>
                    {decisionErrors[request.id] && (
                      <p role="alert">{decisionErrors[request.id]}</p>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
        <div className="button-group button-group--end">
          <Button variant="secondary" onClick={() => void closeRequests()}>
            Done
          </Button>
        </div>
      </Dialog>
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
              other.number === newestNumber ? " (latest)" : ""
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
                      other.number === newestNumber
                        ? pathHref
                        : `${pathHref}?version=${other.number}`
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

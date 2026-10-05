import { Fragment, useState } from "react";
import { createFileRoute, redirect } from "@tanstack/react-router";

import Button from "../../components/Button";
import Link from "../../components/Link";
import TagList from "../../components/TagList";
import TagPicker from "../../components/TagPicker";
import TextInput from "../../components/TextInput";

/**
 * Plain `fetch` never times out on its own — if the server accepts the TCP
 * connection but then goes away without closing it (observed with a Ctrl-C
 * dev-server shutdown, unlike a hard kill which refuses the connection
 * outright), the request hangs forever: no error, no way for the caller's
 * `catch` to ever run. This aborts the request after `timeoutMs` so
 * `deleteIdea`/`saveIdea`/`saveDescription` always land in their `catch` block instead of leaving the UI
 * stuck with no feedback.
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
 * A request that resolves in a handful of milliseconds (typical for local
 * D1) flips a button's pending state on and back off too fast to read as
 * anything but a flicker. This runs `fn`, then waits out the rest of
 * `minMs` before resolving (or rejecting), so a caller that clears its
 * pending state once this settles gets a real, perceivable window — same UX
 * reasoning as e.g. a spinner's minimum-display-time convention.
 *
 * `Date.now()` stays inside this module-level helper rather than in the
 * component itself: the React Compiler's purity check (`react-hooks/purity`)
 * flags an impure call like `Date.now()` made directly in a component, since
 * it can't prove the call never happens during render.
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

/** A Product as `/api/products/:productId/ideas` returns it (see `src/worker/products.ts`). */
interface Product {
  id: string;
  name: string;
  description: string | null;
  createdAt: string;
}

/** An Idea as `/api/products/:productId/ideas` returns it (see `src/worker/ideas.ts`). */
interface Idea {
  id: string;
  name: string;
  createdAt: string;
  /** Tag names, alphabetical (#113). */
  tags: string[];
}

/**
 * The parts of `/api/products/:productId/journey`'s response (#137) the
 * Product home's Journey line needs — the full shape lives with the Journey
 * page (`app_.products.$productId_.journey.tsx`).
 */
interface JourneySummary {
  path: { name: string; milestones: { id: string; name: string }[] };
  journey: {
    currentMilestoneId: string;
    finishedAt: string | null;
  } | null;
}

/**
 * Mirrors `IDEA_NAME_MAX_LENGTH` in `src/worker/ideas.ts` — the client
 * bundle doesn't import worker code, so this is a client-side `maxLength`
 * hint only; the server enforces the real limit.
 */
const IDEA_NAME_MAX_LENGTH = 200;

/** Mirrors `PRODUCT_DESCRIPTION_MAX_LENGTH` in `src/worker/products.ts` — same client-side-hint-only reasoning. */
const PRODUCT_DESCRIPTION_MAX_LENGTH = 2000;

// Filename note: `app_.products.$productId.tsx`, not
// `app.products.$productId.tsx` or `app/products/$productId.tsx` — same
// trailing-underscore escape hatch `app_.settings.tsx` uses (see its own
// header comment and the TanStack Router doc it links): `app.tsx` renders no
// `<Outlet />`, so this page needs to be a sibling of `/app`, not its child.
export const Route = createFileRoute("/_appShell/app_/products/$productId")({
  beforeLoad: async ({ params }) => {
    // Same "bounce back rather than show a dead-end error screen" convention
    // `_appShell`'s own `/api/me` guard uses: anything short of a clean 200
    // (not signed in, not this User's Product, offline, a transient error)
    // redirects to `/app` rather than a dedicated not-found page.
    // The Tag catalog (#113) is fetched alongside — it's needed for the
    // add-Idea form's `TagPicker` — and so is the Product's Journey (#137);
    // both go through the same redirect.
    const [res, tagsRes, journeyRes] = await Promise.all([
      fetch(`/api/products/${params.productId}/ideas`).catch(() => null),
      fetch("/api/tags").catch(() => null),
      fetch(`/api/products/${params.productId}/journey`).catch(() => null),
    ]);
    if (
      !res ||
      !res.ok ||
      !tagsRes ||
      !tagsRes.ok ||
      !journeyRes ||
      !journeyRes.ok
    ) {
      throw redirect({ to: "/app" });
    }
    const { product, ideas } = (await res.json()) as {
      product: Product;
      ideas: Idea[];
    };
    const { tags } = (await tagsRes.json()) as { tags: string[] };
    const journey = (await journeyRes.json()) as JourneySummary;
    return { product, ideas, tagCatalog: tags, journey };
  },
  component: ProductHome,
});

/** PUT an Idea's whole Tag set (#113); the stored set, or `null` on failure. */
async function putIdeaTags(
  productId: string,
  ideaId: string,
  tags: string[],
): Promise<string[] | null> {
  const res = await fetchWithTimeout(
    `/api/products/${productId}/ideas/${ideaId}/tags`,
    {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ tags }),
    },
  );
  if (!res.ok) {
    return null;
  }
  return ((await res.json()) as { tags: string[] }).tags;
}

const ADD_IDEA_FAILED = "We couldn't add that. Try again in a moment.";
const DELETE_IDEA_FAILED = "We couldn't delete that. Try again in a moment.";
const SAVE_IDEA_FAILED = "We couldn't save that. Try again in a moment.";
const ADD_IDEA_TAGS_FAILED =
  "We added that, but couldn't save its tags. Edit it to try again.";
const SAVE_DESCRIPTION_FAILED =
  "We couldn't save the description. Try again in a moment.";
const CONNECTION_FAILED =
  "Something went wrong. Check your connection and try again.";

/**
 * A single Product's home page, reached from `/app` via a link on the
 * Product's own name: its description, its Journey, and its Ideas
 * (`ProductIdeas`, below). Composed from existing components plus
 * heading/paragraph primitives in plain document order.
 *
 * The Product's own description (#112) sits under the heading — its text,
 * or "No description yet." — with an "Edit Description" button that swaps
 * it for a pre-filled `TextInput` + Save / Cancel `.field-row`, the same
 * in-place edit shape an Idea row's rename uses. Single-line on purpose:
 * no multi-line text component exists yet (see #112).
 *
 * Journey (#137) is a short `<h2>` section between the description and
 * the Ideas: one line — what the Path offers before starting, the current
 * Milestone after — and a link styled as a button ("Learn More" / "View
 * Journey") to the Product's own Journey page, which holds the Milestones
 * and "Start Journey".
 *
 * Ends with a plain `<Link href="/app">Back to Products</Link>` — this page
 * otherwise had no way back to the Products list. Same markup
 * `/app/settings` already uses for its own "Back to Products" link, not a
 * new component; whether this grows into a dedicated nav/breadcrumb
 * component (here and retrofitted onto Settings) is its own sign-off
 * question, tracked in #109.
 */
function ProductHome() {
  const {
    product: initialProduct,
    ideas: initialIdeas,
    tagCatalog,
    journey: initialJourney,
  } = Route.useRouteContext();
  const { path, journey } = initialJourney;
  const currentIndex = journey
    ? path.milestones.findIndex(
        (milestone) => milestone.id === journey.currentMilestoneId,
      )
    : -1;
  const [product, setProduct] = useState<Product>(initialProduct);
  const [error, setError] = useState("");
  const [isEditingDescription, setIsEditingDescription] = useState(false);
  const [descriptionDraft, setDescriptionDraft] = useState("");
  const [isSavingDescription, setIsSavingDescription] = useState(false);

  function startEditingDescription() {
    setError("");
    setDescriptionDraft(product.description ?? "");
    setIsEditingDescription(true);
  }

  async function saveDescription() {
    setError("");
    setIsSavingDescription(true);
    try {
      const saved = await withMinimumDuration(async () => {
        const res = await fetchWithTimeout(`/api/products/${product.id}`, {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ description: descriptionDraft }),
        });
        if (!res.ok) {
          return null;
        }
        return ((await res.json()) as { product: Product }).product;
      });
      if (!saved) {
        setError(SAVE_DESCRIPTION_FAILED);
        return;
      }
      // The server's copy, not `descriptionDraft` — it's trimmed, and an
      // empty draft comes back as `null`.
      setProduct(saved);
      setIsEditingDescription(false);
    } catch {
      setError(CONNECTION_FAILED);
    } finally {
      setIsSavingDescription(false);
    }
  }

  return (
    <>
      <h1>Product: {product.name}</h1>
      {isEditingDescription ? (
        <form
          className="field-row"
          onSubmit={(e) => {
            e.preventDefault();
            void saveDescription();
          }}
        >
          <TextInput
            id="product-description"
            label="Description"
            value={descriptionDraft}
            onChange={(e) => setDescriptionDraft(e.target.value)}
            maxLength={PRODUCT_DESCRIPTION_MAX_LENGTH}
            disabled={isSavingDescription}
          />
          <div className="button-group">
            <Button
              type="submit"
              disabled={isSavingDescription}
              state={isSavingDescription ? "saving" : "ready"}
            >
              <Button.State name="ready">Save</Button.State>
              <Button.State name="saving">Saving…</Button.State>
            </Button>
            <Button
              variant="secondary"
              disabled={isSavingDescription}
              onClick={() => {
                setError("");
                setIsEditingDescription(false);
              }}
            >
              Cancel
            </Button>
          </div>
        </form>
      ) : (
        <>
          <p>{product.description ?? "No description yet."}</p>
          <p>
            <Button variant="secondary" onClick={startEditingDescription}>
              Edit Description
            </Button>
          </p>
        </>
      )}
      <h2>Journey</h2>
      {journey ? (
        <p>
          {journey.finishedAt
            ? `${path.name} complete`
            : `Current Milestone: ${path.milestones[currentIndex]?.name} (${
                currentIndex + 1
              } of ${path.milestones.length})`}
        </p>
      ) : (
        <p>Looking for some structure? Follow a marked path to success.</p>
      )}
      <p>
        <Link
          href={`/app/products/${product.id}/journey`}
          className="button button--secondary"
        >
          {journey ? "View Journey" : "Learn More"}
        </Link>
      </p>
      <ProductIdeas
        productId={product.id}
        initialIdeas={initialIdeas}
        tagCatalog={tagCatalog}
      />
      {error && <p role="alert">{error}</p>}

      <p>
        <Link href="/app">Back to Products</Link>
      </p>
    </>
  );
}

/**
 * A Product's own flat list of Ideas (#99) — add one, see them all. A child
 * of `ProductHome`, with its own state and its own error line, so the Ideas
 * section stands apart from the description and Journey above it.
 *
 * The add-Idea form puts its name field and its `TagPicker` side by side
 * (`.field-pair`, 3:1), then "Add Idea" below both, so the Tags read as part
 * of the form (#113); `.form-section` sets it apart from the list under it.
 * The list itself is a real `<ul>`/`<li>` — free correctness, not
 * design-system elaboration, the same tier as `<h1>` over a styled `<div>`
 * — with `aria-labelledby` pointing at its own "Ideas" `<h2>` rather than
 * the page's `<h1>`, so it's announced as "Ideas, list," not
 * "Product: {name}, list" (#101).
 *
 * Rename (#102) swaps a row in place, one row at a time. Resting, a row's
 * actions are Edit / Delete. Editing, the row becomes a form laid out like the
 * add form (#113) — a pre-filled "Rename" `TextInput` beside a `TagPicker`,
 * then Save / Cancel / Delete as a `.button-group` — on a tinted panel
 * (`.list-row--editing`). Clicking Delete (from either)
 * shows Edit / Delete / Cancel — the confirming button keeps the action's own
 * verb, "Delete," rather than a generic "Confirm" (#101).
 *
 * Tags (#113): a resting row (`.list-row--tagged`) shows its Idea's Tags as
 * pills (`TagList`) in a fixed-width column between the name and the
 * actions — as many as fit, then "+N". Tags are saved with their own PUT,
 * after the Idea's create (POST) or rename (PATCH) succeeds.
 */
function ProductIdeas({
  productId,
  initialIdeas,
  tagCatalog,
}: {
  productId: string;
  initialIdeas: Idea[];
  tagCatalog: string[];
}) {
  const [error, setError] = useState("");
  const [ideas, setIdeas] = useState<Idea[]>(initialIdeas);
  const [ideaName, setIdeaName] = useState("");
  const [ideaTags, setIdeaTags] = useState<string[]>([]);
  const [isAdding, setIsAdding] = useState(false);
  // Only ever one row's delete in flight, and one row confirming, at a time
  // — no bulk delete — so a single id each (rather than a set) is enough to
  // track them.
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  // Same single-id convention for rename (#102): one row editing at a time.
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editTags, setEditTags] = useState<string[]>([]);
  const [isSaving, setIsSaving] = useState(false);

  async function addIdea() {
    setError("");
    setIsAdding(true);
    try {
      const res = await fetch(`/api/products/${productId}/ideas`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: ideaName }),
      });
      if (!res.ok) {
        setError(ADD_IDEA_FAILED);
        return;
      }
      const { idea } = (await res.json()) as { idea: Idea };
      // The Idea exists now whether or not its Tags save — so it's listed
      // either way, and a Tag failure gets its own message.
      const tags =
        ideaTags.length > 0
          ? await putIdeaTags(productId, idea.id, ideaTags).catch(() => null)
          : [];
      // Reflect the new Idea immediately — no full page reload or refetch
      // needed for a list this size.
      setIdeas((prev) => [...prev, { ...idea, tags: tags ?? [] }]);
      setIdeaName("");
      setIdeaTags([]);
      if (!tags) {
        setError(ADD_IDEA_TAGS_FAILED);
      }
    } catch {
      setError(CONNECTION_FAILED);
    } finally {
      setIsAdding(false);
    }
  }

  async function deleteIdea(id: string) {
    setError("");
    setConfirmingId(null);
    setDeletingId(id);
    try {
      // The row itself carries the pending button, so removing it has to
      // wait for the same floor `withMinimumDuration` enforces — done
      // inside the callback, the removal would unmount the row (and its
      // "Deleting…" button) the instant the request resolves, cutting the
      // pending state short exactly the way the timeout was meant to fix.
      const ok = await withMinimumDuration(async () => {
        const res = await fetchWithTimeout(
          `/api/products/${productId}/ideas/${id}`,
          {
            method: "DELETE",
          },
        );
        return res.ok;
      });
      if (!ok) {
        setError(DELETE_IDEA_FAILED);
        return;
      }
      setIdeas((prev) => prev.filter((idea) => idea.id !== id));
    } catch {
      setError(CONNECTION_FAILED);
    } finally {
      setDeletingId(null);
    }
  }

  // Editing and confirming a delete are mutually exclusive across the whole
  // list — entering either one leaves the other.
  function startEditing(idea: Idea) {
    setError("");
    setConfirmingId(null);
    setEditingId(idea.id);
    setEditName(idea.name);
    setEditTags(idea.tags);
  }

  function startConfirmingDelete(id: string) {
    setError("");
    setEditingId(null);
    setConfirmingId(id);
  }

  async function saveIdea(id: string) {
    setError("");
    setIsSaving(true);
    try {
      const saved = await withMinimumDuration(async () => {
        const res = await fetchWithTimeout(
          `/api/products/${productId}/ideas/${id}`,
          {
            method: "PATCH",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ name: editName }),
          },
        );
        if (!res.ok) {
          return null;
        }
        const renamed = ((await res.json()) as { idea: Idea }).idea;
        const tags = await putIdeaTags(productId, id, editTags).catch(
          () => null,
        );
        // A failed Tag save still keeps the rename that did land.
        return { renamed, tags };
      });
      if (!saved) {
        setError(SAVE_IDEA_FAILED);
        return;
      }
      // The server's copies, not `editName`/`editTags` — the trimmed,
      // stored name and the deduplicated, sorted Tags.
      const { renamed, tags } = saved;
      setIdeas((prev) =>
        prev.map((idea) =>
          idea.id === id ? { ...renamed, tags: tags ?? renamed.tags } : idea,
        ),
      );
      if (!tags) {
        setError(SAVE_IDEA_FAILED);
        return;
      }
      setEditingId(null);
    } catch {
      setError(CONNECTION_FAILED);
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <>
      <form
        className="form-section"
        onSubmit={(e) => {
          e.preventDefault();
          void addIdea();
        }}
      >
        <div className="field-pair">
          <TextInput
            id="idea-name"
            label="Idea name"
            value={ideaName}
            onChange={(e) => setIdeaName(e.target.value)}
            maxLength={IDEA_NAME_MAX_LENGTH}
            disabled={isAdding}
            required
          />
          <TagPicker
            id="idea-tags"
            catalog={tagCatalog}
            selected={ideaTags}
            onChange={setIdeaTags}
            disabled={isAdding}
          />
        </div>
        <Button
          type="submit"
          disabled={isAdding}
          state={isAdding ? "pending" : "ready"}
        >
          <Button.State name="ready">Add Idea</Button.State>
          <Button.State name="pending">Adding…</Button.State>
        </Button>
      </form>
      <h2 id="ideas-list-heading">Ideas</h2>
      {ideas.length === 0 ? (
        <p>No ideas yet.</p>
      ) : (
        <ul className="list list--tagged" aria-labelledby="ideas-list-heading">
          {ideas.map((idea) => (
            <li
              className={
                editingId === idea.id
                  ? "list-row list-row--editing"
                  : "list-row list-row--tagged"
              }
              key={idea.id}
            >
              {/* Keyed so React builds each mode's buttons fresh rather than
                  reusing one mode's `<button>` for another's mid-click — a
                  reused Edit turning into a submit button would submit the
                  rename form the instant it appeared. */}
              {editingId === idea.id ? (
                <Fragment key="editing">
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      void saveIdea(idea.id);
                    }}
                  >
                    <div className="field-pair">
                      <TextInput
                        id={`rename-idea-${idea.id}`}
                        label="Rename"
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        maxLength={IDEA_NAME_MAX_LENGTH}
                        disabled={isSaving}
                        required
                      />
                      <TagPicker
                        id={`edit-idea-tags-${idea.id}`}
                        catalog={tagCatalog}
                        selected={editTags}
                        onChange={setEditTags}
                        disabled={isSaving}
                      />
                    </div>
                    <div className="button-group">
                      <Button
                        type="submit"
                        disabled={isSaving}
                        state={isSaving ? "saving" : "ready"}
                      >
                        <Button.State name="ready">Save</Button.State>
                        <Button.State name="saving">Saving…</Button.State>
                      </Button>
                      <Button
                        variant="secondary"
                        disabled={isSaving}
                        onClick={() => {
                          setError("");
                          setEditingId(null);
                        }}
                      >
                        Cancel
                      </Button>
                      <Button
                        variant="secondary"
                        disabled={isSaving}
                        onClick={() => startConfirmingDelete(idea.id)}
                      >
                        Delete
                      </Button>
                    </div>
                  </form>
                </Fragment>
              ) : (
                <Fragment key="display">
                  <div className="list-row-name">{idea.name}</div>
                  <div className="list-row-tags">
                    <TagList tags={idea.tags} />
                  </div>
                  <div className="list-row-action">
                    <div className="button-group">
                      <Button
                        variant="secondary"
                        disabled={isSaving || deletingId === idea.id}
                        onClick={() => startEditing(idea)}
                      >
                        Edit
                      </Button>
                      {confirmingId === idea.id || deletingId === idea.id ? (
                        <>
                          <Button
                            disabled={deletingId === idea.id}
                            state={
                              deletingId === idea.id ? "deleting" : "confirming"
                            }
                            onClick={() => void deleteIdea(idea.id)}
                          >
                            <Button.State name="confirming">
                              Delete
                            </Button.State>
                            <Button.State name="deleting">
                              Deleting…
                            </Button.State>
                          </Button>
                          <Button
                            variant="secondary"
                            disabled={deletingId === idea.id}
                            onClick={() => setConfirmingId(null)}
                          >
                            Cancel
                          </Button>
                        </>
                      ) : (
                        <Button
                          variant="secondary"
                          disabled={isSaving}
                          onClick={() => startConfirmingDelete(idea.id)}
                        >
                          Delete
                        </Button>
                      )}
                    </div>
                  </div>
                </Fragment>
              )}
            </li>
          ))}
        </ul>
      )}
      {error && <p role="alert">{error}</p>}
    </>
  );
}

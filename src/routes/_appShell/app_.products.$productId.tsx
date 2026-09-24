import { useState } from "react";
import { createFileRoute, redirect } from "@tanstack/react-router";

import Button from "../../components/Button";
import Link from "../../components/Link";
import TextInput from "../../components/TextInput";

/** A Product as `/api/products/:productId/ideas` returns it (see `src/worker/products.ts`). */
interface Product {
  id: string;
  name: string;
  createdAt: string;
}

/** An Idea as `/api/products/:productId/ideas` returns it (see `src/worker/ideas.ts`). */
interface Idea {
  id: string;
  name: string;
  createdAt: string;
}

/**
 * Mirrors `IDEA_NAME_MAX_LENGTH` in `src/worker/ideas.ts` — the client
 * bundle doesn't import worker code, so this is a client-side `maxLength`
 * hint only; the server enforces the real limit.
 */
const IDEA_NAME_MAX_LENGTH = 200;

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
    const res = await fetch(`/api/products/${params.productId}/ideas`).catch(
      () => null,
    );
    if (!res || !res.ok) {
      throw redirect({ to: "/app" });
    }
    const { product, ideas } = (await res.json()) as {
      product: Product;
      ideas: Idea[];
    };
    return { product, ideas };
  },
  component: ProductIdeas,
});

const ADD_IDEA_FAILED = "We couldn't add that. Try again in a moment.";
const CONNECTION_FAILED =
  "Something went wrong. Check your connection and try again.";

/**
 * A single Product's own flat list of Ideas (#99) — add one, see them all.
 * Reached from `/app` via a link on the Product's own name.
 *
 * Composed from `TextInput`/`Button` plus heading/paragraph primitives in
 * plain document order, same minimal treatment `/app`'s own Products list
 * had at #88 — the Grid-aligned row layout `/app` now has is #90's later
 * polish pass, and whether Ideas share that pattern is explicitly deferred
 * to its own design sign-off (#101). The add-Idea field and its button sit
 * in `.field-row`, the same side-by-side primitive `/app`'s own add-Product
 * form uses. The list itself is a real `<ul>`/`<li>` (no class on either) —
 * free correctness, not design-system elaboration, the same tier as
 * `<h1>` over a styled `<div>` — with `aria-labelledby` pointing at the
 * `<h1>`'s own id, same `/app`-established pattern.
 *
 * Ends with a plain `<Link href="/app">Back to Products</Link>` — this page
 * otherwise had no way back to the Products list. Same markup
 * `/app/settings` already uses for its own "Back to Products" link, not a
 * new component; whether this grows into a dedicated nav/breadcrumb
 * component (here and retrofitted onto Settings) is its own sign-off
 * question deferred to #101.
 */
function ProductIdeas() {
  const { product, ideas: initialIdeas } = Route.useRouteContext();
  const [error, setError] = useState("");
  const [ideas, setIdeas] = useState<Idea[]>(initialIdeas);
  const [ideaName, setIdeaName] = useState("");
  const [isAdding, setIsAdding] = useState(false);

  async function addIdea() {
    setError("");
    setIsAdding(true);
    try {
      const res = await fetch(`/api/products/${product.id}/ideas`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: ideaName }),
      });
      if (!res.ok) {
        setError(ADD_IDEA_FAILED);
        return;
      }
      const { idea } = (await res.json()) as { idea: Idea };
      // Reflect the new Idea immediately — no full page reload or refetch
      // needed for a list this size.
      setIdeas((prev) => [...prev, idea]);
      setIdeaName("");
    } catch {
      setError(CONNECTION_FAILED);
    } finally {
      setIsAdding(false);
    }
  }

  return (
    <>
      <h1 id="ideas-heading">Product: {product.name}</h1>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void addIdea();
        }}
      >
        <div className="field-row">
          <TextInput
            id="idea-name"
            label="Idea name"
            value={ideaName}
            onChange={(e) => setIdeaName(e.target.value)}
            maxLength={IDEA_NAME_MAX_LENGTH}
            disabled={isAdding}
            required
          />
          <Button
            type="submit"
            disabled={isAdding}
            state={isAdding ? "pending" : "ready"}
          >
            <Button.State name="ready">Add idea</Button.State>
            <Button.State name="pending">Adding…</Button.State>
          </Button>
        </div>
      </form>
      {ideas.length === 0 ? (
        <p>No ideas yet.</p>
      ) : (
        <ul aria-labelledby="ideas-heading">
          {ideas.map((idea) => (
            <li key={idea.id}>{idea.name}</li>
          ))}
        </ul>
      )}

      {error && <p role="alert">{error}</p>}

      <p>
        <Link href="/app">Back to Products</Link>
      </p>
    </>
  );
}

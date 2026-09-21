import { useState } from "react";
import { createFileRoute, redirect } from "@tanstack/react-router";

import Button from "../../components/Button";
import Link from "../../components/Link";
import TextInput from "../../components/TextInput";

/** A Product as `/api/products` returns it (see `src/worker/products.ts`). */
interface Product {
  id: string;
  name: string;
  createdAt: string;
}

/**
 * Mirrors `PRODUCT_NAME_MAX_LENGTH` in `src/worker/products.ts` — the client
 * bundle doesn't import worker code, so this is a client-side `maxLength`
 * hint only; the server enforces the real limit.
 */
const PRODUCT_NAME_MAX_LENGTH = 200;

export const Route = createFileRoute("/_layout/app")({
  beforeLoad: async () => {
    // `/api/me` and `/api/products` (issue #88) are both gated only by the
    // session cookie, independent of each other's result, so they go out in
    // parallel rather than one after the other.
    const [meRes, productsRes] = await Promise.all([
      fetch("/api/me").catch(() => null),
      fetch("/api/products").catch(() => null),
    ]);

    // Client-side route guard — a UX affordance only. `/api/me` verifies the
    // session against the database on its own, so this redirect is never the
    // security boundary. Anything short of a clean 200 (no session, offline,
    // a transient error) bounces to `/login` rather than a dead-end error
    // screen; a proper retry/error state is deferred to #28.
    //
    // TanStack Router's authenticated-routes guide runs the check here in
    // `beforeLoad` and threads the result through route `context`.
    if (!meRes || !meRes.ok) {
      throw redirect({ to: "/login" });
    }

    const { email } = (await meRes.json()) as { email: string };

    // A failed products fetch just starts the page with an empty list rather
    // than bouncing back to `/login` — the session itself is already proven
    // valid by the `/api/me` check above.
    const products =
      productsRes && productsRes.ok
        ? ((await productsRes.json()) as { products: Product[] }).products
        : [];

    return { email, products };
  },
  component: App,
});

const ADD_PRODUCT_FAILED = "We couldn't add that. Try again in a moment.";
const DELETE_PRODUCT_FAILED =
  "We couldn't delete that. Try again in a moment.";
const CONNECTION_FAILED =
  "Something went wrong. Check your connection and try again.";

/**
 * Plain `fetch` never times out on its own — if the server accepts the TCP
 * connection but then goes away without closing it (observed with a Ctrl-C
 * dev-server shutdown, unlike a hard kill which refuses the connection
 * outright), the request hangs forever: no error, no way for the caller's
 * `catch` to ever run. This aborts the request after `timeoutMs` so
 * `addProduct`/`deleteProduct` always land in their `catch` block instead of
 * leaving the UI stuck with no feedback.
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
 * `Date.now()` stays inside this module-level helper rather than in `App`
 * itself: the React Compiler's purity check (`react-hooks/purity`) flags an
 * impure call like `Date.now()` made directly in a component, since it
 * can't prove the call never happens during render.
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

/**
 * The first authenticated page: it says who you are, and holds the
 * signed-in User's flat list of Products — add one (#88), see them all,
 * delete one (#89). Account-lifecycle actions (sign out, delete account)
 * live on their own page, `/app/settings`, linked from here rather than
 * mixed in — this page is about the Products, not account management.
 *
 * Composed from `TextInput` / `Button` / `Link` plus heading/paragraph
 * primitives in plain document order: no page-specific CSS, no card
 * treatment or empty-state design for the list, no confirmation/undo on
 * delete (all of that is the design/polish pass, #90). The add-Product field
 * and its button sit in `.field-row` — the same side-by-side
 * single-field-plus-button primitive `/login`'s email step uses — rather
 * than stacked; the per-row delete `Button` isn't a `.field-row` (that
 * pattern is for an input+action pair, not a display row with an action).
 *
 * A failed add-Product or delete surfaces a bare line of error text —
 * enough that a backend-down request doesn't look like it worked. While a
 * request is in flight, its own button disables and its label changes to a
 * present-participle string ("Adding…"/"Deleting…") — native `disabled`,
 * the same in-flight-pending mechanism `/login`'s submit buttons already
 * use (see docs/adr/0012), not a new convention — held for a minimum
 * duration (`ensureMinimumDuration`) so a fast local response doesn't just
 * flicker the button through its pending state.
 */
function App() {
  const { email, products: initialProducts } = Route.useRouteContext();
  const [error, setError] = useState("");
  const [products, setProducts] = useState<Product[]>(initialProducts);
  const [productName, setProductName] = useState("");
  const [isAdding, setIsAdding] = useState(false);
  // Only ever one row's delete in flight at a time — no bulk delete (#89) —
  // so a single id (rather than a set) is enough to track it.
  const [deletingId, setDeletingId] = useState<string | null>(null);

  async function addProduct() {
    setError("");
    setIsAdding(true);
    try {
      await withMinimumDuration(async () => {
        const res = await fetchWithTimeout("/api/products", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ name: productName }),
        });
        if (!res.ok) {
          setError(ADD_PRODUCT_FAILED);
          return;
        }
        const { product } = (await res.json()) as { product: Product };
        // Reflect the new Product immediately — no full page reload or
        // refetch needed for a list this size.
        setProducts((prev) => [...prev, product]);
        setProductName("");
      });
    } catch {
      setError(CONNECTION_FAILED);
    } finally {
      setIsAdding(false);
    }
  }

  async function deleteProduct(id: string) {
    setError("");
    setDeletingId(id);
    try {
      // The row itself carries the pending button, so removing it has to
      // wait for the same floor `withMinimumDuration` enforces — done
      // inside the callback, the removal would unmount the row (and its
      // "Deleting…" button) the instant the request resolves, cutting the
      // pending state short exactly the way the timeout was meant to fix.
      const ok = await withMinimumDuration(async () => {
        const res = await fetchWithTimeout(`/api/products/${id}`, {
          method: "DELETE",
        });
        return res.ok;
      });
      if (!ok) {
        setError(DELETE_PRODUCT_FAILED);
        return;
      }
      setProducts((prev) => prev.filter((product) => product.id !== id));
    } catch {
      setError(CONNECTION_FAILED);
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <>
      <p>signed in as {email}</p>

      <h2>Products</h2>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void addProduct();
        }}
      >
        <div className="field-row">
          <TextInput
            id="product-name"
            label="Product name"
            value={productName}
            onChange={(e) => setProductName(e.target.value)}
            maxLength={PRODUCT_NAME_MAX_LENGTH}
            required
          />
          <Button type="submit" disabled={isAdding}>
            {isAdding ? "Adding…" : "Add product"}
          </Button>
        </div>
      </form>
      {products.length === 0 ? (
        <p>No products yet.</p>
      ) : (
        products.map((product) => (
          <p key={product.id}>
            {product.name}{" "}
            <Button
              disabled={deletingId === product.id}
              onClick={() => void deleteProduct(product.id)}
            >
              {deletingId === product.id ? "Deleting…" : "Delete"}
            </Button>
          </p>
        ))
      )}

      {error && <p role="alert">{error}</p>}

      <p>
        <Link href="/app/settings">Settings</Link>
      </p>
    </>
  );
}

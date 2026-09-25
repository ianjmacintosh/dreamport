import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";

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

export const Route = createFileRoute("/_appShell/app")({
  beforeLoad: async ({ context }) => {
    // The `/api/me` session guard and the signed-in email now live on the
    // parent `_appShell` layout (#90) — both `/app` and `/app/settings`
    // needed that same check, and `AppNav` needs the email either way. The
    // products fetch itself is *started* by the parent too (see its own
    // comment) so it still runs concurrently with `/api/me` instead of
    // waiting behind it — this just awaits the pending promise handed down
    // through context rather than firing its own request. A failed fetch
    // just starts the page with an empty list rather than bouncing back to
    // `/login` — the session itself is already proven valid by the parent's
    // own check.
    const productsRes = await context.productsPromise;
    const products =
      productsRes && productsRes.ok
        ? ((await productsRes.json()) as { products: Product[] }).products
        : [];

    return { products };
  },
  component: App,
});

const ADD_PRODUCT_FAILED = "We couldn't add that. Try again in a moment.";
const DELETE_PRODUCT_FAILED = "We couldn't delete that. Try again in a moment.";
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
 * The first authenticated page: holds the signed-in User's flat list of
 * Products — add one (#88), see them all, delete one (#89). Who's signed in
 * and account-lifecycle actions (sign out, delete account) live in `AppNav`
 * and on its own page, `/app/settings` — this page is about the Products,
 * not account management.
 *
 * Composed from `TextInput` / `Button` plus heading/paragraph primitives in
 * plain document order: no card treatment or empty-state design for the
 * list. The add-Product field and its button sit in `.field-row` — the same
 * side-by-side single-field-plus-button primitive `/login`'s email step
 * uses — rather than stacked; the list itself is a real `<ul>`/`<li>`
 * (`.list`/`.list-row`, #90 follow-up) rather than a stack of
 * `<div>`s, so a screen reader announces it as an actual list and its
 * Product count, not an undifferentiated block of text. The list also
 * carries `aria-labelledby` pointing at the `<h1>`'s own id, giving it an
 * accessible name ("Products") — otherwise a screen reader entering it (or
 * jumping to it directly, e.g. VoiceOver's rotor list of lists) hears only
 * "list, 2 items" with nothing tying it back to the heading above it.
 *
 * A failed add-Product or delete surfaces a bare line of error text —
 * enough that a backend-down request doesn't look like it worked. While a
 * request is in flight, its own button disables and its label changes to a
 * present-participle string ("Adding…"/"Deleting…") — native `disabled`,
 * the same in-flight-pending mechanism `/login`'s submit buttons already
 * use (see docs/adr/0012), not a new convention — held for a minimum
 * duration (`ensureMinimumDuration`) so a fast local response doesn't just
 * flicker the button through its pending state. Add-Product's label swap
 * goes through `Button`'s `state`/`Button.State` composition (#90), same as
 * `/login`'s submit buttons, so the button's own width doesn't jump between
 * "Add product" and "Adding…"; the field disables alongside it so its
 * submitted value can't change out from under the in-flight request. Delete
 * itself is a two-step inline reveal (#90, Q7) — the same resting/confirming
 * shape `/app/settings`'s delete-account flow already uses, just per-row
 * instead of page-level, since a Product list can hold more than one row at
 * a time. The confirming button keeps the action's own verb, "Delete," rather
 * than a generic "Confirm" (#101). The confirming Delete/Cancel pair stays
 * mounted into the deleting state too (#90 follow-up) rather than being
 * swapped out for a lone "Deleting…" button: the confirming Delete's own
 * label swaps to "Deleting…" via `Button.State`, and
 * Cancel disables in place rather than disappearing, so deleting no longer
 * looks like the whole confirm step vanished and a different button took
 * its place.
 */
function App() {
  const { products: initialProducts } = Route.useRouteContext();
  const [error, setError] = useState("");
  const [products, setProducts] = useState<Product[]>(initialProducts);
  const [productName, setProductName] = useState("");
  const [isAdding, setIsAdding] = useState(false);
  // Only ever one row's delete in flight, and one row confirming, at a time
  // — no bulk delete (#89) — so a single id each (rather than a set) is
  // enough to track them.
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);

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
    setConfirmingId(null);
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
      <h1 id="products-heading">Products</h1>
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
            disabled={isAdding}
            required
          />
          <Button
            type="submit"
            disabled={isAdding}
            state={isAdding ? "pending" : "ready"}
          >
            <Button.State name="ready">Add product</Button.State>
            <Button.State name="pending">Adding…</Button.State>
          </Button>
        </div>
      </form>
      {products.length === 0 ? (
        <p>No products yet.</p>
      ) : (
        <ul className="list" aria-labelledby="products-heading">
          {products.map((product) => (
            <li className="list-row" key={product.id}>
              <Link
                className="list-row-name"
                href={`/app/products/${product.id}`}
              >
                {product.name}
              </Link>
              <div className="list-row-action">
                {confirmingId === product.id || deletingId === product.id ? (
                  <div className="button-group">
                    <Button
                      disabled={deletingId === product.id}
                      state={
                        deletingId === product.id ? "deleting" : "confirming"
                      }
                      onClick={() => void deleteProduct(product.id)}
                    >
                      <Button.State name="confirming">Delete</Button.State>
                      <Button.State name="deleting">Deleting…</Button.State>
                    </Button>
                    <Button
                      variant="secondary"
                      disabled={deletingId === product.id}
                      onClick={() => setConfirmingId(null)}
                    >
                      Cancel
                    </Button>
                  </div>
                ) : (
                  <Button
                    variant="secondary"
                    onClick={() => setConfirmingId(product.id)}
                  >
                    Delete
                  </Button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      {error && <p role="alert">{error}</p>}
    </>
  );
}

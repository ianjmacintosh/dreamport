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
  timeoutMs = 10_000,
): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  return fetch(input, { ...init, signal: controller.signal }).finally(() =>
    clearTimeout(timeout),
  );
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
 * enough that a backend-down request doesn't look like it worked. The
 * styled error treatment and button loading state are #90 for this page.
 */
function App() {
  const { email, products: initialProducts } = Route.useRouteContext();
  const [error, setError] = useState("");
  const [products, setProducts] = useState<Product[]>(initialProducts);
  const [productName, setProductName] = useState("");

  async function addProduct() {
    setError("");
    try {
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
      // Reflect the new Product immediately — no full page reload or refetch
      // needed for a list this size.
      setProducts((prev) => [...prev, product]);
      setProductName("");
    } catch {
      setError(CONNECTION_FAILED);
    }
  }

  async function deleteProduct(id: string) {
    setError("");
    try {
      const res = await fetchWithTimeout(`/api/products/${id}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        setError(DELETE_PRODUCT_FAILED);
        return;
      }
      // Reflect the removal immediately — no full page reload or refetch
      // needed for a list this size, same as `addProduct` above.
      setProducts((prev) => prev.filter((product) => product.id !== id));
    } catch {
      setError(CONNECTION_FAILED);
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
          <Button type="submit">Add product</Button>
        </div>
      </form>
      {products.length === 0 ? (
        <p>No products yet.</p>
      ) : (
        products.map((product) => (
          <p key={product.id}>
            {product.name}{" "}
            <Button onClick={() => void deleteProduct(product.id)}>
              Delete
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

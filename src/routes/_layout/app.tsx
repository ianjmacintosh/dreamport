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
const CONNECTION_FAILED =
  "Something went wrong. Check your connection and try again.";

/**
 * The first authenticated page: it says who you are, and holds the
 * signed-in User's flat list of Products (issue #88) — add one, see them
 * all. Account-lifecycle actions (sign out, delete account) live on their
 * own page, `/app/settings`, linked from here rather than mixed in — this
 * page is about the Products, not account management.
 *
 * Composed from `TextInput` / `Button` / `Link` plus heading/paragraph
 * primitives in plain document order: no page-specific CSS, no card
 * treatment or empty-state design for the list (that's the design/polish
 * pass, #90). The add-Product field and its button sit in `.field-row` — the
 * same side-by-side single-field-plus-button primitive `/login`'s email step
 * uses — rather than stacked.
 *
 * A failed add-Product surfaces a bare line of error text — enough that a
 * backend-down request doesn't look like it worked. The styled error
 * treatment and button loading state are #90 for this page.
 */
function App() {
  const { email, products: initialProducts } = Route.useRouteContext();
  const [error, setError] = useState("");
  const [products, setProducts] = useState<Product[]>(initialProducts);
  const [productName, setProductName] = useState("");

  async function addProduct() {
    setError("");
    try {
      const res = await fetch("/api/products", {
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
        products.map((product) => <p key={product.id}>{product.name}</p>)
      )}

      {error && <p role="alert">{error}</p>}

      <p>
        <Link href="/app/settings">Settings</Link>
      </p>
    </>
  );
}

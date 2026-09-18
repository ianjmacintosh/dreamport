import { useState } from "react";
import {
  createFileRoute,
  redirect,
  useNavigate,
  useRouter,
} from "@tanstack/react-router";

import Button from "../../components/Button";
import TextInput from "../../components/TextInput";
import { authClient } from "../../utils/auth-client";

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

/** Which state the delete-account control is in. */
type DeleteStep = "resting" | "confirming" | "sent";

const SIGN_OUT_FAILED = "We couldn't sign you out. Try again in a moment.";
const DELETE_REQUEST_FAILED =
  "We couldn't start account deletion. Try again in a few minutes.";
const CONNECTION_FAILED =
  "Something went wrong. Check your connection and try again.";
const ADD_PRODUCT_FAILED = "We couldn't add that. Try again in a moment.";

/**
 * The first authenticated page: it says who you are, holds the signed-in
 * User's flat list of Products (issue #88), and offers the two
 * account-lifecycle actions from issue #26 — sign out, and delete account.
 *
 * Composed from `TextInput` / `Button` plus heading/paragraph primitives in
 * plain document order: no page-specific CSS, no card treatment or
 * empty-state design for the Products list (that's the design/polish pass,
 * #90), and no confirm-dialog or "danger zone" component for delete account
 * (that would need design sign-off, #28-adjacent). The delete control is a
 * two-step reveal rather than a native `confirm()` so a stray click can't
 * start an irreversible flow; the emailed link is the real confirmation.
 *
 * A failed sign-out, deletion request, or add-Product surfaces a bare line of
 * error text — enough that a throttled (429) or backend-down request doesn't
 * look like it worked. The styled error treatment and button loading states
 * are #28-adjacent (design polish is #90 for this page).
 */
function App() {
  const { email, products: initialProducts } = Route.useRouteContext();
  const navigate = useNavigate();
  const router = useRouter();
  const [deleteStep, setDeleteStep] = useState<DeleteStep>("resting");
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

  async function signOut() {
    setError("");
    try {
      const { error } = await authClient.signOut();
      if (error) {
        setError(SIGN_OUT_FAILED);
        return;
      }
      // `/` is the genuine signed-out state (the homepage has its own way into
      // `/login` since #50). Invalidate first so no stale route context keeps
      // rendering "signed in as".
      void router.invalidate();
      void navigate({ to: "/" });
    } catch {
      setError(CONNECTION_FAILED);
    }
  }

  async function requestDeletion() {
    setError("");
    try {
      const { error } = await authClient.deleteUser({ callbackURL: "/" });
      if (error) {
        // Stay on the confirm step — nothing was sent.
        setError(DELETE_REQUEST_FAILED);
        return;
      }
      setDeleteStep("sent");
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
        <TextInput
          id="product-name"
          label="Product name"
          value={productName}
          onChange={(e) => setProductName(e.target.value)}
          maxLength={PRODUCT_NAME_MAX_LENGTH}
          required
        />
        <Button type="submit">Add product</Button>
      </form>
      {products.length === 0 ? (
        <p>No products yet.</p>
      ) : (
        products.map((product) => <p key={product.id}>{product.name}</p>)
      )}

      <h2>Sign out</h2>
      <Button onClick={() => void signOut()}>Sign out</Button>

      <h2>Delete account</h2>
      {deleteStep === "resting" && (
        <Button
          variant="secondary"
          onClick={() => {
            setError("");
            setDeleteStep("confirming");
          }}
        >
          Delete account
        </Button>
      )}
      {deleteStep === "confirming" && (
        <>
          <p>
            This permanently deletes your account and everything in it. We'll
            email you a link to confirm.
          </p>
          <Button variant="primary" onClick={() => void requestDeletion()}>
            Email me a deletion link
          </Button>
          <Button
            variant="secondary"
            onClick={() => {
              setError("");
              setDeleteStep("resting");
            }}
          >
            Cancel
          </Button>
        </>
      )}
      {deleteStep === "sent" && (
        <p>
          Check your email for a link to finish deleting your account. The link
          expires in 24 hours.
        </p>
      )}

      {error && <p role="alert">{error}</p>}
    </>
  );
}

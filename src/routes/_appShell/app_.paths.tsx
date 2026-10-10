import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";

import Button from "../../components/Button";
import Dialog from "../../components/Dialog";
import Link from "../../components/Link";
import TextArea from "../../components/TextArea";
import TextInput from "../../components/TextInput";

/** A Path as `/api/paths` lists it (see `PathSummary` in `src/worker/paths.ts`). */
interface PathSummary {
  id: string;
  name: string;
  createdAt: string;
}

/** Mirror `src/worker/paths.ts`; the server enforces the real limits. */
const PATH_NAME_MAX_LENGTH = 200;
const PATH_DESCRIPTION_MAX_LENGTH = 2000;

/**
 * Plain `fetch` never times out on its own; this aborts after `timeoutMs`
 * so a request to a server that went away lands in a `catch` instead of
 * hanging. Same helper `/app` and the Product pages each keep a copy of.
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

// `app_.paths`, not `app.paths`: `app.tsx` renders no `<Outlet />`, so this
// page is a sibling of `/app`, the same as `app_.settings.tsx`.
export const Route = createFileRoute("/_appShell/app_/paths")({
  beforeLoad: async () => {
    // The session is already proven by `_appShell`. A failed fetch starts
    // the page empty, as `/app` does with its Products.
    const res = await fetch("/api/paths").catch(() => null);
    const paths =
      res && res.ok
        ? ((await res.json()) as { paths: PathSummary[] }).paths
        : [];
    return { paths };
  },
  component: Paths,
});

const ADD_PATH_FAILED = "We couldn't add that. Try again in a moment.";
const CONNECTION_FAILED =
  "Something went wrong. Check your connection and try again.";

/**
 * Paths (#167): the User's own Paths, each linking to its Draft, and
 * "Add Path", which opens a `Dialog` for the new Path's name and
 * description. A refusal (the 30-Path cap) shows the server's own words in
 * the Dialog, which stays open so nothing typed is lost.
 */
function Paths() {
  const { paths: initialPaths } = Route.useRouteContext();
  const [paths, setPaths] = useState<PathSummary[]>(initialPaths);
  const [isOpen, setIsOpen] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [isAdding, setIsAdding] = useState(false);
  const [error, setError] = useState("");

  function openDialog() {
    setName("");
    setDescription("");
    setError("");
    setIsOpen(true);
  }

  async function addPath() {
    setError("");
    setIsAdding(true);
    try {
      await withMinimumDuration(async () => {
        const res = await fetchWithTimeout("/api/paths", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ name, description }),
        });
        if (res.status === 409) {
          setError(((await res.json()) as { error: string }).error);
          return;
        }
        if (!res.ok) {
          setError(ADD_PATH_FAILED);
          return;
        }
        const { path } = (await res.json()) as { path: PathSummary };
        setPaths((prev) => [...prev, path]);
        setIsOpen(false);
      });
    } catch {
      setError(CONNECTION_FAILED);
    } finally {
      setIsAdding(false);
    }
  }

  return (
    <>
      <h1 id="paths-heading">Paths</h1>
      <p>
        <Button onClick={openDialog}>Add Path</Button>
      </p>
      {paths.length === 0 ? (
        <p>No Paths yet.</p>
      ) : (
        <ul className="list" aria-labelledby="paths-heading">
          {paths.map((path) => (
            <li className="list-row" key={path.id}>
              <Link className="list-row-name" href={`/app/paths/${path.id}`}>
                {path.name}
              </Link>
            </li>
          ))}
        </ul>
      )}

      <Dialog
        open={isOpen}
        onOpenChange={(open) => {
          if (!isAdding) setIsOpen(open);
        }}
        title="Add Path"
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void addPath();
          }}
        >
          <TextInput
            id="path-name"
            label="Path name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={PATH_NAME_MAX_LENGTH}
            disabled={isAdding}
            required
          />
          <TextArea
            id="path-description"
            label="Description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            maxLength={PATH_DESCRIPTION_MAX_LENGTH}
            disabled={isAdding}
          />
          {error && <p role="alert">{error}</p>}
          <div className="button-group">
            <Button
              type="submit"
              disabled={isAdding}
              state={isAdding ? "pending" : "ready"}
            >
              <Button.State name="ready">Add Path</Button.State>
              <Button.State name="pending">Adding…</Button.State>
            </Button>
            <Button
              variant="secondary"
              disabled={isAdding}
              onClick={() => setIsOpen(false)}
            >
              Cancel
            </Button>
          </div>
        </form>
      </Dialog>
    </>
  );
}

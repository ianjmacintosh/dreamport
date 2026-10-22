import { useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { CompassIcon } from "@phosphor-icons/react";

import ActionCard from "../../components/ActionCard";
import Button from "../../components/Button";
import Dialog from "../../components/Dialog";
import TextArea from "../../components/TextArea";
import TextInput from "../../components/TextInput";

/** A Path as `/api/paths` lists it (see `PathSummary` in `src/worker/paths.ts`). */
interface PathSummary {
  id: string;
  name: string;
  createdAt: string;
}

/** As `/api/paths` lists `added` (see `AddedPath` in `src/worker/paths.ts`). */
interface AddedPath {
  id: string;
  name: string;
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
    const { paths, added } =
      res && res.ok
        ? ((await res.json()) as { paths: PathSummary[]; added: AddedPath[] })
        : { paths: [], added: [] };
    return { paths, added };
  },
  component: Paths,
});

const ADD_PATH_FAILED = "We couldn't add that. Try again in a moment.";
const CONNECTION_FAILED =
  "Something went wrong. Check your connection and try again.";

/**
 * Pathfinder (#167, #192): every Path the User can follow, in two
 * sections. "Your Original Paths" are the ones they made, then "Make New
 * Path", which opens a `Dialog` for the new Path's name and description
 * and then goes straight to the new Path's editor. A refusal (the 30-Path
 * cap) shows the server's own words in the Dialog, which stays open so
 * nothing typed is lost. "Your Added Paths" are Dream Sequence, then the
 * Paths they've Added, one card per Path. Every card links to the Path's
 * Trailhead.
 */
function Paths() {
  const { paths, added } = Route.useRouteContext();
  const navigate = useNavigate();
  const [isOpen, setIsOpen] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [isAdding, setIsAdding] = useState(false);
  const [error, setError] = useState("");

  // Each Path as a linked `ActionCard` to its Trailhead: compass and name.
  const cards = (
    list: readonly { id: string; name: string }[],
    labelledBy: string,
  ) => (
    <ul className="action-card-list" aria-labelledby={labelledBy}>
      {list.map((path) => (
        <li key={path.id}>
          <ActionCard
            href={`/app/paths/${path.id}`}
            leading={<CompassIcon weight="bold" aria-hidden="true" />}
          >
            {path.name}
          </ActionCard>
        </li>
      ))}
    </ul>
  );

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
        await navigate({
          to: "/app/paths/$pathId/edit",
          params: { pathId: path.id },
        });
      });
    } catch {
      setError(CONNECTION_FAILED);
    } finally {
      setIsAdding(false);
    }
  }

  return (
    <>
      <h1>Pathfinder</h1>
      <p>
        If you&apos;d like your Product to follow a structured program with
        milestones and tasks along the way to a certain goal, that&apos;s
        exactly what Paths provide. You can follow our free &ldquo;Dream
        Sequence&rdquo; Path to bring your product idea all the way from its
        beginning to being a real shipped product with a growing user base,
        using customer feedback all along the way. If you have different goals
        or prefer taking another route, you can make your own Path for your
        Product to follow instead. You make the milestones and tasks and put
        your Product on that path.
      </p>
      <h2 id="original-paths">Your Original Paths</h2>
      {paths.length === 0 ? (
        <p>No Paths yet.</p>
      ) : (
        cards(paths, "original-paths")
      )}
      <p>
        <Button onClick={openDialog}>Make New Path</Button>
      </p>
      <h2 id="added-paths">Your Added Paths</h2>
      <p>
        The paths listed below were made by other people. You can follow these
        paths, but you cannot make changes to them.
      </p>
      {cards(added, "added-paths")}

      <Dialog
        open={isOpen}
        onOpenChange={(open) => {
          if (!isAdding) setIsOpen(open);
        }}
        title="Make New Path"
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
              <Button.State name="ready">Make New Path</Button.State>
              <Button.State name="pending">Making…</Button.State>
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

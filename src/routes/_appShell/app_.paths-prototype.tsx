// PROTOTYPE (#167) — throwaway. Lives on 167-prototype-trailblazer only; never merge.
// Round 2. Rows: ?variant= C (reorder mode), D (drag handle) and E (drag
// handle, separating lines instead of white blocks). Adding/editing:
// ?form=inline (a button that reveals the form in place) or modal (a dialog).
// State is in memory; every "request" is a fake 400ms wait.
import { useState, type CSSProperties, type ReactNode } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Dialog } from "@base-ui/react/dialog";
import { DotsSixVerticalIcon } from "@phosphor-icons/react";

import type { BreadcrumbsProps } from "../../components/Breadcrumbs";
import Button from "../../components/Button";
import PrototypeSwitcher from "../../components/PrototypeSwitcher";
import TextArea from "../../components/TextArea";
import TextInput from "../../components/TextInput";

const PATH = {
  name: "Weekend Launch",
  description:
    "A two-day route from a rough idea to a landing page that takes sign-ups.",
};

interface Milestone {
  id: string;
  name: string;
  description: string;
  doneWhen: string;
  outcome: string;
}

const EMPTY: Milestone = {
  id: "",
  name: "",
  description: "",
  doneWhen: "",
  outcome: "",
};

const SEED: Milestone[] = [
  {
    id: "m1",
    name: "Pick One Problem",
    description: "Write down the one problem this weekend is about.",
    doneWhen: "You can say the problem in one sentence.",
    outcome: "A problem worth a weekend",
  },
  {
    id: "m2",
    name: "Talk to Five People Who Have It",
    description: "Find five people with the problem and ask how they cope.",
    doneWhen: "Five conversations are written up.",
    outcome: "",
  },
  {
    id: "m3",
    name: "Write the Landing Page Headline and Everything Under It",
    description: "Draft the page in plain words before designing anything.",
    doneWhen: "A friend can say what it offers after ten seconds.",
    outcome: "A page that explains itself",
  },
  {
    id: "m4",
    name: "Put It Live",
    description: "Publish the page with a sign-up form.",
    doneWhen: "The page is reachable at a real URL.",
    outcome: "",
  },
  {
    id: "m5",
    name: "Ask for Sign-ups",
    description: "Send the page to everyone you talked to.",
    doneWhen: "Twenty people have seen it.",
    outcome: "First sign-ups",
  },
];

const VARIANTS = [
  { key: "C", name: "Reorder mode, white blocks" },
  { key: "D", name: "Drag handle, white blocks" },
  { key: "E", name: "Drag handle, separating lines" },
];

export const Route = createFileRoute("/_appShell/app_/paths-prototype")({
  validateSearch: (search: Record<string, unknown>) => ({
    variant:
      search.variant === "D" || search.variant === "E" ? search.variant : "C",
    form: search.form === "modal" ? "modal" : "inline",
  }),
  beforeLoad: () => ({
    breadcrumbs: {
      trail: [{ label: "Trailblazer", href: "/app/paths-prototype" }],
      current: PATH.name,
    } satisfies BreadcrumbsProps,
  }),
  component: PathPrototype,
});

const PROTO_CSS = `
.proto-drag-row { grid-template-columns: 1.5rem minmax(0, 1fr) auto; column-gap: var(--space-3); }
.proto-drag-row > .proto-handle { grid-column: 1; grid-row: 1 / span 2; align-self: center; }
.proto-drag-row > .list-row-name { grid-column: 2; }
.proto-drag-row > .list-row-action { grid-column: 3; }
@media (max-width: 640px) {
  .proto-drag-row > .list-row-action { grid-column: 2; }
}
`;

const wait = () => new Promise((resolve) => setTimeout(resolve, 400));

const blockRow = (variant: string): CSSProperties =>
  variant === "E"
    ? {
        padding: "var(--space-3) 0",
        borderTop: "1px solid var(--color-border)",
      }
    : {
        padding: "var(--space-3) var(--space-4)",
        backgroundColor: "var(--color-sheet)",
      };

function PathPrototype() {
  const { variant, form } = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const [milestones, setMilestones] = useState(SEED);
  const [movingId, setMovingId] = useState<string | null>(null);
  // "new" for the add form, a Milestone id for its edit form.
  const [openForm, setOpenForm] = useState<string | null>(null);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [reordering, setReordering] = useState(false);
  const [dragId, setDragId] = useState<string | null>(null);
  const [dropAt, setDropAt] = useState<number | null>(null);

  const draggable = variant === "D" || variant === "E";
  const busy = movingId !== null;

  async function move(id: string, delta: -1 | 1) {
    setMovingId(id);
    await wait();
    setMilestones((prev) => {
      const from = prev.findIndex((m) => m.id === id);
      const to = from + delta;
      if (to < 0 || to >= prev.length) return prev;
      const next = [...prev];
      [next[from], next[to]] = [next[to], next[from]];
      return next;
    });
    setMovingId(null);
  }

  function drop() {
    if (dragId === null || dropAt === null) return;
    setMilestones((prev) => {
      const from = prev.findIndex((m) => m.id === dragId);
      const next = [...prev];
      const [dragged] = next.splice(from, 1);
      next.splice(dropAt > from ? dropAt - 1 : dropAt, 0, dragged);
      return next;
    });
    setDragId(null);
    setDropAt(null);
  }

  function save(m: Milestone) {
    setMilestones((prev) =>
      m.id
        ? prev.map((x) => (x.id === m.id ? m : x))
        : [...prev, { ...m, id: crypto.randomUUID() }],
    );
    setOpenForm(null);
  }

  function remove(id: string) {
    setMilestones((prev) => prev.filter((m) => m.id !== id));
    setConfirmingId(null);
    setOpenForm(null);
  }

  function deleteButtons(id: string) {
    return confirmingId === id ? (
      <>
        <Button onClick={() => remove(id)}>Delete</Button>
        <Button variant="secondary" onClick={() => setConfirmingId(null)}>
          Cancel
        </Button>
      </>
    ) : (
      <Button
        variant="secondary"
        disabled={busy}
        onClick={() => setConfirmingId(id)}
      >
        Delete
      </Button>
    );
  }

  function formFor(m: Milestone) {
    const adding = !m.id;
    return (
      <MilestoneForm
        key={m.id || "new"}
        idPrefix={m.id || "add"}
        initial={m}
        onSubmit={save}
        actions={(pending) => (
          <>
            <Button
              type="submit"
              disabled={pending}
              state={pending ? "p" : "r"}
            >
              <Button.State name="r">
                {adding ? "Add Milestone" : "Update Milestone"}
              </Button.State>
              <Button.State name="p">
                {adding ? "Adding…" : "Updating…"}
              </Button.State>
            </Button>
            <Button
              variant="secondary"
              disabled={pending}
              onClick={() => setOpenForm(null)}
            >
              Cancel
            </Button>
            {!adding && deleteButtons(m.id)}
          </>
        )}
      />
    );
  }

  function rowActions(m: Milestone, i: number) {
    if (variant === "C" && reordering) {
      return (
        <>
          <Button
            variant="secondary"
            disabled={busy || i === 0}
            state={movingId === m.id ? "p" : "r"}
            onClick={() => void move(m.id, -1)}
          >
            <Button.State name="r">Move Up</Button.State>
            <Button.State name="p">Moving…</Button.State>
          </Button>
          <Button
            variant="secondary"
            disabled={busy || i === milestones.length - 1}
            onClick={() => void move(m.id, 1)}
          >
            Move Down
          </Button>
        </>
      );
    }
    return (
      <>
        <Button
          variant="secondary"
          disabled={busy}
          onClick={() => {
            setConfirmingId(null);
            setOpenForm(m.id);
          }}
        >
          Edit
        </Button>
        {form === "inline" && deleteButtons(m.id)}
      </>
    );
  }

  const dropLine = (
    <li
      aria-hidden
      style={{
        height: 0,
        outline: "2px solid var(--color-accent)",
        margin: "-1px 0",
      }}
    />
  );

  const modalTarget =
    form === "modal" && openForm !== null
      ? openForm === "new"
        ? EMPTY
        : milestones.find((m) => m.id === openForm)
      : undefined;

  return (
    <>
      <style>{PROTO_CSS}</style>
      <h1>{PATH.name}</h1>
      <p>{PATH.description}</p>
      <h2 id="milestones-heading">Milestones</h2>
      {variant === "C" && milestones.length > 1 && (
        <p>
          <Button
            variant="secondary"
            onClick={() => {
              setOpenForm(null);
              setReordering((r) => !r);
            }}
          >
            {reordering ? "Done Reordering" : "Reorder"}
          </Button>
        </p>
      )}
      {milestones.length === 0 ? (
        <p>No Milestones yet.</p>
      ) : (
        <ol
          className="list"
          aria-labelledby="milestones-heading"
          style={variant === "E" ? { rowGap: 0 } : undefined}
          onDragLeave={(e) => {
            if (!e.currentTarget.contains(e.relatedTarget as Node))
              setDropAt(null);
          }}
        >
          {milestones.map((m, i) => (
            <Row
              key={m.id}
              before={dropAt === i && dragId !== null ? dropLine : null}
            >
              <li
                className={
                  form === "inline" && openForm === m.id
                    ? "list-row list-row--editing"
                    : draggable
                      ? "list-row proto-drag-row"
                      : "list-row"
                }
                onDragOver={
                  draggable && dragId
                    ? (e) => {
                        e.preventDefault();
                        const r = e.currentTarget.getBoundingClientRect();
                        setDropAt(e.clientY < r.top + r.height / 2 ? i : i + 1);
                      }
                    : undefined
                }
                onDrop={draggable ? drop : undefined}
                style={{
                  ...(form === "inline" && openForm === m.id
                    ? {}
                    : blockRow(variant)),
                  ...(variant === "E" && i === milestones.length - 1
                    ? { borderBottom: "1px solid var(--color-border)" }
                    : {}),
                  opacity: dragId === m.id ? 0.4 : 1,
                }}
              >
                {form === "inline" && openForm === m.id ? (
                  <div style={{ gridColumn: "1 / -1" }}>{formFor(m)}</div>
                ) : (
                  <>
                    {draggable && (
                      <span
                        className="proto-handle"
                        draggable
                        tabIndex={0}
                        role="button"
                        aria-label={`Move ${m.name}: drag, or press the up or down arrow key`}
                        onDragStart={(e) => {
                          e.dataTransfer.effectAllowed = "move";
                          e.dataTransfer.setDragImage(
                            e.currentTarget.closest("li")!,
                            12,
                            12,
                          );
                          setDragId(m.id);
                        }}
                        onDragEnd={() => {
                          setDragId(null);
                          setDropAt(null);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === "ArrowUp" && i > 0) {
                            e.preventDefault();
                            void move(m.id, -1);
                          }
                          if (
                            e.key === "ArrowDown" &&
                            i < milestones.length - 1
                          ) {
                            e.preventDefault();
                            void move(m.id, 1);
                          }
                        }}
                        style={{
                          display: "grid",
                          placeItems: "center",
                          cursor: "grab",
                          fontSize: "1.5rem",
                        }}
                      >
                        <DotsSixVerticalIcon />
                      </span>
                    )}
                    <div className="list-row-name">
                      {i + 1}. {m.name}
                    </div>
                    <div className="list-row-action">
                      <div className="button-group">{rowActions(m, i)}</div>
                    </div>
                  </>
                )}
              </li>
            </Row>
          ))}
          {dropAt === milestones.length && dragId !== null && dropLine}
        </ol>
      )}

      {form === "inline" && openForm === "new" ? (
        <div
          className="list-row--editing form-section"
          style={{ display: "grid" }}
        >
          {formFor(EMPTY)}
        </div>
      ) : (
        !(variant === "C" && reordering) && (
          <p className="form-section">
            <Button
              disabled={busy}
              onClick={() => {
                setConfirmingId(null);
                setOpenForm("new");
              }}
            >
              Add Milestone
            </Button>
          </p>
        )
      )}

      <Dialog.Root
        open={modalTarget !== undefined}
        onOpenChange={(open) => {
          if (!open) setOpenForm(null);
        }}
      >
        <Dialog.Portal>
          <Dialog.Backdrop
            style={{
              position: "fixed",
              inset: 0,
              background: "rgb(0 0 0 / 0.35)",
            }}
          />
          <Dialog.Popup
            style={{
              position: "fixed",
              top: "50%",
              left: "50%",
              transform: "translate(-50%, -50%)",
              width: "min(36rem, calc(100vw - 2rem))",
              maxHeight: "calc(100vh - 2rem)",
              overflowY: "auto",
              padding: "var(--space-6, 2rem)",
              background: "var(--color-sheet)",
            }}
          >
            <Dialog.Title render={<h2 />}>
              {modalTarget?.id ? "Edit Milestone" : "Add Milestone"}
            </Dialog.Title>
            {modalTarget && formFor(modalTarget)}
          </Dialog.Popup>
        </Dialog.Portal>
      </Dialog.Root>

      <PrototypeSwitcher
        variants={VARIANTS}
        current={variant}
        onChange={(key) =>
          void navigate({ search: (s) => ({ ...s, variant: key }) })
        }
      />
      <button
        type="button"
        onClick={() =>
          void navigate({
            search: (s) => ({
              ...s,
              form: form === "modal" ? "inline" : "modal",
            }),
          })
        }
        style={{
          position: "fixed",
          bottom: "4rem",
          left: "50%",
          transform: "translateX(-50%)",
          padding: "0.25rem 0.75rem",
          borderRadius: "999px",
          background: "#111",
          color: "#fff",
          border: 0,
          fontFamily: "system-ui, sans-serif",
          fontSize: "0.8rem",
          zIndex: 1000,
        }}
      >
        Add/Edit: {form === "modal" ? "modal dialog" : "inline"} (click to flip)
      </button>
    </>
  );
}

function Row({ before, children }: { before: ReactNode; children: ReactNode }) {
  return (
    <>
      {before}
      {children}
    </>
  );
}

function MilestoneForm({
  idPrefix,
  initial,
  onSubmit,
  actions,
}: {
  idPrefix: string;
  initial: Milestone;
  onSubmit: (m: Milestone) => void;
  actions: (pending: boolean) => ReactNode;
}) {
  const [draft, setDraft] = useState(initial);
  const [pending, setPending] = useState(false);
  const set = (field: keyof Milestone) => (e: { target: { value: string } }) =>
    setDraft((d) => ({ ...d, [field]: e.target.value }));
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        setPending(true);
        await wait();
        setPending(false);
        onSubmit(draft);
      }}
    >
      <TextInput
        id={`${idPrefix}-name`}
        label="Milestone name"
        value={draft.name}
        onChange={set("name")}
        disabled={pending}
        required
      />
      <TextArea
        id={`${idPrefix}-description`}
        label="Description"
        value={draft.description}
        onChange={set("description")}
        disabled={pending}
        required
      />
      <TextInput
        id={`${idPrefix}-done-when`}
        label="Done when"
        value={draft.doneWhen}
        onChange={set("doneWhen")}
        disabled={pending}
        required
      />
      <TextInput
        id={`${idPrefix}-outcome`}
        label="Outcome"
        helperText="Optional"
        value={draft.outcome}
        onChange={set("outcome")}
        disabled={pending}
      />
      <div className="button-group">{actions(pending)}</div>
    </form>
  );
}

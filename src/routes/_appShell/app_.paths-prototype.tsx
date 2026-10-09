// PROTOTYPE (#167) — throwaway. Lives on 167-prototype-trailblazer only; never merge.
// Four ways to reorder a Draft's Milestones on one Path page, switchable with
// ?variant=A–D, plus ?form=above|below for where the add-Milestone form sits.
// State is in memory; every "request" is a fake 400ms wait.
import { Fragment, useState, type ReactNode } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import {
  ArrowDownIcon,
  ArrowUpIcon,
  DotsSixVerticalIcon,
} from "@phosphor-icons/react";

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
  { key: "A", name: "Arrows on each row" },
  { key: "B", name: "Move inside the edit panel" },
  { key: "C", name: "Reorder mode" },
  { key: "D", name: "Drag handle" },
];

export const Route = createFileRoute("/_appShell/app_/paths-prototype")({
  validateSearch: (search: Record<string, unknown>) => ({
    variant: typeof search.variant === "string" ? search.variant : "A",
    form: search.form === "above" ? "above" : "below",
  }),
  beforeLoad: () => ({
    breadcrumbs: {
      trail: [{ label: "Trailblazer", href: "/app/paths-prototype" }],
      current: PATH.name,
    } satisfies BreadcrumbsProps,
  }),
  component: PathPrototype,
});

const wait = () => new Promise((resolve) => setTimeout(resolve, 400));

function PathPrototype() {
  const { variant, form } = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const [milestones, setMilestones] = useState(SEED);
  const [movingId, setMovingId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [reordering, setReordering] = useState(false);
  const [dragId, setDragId] = useState<string | null>(null);

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

  function dropOn(targetId: string) {
    if (!dragId || dragId === targetId) return;
    setMilestones((prev) => {
      const next = prev.filter((m) => m.id !== dragId);
      const dragged = prev.find((m) => m.id === dragId)!;
      next.splice(
        next.findIndex((m) => m.id === targetId) +
          (prev.findIndex((m) => m.id === dragId) <
          prev.findIndex((m) => m.id === targetId)
            ? 1
            : 0),
        0,
        dragged,
      );
      return next;
    });
  }

  function update(updated: Milestone) {
    setMilestones((prev) =>
      prev.map((m) => (m.id === updated.id ? updated : m)),
    );
    setEditingId(null);
  }

  function remove(id: string) {
    setMilestones((prev) => prev.filter((m) => m.id !== id));
    setConfirmingId(null);
    setEditingId(null);
  }

  const busy = movingId !== null;
  const addForm = (
    <MilestoneForm
      key={milestones.length}
      idPrefix="add"
      className="form-section"
      initial={{ id: "", name: "", description: "", doneWhen: "", outcome: "" }}
      onSubmit={(m) =>
        setMilestones((prev) => [...prev, { ...m, id: crypto.randomUUID() }])
      }
      actions={(pending) => (
        <Button type="submit" disabled={pending} state={pending ? "p" : "r"}>
          <Button.State name="r">Add Milestone</Button.State>
          <Button.State name="p">Adding…</Button.State>
        </Button>
      )}
    />
  );

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

  function rowActions(m: Milestone, i: number) {
    const first = i === 0;
    const last = i === milestones.length - 1;
    if (variant === "C" && reordering) {
      return (
        <>
          <Button
            variant="secondary"
            disabled={busy || first}
            state={movingId === m.id ? "p" : "r"}
            onClick={() => void move(m.id, -1)}
          >
            <Button.State name="r">Move Up</Button.State>
            <Button.State name="p">Moving…</Button.State>
          </Button>
          <Button
            variant="secondary"
            disabled={busy || last}
            onClick={() => void move(m.id, 1)}
          >
            Move Down
          </Button>
        </>
      );
    }
    return (
      <>
        {variant === "A" && (
          <>
            <Button
              variant="secondary"
              aria-label={`Move ${m.name} up`}
              disabled={busy || first}
              onClick={() => void move(m.id, -1)}
            >
              <ArrowUpIcon />
            </Button>
            <Button
              variant="secondary"
              aria-label={`Move ${m.name} down`}
              disabled={busy || last}
              onClick={() => void move(m.id, 1)}
            >
              <ArrowDownIcon />
            </Button>
          </>
        )}
        <Button
          variant="secondary"
          disabled={busy}
          onClick={() => {
            setConfirmingId(null);
            setEditingId(m.id);
          }}
        >
          Edit
        </Button>
        {deleteButtons(m.id)}
      </>
    );
  }

  return (
    <>
      <h1>{PATH.name}</h1>
      <p>{PATH.description}</p>
      {form === "above" && addForm}
      <h2 id="milestones-heading">Milestones</h2>
      {variant === "C" && milestones.length > 1 && (
        <p>
          <Button variant="secondary" onClick={() => setReordering((r) => !r)}>
            {reordering ? "Done Reordering" : "Reorder"}
          </Button>
        </p>
      )}
      {milestones.length === 0 ? (
        <p>No Milestones yet.</p>
      ) : (
        <ol className="list" aria-labelledby="milestones-heading">
          {milestones.map((m, i) => (
            <li
              key={m.id}
              className={
                editingId === m.id ? "list-row list-row--editing" : "list-row"
              }
              onDragOver={
                variant === "D" ? (e) => e.preventDefault() : undefined
              }
              onDrop={variant === "D" ? () => dropOn(m.id) : undefined}
              style={
                variant === "D" && dragId === m.id
                  ? { opacity: 0.4 }
                  : undefined
              }
            >
              {editingId === m.id ? (
                <MilestoneForm
                  idPrefix={`edit-${m.id}`}
                  initial={m}
                  onSubmit={update}
                  actions={(pending) => (
                    <>
                      <Button
                        type="submit"
                        disabled={pending}
                        state={pending ? "p" : "r"}
                      >
                        <Button.State name="r">Update Milestone</Button.State>
                        <Button.State name="p">Updating…</Button.State>
                      </Button>
                      <Button
                        variant="secondary"
                        disabled={pending}
                        onClick={() => setEditingId(null)}
                      >
                        Cancel
                      </Button>
                      {variant === "B" && (
                        <>
                          <Button
                            variant="secondary"
                            disabled={pending || busy || i === 0}
                            state={movingId === m.id ? "p" : "r"}
                            onClick={() => void move(m.id, -1)}
                          >
                            <Button.State name="r">Move Up</Button.State>
                            <Button.State name="p">Moving…</Button.State>
                          </Button>
                          <Button
                            variant="secondary"
                            disabled={
                              pending || busy || i === milestones.length - 1
                            }
                            onClick={() => void move(m.id, 1)}
                          >
                            Move Down
                          </Button>
                        </>
                      )}
                      {deleteButtons(m.id)}
                    </>
                  )}
                />
              ) : (
                <Fragment>
                  <div className="list-row-name">
                    {variant === "D" && (
                      <span
                        draggable
                        tabIndex={0}
                        role="button"
                        aria-label={`Drag ${m.name}, or press the up or down arrow key to move it`}
                        onDragStart={() => setDragId(m.id)}
                        onDragEnd={() => setDragId(null)}
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
                        style={{ cursor: "grab", marginInlineEnd: "0.5rem" }}
                      >
                        <DotsSixVerticalIcon />
                      </span>
                    )}
                    {i + 1}. {m.name}
                  </div>
                  <div className="list-row-action">
                    <div className="button-group">{rowActions(m, i)}</div>
                  </div>
                </Fragment>
              )}
            </li>
          ))}
        </ol>
      )}
      {form === "below" && addForm}
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
              form: form === "above" ? "below" : "above",
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
        Form {form} the list (click to flip)
      </button>
    </>
  );
}

function MilestoneForm({
  idPrefix,
  initial,
  onSubmit,
  actions,
  className,
}: {
  idPrefix: string;
  initial: Milestone;
  onSubmit: (m: Milestone) => void;
  actions: (pending: boolean) => ReactNode;
  className?: string;
}) {
  const [draft, setDraft] = useState(initial);
  const [pending, setPending] = useState(false);
  const set = (field: keyof Milestone) => (e: { target: { value: string } }) =>
    setDraft((d) => ({ ...d, [field]: e.target.value }));
  return (
    <form
      className={className}
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

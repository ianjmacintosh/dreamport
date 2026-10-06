/**
 * PROTOTYPE — throwaway, #140. Not production code; never merge.
 *
 * Question: how should the current Milestone's column on the Journey page
 * be organized, so a viewer can tell in ~5 seconds (1) what this
 * Milestone is about, (2) what to do here — and that each to-do is
 * clickable — and (3) what done looks like, with Advance findable but not
 * the first thing the eye lands on? Grilled with Ian 2026-10-06.
 *
 * Three variants of the content column on the real Journey route
 * (`/app/products/:productId/journey`), switched with `?variant=A|B|C`.
 * The Milestone route on the left stays as it is. `?m=1..7` picks which
 * Milestone is current (faked — nothing is written); `?many=1` swaps in
 * a 10-item to-do fixture to stress the long case. Checking a Task here
 * only flips local state, and Advance/Return only move `?m`. Dev only —
 * without `?variant=` the page renders its normal markup.
 *
 * A  Sections     — one reading column with three headed sections:
 *                   the Milestone (name, outcome as a lede, description),
 *                   "What to do" (big check rows), "Done when", buttons.
 * B  Checklist    — the to-dos are the page: a progress line, then each
 *                   to-do as a full-width card you can click anywhere on.
 *                   The description folds into "About this Milestone";
 *                   "Done when" sits above the list as the goal.
 * C  Finish line  — the Milestone, a compact to-do list, then one tinted
 *                   finish-line block holding "Done when" and the
 *                   Return/Advance buttons — crossing it is one unit.
 *                   (Ian, round 1: ugly — the block and the "To do"
 *                   subheading both.)
 *
 * D  Sections + cards — Ian's pick from round 1: A's top half (headings,
 *                   text, readable) with B's cards and progress bar under
 *                   "What to do", then A's "Done when" section.
 *
 * Every variant: an `EVENT: ` title loses its prefix and gets an Event
 * pill with a calendar icon instead (display only — the data is
 * unchanged, per Ian on #140); a Worksheet to-do gets a document icon and
 * its "n of m" fill count. All real copy; the only new words are labels
 * (headings, "About this Milestone", the hint in C) — flagged for Ian.
 * Every new class lives in `prototype.css`, listed at its top.
 */
import { useEffect, useState, type ReactNode } from "react";
import { useNavigate, useSearch } from "@tanstack/react-router";
import {
  CalendarBlankIcon,
  CaretLeftIcon,
  CaretRightIcon,
  CheckIcon,
  FileTextIcon,
  FlagCheckeredIcon,
} from "@phosphor-icons/react";

import Button from "../../../components/Button";
import Link from "../../../components/Link";
import "./prototype.css";

interface Milestone {
  id: string;
  name: string;
  description: string;
  doneWhen: string;
  outcome: string;
}

interface WorksheetSummary {
  id: string;
  name: string;
  milestoneIds: string[];
  filled: number;
  total: number;
}

interface TaskSummary {
  id: string;
  title: string;
  milestoneIds: string[];
  done: boolean;
}

/** One thing to do on the Milestone: a Worksheet to fill or a Task to tick. */
type ToDo =
  | {
      kind: "worksheet";
      id: string;
      name: string;
      filled: number;
      total: number;
    }
  | {
      kind: "task";
      id: string;
      title: string;
      isEvent: boolean;
      done: boolean;
    };

const EVENT_PREFIX = "EVENT: ";

// ── The 10-item fixture (?many=1) ─────────────────────────────────────────

const MANY_TASKS: { id: string; title: string }[] = [
  { id: "f1", title: "EVENT: Set aside 1 hour to write the Product Summary" },
  { id: "f2", title: "List three people who have this problem" },
  { id: "f3", title: "Write down the biggest bet your product makes" },
  { id: "f4", title: "EVENT: Read your Product Summary aloud to a friend" },
  { id: "f5", title: "Ask that friend to explain it back in their own words" },
  { id: "f6", title: "Note anything they got wrong" },
  { id: "f7", title: "Rewrite the parts they got wrong" },
  { id: "f8", title: "Pick a rough price, even if it's a guess" },
  { id: "f9", title: "EVENT: Block 30 minutes to review it next week" },
];

interface ProtoSearch {
  variant?: unknown;
  m?: unknown;
  many?: unknown;
}

export interface PrototypeColumn {
  variant: string;
  /** The faked current Milestone, 1-based. */
  m: number;
  many: boolean;
}

/** The prototype's settings from the URL, or `null` outside dev / without `?variant=`. */
// eslint-disable-next-line react-refresh/only-export-components -- prototype
export function usePrototypeColumn(
  realCurrentIndex: number,
  milestoneCount: number,
): PrototypeColumn | null {
  const search = useSearch({ strict: false }) as ProtoSearch;
  if (!import.meta.env.DEV || typeof search.variant !== "string") return null;
  return {
    variant: search.variant,
    m: Math.min(
      milestoneCount,
      Math.max(1, Number(search.m) || realCurrentIndex + 1 || 1),
    ),
    many: search.many === "1" || search.many === 1,
  };
}

interface ColumnProps {
  productId: string;
  milestone: Milestone;
  toDos: ToDo[];
  onToggle: (taskId: string) => void;
  canReturn: boolean;
  isLast: boolean;
  onReturn: () => void;
  onAdvance: () => void;
}

export function JourneyColumnPrototype({
  proto,
  productId,
  milestones,
  worksheets,
  tasks,
}: {
  proto: PrototypeColumn;
  productId: string;
  milestones: Milestone[];
  worksheets: WorksheetSummary[];
  tasks: TaskSummary[];
}) {
  const navigate = useNavigate();
  const milestone = milestones[proto.m - 1];
  // Local check state, seeded from the real Tasks — nothing is written.
  const [done, setDone] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(tasks.map((t) => [t.id, t.done])),
  );

  function set(next: ProtoSearch) {
    void navigate({
      to: ".",
      search: ((prev: Record<string, unknown>) => ({
        ...prev,
        ...next,
      })) as never,
      replace: true,
    });
  }

  const sheetToDos: ToDo[] = worksheets
    .filter((w) => w.milestoneIds.includes(milestone.id))
    .map((w) => ({ kind: "worksheet", ...w }));
  const taskSource = proto.many
    ? MANY_TASKS
    : tasks.filter((t) => t.milestoneIds.includes(milestone.id));
  const taskToDos: ToDo[] = taskSource.map((t) => {
    const isEvent = t.title.startsWith(EVENT_PREFIX);
    return {
      kind: "task",
      id: t.id,
      title: isEvent ? t.title.slice(EVENT_PREFIX.length) : t.title,
      isEvent,
      done: done[t.id] ?? false,
    };
  });
  const toDos = [...sheetToDos, ...taskToDos];

  const index = Math.max(
    0,
    VARIANTS.findIndex((v) => v.key === proto.variant.toUpperCase()),
  );
  const { Component } = VARIANTS[index];

  return (
    <>
      <Component
        productId={productId}
        milestone={milestone}
        toDos={toDos}
        onToggle={(id) => setDone((d) => ({ ...d, [id]: !d[id] }))}
        canReturn={proto.m > 1}
        isLast={proto.m === milestones.length}
        onReturn={() => set({ m: Math.max(1, proto.m - 1) })}
        onAdvance={() => set({ m: Math.min(milestones.length, proto.m + 1) })}
      />
      <PrototypeSwitcher
        index={index}
        onVariant={(key) => set({ variant: key })}
      >
        <button
          type="button"
          aria-label="Previous Milestone"
          onClick={() => set({ m: Math.max(1, proto.m - 1) })}
        >
          −
        </button>
        <span>
          M{proto.m}/{milestones.length}
        </span>
        <button
          type="button"
          aria-label="Next Milestone"
          onClick={() => set({ m: Math.min(milestones.length, proto.m + 1) })}
        >
          +
        </button>
        <span className="proto-switcher-sep" aria-hidden="true" />
        <button
          type="button"
          className="proto-switcher-toggle"
          onClick={() => set({ many: proto.many ? undefined : "1" })}
        >
          {proto.many ? "10 to-dos" : "Real to-dos"}
        </button>
      </PrototypeSwitcher>
    </>
  );
}

// ── Shared pieces ────────────────────────────────────────────────────────

function EventPill() {
  return (
    <span className="proto-event-pill">
      <CalendarBlankIcon weight="bold" aria-hidden="true" />
      Event
    </span>
  );
}

/** The big check box: a real checkbox, restyled, inside its row's label. */
function CheckBox({
  checked,
  onChange,
}: {
  checked: boolean;
  onChange: () => void;
}) {
  return (
    <span className="proto-check">
      <input type="checkbox" checked={checked} onChange={onChange} />
      <CheckIcon
        weight="bold"
        aria-hidden="true"
        className="proto-check-mark"
      />
    </span>
  );
}

function SheetIcon() {
  return (
    <span className="proto-sheet-icon">
      <FileTextIcon weight="bold" aria-hidden="true" />
    </span>
  );
}

function countDone(toDos: ToDo[]) {
  return toDos.filter((t) =>
    t.kind === "task" ? t.done : t.filled === t.total,
  ).length;
}

function MoveButtons({
  canReturn,
  isLast,
  onReturn,
  onAdvance,
}: Pick<ColumnProps, "canReturn" | "isLast" | "onReturn" | "onAdvance">) {
  return (
    <div className="button-group">
      {canReturn && (
        <Button variant="secondary" onClick={onReturn}>
          Return to Previous Milestone
        </Button>
      )}
      <Button onClick={onAdvance}>
        {isLast ? "Finish Journey" : "Advance to Next Milestone"}
      </Button>
    </div>
  );
}

// ── A: Sections ──────────────────────────────────────────────────────────

function VariantA(props: ColumnProps) {
  const { milestone, toDos, productId, onToggle } = props;
  return (
    <section className="proto-a">
      <h3>{milestone.name}</h3>
      <p className="proto-a-lede">{milestone.outcome}</p>
      <p>{milestone.description}</p>

      <h4 className="proto-a-heading">
        What to do{" "}
        <span className="proto-a-count">
          {countDone(toDos)} of {toDos.length} done
        </span>
      </h4>
      <ul className="proto-a-list">
        {toDos.map((toDo) =>
          toDo.kind === "worksheet" ? (
            <li key={toDo.id} className="proto-a-row">
              <SheetIcon />
              <span>
                <Link href={`/app/products/${productId}/worksheets/${toDo.id}`}>
                  Complete your {toDo.name}
                </Link>{" "}
                <span className="proto-muted">
                  {toDo.filled} of {toDo.total} filled
                </span>
              </span>
            </li>
          ) : (
            <li key={toDo.id}>
              <label
                className="proto-a-row proto-a-row--task"
                data-done={toDo.done}
              >
                <CheckBox
                  checked={toDo.done}
                  onChange={() => onToggle(toDo.id)}
                />
                <span>
                  {toDo.title} {toDo.isEvent && <EventPill />}
                </span>
              </label>
            </li>
          ),
        )}
      </ul>

      <h4 className="proto-a-heading">Done when</h4>
      <p>{milestone.doneWhen}</p>

      <MoveButtons {...props} />
    </section>
  );
}

// ── B: Checklist ─────────────────────────────────────────────────────────

function VariantB(props: ColumnProps) {
  const { milestone, toDos, productId, onToggle } = props;
  const doneCount = countDone(toDos);
  return (
    <section className="proto-b">
      <h3>{milestone.name}</h3>
      <p className="proto-b-goal">
        <strong>Done when:</strong> {milestone.doneWhen}
      </p>
      <details className="proto-b-about">
        <summary>About this Milestone</summary>
        <p>{milestone.description}</p>
      </details>

      <div className="proto-b-progress">
        <span>
          {doneCount} of {toDos.length} done
        </span>
        <span className="proto-b-bar" aria-hidden="true">
          <span style={{ width: `${(doneCount / toDos.length) * 100}%` }} />
        </span>
      </div>

      <ul className="proto-b-cards">
        {toDos.map((toDo) =>
          toDo.kind === "worksheet" ? (
            <li key={toDo.id}>
              <a
                className="proto-b-card"
                href={`/app/products/${productId}/worksheets/${toDo.id}`}
              >
                <SheetIcon />
                <span className="proto-b-card-title">{toDo.name}</span>
                <span className="proto-muted">
                  {toDo.filled} of {toDo.total} filled
                </span>
                <CaretRightIcon weight="bold" aria-hidden="true" />
              </a>
            </li>
          ) : (
            <li key={toDo.id}>
              <label className="proto-b-card" data-done={toDo.done}>
                <CheckBox
                  checked={toDo.done}
                  onChange={() => onToggle(toDo.id)}
                />
                <span className="proto-b-card-title">{toDo.title}</span>
                {toDo.isEvent && <EventPill />}
              </label>
            </li>
          ),
        )}
      </ul>

      <MoveButtons {...props} />
    </section>
  );
}

// ── C: Finish line ───────────────────────────────────────────────────────

function VariantC(props: ColumnProps) {
  const { milestone, toDos, productId, onToggle } = props;
  return (
    <section className="proto-c">
      <h3>{milestone.name}</h3>
      <p>{milestone.description}</p>

      <h4 className="proto-c-heading">To do</h4>
      <ul className="proto-c-list">
        {toDos.map((toDo) =>
          toDo.kind === "worksheet" ? (
            <li key={toDo.id} className="proto-c-row">
              <SheetIcon />
              <Link href={`/app/products/${productId}/worksheets/${toDo.id}`}>
                {toDo.name}
              </Link>
              <span className="proto-muted">
                {toDo.filled} of {toDo.total}
              </span>
            </li>
          ) : (
            <li key={toDo.id}>
              <label className="proto-c-row" data-done={toDo.done}>
                <CheckBox
                  checked={toDo.done}
                  onChange={() => onToggle(toDo.id)}
                />
                <span>{toDo.title}</span>
                {toDo.isEvent && <EventPill />}
              </label>
            </li>
          ),
        )}
      </ul>

      <div className="proto-c-finish">
        <h4 className="proto-c-finish-heading">
          <FlagCheckeredIcon weight="bold" aria-hidden="true" />
          Done when
        </h4>
        <p className="proto-c-finish-text">{milestone.doneWhen}</p>
        <p className="proto-c-hint">
          The to-dos help you get here. You decide when you&apos;ve arrived.
        </p>
        <MoveButtons {...props} />
      </div>
    </section>
  );
}

// ── D: Sections + cards (Ian's pick from round 1) ───────────────────────

/**
 * A's top half (name, outcome lede, description, headed sections) with B's
 * progress bar and cards under "What to do", then A's "Done when" section
 * and the buttons.
 */
function VariantD(props: ColumnProps) {
  const { milestone, toDos, productId, onToggle } = props;
  const doneCount = countDone(toDos);
  return (
    <section className="proto-a">
      <h3>{milestone.name}</h3>
      <p className="proto-a-lede">{milestone.outcome}</p>
      <p>{milestone.description}</p>

      <h4 className="proto-a-heading">What to do</h4>
      <div className="proto-b-progress proto-d-progress">
        <span>
          {doneCount} of {toDos.length} done
        </span>
        <span className="proto-b-bar" aria-hidden="true">
          <span style={{ width: `${(doneCount / toDos.length) * 100}%` }} />
        </span>
      </div>
      <ul className="proto-b-cards">
        {toDos.map((toDo) =>
          toDo.kind === "worksheet" ? (
            <li key={toDo.id}>
              <a
                className="proto-b-card"
                href={`/app/products/${productId}/worksheets/${toDo.id}`}
              >
                <SheetIcon />
                <span className="proto-b-card-title">{toDo.name}</span>
                <span className="proto-muted">
                  {toDo.filled} of {toDo.total} filled
                </span>
                <CaretRightIcon weight="bold" aria-hidden="true" />
              </a>
            </li>
          ) : (
            <li key={toDo.id}>
              <label className="proto-b-card" data-done={toDo.done}>
                <CheckBox
                  checked={toDo.done}
                  onChange={() => onToggle(toDo.id)}
                />
                <span className="proto-b-card-title">{toDo.title}</span>
                {toDo.isEvent && <EventPill />}
              </label>
            </li>
          ),
        )}
      </ul>

      <h4 className="proto-a-heading">Done when</h4>
      <p>{milestone.doneWhen}</p>

      <MoveButtons {...props} />
    </section>
  );
}

// ── Switcher ─────────────────────────────────────────────────────────────

const VARIANTS = [
  { key: "A", name: "Sections", Component: VariantA },
  { key: "B", name: "Checklist", Component: VariantB },
  { key: "C", name: "Finish line", Component: VariantC },
  { key: "D", name: "Sections + cards", Component: VariantD },
];

function PrototypeSwitcher({
  index,
  onVariant,
  children,
}: {
  index: number;
  onVariant: (key: string) => void;
  children: ReactNode;
}) {
  const go = (delta: number) =>
    onVariant(
      VARIANTS[(index + delta + VARIANTS.length) % VARIANTS.length].key,
    );

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const t = e.target as HTMLElement | null;
      if (t?.closest("input, textarea, [contenteditable]")) return;
      if (e.key === "ArrowLeft") go(-1);
      if (e.key === "ArrowRight") go(1);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const current = VARIANTS[index];
  return (
    <div className="proto-switcher" role="toolbar" aria-label="Prototype">
      <button type="button" onClick={() => go(-1)} aria-label="Previous">
        <CaretLeftIcon aria-hidden="true" />
      </button>
      <span>
        {current.key} ({current.name})
      </span>
      <button type="button" onClick={() => go(1)} aria-label="Next">
        <CaretRightIcon aria-hidden="true" />
      </button>
      <span className="proto-switcher-sep" aria-hidden="true" />
      {children}
    </div>
  );
}

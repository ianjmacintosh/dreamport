/**
 * PROTOTYPE — throwaway, #137. Not production code; never merge.
 *
 * Question: what should the Journey page look like, before and after
 * starting? (Decisions in #137's 2026-10-04 comment.) Three layouts on the
 * real Journey route (`/app/products/:productId/journey`), switched with
 * `?variant=A|B|C`. `?state=before|after` and `?m=1..7` fake the Journey's
 * state so both sides can be judged without touching the database; "Start
 * Journey" here only flips `state` (no request). Dev only — without
 * `?variant=` the page renders its normal markup.
 *
 * A  Document     — one column in reading order: pitch, numbered list, then
 *                   the invitation and the button at the bottom. After: the
 *                   big-picture line, the list, then the current work.
 * B  Route map    — the pitch, invitation and button up top in one panel,
 *                   then a vertical route (dots on a line) with the outcome
 *                   lines. After: route on the left, current work on the
 *                   right.
 * C  Destination  — leads with where it ends ("Ends at: Growth, a product
 *                   that grows and makes money"), then a 7-step track you
 *                   read left to right; the button sits in a sticky aside.
 *                   After: a progress bar, the track, the work full-width.
 *
 * D  Route map, both states — Ian's pick from round 1: B's after-start
 *                   split for both states. Before starting, the right panel
 *                   opens with a heading, then the pitch, the invitation
 *                   and Start Journey, all at body size.
 *
 * All copy is placeholder at the brief's lengths — Ian writes the real
 * thing. Every new class lives in `prototype.css`, listed at its top.
 */
import { useEffect, type ReactNode } from "react";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { CaretLeftIcon, CaretRightIcon } from "@phosphor-icons/react";

import Button from "../../../components/Button";
import Link from "../../../components/Link";
import "./prototype.css";

interface Milestone {
  id: string;
  name: string;
  description: string;
  doneWhen: string;
}

interface ProtoProps {
  product: { id: string; name: string };
  milestones: Milestone[];
}

interface ViewProps extends ProtoProps {
  /** -1 before starting; otherwise the current Milestone's index. */
  currentIndex: number;
  onStart: () => void;
}

// ── Placeholder copy, at the brief's lengths ─────────────────────────────

/** Sales paragraph: 2–4 sentences. */
const PITCH =
  "Placeholder sales paragraph, two to four sentences long. It connects the idea you have today with a product that grows and makes money. The seven steps are the route between the two. It talks about what you want, not about our method.";

/** Outcome lines: 8 words or fewer each, one per Milestone. */
const OUTCOMES = [
  "A one-page plan someone else understands",
  "Proof the problem is real, in their words",
  "The features they want, at their price",
  "A first version people can pay for",
  "Paying customers who use it without you",
  "Customers who'd hate to lose it",
  "A repeatable way to find more customers",
];

/** Invitation line: 1–2 sentences, beside Start Journey. */
function invitation(firstName: string) {
  return `Placeholder invitation: starting puts you on step 1, ${firstName}, and leaves your Ideas and description as they are. Use as much or as little of it as you like.`;
}

// ── Shared bits (markup only, no layout) ─────────────────────────────────

function StartButton({ onStart }: { onStart: () => void }) {
  return <Button onClick={onStart}>Start Journey</Button>;
}

function BigPicture({ milestones, currentIndex }: ViewProps) {
  const next = milestones[currentIndex + 1];
  const last = milestones[milestones.length - 1];
  return (
    <p className="journey-big-picture">
      <strong>
        Milestone {currentIndex + 1} of {milestones.length}
      </strong>
      {" · "}Next: {next ? next.name : "—"}
      {" · "}Ends at: {last.name}
    </p>
  );
}

function CurrentWork({
  milestone,
  index,
  heading = "h3",
}: {
  milestone: Milestone;
  index: number;
  heading?: "h3" | "h2";
}) {
  const H = heading;
  return (
    <>
      <H>
        Now: {index + 1}. {milestone.name}
      </H>
      <p>{milestone.description}</p>
      <p>
        <strong>Done when:</strong> {milestone.doneWhen}
      </p>
      <p className="journey-slot">
        #139&apos;s Worksheet and #140&apos;s Tasks go here.
      </p>
    </>
  );
}

function statusOf(index: number, currentIndex: number) {
  if (currentIndex < 0) return "future";
  if (index < currentIndex) return "done";
  if (index === currentIndex) return "current";
  return "future";
}

const STATUS_LABEL = { done: "Done", current: "Current", future: "" };

function BackLink({ product }: ProtoProps) {
  return (
    <p>
      <Link href={`/app/products/${product.id}`} current={false}>
        Back to {product.name}
      </Link>
    </p>
  );
}

// ── A: Document ──────────────────────────────────────────────────────────

function VariantA(props: ViewProps) {
  const { product, milestones, currentIndex, onStart } = props;
  const started = currentIndex >= 0;
  return (
    <>
      <h1>{product.name}</h1>
      <h2>Journey</h2>
      {started ? <BigPicture {...props} /> : <p>{PITCH}</p>}
      <ol aria-label="Milestones" className="journey-a-list">
        {milestones.map((m, i) => {
          const status = statusOf(i, currentIndex);
          return (
            <li
              key={m.id}
              aria-current={status === "current" ? "step" : undefined}
              data-status={status}
            >
              <strong>{m.name}</strong>
              {status !== "future" && started && (
                <span className="journey-a-status">
                  {" "}
                  — {STATUS_LABEL[status]}
                </span>
              )}
              {!started && (
                <span className="journey-a-outcome"> — {OUTCOMES[i]}</span>
              )}
            </li>
          );
        })}
      </ol>
      {started ? (
        <CurrentWork
          milestone={milestones[currentIndex]}
          index={currentIndex}
        />
      ) : (
        <div className="journey-a-invite">
          <p>{invitation(milestones[0].name)}</p>
          <StartButton onStart={onStart} />
        </div>
      )}
      <BackLink {...props} />
    </>
  );
}

// ── B: Route map ─────────────────────────────────────────────────────────

function RouteMap({
  milestones,
  currentIndex,
  compact,
}: ViewProps & { compact?: boolean }) {
  return (
    <ol aria-label="Milestones" className="journey-route">
      {milestones.map((m, i) => {
        const status = statusOf(i, currentIndex);
        return (
          <li
            key={m.id}
            className="journey-route-stop"
            data-status={status}
            aria-current={status === "current" ? "step" : undefined}
          >
            <span className="journey-route-dot" aria-hidden="true">
              {i + 1}
            </span>
            <span className="journey-route-name">{m.name}</span>
            {(!compact || status === "current") && (
              <span className="journey-route-outcome">{OUTCOMES[i]}</span>
            )}
          </li>
        );
      })}
    </ol>
  );
}

function VariantB(props: ViewProps) {
  const { product, milestones, currentIndex, onStart } = props;
  const started = currentIndex >= 0;
  return (
    <>
      <h1>{product.name}</h1>
      <h2>Journey</h2>
      {started ? (
        <>
          <BigPicture {...props} />
          <div className="journey-b-split">
            <RouteMap {...props} compact />
            <section className="journey-b-work">
              <CurrentWork
                milestone={milestones[currentIndex]}
                index={currentIndex}
              />
            </section>
          </div>
        </>
      ) : (
        <>
          <section className="journey-b-panel">
            <p className="text-xl">{PITCH}</p>
            <p>{invitation(milestones[0].name)}</p>
            <StartButton onStart={onStart} />
          </section>
          <RouteMap {...props} />
        </>
      )}
      <BackLink {...props} />
    </>
  );
}

// ── C: Destination ───────────────────────────────────────────────────────

function Track({ milestones, currentIndex }: ViewProps) {
  return (
    <ol aria-label="Milestones" className="journey-track">
      {milestones.map((m, i) => {
        const status = statusOf(i, currentIndex);
        return (
          <li
            key={m.id}
            className="journey-track-step"
            data-status={status}
            aria-current={status === "current" ? "step" : undefined}
          >
            <span className="journey-track-number">{i + 1}</span>
            <strong>{m.name}</strong>
            <span className="journey-track-outcome">{OUTCOMES[i]}</span>
          </li>
        );
      })}
    </ol>
  );
}

function VariantC(props: ViewProps) {
  const { product, milestones, currentIndex, onStart } = props;
  const started = currentIndex >= 0;
  const last = milestones[milestones.length - 1];
  return (
    <>
      <h1>{product.name}</h1>
      <h2>Journey</h2>
      {started ? (
        <>
          <div className="journey-c-progress">
            <BigPicture {...props} />
            <progress
              max={milestones.length}
              value={currentIndex}
              aria-label="Milestones done"
            />
          </div>
          <Track {...props} />
          <section className="journey-c-work">
            <CurrentWork
              milestone={milestones[currentIndex]}
              index={currentIndex}
            />
          </section>
        </>
      ) : (
        <div className="journey-c-layout">
          <div>
            <p className="journey-c-destination">
              Ends at: <strong>{last.name}</strong> — a product that grows and
              makes money.
            </p>
            <p>{PITCH}</p>
            <Track {...props} />
          </div>
          <aside className="journey-c-aside">
            <p>{invitation(milestones[0].name)}</p>
            <StartButton onStart={onStart} />
          </aside>
        </div>
      )}
      <BackLink {...props} />
    </>
  );
}

// ── D: Route map, both states ───────────────────────────────────────────

function VariantD(props: ViewProps) {
  const { product, milestones, currentIndex, onStart } = props;
  const started = currentIndex >= 0;
  return (
    <>
      <h1>{product.name}</h1>
      <h2>Journey</h2>
      {started && <BigPicture {...props} />}
      <div className="journey-b-split">
        <RouteMap {...props} compact={started} />
        <section className="journey-b-work">
          {started ? (
            <CurrentWork
              milestone={milestones[currentIndex]}
              index={currentIndex}
            />
          ) : (
            <>
              <h3>Placeholder heading for the pitch</h3>
              <p>{PITCH}</p>
              <p>{invitation(milestones[0].name)}</p>
              <StartButton onStart={onStart} />
            </>
          )}
        </section>
      </div>
      <BackLink {...props} />
    </>
  );
}

// ── Switching ────────────────────────────────────────────────────────────

const VARIANTS = [
  { key: "A", name: "Document", Component: VariantA },
  { key: "B", name: "Route map", Component: VariantB },
  { key: "C", name: "Destination", Component: VariantC },
  { key: "D", name: "Route map, both states", Component: VariantD },
];

interface ProtoSearch {
  variant?: unknown;
  state?: unknown;
  m?: unknown;
}

// eslint-disable-next-line react-refresh/only-export-components -- prototype
export function usePrototypeVariant(): string | null {
  const search = useSearch({ strict: false }) as ProtoSearch;
  if (!import.meta.env.DEV) return null;
  return typeof search.variant === "string" ? search.variant : null;
}

export function JourneyPrototype(
  props: ProtoProps & { variant: string; realCurrentIndex: number },
) {
  const search = useSearch({ strict: false }) as ProtoSearch;
  const navigate = useNavigate();
  const index = Math.max(
    0,
    VARIANTS.findIndex((v) => v.key === props.variant.toUpperCase()),
  );
  const state =
    search.state === "before" || search.state === "after"
      ? search.state
      : props.realCurrentIndex >= 0
        ? "after"
        : "before";
  const m = Math.min(
    props.milestones.length,
    Math.max(1, Number(search.m) || props.realCurrentIndex + 1 || 1),
  );
  const currentIndex = state === "after" ? m - 1 : -1;

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

  const { Component } = VARIANTS[index];
  return (
    <>
      <Component
        {...props}
        currentIndex={currentIndex}
        onStart={() => set({ state: "after", m: 1 })}
      />
      <PrototypeSwitcher
        index={index}
        onVariant={(key) => set({ variant: key })}
      >
        <button
          type="button"
          className="proto-switcher-toggle"
          onClick={() => set({ state: state === "after" ? "before" : "after" })}
        >
          {state === "after" ? "After start" : "Before start"}
        </button>
        {state === "after" && (
          <>
            <button
              type="button"
              aria-label="Previous Milestone"
              onClick={() => set({ m: Math.max(1, m - 1) })}
            >
              −
            </button>
            <span>
              M{m}/{props.milestones.length}
            </span>
            <button
              type="button"
              aria-label="Next Milestone"
              onClick={() =>
                set({ m: Math.min(props.milestones.length, m + 1) })
              }
            >
              +
            </button>
          </>
        )}
      </PrototypeSwitcher>
    </>
  );
}

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

// PROTOTYPE — throwaway (#192). Lives on 192-prototype-added-copy only;
// never merge, never push.
//
// Round 3 (below "round 3"): I–L, after Ian picked G. Round 2 (below
// "round 2"): E–H, after Ian picked D. Round 1's A–C are
// in this branch's history (d658e06).
//
// Round 1: how an Added copy looks among a User's Available Paths, on the
// Paths page (`/app/paths`) and Pathfinder
// (`/app/products/:productId/pathfinder`). Four structurally different
// variants via `?variant=`, the same key on both pages; the case via
// `?state=`. All stubbed in memory: clicks on rows are caught and written
// to the state line instead of navigating.
import { useState } from "react";
import type { MouseEvent, ReactNode } from "react";
import {
  BookOpenIcon,
  CompassIcon,
  LockSimpleIcon,
  PencilSimpleIcon,
  UserIcon,
} from "@phosphor-icons/react";

import ActionCard from "../../components/ActionCard";
import Button from "../../components/Button";
import Link from "../../components/Link";
import { PrototypeSwitcher } from "../../components/PrototypeSwitcher";

// ---------------------------------------------------------------- stubs --

const VARIANTS = [
  { key: "G", name: "Round 2's G, for reference" },
  { key: "I", name: "Make New Path under Original; Added only when held" },
  { key: "J", name: "As I, plus a line saying Added can't be changed" },
  { key: "K", name: "Make New Path beside the Original heading" },
  { key: "L", name: "Make New Path on top; both sections always shown" },
];

const STATES = [
  { key: "typical", name: "Two own Paths + copies of v1 and v2" },
  { key: "no-copies", name: "No copies (today)" },
  { key: "one-copy", name: "One copy (v2 only)" },
  { key: "two-guides", name: "Copies of two different Paths" },
  { key: "following", name: "Product on the v2 copy; another Completed" },
  { key: "name-clash", name: "Own Path with the same name as a copy" },
] as const;
export type StateKey = (typeof STATES)[number]["key"];

/** A Path the User made. `version` is its newest saved one, if any. */
interface OwnPath {
  kind: "own";
  id: string;
  name: string;
  version: number | null;
}

/** An Added copy of one published version of another User's Path. */
interface CopyPath {
  kind: "copy";
  id: string;
  name: string;
  version: number;
  /** The Guide's Path it was copied from: copies of two versions share it. */
  sourceId: string;
}

type UserPath = OwnPath | CopyPath;

interface Journey {
  status: "following" | "completed" | "abandoned";
  /** The copy (or Path) the Journey is on. */
  pathId: string;
}

interface Stub {
  paths: UserPath[];
  /** The Product's Journeys, by the source Path they're on. */
  journeys: Record<string, Journey>;
}

const WEEKLY: OwnPath = {
  kind: "own",
  id: "own-weekly",
  name: "Weekly Customer Calls",
  version: 3,
};
const PRICING: OwnPath = {
  kind: "own",
  id: "own-pricing",
  name: "Pricing Experiments",
  version: null,
};
const POPUP_V1: CopyPath = {
  kind: "copy",
  id: "copy-popup-v1",
  name: "Pop-Up Shop Launch",
  version: 1,
  sourceId: "popup",
};
const POPUP_V2: CopyPath = { ...POPUP_V1, id: "copy-popup-v2", version: 2 };
const COLD_V4: CopyPath = {
  kind: "copy",
  id: "copy-cold-v4",
  name: "Cold Email Sprint",
  version: 4,
  sourceId: "cold",
};
const OWN_POPUP: OwnPath = {
  kind: "own",
  id: "own-popup",
  name: "Pop-Up Shop Launch",
  version: 1,
};

function stubFor(state: StateKey): Stub {
  switch (state) {
    case "no-copies":
      return { paths: [WEEKLY, PRICING], journeys: {} };
    case "one-copy":
      return { paths: [WEEKLY, PRICING, POPUP_V2], journeys: {} };
    case "two-guides":
      return {
        paths: [WEEKLY, PRICING, POPUP_V1, POPUP_V2, COLD_V4],
        journeys: {},
      };
    case "following":
      return {
        paths: [WEEKLY, PRICING, POPUP_V1, POPUP_V2],
        journeys: {
          popup: { status: "following", pathId: POPUP_V2.id },
          [WEEKLY.id]: { status: "completed", pathId: WEEKLY.id },
        },
      };
    case "name-clash":
      return { paths: [WEEKLY, OWN_POPUP, POPUP_V2], journeys: {} };
    default:
      return { paths: [WEEKLY, PRICING, POPUP_V1, POPUP_V2], journeys: {} };
  }
}

const PRODUCT = { id: "tarot", name: "Tarot" };
const DREAM_SEQUENCE = { id: "dream-sequence", name: "Dream Sequence" };

// ----------------------------------------------------------- helpers --

const own = (s: Stub) => s.paths.filter((p): p is OwnPath => p.kind === "own");
const copies = (s: Stub) =>
  s.paths.filter((p): p is CopyPath => p.kind === "copy");
/** Pathfinder offers only own Paths with a saved version. */
const followableOwn = (s: Stub) => own(s).filter((p) => p.version !== null);

const trailhead = (p: { id: string }) => `/app/paths/${p.id}`;
const journeyHref = (pathId: string) =>
  `/app/products/${PRODUCT.id}/journeys/journey-on-${pathId}`;

/** Copies grouped by the Path they came from, versions oldest first. */
function groupCopies(s: Stub) {
  const groups = new Map<string, CopyPath[]>();
  for (const c of copies(s)) {
    groups.set(c.sourceId, [...(groups.get(c.sourceId) ?? []), c]);
  }
  return [...groups.values()].map((g) =>
    g.sort((a, b) => a.version - b.version),
  );
}

function Dot() {
  return <span aria-hidden="true"> · </span>;
}

function PathsIntro() {
  return (
    <p>
      If you&apos;d like your Product to follow a structured program with
      milestones and tasks along the way to a certain goal, that&apos;s exactly
      what Paths provide. You can follow our free &ldquo;Dream Sequence&rdquo;
      Path to bring your product idea all the way from its beginning to being a
      real shipped product with a growing user base, using customer feedback all
      along the way. If you have different goals or prefer taking another route,
      you can make your own Path for your Product to follow instead. You make
      the milestones and tasks and put your Product on that path.
    </p>
  );
}

function MakeYourOwn() {
  return (
    <>
      <h3>Make Your Own Path</h3>
      <p>
        Not finding a Path that does quite what you need?{" "}
        <Link href="/app/paths">Make your own Path</Link>
      </p>
    </>
  );
}

// ---------------------------------------------------------- round 2 --
// Ian on round 1: D's cards, but one card per Path however many versions
// are held; the whole card clickable, always to the Trailhead (an own
// Path's Trailhead has Edit Path); the name bold; an icon saying yours or
// read-only. What's still open is which icons, sections or one list, and
// where the version goes. E–H answer those differently; D stays for
// reference. Round 1's D is in history (7587be6).

/** One entry per Path: each own Path, and each Path the User holds copies of. */
type Entry =
  | { kind: "own"; id: string; name: string; path: OwnPath }
  | { kind: "added"; id: string; name: string; copies: CopyPath[] }
  | { kind: "dreamport"; id: string; name: string };

function entries(s: Stub, forPathfinder: boolean): Entry[] {
  const mine = (forPathfinder ? followableOwn(s) : own(s)).map(
    (p): Entry => ({ kind: "own", id: p.id, name: p.name, path: p }),
  );
  const added = groupCopies(s).map(
    (g): Entry => ({
      kind: "added",
      id: g[0].sourceId,
      name: g[0].name,
      copies: g,
    }),
  );
  const byEntryName = (a: Entry, b: Entry) => a.name.localeCompare(b.name);
  return [
    ...(forPathfinder
      ? [{ kind: "dreamport", ...DREAM_SEQUENCE } as Entry]
      : []),
    ...[...mine, ...added].sort(
      (a, b) => byEntryName(a, b) || (a.kind === "own" ? -1 : 1),
    ),
  ];
}

function versionsText(e: Entry): string {
  if (e.kind === "dreamport") return "";
  if (e.kind === "own") {
    return e.path.version === null
      ? "Draft, no version saved"
      : `Version ${e.path.version}`;
  }
  const v = e.copies.map((c) => c.version);
  return v.length === 1
    ? `Version ${v[0]}`
    : `Versions ${v.slice(0, -1).join(", ")} and ${v[v.length - 1]}`;
}

/** Pathfinder's status for an entry: Following, Completed, Abandoned. */
function journeyStatus(s: Stub, e: Entry) {
  const journey = s.journeys[e.id];
  if (!journey) return { href: trailhead(e), status: null };
  // No version, even across copies of two (round 3: no versions shown).
  if (journey.status === "following") {
    return { href: journeyHref(journey.pathId), status: "Following" };
  }
  return {
    href: trailhead(e),
    status: journey.status === "completed" ? "Completed" : "Abandoned",
  };
}

interface Look {
  icon: (e: Entry) => ReactNode;
  /** The small line under the name, if this look has one. */
  line?: (e: Entry) => ReactNode;
  /** Text at the card's end on the Paths page, if any. */
  end?: (e: Entry) => string | null;
}

function Card({
  e,
  look,
  stub,
  page,
}: {
  e: Entry;
  look: Look;
  stub: Stub;
  page: "Paths" | "Pathfinder";
}) {
  const { href, status } =
    page === "Pathfinder"
      ? journeyStatus(stub, e)
      : { href: trailhead(e), status: null };
  const end = [look.end?.(e), status].filter(Boolean).join(" · ");
  const line = look.line?.(e);
  return (
    <ActionCard
      href={href}
      leading={look.icon(e)}
      trailing={end && <ActionCard.Status>{end}</ActionCard.Status>}
    >
      <strong>{e.name}</strong>
      {line && (
        <>
          <br />
          <span className="text-sm">{line}</span>
        </>
      )}
    </ActionCard>
  );
}

function Cards({
  list,
  look,
  stub,
  page,
}: {
  list: Entry[];
  look: Look;
  stub: Stub;
  page: "Paths" | "Pathfinder";
}) {
  return (
    <ul className="action-card-list">
      {list.map((e) => (
        <li key={e.id}>
          <Card e={e} look={look} stub={stub} page={page} />
        </li>
      ))}
    </ul>
  );
}

const icon = {
  pencil: <PencilSimpleIcon weight="bold" aria-hidden="true" />,
  lock: <LockSimpleIcon weight="bold" aria-hidden="true" />,
  user: <UserIcon weight="bold" aria-hidden="true" />,
  book: <BookOpenIcon weight="bold" aria-hidden="true" />,
  compass: <CompassIcon weight="bold" aria-hidden="true" />,
};

// E: one list. A pencil for a Path you made (you can change it), a padlock
// for anything you can't (an Added copy, Dream Sequence). The small line
// says Added and the versions.
const LOOK_E: Look = {
  icon: (e) => (e.kind === "own" ? icon.pencil : icon.lock),
  line: (e) =>
    e.kind === "own" ? (
      versionsText(e)
    ) : e.kind === "added" ? (
      <>
        Added
        <Dot />
        Read-only
        <Dot />
        {versionsText(e)}
      </>
    ) : (
      "From Dreamport"
    ),
};

// F: B's two sections, with E's pencil and padlock. The headings say
// made-or-Added, so the small line is only the versions.
const LOOK_F: Look = {
  icon: LOOK_E.icon,
  line: (e) => (e.kind === "dreamport" ? null : versionsText(e)),
};

// G: one list, no second line. A person for a Path you made, an open book
// for an Added one (the "bought book" of CONTEXT.md); the versions sit at
// the card's end like a status.
const LOOK_G: Look = {
  icon: (e) =>
    e.kind === "own"
      ? icon.user
      : e.kind === "added"
        ? icon.book
        : icon.compass,
  end: (e) => versionsText(e) || null,
};

// H: the compass stays on every card (#199's "Paths are a compass"), and
// the words carry it: "Made by you" or "Added, read-only" on the small
// line, made ones first, then Added.
const LOOK_H: Look = {
  icon: () => icon.compass,
  line: (e) =>
    e.kind === "own" ? (
      <>
        Made by you
        <Dot />
        {versionsText(e)}
      </>
    ) : e.kind === "added" ? (
      <>
        Added, read-only
        <Dot />
        {versionsText(e)}
      </>
    ) : (
      "From Dreamport"
    ),
};

const LOOKS: Record<string, Look> = {
  E: LOOK_E,
  F: LOOK_F,
  G: LOOK_G,
  H: LOOK_H,
};

function PathsRound2({ variant, stub }: { variant: string; stub: Stub }) {
  const look = LOOKS[variant];
  const all = entries(stub, false);
  const mine = all.filter((e) => e.kind === "own");
  const added = all.filter((e) => e.kind === "added");
  return (
    <>
      <h1>Paths</h1>
      <PathsIntro />
      {variant === "F" ? (
        <>
          <h2>Paths You Made</h2>
          <p>
            <Button>Make New Path</Button>
          </p>
          {mine.length === 0 ? (
            <p>No Paths yet.</p>
          ) : (
            <Cards list={mine} look={look} stub={stub} page="Paths" />
          )}
          {added.length > 0 && (
            <>
              <h2>Paths You&apos;ve Added</h2>
              <p>
                These are copies of other Users&apos; Paths. Your Products can
                follow them, but they can&apos;t be changed.
              </p>
              <Cards list={added} look={look} stub={stub} page="Paths" />
            </>
          )}
        </>
      ) : (
        <>
          <p>
            <Button>Make New Path</Button>
          </p>
          <Cards
            list={variant === "H" ? [...mine, ...added] : all}
            look={look}
            stub={stub}
            page="Paths"
          />
        </>
      )}
    </>
  );
}

function PathfinderRound2({ variant, stub }: { variant: string; stub: Stub }) {
  const look = LOOKS[variant];
  const all = entries(stub, true);
  const ofKind = (k: Entry["kind"]) => all.filter((e) => e.kind === k);
  return (
    <>
      <h1>{PRODUCT.name}</h1>
      <h2>Browse Available Paths</h2>
      {variant === "F" ? (
        (
          [
            ["From Dreamport", ofKind("dreamport")],
            ["Made by You", ofKind("own")],
            ["Added", ofKind("added")],
          ] as const
        ).map(
          ([heading, list]) =>
            list.length > 0 && (
              <div key={heading}>
                <h3>{heading}</h3>
                <Cards list={list} look={look} stub={stub} page="Pathfinder" />
              </div>
            ),
        )
      ) : (
        <Cards
          list={
            variant === "H"
              ? [...ofKind("dreamport"), ...ofKind("own"), ...ofKind("added")]
              : all
          }
          look={look}
          stub={stub}
          page="Pathfinder"
        />
      )}
      <MakeYourOwn />
    </>
  );
}

// ---------------------------------------------------------- round 3 --
// Ian on round 2: G's one-line cards, but the compass on every card, no
// versions and nothing about who made it; headings say "Your Original
// Paths" and "Your Added Paths". Still open: where Make New Path sits,
// whether the Added section says what Added means, and what an empty
// section does. I–L answer those; G stays for reference. Pathfinder gets
// the same cards under "Dream Sequence"-first headings.

const LOOK_PLAIN: Look = { icon: () => icon.compass };

const ADDED_LINE =
  "Copies of other Users' Paths. Your Products can follow them, but they can't be changed.";

function PathsRound3({ variant, stub }: { variant: string; stub: Stub }) {
  const all = entries(stub, false);
  const mine = all.filter((e) => e.kind === "own");
  const added = all.filter((e) => e.kind === "added");
  const make = <Button>Make New Path</Button>;
  const cards = (list: Entry[]) => (
    <Cards list={list} look={LOOK_PLAIN} stub={stub} page="Paths" />
  );

  // I: Make New Path opens the Original section, under its heading; the
  // Added section only when there's something in it, no explanation.
  if (variant === "I") {
    return (
      <>
        <h1>Paths</h1>
        <PathsIntro />
        <h2>Your Original Paths</h2>
        <p>{make}</p>
        {mine.length === 0 ? <p>No Paths yet.</p> : cards(mine)}
        {added.length > 0 && (
          <>
            <h2>Your Added Paths</h2>
            {cards(added)}
          </>
        )}
      </>
    );
  }

  // J: as I, plus one line under "Your Added Paths" saying they're
  // copies and can't be changed: the heading alone is the only sign.
  if (variant === "J") {
    return (
      <>
        <h1>Paths</h1>
        <PathsIntro />
        <h2>Your Original Paths</h2>
        <p>{make}</p>
        {mine.length === 0 ? <p>No Paths yet.</p> : cards(mine)}
        {added.length > 0 && (
          <>
            <h2>Your Added Paths</h2>
            <p>{ADDED_LINE}</p>
            {cards(added)}
          </>
        )}
      </>
    );
  }

  // K: Make New Path beside "Your Original Paths" (`.heading-row`, the
  // Edit Path arrangement), so it reads as that section's action.
  if (variant === "K") {
    return (
      <>
        <h1>Paths</h1>
        <PathsIntro />
        <div className="heading-row">
          <h2>Your Original Paths</h2>
          {make}
        </div>
        {mine.length === 0 ? <p>No Paths yet.</p> : cards(mine)}
        {added.length > 0 && (
          <>
            <h2>Your Added Paths</h2>
            {cards(added)}
          </>
        )}
      </>
    );
  }

  // L: Make New Path above both sections, where it is today; both
  // sections always shown, an empty one saying so.
  return (
    <>
      <h1>Paths</h1>
      <PathsIntro />
      <p>{make}</p>
      <h2>Your Original Paths</h2>
      {mine.length === 0 ? (
        <p>You haven&apos;t made a Path yet.</p>
      ) : (
        cards(mine)
      )}
      <h2>Your Added Paths</h2>
      {added.length === 0 ? (
        <p>You haven&apos;t Added a Path yet.</p>
      ) : (
        cards(added)
      )}
    </>
  );
}

function PathfinderRound3({ stub }: { stub: Stub }) {
  const all = entries(stub, true);
  const sections = [
    ["From Dreamport", all.filter((e) => e.kind === "dreamport")],
    ["Your Original Paths", all.filter((e) => e.kind === "own")],
    ["Your Added Paths", all.filter((e) => e.kind === "added")],
  ] as const;
  return (
    <>
      <h1>{PRODUCT.name}</h1>
      <h2>Browse Available Paths</h2>
      {sections.map(
        ([heading, list]) =>
          list.length > 0 && (
            <div key={heading}>
              <h3>{heading}</h3>
              <Cards
                list={list}
                look={LOOK_PLAIN}
                stub={stub}
                page="Pathfinder"
              />
            </div>
          ),
      )}
      <MakeYourOwn />
    </>
  );
}

// ------------------------------------------------------------- harness --

function PathsPage({ variant, stub }: { variant: string; stub: Stub }) {
  if (variant === "G") return <PathsRound2 variant={variant} stub={stub} />;
  return <PathsRound3 variant={variant} stub={stub} />;
}

function PathfinderPage({ variant, stub }: { variant: string; stub: Stub }) {
  if (variant === "G")
    return <PathfinderRound2 variant={variant} stub={stub} />;
  return <PathfinderRound3 stub={stub} />;
}

/** Catches link clicks inside the page, so a stubbed row never navigates. */
function catchClicks(onClick: (href: string) => void): (e: MouseEvent) => void {
  return (e) => {
    const a = (e.target as HTMLElement).closest("a");
    const href = a?.getAttribute("href");
    if (!href || !href.startsWith("/app/")) return;
    if (href === "/app/paths" || href.startsWith("/app/paths?")) return;
    e.preventDefault();
    e.stopPropagation();
    onClick(href);
  };
}

function describeHref(href: string, stub: Stub): string {
  const held = stub.paths.filter(
    (p) => p.kind === "copy" && href.endsWith(`/paths/${p.sourceId}`),
  ) as CopyPath[];
  if (held.length > 0) {
    return `the Trailhead for ${held[0].name}, showing your copy of Version ${held[held.length - 1].version}`;
  }
  const path = stub.paths.find((p) => href.includes(`/${p.id}`));
  const label = path
    ? `${path.name}${path.kind === "copy" ? ` (copy of Version ${path.version})` : ""}`
    : href.includes("dream-sequence")
      ? "Dream Sequence"
      : "";
  if (href.includes("/journeys/")) {
    const onId = href.split("journey-on-")[1];
    const on = stub.paths.find((p) => p.id === onId);
    return `the Journey on ${on?.name ?? onId}${on?.kind === "copy" ? ` v${on.version}` : ""}`;
  }
  if (href.endsWith("/edit")) return `the editor (Trailblazer) for ${label}`;
  return `the Trailhead for ${label}`;
}

function StateBar({
  state,
  onChange,
}: {
  state: StateKey;
  onChange: (s: StateKey) => void;
}) {
  if (!import.meta.env.DEV) return null;
  return (
    <label
      style={{
        position: "fixed",
        top: "0.5rem",
        right: "0.5rem",
        zIndex: 1000,
        padding: "0.25rem 0.5rem",
        borderRadius: "0.5rem",
        background: "#111",
        color: "#fff",
        fontFamily: "system-ui, sans-serif",
        fontSize: "0.8rem",
      }}
    >
      State{" "}
      <select
        value={state}
        onChange={(e) => onChange(e.target.value as StateKey)}
        style={{ fontSize: "0.8rem" }}
      >
        {STATES.map((s) => (
          <option key={s.key} value={s.key}>
            {s.name}
          </option>
        ))}
      </select>
    </label>
  );
}

function StateLine({
  page,
  variant,
  state,
  stub,
  lastClick,
}: {
  page: "Paths" | "Pathfinder";
  variant: string;
  state: StateKey;
  stub: Stub;
  lastClick: string | null;
}) {
  const other =
    page === "Paths"
      ? `/app/products/${PRODUCT.id}/pathfinder?variant=${variant}&state=${state}`
      : `/app/paths?variant=${variant}&state=${state}`;
  const held = stub.paths
    .map((p) =>
      p.kind === "copy"
        ? `${p.name} v${p.version} (copy)`
        : `${p.name} ${p.version ? `v${p.version}` : "(Draft only)"} (own)`,
    )
    .join(", ");
  const journeys = Object.entries(stub.journeys)
    .map(([k, j]) => `${k}: ${j.status} on ${j.pathId}`)
    .join(", ");
  return (
    <div
      style={{
        marginTop: "3rem",
        marginBottom: "4rem",
        fontFamily: "monospace",
        fontSize: "0.8rem",
      }}
    >
      <p>
        page: {page} · variant: {variant} · state: {state}
        <br />
        User holds: {held}
        <br />
        {PRODUCT.name}&apos;s Journeys: {journeys || "none"}
        <br />
        last click: {lastClick ?? "none yet"}
      </p>
      <p>
        <a href={other}>
          Same variant and state on {page === "Paths" ? "Pathfinder" : "Paths"}{" "}
          →
        </a>
      </p>
    </div>
  );
}

export interface ProtoSearch {
  variant?: string;
  state?: StateKey;
}

// eslint-disable-next-line react-refresh/only-export-components -- prototype
export const validateProtoSearch = (
  search: Record<string, unknown>,
): ProtoSearch => ({
  ...(typeof search.variant === "string" && { variant: search.variant }),
  ...(typeof search.state === "string" && { state: search.state as StateKey }),
});

/** The page under test, the bars, and the state line, for either page. */
export function Prototype({
  page,
  search,
  setSearch,
}: {
  page: "Paths" | "Pathfinder";
  search: ProtoSearch;
  setSearch: (next: ProtoSearch) => void;
}) {
  const [lastClick, setLastClick] = useState<string | null>(null);
  const variant = search.variant ?? "I";
  const state = search.state ?? "typical";
  const stub = stubFor(state);
  const set = (next: ProtoSearch) => {
    setLastClick(null);
    setSearch({ variant, state, ...next });
  };
  return (
    <>
      <StateBar state={state} onChange={(s) => set({ state: s })} />
      <div
        onClickCapture={catchClicks((href) =>
          setLastClick(`${href} → ${describeHref(href, stub)}`),
        )}
      >
        {page === "Paths" ? (
          <PathsPage variant={variant} stub={stub} />
        ) : (
          <PathfinderPage variant={variant} stub={stub} />
        )}
      </div>
      <StateLine
        page={page}
        variant={variant}
        state={state}
        stub={stub}
        lastClick={lastClick}
      />
      <PrototypeSwitcher
        variants={VARIANTS}
        current={variant}
        onChange={(v) => set({ variant: v })}
      />
    </>
  );
}

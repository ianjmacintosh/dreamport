// PROTOTYPE — throwaway (#192). Lives on 192-prototype-added-copy only;
// never merge, never push.
//
// Round 1: how an Added copy looks among a User's Available Paths, on the
// Paths page (`/app/paths`) and Pathfinder
// (`/app/products/:productId/pathfinder`). Four structurally different
// variants via `?variant=`, the same key on both pages; the case via
// `?state=`. All stubbed in memory: clicks on rows are caught and written
// to the state line instead of navigating.
import { useState } from "react";
import type { MouseEvent, ReactNode } from "react";
import { CompassIcon } from "@phosphor-icons/react";

import ActionCard from "../../components/ActionCard";
import Button from "../../components/Button";
import Link from "../../components/Link";
import { PrototypeSwitcher } from "../../components/PrototypeSwitcher";

// ---------------------------------------------------------------- stubs --

const VARIANTS = [
  { key: "A", name: "One list, version beside a copy's name" },
  { key: "B", name: "Two sections: made by you, Added" },
  { key: "C", name: "One row per Path, its versions inside" },
  { key: "D", name: "Rows say what you can do: Edit Path / View Path" },
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

const byName = (a: UserPath, b: UserPath) =>
  a.name.localeCompare(b.name) ||
  (a.kind === b.kind ? 0 : a.kind === "own" ? -1 : 1) ||
  (a.version ?? 0) - (b.version ?? 0);

const own = (s: Stub) => s.paths.filter((p): p is OwnPath => p.kind === "own");
const copies = (s: Stub) =>
  s.paths.filter((p): p is CopyPath => p.kind === "copy");
/** Pathfinder offers only own Paths with a saved version. */
const followableOwn = (s: Stub) => own(s).filter((p) => p.version !== null);

const trailhead = (p: { id: string }) => `/app/paths/${p.id}`;
const editor = (p: { id: string }) => `/app/paths/${p.id}/edit`;
const journeyHref = (pathId: string) =>
  `/app/products/${PRODUCT.id}/journeys/journey-on-${pathId}`;

const sourceOf = (p: UserPath) => (p.kind === "copy" ? p.sourceId : p.id);

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

/** Where a Pathfinder entry goes, and its status, as today's page decides. */
function pathfinderTarget(s: Stub, p: { id: string } & Partial<UserPath>) {
  const journey = s.journeys[sourceOf(p as UserPath)];
  if (journey?.status === "following") {
    const onOther = journey.pathId !== p.id;
    const other = s.paths.find((x) => x.id === journey.pathId);
    return {
      href: journeyHref(journey.pathId),
      status:
        onOther && other?.kind === "copy"
          ? `Following Version ${other.version}`
          : "Following",
    };
  }
  return {
    href: trailhead(p),
    status: journey
      ? journey.status === "completed"
        ? "Completed"
        : "Abandoned"
      : null,
  };
}

/** Prototype-only: the italic the design system gives status text. */
const italic = { fontStyle: "italic" } as const;

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

function compass() {
  return <CompassIcon weight="bold" aria-hidden="true" />;
}

// ------------------------------------------------------------- variant A --
// One list, as today. A copy's row links to its Trailhead and carries
// "Version 2 · Added" at the row's end, small and italic; an own Path's row
// is unchanged and still opens the editor.

function PathsA({ stub }: { stub: Stub }) {
  const rows = [...stub.paths].sort(byName);
  return (
    <>
      <h1 id="paths-heading">Paths</h1>
      <PathsIntro />
      <p>
        <Button>Make New Path</Button>
      </p>
      <ul className="list" aria-labelledby="paths-heading">
        {rows.map((p) => (
          <li className="list-row" key={p.id}>
            <Link
              className="list-row-name"
              href={p.kind === "copy" ? trailhead(p) : editor(p)}
            >
              {p.name}
            </Link>
            {p.kind === "copy" && (
              <span className="list-row-action text-sm" style={italic}>
                Version {p.version}
                <Dot />
                Added
              </span>
            )}
          </li>
        ))}
      </ul>
    </>
  );
}

function PathfinderA({ stub }: { stub: Stub }) {
  const entries: ({ id: string; name: string } & Partial<UserPath>)[] = [
    DREAM_SEQUENCE,
    ...followableOwn(stub),
    ...copies(stub),
  ];
  return (
    <>
      <h1>{PRODUCT.name}</h1>
      <h2>Browse Available Paths</h2>
      <ul className="action-card-list">
        {entries.map((p) => {
          const { href, status } = pathfinderTarget(stub, p);
          const version = p.kind === "copy" ? `Version ${p.version}` : null;
          const trailing = [version, status].filter(Boolean).join(" · ");
          return (
            <li key={p.id}>
              <ActionCard
                href={href}
                leading={compass()}
                trailing={
                  trailing && <ActionCard.Status>{trailing}</ActionCard.Status>
                }
              >
                {p.name}
              </ActionCard>
            </li>
          );
        })}
      </ul>
      <MakeYourOwn />
    </>
  );
}

// ------------------------------------------------------------- variant B --
// Two sections. The Paths page splits "Paths You Made" (with Make New Path)
// from "Paths You've Added" (one line on what Added means, then a row per
// copy, its version at the row's end). Pathfinder groups the same way under
// h3s, Dream Sequence on its own first.

function PathsB({ stub }: { stub: Stub }) {
  const mine = own(stub).sort(byName);
  const added = copies(stub).sort(byName);
  return (
    <>
      <h1>Paths</h1>
      <PathsIntro />
      <h2 id="made-heading">Paths You Made</h2>
      <p>
        <Button>Make New Path</Button>
      </p>
      {mine.length === 0 ? (
        <p>No Paths yet.</p>
      ) : (
        <ul className="list" aria-labelledby="made-heading">
          {mine.map((p) => (
            <li className="list-row" key={p.id}>
              <Link className="list-row-name" href={editor(p)}>
                {p.name}
              </Link>
            </li>
          ))}
        </ul>
      )}
      {added.length > 0 && (
        <>
          <h2 id="added-heading">Paths You&apos;ve Added</h2>
          <p>
            These are copies of other Users&apos; Paths. Your Products can
            follow them, but they can&apos;t be changed.
          </p>
          <ul className="list" aria-labelledby="added-heading">
            {added.map((p) => (
              <li className="list-row" key={p.id}>
                <Link className="list-row-name" href={trailhead(p)}>
                  {p.name}
                </Link>
                <span className="list-row-action text-sm">
                  Version {p.version}
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
    </>
  );
}

function CardList({
  stub,
  entries,
}: {
  stub: Stub;
  entries: ({ id: string; name: string } & Partial<UserPath>)[];
}) {
  return (
    <ul className="action-card-list">
      {entries.map((p) => {
        const { href, status } = pathfinderTarget(stub, p);
        return (
          <li key={p.id}>
            <ActionCard
              href={href}
              leading={compass()}
              trailing={
                status && <ActionCard.Status>{status}</ActionCard.Status>
              }
            >
              {p.name}
              {p.kind === "copy" && (
                <>
                  <Dot />
                  <span className="text-sm">Version {p.version}</span>
                </>
              )}
            </ActionCard>
          </li>
        );
      })}
    </ul>
  );
}

function PathfinderB({ stub }: { stub: Stub }) {
  const mine = followableOwn(stub).sort(byName);
  const added = copies(stub).sort(byName);
  return (
    <>
      <h1>{PRODUCT.name}</h1>
      <h2>Browse Available Paths</h2>
      <h3>From Dreamport</h3>
      <CardList stub={stub} entries={[DREAM_SEQUENCE]} />
      {mine.length > 0 && (
        <>
          <h3>Made by You</h3>
          <CardList stub={stub} entries={mine} />
        </>
      )}
      {added.length > 0 && (
        <>
          <h3>Added</h3>
          <CardList stub={stub} entries={added} />
        </>
      )}
      <MakeYourOwn />
    </>
  );
}

// ------------------------------------------------------------- variant C --
// One row per Path, not per copy. Copies of two versions of one Path share
// a row: its name links to the newest copy's Trailhead, and the row's end
// lists every version held, each a link to that copy's Trailhead. On
// Pathfinder that's one card per Path, the versions in its status; a Path
// is followed once across its versions, so the card says which.

function VersionLinks({ group }: { group: CopyPath[] }) {
  return (
    <span className="list-row-action text-sm">
      {group.length === 1 ? (
        <>Version {group[0].version}</>
      ) : (
        <>
          {"Versions "}
          {group.map((c, i) => (
            <span key={c.id}>
              {i > 0 && (i === group.length - 1 ? " and " : ", ")}
              <Link href={trailhead(c)}>{c.version}</Link>
            </span>
          ))}
        </>
      )}
    </span>
  );
}

function PathsC({ stub }: { stub: Stub }) {
  type Row = { name: string; own?: OwnPath; group?: CopyPath[] };
  const rows: Row[] = [
    ...own(stub).map((p): Row => ({ name: p.name, own: p })),
    ...groupCopies(stub).map((g): Row => ({ name: g[0].name, group: g })),
  ].sort((a, b) => a.name.localeCompare(b.name) || (a.own ? -1 : 1));
  return (
    <>
      <h1 id="paths-heading">Paths</h1>
      <PathsIntro />
      <p>
        <Button>Make New Path</Button>
      </p>
      <ul className="list" aria-labelledby="paths-heading">
        {rows.map((r) =>
          r.own ? (
            <li className="list-row" key={r.own.id}>
              <Link className="list-row-name" href={editor(r.own)}>
                {r.name}
              </Link>
            </li>
          ) : (
            <li className="list-row" key={r.group![0].sourceId}>
              <Link
                className="list-row-name"
                href={trailhead(r.group![r.group!.length - 1])}
              >
                {r.name}
              </Link>
              <VersionLinks group={r.group!} />
            </li>
          ),
        )}
      </ul>
    </>
  );
}

function PathfinderC({ stub }: { stub: Stub }) {
  const groups = groupCopies(stub);
  return (
    <>
      <h1>{PRODUCT.name}</h1>
      <h2>Browse Available Paths</h2>
      <ul className="action-card-list">
        {[DREAM_SEQUENCE, ...followableOwn(stub)].map((p) => {
          const { href, status } = pathfinderTarget(stub, p);
          return (
            <li key={p.id}>
              <ActionCard
                href={href}
                leading={compass()}
                trailing={
                  status && <ActionCard.Status>{status}</ActionCard.Status>
                }
              >
                {p.name}
              </ActionCard>
            </li>
          );
        })}
        {groups.map((g) => {
          const newest = g[g.length - 1];
          const journey = stub.journeys[newest.sourceId];
          const following = journey?.status === "following";
          const followed = g.find((c) => c.id === journey?.pathId);
          const versions =
            g.length === 1
              ? `Version ${newest.version}`
              : `Versions ${g.map((c) => c.version).join(" and ")}`;
          const status = following
            ? `Following Version ${followed?.version}`
            : journey
              ? journey.status === "completed"
                ? "Completed"
                : "Abandoned"
              : versions;
          return (
            <li key={newest.sourceId}>
              <ActionCard
                href={
                  following ? journeyHref(journey.pathId) : trailhead(newest)
                }
                leading={compass()}
                trailing={<ActionCard.Status>{status}</ActionCard.Status>}
              >
                {newest.name}
              </ActionCard>
            </li>
          );
        })}
      </ul>
      <MakeYourOwn />
    </>
  );
}

// ------------------------------------------------------------- variant D --
// Rows say what you can do. The Paths page's rows become white cards
// (`.list--cards`), each the Path's name over a small line about it, and a
// button at the end: "Edit Path" for one you made (to the editor), "View
// Path" for a copy (to its Trailhead), so a copy never offers Edit.
// Pathfinder keeps its cards, a copy's card carrying the same small line.

function aboutLine(p: UserPath): ReactNode {
  if (p.kind === "copy") {
    return (
      <>
        Version {p.version}
        <Dot />
        Added, read-only
      </>
    );
  }
  return p.version === null
    ? "Draft, no version saved"
    : `Version ${p.version}`;
}

function PathsD({ stub }: { stub: Stub }) {
  const rows = [...stub.paths].sort(byName);
  return (
    <>
      <h1 id="paths-heading">Paths</h1>
      <PathsIntro />
      <p>
        <Button>Make New Path</Button>
      </p>
      <ul className="list list--cards" aria-labelledby="paths-heading">
        {rows.map((p) => (
          <li className="list-row" key={p.id}>
            <span className="list-row-name">
              {p.name}
              <br />
              <span className="text-sm" style={italic}>
                {aboutLine(p)}
              </span>
            </span>
            <span className="list-row-action">
              {p.kind === "copy" ? (
                <Link href={trailhead(p)} className="button button--secondary">
                  View Path
                </Link>
              ) : (
                <Link href={editor(p)} className="button button--secondary">
                  Edit Path
                </Link>
              )}
            </span>
          </li>
        ))}
      </ul>
    </>
  );
}

function PathfinderD({ stub }: { stub: Stub }) {
  const entries: ({ id: string; name: string } & Partial<UserPath>)[] = [
    DREAM_SEQUENCE,
    ...followableOwn(stub),
    ...copies(stub),
  ];
  return (
    <>
      <h1>{PRODUCT.name}</h1>
      <h2>Browse Available Paths</h2>
      <ul className="action-card-list">
        {entries.map((p) => {
          const { href, status } = pathfinderTarget(stub, p);
          const line =
            p.kind === "copy"
              ? aboutLine(p as CopyPath)
              : p.kind === "own"
                ? "Made by you"
                : "From Dreamport";
          return (
            <li key={p.id}>
              <ActionCard
                href={href}
                leading={compass()}
                trailing={
                  status && <ActionCard.Status>{status}</ActionCard.Status>
                }
              >
                {p.name}
                <br />
                <span className="text-sm">{line}</span>
              </ActionCard>
            </li>
          );
        })}
      </ul>
      <MakeYourOwn />
    </>
  );
}

// ------------------------------------------------------------- harness --

function PathsPage({ variant, stub }: { variant: string; stub: Stub }) {
  if (variant === "B") return <PathsB stub={stub} />;
  if (variant === "C") return <PathsC stub={stub} />;
  if (variant === "D") return <PathsD stub={stub} />;
  return <PathsA stub={stub} />;
}

function PathfinderPage({ variant, stub }: { variant: string; stub: Stub }) {
  if (variant === "B") return <PathfinderB stub={stub} />;
  if (variant === "C") return <PathfinderC stub={stub} />;
  if (variant === "D") return <PathfinderD stub={stub} />;
  return <PathfinderA stub={stub} />;
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
  const variant = search.variant ?? "A";
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

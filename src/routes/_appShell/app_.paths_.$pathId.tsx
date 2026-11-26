// PROTOTYPE — throwaway (#246, #247). On main this file is the real
// Trailhead; here every Path id shows a stubbed By Request Path, and the
// Guide view shows a stub of the Path editor (or, in C, the Guide's own
// Trailhead). Never merge. Variants live in ./-prototype-guide-terms.tsx.
import { useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";

import type { BreadcrumbsProps } from "../../components/Breadcrumbs";
import { PrototypeSwitcher } from "../../components/PrototypeSwitcher";
import {
  Editor,
  GuideTrailhead,
  SAMPLES,
  UserTrailhead,
  VARIANTS,
  VIEWERS,
  initialState,
} from "./-prototype-guide-terms";
import type { ProtoState, Sample, Viewer } from "./-prototype-guide-terms";

interface Search {
  variant?: string;
  as?: Viewer;
  notes?: Sample;
  version?: number;
}

export const Route = createFileRoute("/_appShell/app_/paths_/$pathId")({
  validateSearch: (search: Record<string, unknown>): Search => ({
    ...(typeof search.variant === "string" && { variant: search.variant }),
    ...(typeof search.as === "string" && { as: search.as as Viewer }),
    ...(typeof search.notes === "string" && { notes: search.notes as Sample }),
    ...(typeof search.version === "number" && { version: search.version }),
  }),
  beforeLoad: () => ({
    breadcrumbs: {
      trail: [{ label: "Pathfinder", href: "/app/paths" }],
      current: "Pop-Up Shop Launch",
    } satisfies BreadcrumbsProps,
  }),
  component: PrototypeGuideTerms,
});

function PrototypeGuideTerms() {
  const search = Route.useSearch();
  const { pathId } = Route.useParams();
  const navigate = useNavigate({ from: Route.fullPath });
  const variant = search.variant ?? "A";
  const viewer = search.as ?? "user";
  const sample = search.notes ?? "long";
  const set = (next: Partial<Search>) =>
    void navigate({
      search: { variant, as: viewer, notes: sample, ...next },
      replace: true,
    });
  const versionHref = (n: number) =>
    `/app/paths/${pathId}?variant=${variant}&as=${viewer}&notes=${sample}&version=${n}`;

  return (
    <>
      {/* Keyed on the sample so picking another starts afresh; switching
          variant or viewer keeps what the Guide wrote. */}
      <Stage
        key={sample}
        sample={sample}
        variant={variant}
        viewer={viewer}
        version={search.version}
        versionHref={versionHref}
      />
      <ControlBar
        viewer={viewer}
        sample={sample}
        onViewer={(as) => set({ as, version: undefined })}
        onSample={(notes) => set({ notes, version: undefined })}
      />
      <PrototypeSwitcher
        variants={VARIANTS}
        current={variant}
        onChange={(key) => set({ variant: key })}
      />
    </>
  );
}

function Stage({
  sample,
  variant,
  viewer,
  version,
  versionHref,
}: {
  sample: Sample;
  variant: string;
  viewer: Viewer;
  version: number | undefined;
  versionHref: (n: number) => string;
}) {
  const { email } = Route.useRouteContext();
  const [state, setState] = useState<ProtoState>(() => initialState(sample));
  const shownVersion =
    version ?? state.versions[state.versions.length - 1].number;

  let page;
  if (viewer === "guide-trailhead" && variant !== "C") {
    page = (
      <UserTrailhead
        key={`${variant}:${shownVersion}:guide`}
        variant={variant}
        version={shownVersion}
        versionHref={versionHref}
        email={email}
        state={state}
        setState={setState}
        asGuide
      />
    );
  } else if (viewer === "user") {
    page = (
      <UserTrailhead
        key={`${variant}:${shownVersion}`}
        variant={variant}
        version={shownVersion}
        versionHref={versionHref}
        email={email}
        state={state}
        setState={setState}
      />
    );
  } else if (variant === "C") {
    page = (
      <GuideTrailhead
        key={shownVersion}
        version={shownVersion}
        versionHref={versionHref}
        state={state}
        setState={setState}
      />
    );
  } else {
    page = (
      <Editor
        key={variant}
        variant={variant}
        state={state}
        setState={setState}
      />
    );
  }

  return (
    <>
      {page}
      <p
        style={{
          marginTop: "3rem",
          marginBottom: "5rem",
          fontFamily: "monospace",
          fontSize: "0.8rem",
          opacity: 0.7,
        }}
      >
        PROTOTYPE state:{" "}
        {state.versions
          .map(
            (v) =>
              `v${v.number} notes: ${v.notes.trim() ? `${v.notes.trim().length} chars` : "none"}`,
          )
          .join(" · ")}{" "}
        · Draft notes:{" "}
        {state.draft.trim() ? `${state.draft.trim().length} chars` : "none"} ·
        Requested: {state.requested ? "yes" : "no"}
      </p>
    </>
  );
}

function ControlBar({
  viewer,
  sample,
  onViewer,
  onSample,
}: {
  viewer: Viewer;
  sample: Sample;
  onViewer: (v: Viewer) => void;
  onSample: (s: Sample) => void;
}) {
  if (!import.meta.env.DEV) return null;
  const select = { fontSize: "0.8rem", maxWidth: "9rem" };
  return (
    <div
      style={{
        position: "fixed",
        top: "5.5rem",
        right: "0.5rem",
        zIndex: 1000,
        display: "grid",
        gap: "0.25rem",
        padding: "0.25rem 0.5rem",
        borderRadius: "0.5rem",
        background: "#111",
        color: "#fff",
        fontFamily: "system-ui, sans-serif",
        fontSize: "0.8rem",
      }}
    >
      <label>
        View as{" "}
        <select
          value={viewer}
          onChange={(e) => onViewer(e.target.value as Viewer)}
          style={select}
        >
          {VIEWERS.map((v) => (
            <option key={v.key} value={v.key}>
              {v.name}
            </option>
          ))}
        </select>
      </label>
      <label>
        Notes{" "}
        <select
          value={sample}
          onChange={(e) => onSample(e.target.value as Sample)}
          style={select}
        >
          {SAMPLES.map((s) => (
            <option key={s.key} value={s.key}>
              {s.name}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}

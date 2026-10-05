// PROTOTYPE (prototype/worksheet-design), round 2: four variants of the
// worksheet sheet, switchable via `?variant=A|B|C|D` and the floating bar —
// corners (square / rounded) × edge (border / none). Every variant has
// ruled-line answers, no progress line, and the sheet's own title.
import { useState, type ReactNode } from "react";
import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";

import Button from "../../components/Button";
import Link from "../../components/Link";
import PrototypeSwitcher from "../../components/PrototypeSwitcher";
import TextArea from "../../components/TextArea";
import "../../prototype/worksheet-design.css";

const VARIANTS = [
  { key: "A", name: "Square, bordered", corners: "square", edge: "bordered" },
  { key: "B", name: "Square, no border", corners: "square", edge: "plain" },
  { key: "C", name: "Rounded, bordered", corners: "rounded", edge: "bordered" },
  { key: "D", name: "Rounded, no border", corners: "rounded", edge: "plain" },
];

/** PROTOTYPE: the title printed on the sheet, by Worksheet id — "Rough One-Pager" is what we call it, not what the paper says. */
const SHEET_TITLES: Record<string, string> = {
  "rough-one-pager": "One-Pager",
};

/**
 * Plain `fetch` never times out on its own — if the server accepts the TCP
 * connection but then goes away without closing it, the request hangs
 * forever. This aborts it after `timeoutMs` so `save` always lands in its
 * `catch` block instead. Same helper the Product home, the Journey page
 * and `/app` each keep their own copy of.
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
 * is perceivable rather than a flicker (docs/adr/0013). Same helper the
 * Product home, the Journey page and `/app` each keep their own copy of.
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

/** Mirrors `WORKSHEET_ANSWER_MAX_LENGTH` in `src/worker/worksheets.ts` — a client-side hint only; the server enforces it. */
const WORKSHEET_ANSWER_MAX_LENGTH = 1000;

/** `/api/products/:productId/worksheets/:worksheetId`'s answer (see `src/worker/worksheets.ts`). */
interface WorksheetState {
  worksheet: {
    id: string;
    name: string;
    fields: { id: string; name: string; prompt: string }[];
  };
  /** Filled-in fields by field id; a blank field is absent. */
  answers: Record<string, string>;
}

const CC_BY_SA_3_URL = "https://creativecommons.org/licenses/by-sa/3.0/";

/**
 * The credit a Worksheet adapted from someone else's work carries, by
 * Worksheet id. CC BY-SA 3.0 asks for credit, a note that it was changed
 * and a link to the license; the Copyright page carries the full credit and
 * the list of changes (#139, #145).
 */
const ATTRIBUTIONS: Record<string, ReactNode> = {
  "rough-one-pager": (
    <>
      Credit: Adapted from Lean Canvas by Ash Maurya (
      <Link href={CC_BY_SA_3_URL} external>
        CC BY-SA 3.0
      </Link>
      )
    </>
  ),
};

const SAVE_FAILED = "We couldn't save your answers. Try again in a moment.";
const CONNECTION_FAILED =
  "Something went wrong. Check your connection and try again.";

// Filename note: `$productId_` makes this a sibling of the Product home
// rather than its child, the same as the Journey page's own route; see its
// header comment.
export const Route = createFileRoute(
  "/_appShell/app_/products/$productId_/worksheets/$worksheetId",
)({
  validateSearch: (search: Record<string, unknown>): { variant?: string } =>
    typeof search.variant === "string" ? { variant: search.variant } : {},
  beforeLoad: async ({ params }) => {
    const res = await fetch(
      `/api/products/${params.productId}/worksheets/${params.worksheetId}`,
    ).catch(() => null);
    // Not signed in, not this User's Product, no Journey yet, offline:
    // bounce back to `/app`, the same convention as the Journey page.
    if (!res || !res.ok) {
      throw redirect({ to: "/app" });
    }
    const { product, ...worksheetState } = (await res.json()) as {
      product: { id: string; name: string };
    } & WorksheetState;
    return { product, worksheetState };
  },
  component: ProductWorksheet,
});

/**
 * One of a Product's Worksheets (#139), reached from the current
 * Milestone's content on the Journey page, on every Milestone and once
 * finished.
 *
 * The Product's name is the h1 and the Worksheet's the h2, the same shape
 * as the Journey page. Below them, how many fields are filled in (as
 * saved, not as typed), then one `TextInput` per field with its prompt as
 * helper text, and one Save button for the lot. A blank field is just an
 * empty input.
 *
 * Ends with the Worksheet's credit, if it's adapted from someone else's
 * work, in small text with quiet links, then "Back to Journey".
 */
function ProductWorksheet() {
  const { product, worksheetState } = Route.useRouteContext();
  const { worksheet } = worksheetState;
  const { variant: variantKey = "A" } = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const variant = VARIANTS.find((v) => v.key === variantKey) ?? VARIANTS[0];
  const [drafts, setDrafts] = useState(worksheetState.answers);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const attribution = ATTRIBUTIONS[worksheet.id];
  const sheetTitle = SHEET_TITLES[worksheet.id] ?? worksheet.name;

  async function save() {
    setError("");
    setSaved(false);
    setIsSaving(true);
    try {
      const result = await withMinimumDuration(async () => {
        const res = await fetchWithTimeout(
          `/api/products/${product.id}/worksheets/${worksheet.id}`,
          {
            method: "PUT",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ answers: drafts }),
          },
        );
        if (!res.ok) {
          return null;
        }
        return (await res.json()) as WorksheetState;
      });
      if (!result) {
        setError(SAVE_FAILED);
        return;
      }
      // The server's copy — trimmed, blanks dropped.
      setDrafts(result.answers);
      setSaved(true);
    } catch {
      setError(CONNECTION_FAILED);
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <>
      <h1>{product.name}</h1>
      <p>
        <Link href={`/app/products/${product.id}/journey`} current={false}>
          Back to Journey
        </Link>
      </p>
      <article
        className={`ws-sheet ws-sheet--${variant.corners} ws-sheet--${variant.edge}`}
      >
        <h2>{sheetTitle}</h2>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void save();
          }}
        >
          {worksheet.fields.map((field, i) => (
            <TextArea
              key={field.id}
              id={`worksheet-${field.id}`}
              label={`${i + 1}. ${field.name}`}
              helperText={field.prompt}
              value={drafts[field.id] ?? ""}
              onChange={(e) => {
                setSaved(false);
                setDrafts({ ...drafts, [field.id]: e.target.value });
              }}
              maxLength={WORKSHEET_ANSWER_MAX_LENGTH}
              disabled={isSaving}
            />
          ))}
          <Button
            type="submit"
            disabled={isSaving}
            state={isSaving ? "saving" : "ready"}
          >
            <Button.State name="ready">Save {sheetTitle}</Button.State>
            <Button.State name="saving">Saving…</Button.State>
          </Button>
        </form>
        {saved && <p role="status">Saved.</p>}
        {error && <p role="alert">{error}</p>}
        {attribution && <p className="ws-credit">{attribution}</p>}
      </article>
      <PrototypeSwitcher
        variants={VARIANTS}
        current={variant.key}
        onChange={(key) =>
          void navigate({ search: { variant: key }, replace: true })
        }
      />
    </>
  );
}

import { useState, type ReactNode } from "react";
import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";

import Button from "../../components/Button";
import Link from "../../components/Link";
import TextArea from "../../components/TextArea";

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

/** `/api/products/:productId/worksheets/:worksheetId`'s answer (see `worksheetState` in `src/worker/journeys.ts`). */
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
 * and a link to the license; "Adapted" is the note here, and the Copyright
 * page (linked from the footer) carries the full credit and the list of
 * changes (#139, #145).
 */
const ATTRIBUTIONS: Record<string, ReactNode> = {
  "product-summary": (
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
 * The Product's name is the h1, then "Back to Journey", then the
 * Worksheet drawn as a sheet of paper (`.sheet`, picked from a prototype on
 * branch `prototype/worksheet-design`): its name as the sheet's h2, one
 * numbered `TextArea` per field with its prompt as helper text, one Save
 * button for the lot (a successful save goes back to the Journey page),
 * and the Worksheet's credit, if it's adapted from
 * someone else's work, in the bottom corner. No "N of M filled in" line
 * here — the sheet is the paper.
 */
function ProductWorksheet() {
  const { product, worksheetState } = Route.useRouteContext();
  const { worksheet } = worksheetState;
  const [drafts, setDrafts] = useState(worksheetState.answers);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");
  const navigate = useNavigate();
  const attribution = ATTRIBUTIONS[worksheet.id];

  async function save() {
    setError("");
    setIsSaving(true);
    try {
      const res = await withMinimumDuration(() =>
        fetchWithTimeout(
          `/api/products/${product.id}/worksheets/${worksheet.id}`,
          {
            method: "PUT",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ answers: drafts }),
          },
        ),
      );
      if (!res.ok) {
        setError(SAVE_FAILED);
        return;
      }
      // Saved: back to the Journey, where the work goes on.
      await navigate({
        to: "/app/products/$productId/journey",
        params: { productId: product.id },
      });
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
      <article className="sheet">
        <h2>{worksheet.name}</h2>
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
            <Button.State name="ready">Save {worksheet.name}</Button.State>
            <Button.State name="saving">Saving…</Button.State>
          </Button>
        </form>
        {error && <p role="alert">{error}</p>}
        {attribution && <p className="sheet-credit">{attribution}</p>}
      </article>
    </>
  );
}

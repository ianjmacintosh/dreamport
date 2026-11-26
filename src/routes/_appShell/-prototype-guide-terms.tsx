// PROTOTYPE — throwaway (#246, #247). Lives on 246-prototype-guide-terms
// only; never merge.
//
// Round 1: where a Guide writes a By Request Path's "Notes About Getting
// Access", and how a User reads them on the Trailhead before Request. Four
// variants via `?variant=`, each with both views via `?as=guide|user`, and
// the sample notes via `?notes=long|short|none`. Everything is in memory.
//   A  notes are part of the Draft: a field in the Edit Path Dialog, saved
//      into the next version; the User reads them as their own section
//      above the Request Notice
//   B  notes belong to a saved version and change without a new one: Edit
//      Notes on each Manage Versions row; the User reads them inside the
//      Request Notice
//   C  the issue's own wording: the Guide edits the version shown in place
//      on their own Trailhead; the User reads them on a white sheet
//   D  notes are part of the Draft, as a field right on the editor page;
//      the User reads them full width at the top, above the two columns
//
// Round 2 (Ian's picks after round 1):
//   E  notes are part of the Draft (a saved version never changes). In the
//      editor they sit right after the description, edited in place with
//      C's controls and D's "changed since" Notice. The User sees A's
//      Trailhead with Ian's Notice copy; the Guide's own Trailhead
//      (`?as=guide-trailhead`) shows the same notes read-only.
import { useState } from "react";
import type { ReactNode } from "react";

import Button from "../../components/Button";
import Dialog from "../../components/Dialog";
import Link from "../../components/Link";
import Notice from "../../components/Notice";
import TextArea from "../../components/TextArea";
import TextInput from "../../components/TextInput";

// ---------------------------------------------------------------- stubs --

export const VARIANTS = [
  { key: "A", name: "Draft · Edit Path Dialog field · section above Notice" },
  { key: "B", name: "Per saved version · Manage Versions · inside Notice" },
  { key: "C", name: "Per version · edit on own Trailhead · white sheet" },
  { key: "D", name: "Draft · field on the editor page · top of Trailhead" },
  {
    key: "E",
    name: "Round 2 · Draft · edit in place in editor · A's Trailhead",
  },
];

export const VIEWERS = [
  { key: "guide", name: "Guide · editor" },
  { key: "guide-trailhead", name: "Guide · own Trailhead" },
  { key: "user", name: "User (not holding it)" },
] as const;
export type Viewer = (typeof VIEWERS)[number]["key"];

export const SAMPLES = [
  { key: "long", name: "Long notes, line breaks" },
  { key: "short", name: "Short notes" },
  { key: "none", name: "No notes" },
] as const;
export type Sample = (typeof SAMPLES)[number]["key"];

const SHORT =
  "Send me a message on Instagram (@popup.marta) before you Request, so I know who you are.";

const LONG = `Access to this Path costs $40 (US dollars), paid once.

How to pay:
1. Send $40 by PayPal to marta.popups@example.com.
2. In the payment note, write the email address you use on Dreamport.
3. Come back here and press Request.

I check payments every evening (Lisbon time) and Approve Requests within two days of payment.

Can't pay right now? Message me on Instagram (@popup.marta) and we'll work something out.`;

const SAMPLE_TEXT: Record<Sample, string> = {
  long: LONG,
  short: SHORT,
  none: "",
};

const PATH = {
  name: "Pop-Up Shop Launch",
  description:
    "Take a product from your kitchen table to a weekend market stall: price it, test it on real buyers, and leave with a list of people who want more.",
};

const MILESTONES = [
  { id: "m1", name: "Pick Your Market", outcome: "A stall booked" },
  {
    id: "m2",
    name: "Price the First Batch",
    outcome: "A price you can defend",
  },
  {
    id: "m3",
    name: "Sell Out a Saturday",
    outcome: "Real sales, real feedback",
  },
  { id: "m4", name: "Build the List", outcome: "Fifty people who want more" },
];

export interface ProtoState {
  /** Saved versions, oldest first. Each has its own notes. */
  versions: { number: number; notes: string }[];
  /** A and D: the Draft's notes, saved into the next version. */
  draft: string;
  requested: boolean;
}

export function initialState(sample: Sample): ProtoState {
  const notes = SAMPLE_TEXT[sample];
  return {
    // Version 1 was saved before notes existed, so it has none.
    versions: [
      { number: 1, notes: "" },
      { number: 2, notes },
    ],
    draft: notes,
    requested: false,
  };
}

export type SetState = (update: (s: ProtoState) => ProtoState) => void;

const newest = (s: ProtoState) => s.versions[s.versions.length - 1];

/** The Guide's text: a blank line starts a paragraph, a line break stays one. */
function NotesText({ text }: { text: string }) {
  return (
    <>
      {text
        .trim()
        .split(/\n\s*\n/)
        .map((para, i) => {
          const lines = para.split("\n");
          return (
            <p key={i}>
              {lines.map((line, j) => (
                <span key={j}>
                  {line}
                  {j < lines.length - 1 && <br />}
                </span>
              ))}
            </p>
          );
        })}
    </>
  );
}

const OUTSIDE_DREAMPORT =
  "Anything these notes ask for happens between you and the Guide, outside Dreamport. Dreamport plays no part in it.";

/** A quiet link that opens a Dialog, as the editor's Change Access is. */
function QuietButton({
  onOpen,
  children,
}: {
  onOpen: () => void;
  children: string;
}) {
  return (
    <a
      href="#"
      role="button"
      aria-haspopup="dialog"
      className="link-quiet"
      onClick={(e) => {
        e.preventDefault();
        onOpen();
      }}
    >
      {children}
    </a>
  );
}

function Dot() {
  return <span aria-hidden="true"> · </span>;
}

function MilestoneRoute() {
  return (
    <ol aria-label="Milestones" className="journey-route">
      {MILESTONES.map((m, i) => (
        <li key={m.id} className="journey-route-stop" data-status="future">
          <span className="journey-route-dot">
            <span aria-hidden="true">{i + 1}</span>
          </span>
          <span className="journey-route-name">{m.name}</span>
          <span className="journey-route-outcome">{m.outcome}</span>
        </li>
      ))}
    </ol>
  );
}

// ------------------------------------------------------------ Trailhead --

/** What the User sees: the Trailhead for one version, not yet held. */
export function UserTrailhead({
  variant,
  version,
  versionHref,
  email,
  state,
  setState,
  asGuide = false,
}: {
  variant: string;
  version: number;
  versionHref: (n: number) => string;
  email: string;
  state: ProtoState;
  setState: SetState;
  /** The Guide's own Trailhead: Requests and Edit Path at the h1, no Request. */
  asGuide?: boolean;
}) {
  const [confirming, setConfirming] = useState(false);
  const shown =
    state.versions.find((v) => v.number === version) ?? newest(state);
  const notes = shown.notes.trim();
  const isNewest = shown.number === newest(state).number;

  // The Guide's own Trailhead shows no Request: they can't Request their own Path.
  const request = (notice: ReactNode) =>
    asGuide ? null : (
      <>
        <Notice>
          {state.requested ? (
            <>
              <p>You&apos;ve Requested Version {shown.number}.</p>
              <p>
                Waiting on the Guide. Come back to this page to see their
                answer.
              </p>
            </>
          ) : (
            notice
          )}
        </Notice>
        <div className="button-group button-group--end">
          <Button
            disabled={state.requested}
            onClick={() => setConfirming(true)}
          >
            {state.requested ? "Requested" : "Request"}
          </Button>
        </div>
      </>
    );

  const usualNotice = (
    <>
      <p>The Guide of this Path decides who can Add it.</p>
      <p>
        Request it, and you&apos;ll find the answer here when you come back.
        There are no notifications.
      </p>
    </>
  );

  let column: ReactNode;
  let top: ReactNode = null;

  if (variant === "E") {
    // A's Trailhead with Ian's Notice copy (round 2).
    column = (
      <>
        {notes && (
          <>
            <h2 className="text-h4">Notes About Getting Access</h2>
            <NotesText text={notes} />
          </>
        )}
        {request(
          notes ? (
            <>
              <p>The Guide of this Path decides who can Add it.</p>
              <p>
                Dreamport cannot guarantee that the Guide will give you access,
                even if you follow whatever steps they ask, including sending
                payment. When the Guide grants you access, you will always have
                access to that version of the Path.
              </p>
              <p>
                Request it, then check back here. The Guide&apos;s answer shows
                on this page once they decide. There are no notifications.
              </p>
            </>
          ) : (
            usualNotice
          ),
        )}
      </>
    );
  } else if (variant === "A") {
    column = (
      <>
        {notes && (
          <>
            <h2 className="text-h4">Notes About Getting Access</h2>
            <NotesText text={notes} />
          </>
        )}
        {request(
          <>
            <p>The Guide of this Path decides who can Add it.</p>
            {notes && <p>{OUTSIDE_DREAMPORT}</p>}
            <p>
              Request it, and you&apos;ll find the answer here when you come
              back. There are no notifications.
            </p>
          </>,
        )}
      </>
    );
  } else if (variant === "B") {
    column = request(
      notes ? (
        <>
          <p>The Guide of this Path decides who can Add it.</p>
          <p>
            <b>Notes About Getting Access</b>
          </p>
          {/* PROTOTYPE: the quoted notes would need new CSS (a quote
              inside a Notice, not italic). */}
          <div
            style={{
              fontStyle: "normal",
              borderLeft: "2px solid currentColor",
              paddingLeft: "1rem",
              margin: "0.5rem 0 1rem",
            }}
          >
            <NotesText text={notes} />
          </div>
          <p>{OUTSIDE_DREAMPORT}</p>
          <p>
            Request it, and you&apos;ll find the answer here when you come back.
            There are no notifications.
          </p>
        </>
      ) : (
        usualNotice
      ),
    );
  } else if (variant === "C") {
    column = (
      <>
        {notes && (
          <div className="sheet">
            <h2 className="text-h4">Notes About Getting Access</h2>
            <div>
              <NotesText text={notes} />
            </div>
            <p className="text-sm">
              <i>Written by the Guide. {OUTSIDE_DREAMPORT}</i>
            </p>
          </div>
        )}
        {request(usualNotice)}
      </>
    );
  } else {
    // D: the notes lead the page, full width, before the two columns.
    top = notes && (
      <section aria-labelledby="notes-heading">
        <h2 id="notes-heading" className="text-h4">
          Notes About Getting Access
        </h2>
        <p className="text-sm">
          The Guide wrote these notes for Version {shown.number}.{" "}
          {OUTSIDE_DREAMPORT}
        </p>
        <NotesText text={notes} />
      </section>
    );
    column = request(
      notes ? (
        <>
          <p>The Guide of this Path decides who can Add it.</p>
          <p>
            Read the Notes About Getting Access at the top of this page before
            you Request.
          </p>
          <p>
            You&apos;ll find the answer here when you come back. There are no
            notifications.
          </p>
        </>
      ) : (
        usualNotice
      ),
    );
  }

  return (
    <>
      {asGuide ? (
        <div className="heading-row">
          <h1>{PATH.name}</h1>
          <div className="button-group">
            <Button variant="secondary">Requests (2)</Button>
            <Button variant="secondary">Edit Path</Button>
          </div>
        </div>
      ) : (
        <h1>{PATH.name}</h1>
      )}
      <p className="text-sm">
        Version {shown.number}
        <Dot />
        Access: By Request
        <Dot />
        Price: Free
        {!isNewest && (
          <>
            <Dot />
            <Link href={versionHref(newest(state).number)}>
              A newer version is available.
            </Link>
          </>
        )}
      </p>
      {top}
      <div className="journey-split">
        <MilestoneRoute />
        <section>
          <p>{PATH.description}</p>
          {column}
          <p>
            <Link href={versionHref(1)} className="link-quiet">
              Looking for an older version?
            </Link>
          </p>
        </section>
      </div>
      <Dialog
        open={confirming}
        onOpenChange={(open) => !open && setConfirming(false)}
        title={`Request Version ${shown.number}?`}
      >
        <p>
          The Guide will see your email address ({email}) with your Request.
        </p>
        <div className="button-group button-group--end">
          <Button variant="secondary" onClick={() => setConfirming(false)}>
            Cancel
          </Button>
          <Button
            onClick={() => {
              setState((s) => ({ ...s, requested: true }));
              setConfirming(false);
            }}
          >
            Send Request
          </Button>
        </div>
      </Dialog>
    </>
  );
}

/** C's Guide view: their own Trailhead, editing the shown version's notes. */
export function GuideTrailhead({
  version,
  versionHref,
  state,
  setState,
}: {
  version: number;
  versionHref: (n: number) => string;
  state: ProtoState;
  setState: SetState;
}) {
  const shown =
    state.versions.find((v) => v.number === version) ?? newest(state);
  const notes = shown.notes.trim();
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState("");
  const isNewest = shown.number === newest(state).number;
  const save = (value: string) => {
    setState((s) => ({
      ...s,
      versions: s.versions.map((v) =>
        v.number === shown.number ? { ...v, notes: value } : v,
      ),
    }));
    setEditing(false);
  };
  const start = () => {
    setText(shown.notes);
    setEditing(true);
  };

  return (
    <>
      <div className="heading-row">
        <h1>{PATH.name}</h1>
        <div className="button-group">
          <Button variant="secondary">Requests (2)</Button>
          <Button variant="secondary">Edit Path</Button>
        </div>
      </div>
      <p className="text-sm">
        Version {shown.number}
        <Dot />
        Access: By Request
        <Dot />
        Price: Free
        {!isNewest && (
          <>
            <Dot />
            <Link href={versionHref(newest(state).number)}>
              A newer version is available.
            </Link>
          </>
        )}
      </p>
      <div className="journey-split">
        <MilestoneRoute />
        <section>
          <p>{PATH.description}</p>
          {editing ? (
            <>
              <TextArea
                id="notes"
                label={`Notes About Getting Access for Version ${shown.number}`}
                helperText="What a User needs to know before they Request this version, such as a price and how to pay, or how to reach you. Users see these notes above the Request button."
                rows={8}
                value={text}
                onChange={(e) => setText(e.target.value)}
              />
              <div className="button-group button-group--end">
                {shown.notes && (
                  <Button variant="secondary" onClick={() => save("")}>
                    Clear Notes
                  </Button>
                )}
                <Button variant="secondary" onClick={() => setEditing(false)}>
                  Cancel
                </Button>
                <Button onClick={() => save(text)}>Save Notes</Button>
              </div>
            </>
          ) : (
            <>
              <div className="heading-row">
                <h2 className="text-h4">Notes About Getting Access</h2>
                <Button variant="secondary" onClick={start}>
                  {notes ? "Edit Notes" : "Write Notes"}
                </Button>
              </div>
              <p className="text-sm">
                These notes belong to Version {shown.number}. Each version has
                its own.
              </p>
              {notes ? (
                <NotesText text={notes} />
              ) : (
                <p>
                  Version {shown.number} has no notes. Users see only the
                  Request button.
                </p>
              )}
            </>
          )}
          <p>
            <Link
              href={versionHref(shown.number === 1 ? 2 : 1)}
              className="link-quiet"
            >
              {shown.number === 1
                ? "Go to Version 2"
                : "Looking for an older version?"}
            </Link>
          </p>
        </section>
      </div>
    </>
  );
}

// --------------------------------------------------------------- Editor --

/**
 * E: the Draft's notes on the editor page, right after the description,
 * read the way the Trailhead shows them and edited in place (C's controls).
 * Saving changes the Draft only; Users see the latest version's notes.
 */
function EditorNotes({
  draft,
  latest,
  onSave,
}: {
  draft: string;
  latest: { number: number; notes: string };
  onSave: (draft: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState("");
  const notes = draft.trim();
  const changed = draft !== latest.notes;
  const save = (value: string) => {
    onSave(value);
    setEditing(false);
  };

  if (editing) {
    return (
      <>
        <TextArea
          id="editor-notes"
          label="Notes About Getting Access"
          helperText="What a User needs to know before they Request this Path, such as a price and how to pay, or how to reach you. Users see these notes on the Trailhead, above the Request button. Like the name and description, they go into the next version you save."
          rows={8}
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
        <div className="button-group button-group--end">
          {draft && (
            <Button variant="secondary" onClick={() => save("")}>
              Clear Notes
            </Button>
          )}
          <Button variant="secondary" onClick={() => setEditing(false)}>
            Cancel
          </Button>
          <Button onClick={() => save(text)}>Save Notes</Button>
        </div>
      </>
    );
  }

  return (
    <>
      <div className="heading-row">
        <h2 className="text-h4">Notes About Getting Access</h2>
        <Button
          variant="secondary"
          onClick={() => {
            setText(draft);
            setEditing(true);
          }}
        >
          {notes ? "Edit Notes" : "Write Notes"}
        </Button>
      </div>
      {changed ? (
        <Notice>
          <p>You&apos;ve changed these notes since Version {latest.number}.</p>
          <p>
            Users keep seeing Version {latest.number}&apos;s notes until you
            Save as New Version.
          </p>
        </Notice>
      ) : (
        notes && (
          <p className="text-sm">
            These are Version {latest.number}&apos;s notes. Users see them on
            the Trailhead, above the Request button.
          </p>
        )
      )}
      {notes ? (
        <NotesText text={notes} />
      ) : (
        <p>
          {changed
            ? "No notes. Once you save a new version, Users see only the Request button."
            : `Version ${latest.number} has no notes. Users see only the Request button.`}
        </p>
      )}
    </>
  );
}

/** A, B and D's Guide view: a stub of the Path editor. */
export function Editor({
  variant,
  state,
  setState,
}: {
  variant: string;
  state: ProtoState;
  setState: SetState;
}) {
  const latest = newest(state);
  const draftBased = variant === "A" || variant === "D" || variant === "E";
  const matches = !draftBased || state.draft === latest.notes;
  const [editPath, setEditPath] = useState(false);
  const [managing, setManaging] = useState(false);
  const [dialogNotes, setDialogNotes] = useState("");
  const [editingRow, setEditingRow] = useState<number | null>(null);
  const [rowText, setRowText] = useState("");

  const saveVersion = () =>
    setState((s) => ({
      ...s,
      versions: [
        ...s.versions,
        { number: newest(s).number + 1, notes: s.draft },
      ],
    }));

  const setVersionNotes = (n: number, notes: string) => {
    setState((s) => ({
      ...s,
      versions: s.versions.map((v) => (v.number === n ? { ...v, notes } : v)),
    }));
    setEditingRow(null);
  };

  const draftNotes = state.draft.trim();

  return (
    <>
      <div className="heading-row">
        <h1>{PATH.name}</h1>
        <Button
          variant="secondary"
          onClick={() => {
            setDialogNotes(state.draft);
            setEditPath(true);
          }}
        >
          Edit Path
        </Button>
      </div>
      <p className="text-sm">
        Path Status: <a href="#">Open</a>
      </p>
      <p className="text-sm">
        <b>{matches ? `Version ${latest.number}` : "Draft (unpublished)"}</b>
        <Dot />
        <QuietButton onOpen={() => setManaging(true)}>
          Manage Versions
        </QuietButton>
      </p>
      <p className="text-sm">
        Access: By Request
        <Dot />
        <QuietButton onOpen={() => {}}>Change Access</QuietButton>
      </p>
      {variant === "B" && (
        <p className="text-sm">
          Notes About Getting Access:{" "}
          {latest.notes.trim()
            ? `Version ${latest.number} has notes`
            : `Version ${latest.number} has none`}
          <Dot />
          <QuietButton onOpen={() => setManaging(true)}>
            Edit in Manage Versions
          </QuietButton>
        </p>
      )}
      <h2 className="text-h4">About This Path</h2>
      <p>{PATH.description}</p>
      {variant === "E" && (
        <EditorNotes
          draft={state.draft}
          latest={latest}
          onSave={(draft) => setState((s) => ({ ...s, draft }))}
        />
      )}
      {variant === "A" && (
        <>
          <h2 className="text-h4">Notes About Getting Access</h2>
          {draftNotes ? (
            <NotesText text={draftNotes} />
          ) : (
            <p>
              No notes. Users who want this Path see only the Request button.
              Add notes with Edit Path.
            </p>
          )}
        </>
      )}

      <div className="journey-split journey-split--route-first">
        <div>
          <h2>Milestones</h2>
          <MilestoneRoute />
        </div>
        <section>
          <div className="heading-row">
            <h3>{MILESTONES[0].name}</h3>
            <Button variant="secondary">Edit Milestone</Button>
          </div>
          <p>{MILESTONES[0].outcome}</p>
          <p className="text-sm">
            <i>(PROTOTYPE: the Milestone's Tasks would follow here.)</i>
          </p>
        </section>
      </div>

      {variant === "D" && (
        <section aria-labelledby="draft-notes-heading">
          <h2 id="draft-notes-heading">Notes About Getting Access</h2>
          <TextArea
            id="draft-notes"
            label="Notes for Users who want to Request this Path"
            helperText="Users see these notes on the Trailhead, above the Request button. Say what you need from them, such as a price and how to pay, or how to reach you. Your notes go into the next version you save."
            rows={8}
            value={state.draft}
            onChange={(e) => setState((s) => ({ ...s, draft: e.target.value }))}
          />
          {!matches && (
            <Notice>
              <p>
                You&apos;ve changed these notes since Version {latest.number}.
              </p>
              <p>
                Users keep seeing Version {latest.number}&apos;s notes until you
                Save as New Version.
              </p>
            </Notice>
          )}
        </section>
      )}

      <div className="button-group button-group--end">
        <Button variant="secondary">Close This Path</Button>
        {draftBased && !matches && (
          <Button
            variant="secondary"
            onClick={() => setState((s) => ({ ...s, draft: newest(s).notes }))}
          >
            Discard Changes
          </Button>
        )}
        <Button onClick={saveVersion}>Save as New Version</Button>
      </div>

      <Dialog
        open={editPath}
        onOpenChange={(open) => !open && setEditPath(false)}
        title="Edit Path"
      >
        <TextInput id="edit-name" label="Name" defaultValue={PATH.name} />
        <TextArea
          id="edit-description"
          label="Description"
          defaultValue={PATH.description}
        />
        {variant === "A" && (
          <TextArea
            id="edit-notes"
            label="Notes About Getting Access"
            helperText="Users see these notes on the Trailhead, above the Request button. Say what you need from them, such as a price and how to pay, or how to reach you. Like the name and description, they go into the next version you save."
            rows={6}
            value={dialogNotes}
            onChange={(e) => setDialogNotes(e.target.value)}
          />
        )}
        <div className="button-group button-group--end">
          <Button variant="secondary" onClick={() => setEditPath(false)}>
            Cancel
          </Button>
          <Button
            onClick={() => {
              setState((s) => ({ ...s, draft: dialogNotes }));
              setEditPath(false);
            }}
          >
            Update Path
          </Button>
        </div>
      </Dialog>

      <Dialog
        open={managing}
        onOpenChange={(open) => {
          if (!open) {
            setManaging(false);
            setEditingRow(null);
          }
        }}
        title="Manage Versions"
      >
        <ul className="list">
          {[...state.versions].reverse().map((v) =>
            variant === "B" && editingRow === v.number ? (
              <li key={v.number} className="list-row list-row--editing">
                <div>
                  <TextArea
                    id={`row-notes-${v.number}`}
                    label={`Notes About Getting Access for Version ${v.number}`}
                    helperText="Users who want this version see these notes above the Request button. You can change them at any time without saving a new version."
                    rows={6}
                    value={rowText}
                    onChange={(e) => setRowText(e.target.value)}
                  />
                  <div className="button-group button-group--end">
                    {v.notes && (
                      <Button
                        variant="secondary"
                        onClick={() => setVersionNotes(v.number, "")}
                      >
                        Clear Notes
                      </Button>
                    )}
                    <Button
                      variant="secondary"
                      onClick={() => setEditingRow(null)}
                    >
                      Cancel
                    </Button>
                    <Button onClick={() => setVersionNotes(v.number, rowText)}>
                      Save Notes
                    </Button>
                  </div>
                </div>
              </li>
            ) : (
              <li key={v.number} className="list-row">
                <span>
                  Version {v.number}
                  {variant === "B" && (
                    <span className="text-sm">
                      <br />
                      {v.notes.trim() ? "Has notes" : "No notes"}
                    </span>
                  )}
                </span>
                <div className="button-group">
                  {variant === "B" && (
                    <Button
                      variant="secondary"
                      onClick={() => {
                        setRowText(v.notes);
                        setEditingRow(v.number);
                      }}
                    >
                      {v.notes.trim() ? "Edit Notes" : "Write Notes"}
                    </Button>
                  )}
                  <Button variant="secondary">Copy Link</Button>
                  <Button variant="secondary">Unpublish</Button>
                </div>
              </li>
            ),
          )}
        </ul>
        <div className="button-group button-group--end">
          <Button onClick={() => setManaging(false)}>Done</Button>
        </div>
      </Dialog>
    </>
  );
}

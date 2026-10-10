# Design decisions

One-liner rules for composing pages from the design system's existing
Components and Patterns (see `AGENTS.md`'s four-tier system). Each entry
here is a decision already made — during a sign-off conversation like #28's
or #90's — for a shape that recurs, not a one-off.

**These are binding, not advisory.** When a page's situation clearly matches
an entry below, build it directly — no sign-off round-trip needed, since
sign-off was already spent when the rule was written. A situation that
doesn't clearly match an existing entry still needs its own sign-off
conversation (AGENTS.md rule 3), the same as before this document existed.

Add an entry only once a sign-off conversation resolves something repeatable
— never speculatively, ahead of a real decision.

## Rules

- A form consisting of a single labelled field and a single attached action
  (e.g. an email field + "Send Code") uses the `.field-row` pattern —
  the button sits beside the field, flush with its top/bottom edges, not
  stacked below it. Two or more buttons with no field attached use
  `.button-group` instead. See the style guide's "Field with action"
  section and docs/adr/0012 (decided in #28).

- Button labels are in Title Case ("Add Product", "Start Journey",
  "Verify and Sign In"): capitalize every word except short articles,
  conjunctions and prepositions ("a", "and", "the", "to"…) that aren't
  first. Pending labels follow suit ("Verifying You're Human…"). Written
  into the label text, not a CSS `text-transform` — `capitalize` can't
  leave the small words lowercase, and would also capitalize the email
  in `AppNav`'s account trigger. Covers anything styled `.button`
  (decided in #137).

- A button that starts a request needing server confirmation (add, delete,
  any create/update/destroy action) disables and relabels to a
  present-participle string ("Adding…"/"Deleting…") while that request is
  in flight — native `disabled`, not `aria-disabled` (docs/adr/0012). That
  state holds for a minimum of 400ms, timed from when the request starts,
  via `withMinimumDuration`, so a fast response doesn't flicker the state
  instead of showing it — and any change that would remove the pending
  element itself (e.g. the row a delete button lives in) waits until after
  that minimum duration resolves, not before. See docs/adr/0013 (decided
  in #89).

- A signed-in page (e.g. `/app`, `/app/settings`) renders inside the
  `_appShell` layout — `AppNav` (the section links, then an account
  `Dropdown` triggered by the User's own email, holding Settings and Log
  out) plus `<Footer variant="app" />` (the default; copyright on one end,
  Privacy Policy/Terms of Service/Copyright on the other, on the page color) —
  not the marketing `Header`/`_withFooter`. `Header` itself stays
  signed-out-only; it has no concept of a session. The public pages (`/`,
  `/login`, `/about`, `/privacy`, `/terms`, `/copyright`) render inside `_withFooter`,
  whose chrome follows the session: signed out, `Header` plus
  `<Footer variant="marketing" />` — a Dreamport description beside a
  stacked "Learn More" list (Log In/About Dreamport/Contact/Privacy
  Policy/Terms of Service/Copyright), copyright below, on a dark background; signed
  in, the same `AppNav` and in-app `Footer` as `_appShell`, so a public
  page reached from inside the app still looks signed in. `/login` itself
  sends a signed-in visitor on to `/app`. See `src/routes/_appShell.tsx`,
  `src/routes/_withFooter.tsx` and `src/components/AppNav` (decided in
  #90; the flat email/Settings/Log out layout superseded by the `Dropdown`
  below in #119; the two `Footer` variants and the session-following
  `_withFooter` chrome added in #121).

- A public page's body copy (the homepage, About, Privacy Policy, Terms
  of Service, Copyright) reads at `.text-2xl` — set on each body `<p>`, the way the
  homepage does — rather than the default body size. Supporting text like
  a legal page's "Last updated" line stays small (`.text-sm`), and
  `/login` stays at the default: it's a form, not a page to read. Signed-in
  pages keep the default body size (decided in #121).

- A link that shouldn't draw the eye (e.g. the in-app footer's Privacy
  Policy / Terms of Service) uses `.link-quiet` — the text's own
  near-black, underlined, dropping the underline on hover — rather than
  the default blue. See the style guide's "Links" section (decided in
  #121). The same goes for a secondary way out of a form that shouldn't
  compete with its main button (e.g. `/login`'s "Request a new code", a
  `.link-quiet` link back to `/login`): inline text below that button,
  not a secondary `Button` beside it (decided in #128).

- A destructive, irreversible action (delete account, delete a Product,
  delete an Idea) uses a two-step reveal in place — resting state shows
  the action itself ("Delete"); clicking it swaps that control for a
  confirming step plus "Cancel" rather than performing the action —
  instead of a modal/dialog. A stray click can't trigger the irreversible
  step, and no dialog component is needed. The confirming step keeps the
  action's own verb rather than a generic "Confirm" — delete-account's own
  confirming step is "Email Me a Deletion Link," not "Confirm" — so the
  button never says less than what it's about to do. Decided for
  delete-account in #26, reaffirmed generally (one confirming state per
  row, not just per page) for Product delete in #90; #90's own
  implementation used generic "Confirm" wording, which #101 corrected back
  to the action's own verb ("Delete") for both Products and Ideas.

- A row that pairs a name or display value with one attached action (a
  Product's own name + Delete, an Idea's own name + Edit/Delete) uses the
  `.list`/`.list-row` pattern — real `<ul>`/`<li>`, not `.field-row`
  (which is for a labelled input, not a display value). See `src/global.css`
  and the style guide's "Row with action" section (decided in #90, generalized
  off "Product" naming in #101). Each row is laid out on its own — no row's
  layout depends on another's, so one row changing mode (confirming,
  editing) never shifts the rest (decided in #102, replacing #90's shared
  column).

- A row edited in place (e.g. renaming an Idea) swaps its content for a
  `.field-row` spanning the whole row. When the field needs more than one
  action (Save / Cancel / Delete), they go in a `.button-group` in the
  field-row's button slot (decided in #102). When the row's form has more
  than one field (an Idea's name plus its Tags, #113), it lays them out like
  the add form instead — a `.field-pair`, the `.button-group` below — on a
  tinted panel (`.list-row--editing`) so it reads as one form, set apart
  from the rows around it.

- Tags are condensed, filled pills, one neutral color for every Tag;
  per-Tag colors would be a separate decision (decided in #113, picked
  from a six-variant prototype on branch `113-idea-tags-prototype`).
  - In a list, an Idea's Tags get a fixed-width column between its name
    and its actions (`.list-row--tagged`), the same width on every row, so
    a long name never gets squeezed and the pills line up down the list.
    The column shows as many pills as fit, then an outlined "+N" pill that
    opens a popover with every Tag. Below 640px a row stacks name / Tags /
    actions and shows every pill, with much more room between rows (and
    some within one) so neighbouring Ideas don't run together.
  - The "+N" pill is outlined, never filled like a Tag: it's a different
    kind of thing, and a custom Tag could be named "+2".
  - Tags are chosen with a `TagPicker`: a box shaped like a text input
    holding the chosen pills — as many as fit, then "+N", always one line
    tall — that opens a `Dropdown` with a checkbox item per catalog Tag.
    Inside the box "+N" gets no hover of its own; the whole box is the
    control.
  - A pill too wide for its space on its own is cut off with "…"; the full
    name stays in the popover and the dropdown.
  - The add-Idea form puts its name and its `TagPicker` side by side
    (`.field-pair`, 3:1), with "Add Idea" below both, so the Tags read as
    part of the form — and never as a filter on the list below.
    `.form-section` leaves clear room between the form and that list.

- An account menu (e.g. `AppNav`'s Settings/Log out) uses the `Dropdown`
  component — a generic, reusable trigger-plus-panel Component (not a
  one-off tied to `AppNav`), built on `@base-ui/react`'s `Menu` primitives
  for behavior (focus management, keyboard nav, outside-click/`Escape`)
  while `Dropdown` owns its panel's CSS. Its trigger is a `.button`
  (`variant`, default `"secondary"`; `"nav"` on the bar), so it shares
  every button's size and hover outline (#125). `AppNav`'s trigger reads
  "Account", after Phosphor's `UserCircle`, with a chevron; the panel
  names who's signed in with a non-clickable `Dropdown.Group` label
  ("Signed in as …") over Settings and Log out, the same group the phone
  ☰ menu shows. See ADR-0014 and the style guide's "Dropdown" section
  (decided in #119; the trigger was the email itself until #167 replaced
  it, after trying "You", a dividing line, and a plain Settings link).

- `AppNav`'s top-level sections (just Products for now) are links on the
  right of the bar, beside the account `Dropdown`, not beside the wordmark.
  Each is a pill on `--color-bar-trigger-tint` with its Phosphor icon
  before the label; the section you're in (`aria-current="page"`) gets
  `--color-bar-link-current-tint` and goes bold. This reverses #90's "no
  active-route highlighting", which predated real sections. Everything
  clickable on the bar (section links, account trigger, ☰) is the same
  size as a `.button` and gets the same hover outline. Below 640px the links and account
  trigger collapse into one icon-only ☰ `Dropdown` (sections, a separator,
  then the signed-in group). 640px fits one section; adding sections means
  measuring the row again and likely adding a wider breakpoint (decided in
  #125, from a prototype that compared rail/pill/marker styles and a
  bottom tab bar).

- A page nested under `/app` (a Product, its Journey, a Worksheet) gets
  `Breadcrumbs`: a white (`--color-sheet`) band edge to edge directly
  under `AppNav`, its trail lined up with the page column. The last crumb
  is the page you're on, unlinked (`aria-current="page"`); the root is
  the section ("Products"), never "Home"; a Milestone is never a crumb.
  Top-level pages (`/app`, `/app/settings`) have none: one crumb would
  only repeat the h1. The trail stays on one line, ancestors shortening
  with "…" (to no less than 44px) before the current page does. Below
  640px it becomes one "‹ Back to {parent}" link. A page names its trail
  in its route's `beforeLoad` context and `_appShell` draws the band.
  Picked over a white box, Tag pills, and bands or rules under the h1 in
  a prototype on branch `109-prototype-breadcrumbs` (decided in #109).

- Icons use Phosphor (`@phosphor-icons/react`), imported per-icon by name
  (e.g. `CaretDownIcon`) rather than a hand-authored SVG or another icon
  library, at the `"regular"` weight unless a specific icon calls for
  another. This is the project's icon system going forward, not a one-off
  for any single icon (decided in #119).
  - One scoped exception: `Dropdown`'s trigger chevron is its own
    hand-drawn two-line SVG, not Phosphor's `CaretDown`. Phosphor's caret
    is a single closed path, and the open/close animation folds its two
    strokes independently, which a single path can't do. It follows
    Phosphor's regular-weight proportions. Every other icon stays Phosphor
    (decided in #120).

- The "Dreamport" wordmark is styled text (the `.wordmark` class), not an
  image asset, shown at the left of every page with `Header` (linking to
  `/`) or `AppNav` (linking to `/app`) — including the homepage, whose
  hero headline says something else rather than repeating the name. It's
  `--text-h2`, stepping down to `--text-2xl` below 640px. Its box is
  trimmed to x-height → baseline (`text-box`), so a bar centres its
  lowercase letters against the bar's other items rather than centring
  Funnel Display's much taller line box (#125). `AppNav` keeps everything
  on one row at every width (#119 replaced #118's stacked phone layout);
  the wordmark shows at every width, with the rest collapsing into a ☰
  menu on phones (#125, replacing #120's hide-the-wordmark stopgap). See
  the style guide's "Wordmark" section (decided in #118). It's part of
  the bar, not a nav item, so it's never marked as the current page
  (`current={false}` on its `Link`), even on the page it links to (#125).

- `Header` and `AppNav` share one bar color: a violet → magenta gradient
  interpolated in oklab, with cream text and cream-filled buttons, via the
  `--color-bar-*` tokens. Picked over flat-violet and dark-grey-with-accent-
  line alternatives in a prototype round; its sub-AA contrast is an accepted
  trade-off recorded in `tokens.css` (decided in #118).

- A Product's Journey page puts the Product's name in the h1 and "Journey"
  in the h2, then two columns (`.journey-split`): the Milestones as a
  route on the left (`.journey-route` — numbered dots on a line, bold
  names, each with its outcome line under it in plain text color
  (`.journey-route-outcome`; once started, only the current one's); done
  ones a `--color-done` grey circle with a Phosphor check labelled
  "Done", the current one violet and `aria-current="step"`), and
  the content for where you are on the right, as plain page text — no
  tinted panel. Below 640px the content stacks above the route. No "N of
  7 · Next · Ends at" line: the route already says it. Picked from a
  prototype on branch `prototype/journey-ux` (decided in #137).

- A Worksheet's page puts the Product's name in the h1, then the
  Worksheet drawn as a sheet of paper (`.sheet`): white
  (`--color-sheet`, an acknowledged addition to Solarized Light) on the
  cream page, full content width, square corners, no border, no shadow.
  On the sheet: the Worksheet's name as its h2, numbered questions ("1.
  Problem") as lined `TextArea`s — three lines tall and growing, not
  hand-resizable, with the prompt between question and lines at body size
  (`--text-base`, not helper text's usual `--text-sm`) — one Save button, and
  any credit right-aligned in italics in the bottom corner ("Credit:
  Adapted from … (CC BY-SA 3.0)", only the license linked). No "N of M
  filled in" line on the sheet. Saving goes back to the Journey page, which
  links each Worksheet above the "Done when" line as "Complete your
  Product Summary", only the Worksheet's name linked. Picked from a
  prototype on branch `prototype/worksheet-design` (decided in #139).

- Helper text (`.input-helper`) is `--color-text-primary`, the label's own
  color, at `--text-sm` — never `--color-text-muted`, which fails AA on
  both cream and white (decided in #139).

- Things a User does on a page — Worksheets to fill in, Tasks to tick —
  are `ActionCard`s in an `.action-card-list`, one `h4` section per kind
  ("Worksheets", "Tasks"), never mixed into one list. A Worksheet's card
  says "Complete" or "Incomplete" (`ActionCard.Status`), never a count; a
  Task's leads with a `Checkbox`. No progress bars or "n of m done"
  counts. A section with nothing in it is left out. See the style guide's
  "Action card" section (decided in #140).

- A form with several fields, one of them a `TextArea` (a Milestone, a
  Path's name and description), opens in a `Dialog` from a button rather
  than sitting on the page all the time: "Add Milestone" at the end of the
  list, "Edit" on a row. The same `Dialog` adds and edits; when editing,
  Delete is inside it (the usual two-step reveal), so the row shows only
  Edit. `Dialog` is a generic Component on `@base-ui/react`'s `Dialog`,
  the way `Dropdown` is on its `Menu`: base-ui owns focus trapping,
  `Escape` and outside clicks, `Dialog` owns the CSS: a square-cornered
  panel in the page's own cream (`--color-page-bg`) over a dimmed page, its
  title an h2. A one- or two-field row edit (renaming an Idea) stays in place
  (decided in #167, picked over an in-place reveal in a prototype on
  branch `167-prototype-trailblazer`).

- A list the User puts in order (a Path's Draft Milestones) has a drag
  handle (Phosphor `DotsSixVertical`) in a column of its own at the start
  of each row, and thin `--color-border` lines between and around the rows
  in place of the usual row gap. A focused handle moves its row with the
  up and down arrow keys, and drag works by touch as well as by mouse. The
  row reads "1. {name}", then its actions. Picked over a Reorder mode,
  the handle on white blocks, arrow buttons on each row and Move Up/Down
  inside the edit form, in the same prototype (decided in #167). The row
  being dragged carries dnd-kit's transform as an inline `style`, the one
  accepted exception to "no inline styles": it follows the pointer, so no
  class can hold it.

- `AppNav` has a second section, Paths (Phosphor `PathIcon`, the
  `/app/paths` pages), after Products, 12px apart. The section, its h1
  and its breadcrumb say "Paths", never "Trailblazer": that name is for
  adding and editing a Path inside the section, and would mean nothing to
  a new User in the nav. With two sections and
  the "Account" trigger the bar collapses into the ☰ menu below about
  820px, not 640px: "Account" starts to clip below about 800px (decided
  in #167).

- White (`--color-sheet`) is not a surface color. It's kept for a
  Worksheet's paper (`.sheet`) and for the few places that need emphasis
  and have no other way to get it, such as the `Breadcrumbs` band. Panels,
  dialogs and forms sit on the page's cream (`--color-page-bg`) (decided in
  #167).

- A multi-line field is a `TextArea`: the same box as a `TextInput`, three
  lines tall and growing as you type. The ruled-lines look (`lined`) is
  only for a Worksheet's answers on its `.sheet`. See the style guide's
  "Text inputs" section (decided in #167).

- A Milestone's Tasks on a Path's Draft are edited in a Dialog of their
  own, "Tasks for {Milestone name}", opened from a Tasks button beside
  the row's Edit, not under each row on the page or inside the Edit
  Milestone Dialog. Everything in it takes effect at once, with no
  submit, so it never mixes with a form that waits for its button. In it:
  the Tasks as a ruled list with drag handles, each row "{title}" then
  Edit, editing in place (a one-field row edit: Update Task, Cancel,
  Delete, the confirming Delete taking Delete's place with no second
  Cancel, since a fourth button leaves the field too narrow in the
  Dialog); a "Task title" field
  with "Add Task" beside it; and Done to close. Picked over Tasks nested
  under each Milestone row and Tasks inside the Edit Milestone Dialog in a
  prototype on branch `168-prototype-milestone-tasks` (decided in #168).

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
  than sitting on the page all the time. The same `Dialog` adds and edits;
  when editing, Delete is inside it (the usual two-step reveal). `Dialog` is a generic Component on `@base-ui/react`'s `Dialog`,
  the way `Dropdown` is on its `Menu`: base-ui owns focus trapping,
  `Escape` and outside clicks, `Dialog` owns the CSS: a square-cornered
  panel in the page's own cream (`--color-page-bg`) over a dimmed page, its
  title an h2. A one- or two-field row edit (renaming an Idea) stays in place
  (decided in #167, picked over an in-place reveal in a prototype on
  branch `167-prototype-trailblazer`).

- A list the User puts in order (a Path's Milestones, a Milestone's
  Tasks) has a drag handle (Phosphor `DotsSixVertical`) in a column of its
  own at the start of each row. A focused handle moves its row with the up
  and down arrow keys, and drag works by touch as well as by mouse. Each
  row is a white card spaced apart from the next, the `ActionCard` look
  with the handle where a Task's check box would be, then the row's text,
  then its actions; a row with no actions keeps its text centred on the
  handle. Picked over a Reorder mode, arrow buttons on each row and Move
  Up/Down inside the edit form (decided in #167); the white cards replaced
  #167's thin lines between and around the rows in #169's prototype. The
  row being dragged carries dnd-kit's transform as an inline `style`, the
  one accepted exception to "no inline styles": it follows the pointer, so
  no class can hold it.

- `AppNav` has a second section, Paths (Phosphor `CompassIcon`, the
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

- A Path's page is one page (decided in #169, from eleven rounds of a
  prototype on branch `169-prototype-save-version`; it replaced #167's
  Milestone list with row buttons and #168's Tasks Dialog):
  - The Path's name as the h1 with "Edit Path" beside it, then the
    description.
  - Two columns, as on the Journey page (`.journey-split`). On the left,
    a "Milestones" h2 over the Journey page's route: numbered dots on a
    line, each stop's name a button that picks that Milestone, "n Tasks"
    under it ("1 Task", "No Tasks"), the picked one in the route's
    current-stop violet. Under the route, "Manage Milestones". On the
    right, the picked Milestone (the first, to start): its name as an h3,
    level with "Milestones", with "Edit Milestone" beside it, then its
    outcome, description and "Done When", then a "Tasks" h4 and its Tasks,
    managed right there: the white-card rows with drag handles, each
    "{title}" then Edit, editing in place (Update Task, Cancel, Delete,
    the confirming Delete taking Delete's place), and a "Task title" field
    with "Add Task" beside it. Each Task change takes effect at once.
    Below 640px the route comes first, then the picked Milestone, unlike
    the Journey page.
  - "Edit Path" and "Manage Milestones" open the same Edit Path Dialog:
    name, description, then a "Milestones" h3 over the Milestones as
    white-card rows with drag handles and no other actions, and "Add
    Milestone", which opens the Milestone Dialog on top of it. Milestones
    added or moved there wait for Update Path, which saves them with the
    name and description all at once, so Cancel really cancels.
  - A Path with no Milestones shows "No Milestones yet." and "Manage
    Milestones" under the h2.
  - Save as New Version ends the page (below).

- A heading with an action (Edit Path beside a Path's h1, Edit Milestone
  beside a Milestone's h3) puts the button at the right end of the
  heading's row, centred on the heading, the heading keeping its own
  spacing below (decided in #169).

- A list (`.list`) leaves room after it, so whatever follows (a form, a
  button, the next heading) never sits on its last row (decided in #169).

- A confirming button sits bottom right, last, with Cancel (and any
  Delete) to its left: `.button-group--end`, the Journey page's Return /
  Advance arrangement. That covers a Dialog's or form's submit button
  ("Update Path", "Add Milestone") and a page's own main action at its
  end (Save as New Version). Forms and Dialogs built before this move
  over when they're next changed (decided in #169).

- A Path's page ends with Save as New Version bottom right, and a
  refused save's reason under the button. Which version the page is, and
  every saved version, are under the h1 instead (#191, which dropped
  #169's "Last edited" and "Latest version" lines as too much in the
  status area). No Milestones-and-Tasks count. A date and time shows in
  the browser's own locale as a long date with the time ("October 10,
  2026 at 2:32 PM"), in a `<time>` (decided in #169, from a prototype on
  branch `169-prototype-save-version`).

- A Product's Journeys, Pathfinder and a Path's Trailhead are three pages
  under the Product, each with the Product's name as the h1 except the
  Trailhead (decided in #170, in words, without a prototype):
  - **Journeys** (`/app/products/:productId/journeys`): no "Journeys"
    heading; straight to an "Active Journeys" h2 and an "Inactive
    Journeys" h2 (#172), each one `ActionCard` link per Journey, oldest
    first, the Path's name with "In Progress", "Completed" or "Abandoned"
    as its status: no current Milestone and no start date. A section with
    none is left out, and a list of one is still a list. With no Journeys
    at all, "This Product is not following any Paths yet." Then a "Follow
    Another Path" h2, one line, and "Open Pathfinder".
    Checking on a Journey under way comes first; choosing a new Path comes
    second, and the page never redirects to Pathfinder.
  - **Pathfinder** (`/app/products/:productId/pathfinder`): "Pathfinder"
    as the h2, then one `ActionCard` link per Path the User can follow
    (Dream Sequence first, then their own with a saved version), each
    going to its Trailhead. One the Product has a Journey in progress on
    stays in the list, marked "Following", and goes to that Journey: a Path
    you're on never invites you to start it again. One it has followed
    before, but isn't now, is marked "Completed" or "Abandoned" for its
    latest Journey and goes to its Trailhead, to start again (#172). A "Make Your Own Path" h3 ends
    it: "Not finding a Path that does quite what you need? Make your own
    Path", the last three words linking to Trailblazer.
  - **Trailhead** (`/app/products/:productId/paths/:pathId/trailhead`):
    the pre-start Journey page #137 drew, with the Path's name as the h1:
    the route with every outcome line on the left, the pitch and "Start
    Journey" on the right. A User's own Path shows its description as the
    pitch. If the Product has a Journey in progress on the Path, "{Product}
    is already following {Path}." and "View Journey" take Start Journey's
    place, on every version: a Product has at most one Journey in progress
    per Path (#172), so a newer version can't be started while one is (the
    server answers 409), and
    the line names the followed version, "(version 1)", when it isn't the
    one shown. The
    version stays in the background: the page shows the latest, and a
    `.link-quiet` "Looking for an older version?" (only when there's more
    than one) opens a `Dialog` listing every version, the one shown
    unlinked. The link adds `?versions` to the URL, so Back closes the
    Dialog. A `Dropdown` put an older version one click from Start
    Journey, too easy to reach. An earlier version's page says a newer one
    is available.
  - The Product page's section is "Journey List" (#172): a singular
    "Journey" was wrong with several, and "Journey(s)" or plural logic is
    worse. It shows only the active Journeys, as the Journeys page's
    `ActionCard`s (path icon, white card, "In Progress"), or "Looking for
    some structure? Follow a marked path to success." when there are none.
    Its button reads "View Journeys", or "Choose a Path" (to Pathfinder)
    when the Product has no Journeys at all.
  - A Path's editor is `/app/paths/:pathId/edit`, its crumb "Edit", so the
    Path's own URL is free for a page about the Path later.

- Deleting a Path is "Delete Path", a secondary button to the left of
  Save as New Version at the end of the Path's page. It opens a `Dialog`
  titled "Delete Path Permanently?" that says what goes ("This will remove
  "{Path name}" and everything associated with it, including history
  entries, tasks, worksheets, etc. This cannot be undone!"), then Cancel
  and "Delete Path", a primary button that deletes on one click. Deleting
  goes to the Paths list (decided in #171, in words, without a prototype;
  it replaced a Delete inside the Edit Path Dialog).
  - Why a Dialog, and not the usual reveal in place: the action reaches
    far past what the page shows. It removes the Path and much that isn't
    on screen, such as Tasks, Worksheets and history entries. A User has
    to be told that before confirming, and there's no room to say it
    where the button sits. The Dialog gives the explanation space of its
    own. Needing a confirmation doesn't call for a Dialog on its own: the
    reveal in place already gives one. A Dialog is for when the
    explanation doesn't fit beside the button.
  - The Dialog replaces the two-step reveal; it doesn't hold one. Opening
    it is the first click, and its heading and text are the confirming
    step. A reveal inside it only changed the button's color and said
    nothing new, so it read as broken rather than careful.

- Discarding a Draft's changes is "Discard Changes", a secondary button
  between Delete Path and Save as New Version, shown only once the Path has
  a saved version. It opens a `Dialog` titled "Discard your changes since
  Version {n}?" that says what comes back ("This will put "{Path name}"
  back the way Version {n} saved it: its name, description, Milestones and
  Tasks. This cannot be undone!"), then Cancel and "Discard Changes", a
  primary button. Afterwards the page shows the restored Draft with its
  first Milestone picked (decided in #179, in words, without a prototype).
  - Why a Dialog: the same reason as Delete Path's. What it throws away
    isn't all on screen (Milestones added since, edits to the Tasks of
    Milestones not picked), and it can't be undone.

- A Journey is In Progress, Completed or Abandoned (#172), and its page
  follows suit, in the right column and at the page's end, bottom right
  under the two columns:
  - **In Progress**: the column as before, and the page ends with
    "Abandon Journey", a secondary button, as the usual two-step reveal in
    place (Cancel, then a confirming "Abandon Journey"). Abandoning loses
    nothing, so there's nothing to explain and no `Dialog`. There's no
    Delete: a Journey in progress has to be abandoned first.
  - **Completed**: Return, then "Restart Journey" bottom right, the
    confirming position. The page ends with "Delete Journey".
  - **Abandoned**: "{Path} abandoned" as the h3, then "You stepped away
    from this Journey on {Milestone}. Resume it there, or restart the Path
    from the beginning.", the Worksheets, then a secondary "Restart
    Journey" and "Resume Journey" bottom right; no Advance or Return.
    Resume puts it back in progress where it was left; while another
    Journey on the Path is in progress the server refuses, and the page
    says why under the buttons: "{Product} already has an active Journey
    on the "{Path}" Path. A Product cannot have multiple simultaneous
    Journeys on the same Path. You can go to that active Journey screen
    and either continue that Journey or abandon it.", both "active
    Journey"s linking to that Journey. The page ends with "Delete
    Journey".
  - "Restart Journey" starts a new, blank Journey on the Path's latest
    version in one click and goes to it, asking nothing first, since
    nothing is lost.
  - "Delete Journey" opens a "Delete Journey Permanently?" `Dialog` the
    way Delete Path does (above), since the answers and checked Tasks it
    removes aren't on the page. Its text is "This will remove {Product}'s
    Journey on "{Path}" and everything in it, including Worksheet answers
    and checked Tasks. This cannot be undone!", and its "Delete Journey"
    deletes on one click, then goes to the Journeys list.
  - The Journeys page goes straight to "Active Journeys" (in progress)
    and "Inactive Journeys" (completed or abandoned), with no "Journeys"
    heading above them (see the Journeys page above); the Product page's
    Journey List shows only the active ones (above); Pathfinder marks a Path it isn't
    following but has followed with how its latest Journey ended (decided
    in #172, in words, without a prototype; Pause was dropped for
    Abandon).

- Why an action didn't go through (a refused save, start or resume) is a
  `role="alert"` paragraph right after the action's `.button-group`, with
  `--space-4` above it from `global.css`, so it reads as its own message
  rather than part of the button row. Covers every such message, not just
  the one it was noticed on (decided in #172).

- The UI says Path, not Journey (decided with Ian on 2026-10-14, #198).
  Buttons, headings and breadcrumbs name the Path: "Start on Path", "View
  Current Path Journey", "Resume Path", "Restart Path", "Abandon Path",
  "Active Paths", "Inactive Paths", "Find More Paths", "View Paths", and
  the Journey page is laid out like a Path's own page: the Path's name as
  the h1 (the Product's name is left to the breadcrumbs), and a
  "Milestones" h2 over the route, level with the current Milestone's h3.
  "Journey" stays only where
  something is about one particular Journey: "Mark Journey Complete",
  "Delete This Journey", the Delete dialog, and the last crumb. A Journey
  page's trail is Products › {Product} › Paths › {Path} › Current,
  Completed or Abandoned Journey, by its state, with Paths linking to the
  Product's Paths page and {Path} to its Trailhead; a Worksheet page in a
  Journey adds itself after that. Pathfinder sits under the Product's
  Paths too: its crumb and heading are "Browse Available Paths"
  (Products › {Product} › Paths › Browse Available Paths), and a
  Trailhead sits beside it under Paths (Products › {Product} › Paths ›
  {Path}), so a Journey is a page under its Path's Trailhead. The Pathfinder name is kept for the
  directory it grows into. URLs, code and `CONTEXT.md`'s terms are
  unchanged. The labels in earlier entries above predate this.

- A linked `ActionCard` (a Worksheet, a Path) shows it's clickable the
  way a button does: hover outlines the whole card with `.button:hover`'s
  outline, and its title underlines. Keyboard focus gets exactly the same,
  so hover and focus read as one state. A Task's card, a `<label>`, keeps
  outlining only its check box. Paths are a compass (Phosphor
  `CompassIcon`), on their cards and in `AppNav` (decided in #199, from a
  prototype on local branch `199-prototype-linked-card-hover` that
  compared outlining the icon, the caret or the card, underlining the
  title, nudging the caret and filling the icon, then combinations of the
  last three; filling the icon was built, then dropped as too much).

- A Guide's Publish, Unpublish, Open and Close controls live in the Path
  editor (`/app/paths/:pathId/edit`), not on the Trailhead (decided in
  #191, from a prototype on local branch `191-prototype-editor`: eight
  rounds, from four placements (a Versions section at the page's end, a
  status line plus a Dialog, one Publishing menu beside Edit Path, controls
  beside Save as New Version) down to the one below, then wording):
  - Under the h1 and above the description, two lines at `.text-sm`. The
    first is "Path Status: Open" or "Path Status: Closed", plain text, the
    word linking to the Trailhead (plain text until #205 gives the Path
    its page at `/app/paths/:pathId`). It is the Guide's alone. The second is
    the version being edited in bold, then, for a Guide only, a middle dot
    (hidden from screen readers) and a `.link-quiet` "Manage Versions". A
    plain User sees just the version: they can't publish, and can't go
    back to an earlier version, so nothing about publishing is shown to
    them.
  - The version is "Version {n}" while the page matches that saved version,
    and "Draft" after any edit, whether or not another version has exactly
    the same fields; saving a new version, or Discard Changes, turns it
    back into a version. A Path nothing is saved on yet is "Draft". For a
    Guide, " (unpublished)" follows a version that isn't published, and
    always follows "Draft". This reverses #169's "No Draft label".
  - "Manage Versions" opens a `Dialog` with a row for every saved version,
    newest first (`.list`): just "Version {n}", then its buttons at the
    row's end: Publish on an unpublished row, Copy Link and Unpublish on a
    published one. Done closes it. Unpublish confirms in place
    in the row, as every destructive action does: the row says "Users who
    already Added Version {n} keep it." (and, for the only published
    version, that unpublishing it closes this Path), with Cancel and
    Unpublish. Publish and Copy Link act on one click. Copy Link's own
    label turns to "Copied Link" for a moment, then back, as a `Button`
    state, so it keeps its width; there is no separate confirmation line.
  - Close This Path is a secondary button in Delete Path's place at the end
    of the page, so while a Path is open it can't be deleted. Once it is
    closed Delete Path returns, and Open This Path follows it, between
    Delete Path and Save as New Version. Open This Path appears only once a
    version is published. Publishing into a closed Path doesn't open it; the
    Guide is told it is still closed. Unpublishing the only published
    version closes the Path and tells the Guide with the Trailhead's notice
    (above the version line, in the notice style, which is not an error
    treatment).
  - There is no root-address copy button on the page. The Path Status link
    goes to the Trailhead, and Copy Link on a published version's row is
    the only copy control.
  - Copy Link copies the version's own address, the Trailhead's root
    with the version in the query: `/app/paths/:pathId?version={n}`.
  - The notice is #205's notice component, built here first since #191
    lands before #205: a small Phosphor `WarningCircleIcon`, a left accent
    bar, no box, the text in italics, each sentence its own paragraph with
    no space below the last. #205's Trailhead reuses it.
  - The description has a heading, "About This Path": an `h2` (it sits
    between the h1 and the "Milestones" h2) at `.text-h4`, a new type
    utility that gives a heading the `h4`'s look, its body face included.
    A plain `h2` is too big over a sentence or two.
- A Path's Trailhead (`/app/paths/:pathId`, and the same page for one
  published version) looks the same to everyone, its Guide included: the
  Path's name as the h1, a version line under it, then `.journey-split`
  with the Milestones on the left and everything else in the right column
  under the description. The Guide alone gets an **Edit Path** button at
  the h1's end (`.heading-row`); Publish, Open and Close live in the Path
  editor, not here. The version line is written by the page, not the
  Path: "Version 2 · Free" at `.text-sm` in the text's own colour, its
  parts split by middle dots hidden from screen readers, as the in-app
  `Footer` does; an older version adds "A newer version is available.",
  linking to the newest. **Add This Path**, for a User who hasn't Added
  another User's Path, arrives with #192. Once it can be followed, a native
  select of the User's Products sits beside **Start on Path** as a
  `.field-row`. "Looking for an older version?" under that opens a
  `Dialog` of the published versions, as before. Its trail is Paths ›
  {Path}, replacing the Product-scoped Trailhead trail above. Nothing
  warns ahead of a click: pressing Start on Path with no Product, or for
  a Product already on the Path, shows why after the button ("You don't
  have a Product yet, and a Journey needs one. [Add a Product] first."; or
  "{Product} is already on the {Path} Path." then "Would you like to [view
  your current Journey]? If you'd like to restart, you'll have to do it
  from within your current Journey."). There's no Restart on the
  Trailhead. A closed Path or an unpublished version shows "This Path
  ({Path}) is no longer available." These messages are #191's `Notice`
  (decided in #205, from a prototype on local branch
  `205-prototype-trailhead`: six rounds across six viewers, from three
  layouts (the right column as today, one action beside the h1 with the
  picker in a Dialog, a numbered checklist) down to round 1's first, then
  older versions as a Dialog or a popover, and the version line as small
  italics, body-size italics or small dotted text).

- Pathfinder is the page at `/app/paths`, no longer under a Product: one
  page listing every Available Path, reached from `AppNav` and from a
  Product's links to find a Path (decided in #192, from a prototype on
  local branch `192-prototype-added-copy`: eight rounds, from four
  layouts (one list with the version beside a copy's name, two sections,
  one row per Path with its versions inside, rows with Edit Path / View
  Path buttons) to the last one's cards, then icons, sections, spacing,
  where Dream Sequence goes and where the name shows). It replaces #170's
  per-Product Pathfinder and #198's "Browse Available Paths" crumb; a
  Product's own Journeys stay on its Journeys page.
  - `AppNav`'s section, the page's h1 and the crumbs above it say
    "Pathfinder", replacing #167's "Paths". The URL stays `/app/paths`,
    so a Path's Trailhead (`/app/paths/:pathId`) still sits under it.
  - Two sections, each an h2: "Your Original Paths" (the Paths the User
    made) and "Your Added Paths" (Dream Sequence first, then their Added
    copies). Dream Sequence needs no Add, but on this page it is grouped
    with the Paths someone else made.
  - Each card is a linked `ActionCard`: the compass, the Path's name in
    bold, and nothing else: no version, no Draft or saved state, nothing
    about who made it. The whole card links to the Path's Trailhead, an
    Original Path's too (its Trailhead has Edit Path). There are no
    buttons on the cards.
  - A User holding copies of several versions of one Path sees one card
    for it, not one per version. The Trailhead shows their copies.
  - Make New Path sits under the "Your Original Paths" cards, bottom left,
    not bottom right: it doesn't act on the cards above it. With no
    Original Paths, "No Paths yet." takes the cards' place.
  - Under "Your Added Paths", before the cards: "The paths listed below
    were made by other people. You can follow these paths, but you cannot
    make changes to them." Its "paths" stays lowercase: it's plain prose,
    and capitalized there it reads oddly. The heading and that line are
    the only signs a Path is read-only; the card looks the same as an
    Original Path's.
  - The page keeps the design system's spacing, `main > * + *`'s 1rem,
    with no extra room above the headings or after the cards. Rounds with
    2rem above them read as too much.
  - Picked over a pencil (yours) or padlock (read-only) icon, and a person
    or open book: the compass stays every Path's icon (#199).

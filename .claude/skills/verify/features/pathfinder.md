# Pathfinder and Adding a Path

Pathfinder (`/app/paths`) lists every Path the User can follow: "Your
Original Paths" (the ones they made, then Make New Path) and "Your Added
Paths" (Dream Sequence, then each Path they've Added, one card per Path).
Every card links to the Path's Trailhead (`/app/paths/<pathId>`). Another
User's open Path offers **Add This Path** there; Adding copies the version
shown to the User, and the Trailhead then shows their copy with the Product
picker and Start on Path (#192).

## Sub-features

- `pathfinder-sections`: the two h2 sections; "No Paths yet." with no
  Original Paths; the Added section's line "The paths listed below were
  made by other people…".
- `add-path`: Add This Path on another User's open, published version.
  After it, the same address shows Start on Path, and survives a reload.
- `added-journey`: a Journey on the copy starts, ticks Tasks, Advances and
  Returns like any other.
- `added-delete-refused`: the Guide's Delete Path (on a closed Path)
  answers "Someone has Added this Path, so it can't be deleted." in the
  Dialog.
- `old-pathfinder-redirect`: `/app/products/<id>/pathfinder` lands on
  `/app/paths`.

## How to get to it (user POV)

- `AppNav`'s "Pathfinder" link (at 1280px; below about 820px it's in the
  ☰ "Menu").
- A Product's "Choose a Path" (no Journeys yet) and the Product's Paths
  page's "Open Pathfinder".
- A Guide's shared Trailhead link, for Add.

## Driving it with chrome-devtools-axi

Preconditions: two Users. The Guide is `delivered+guide+e2e-test@resend.dev`
(the `local` env's `GUIDE_EMAILS`); the second is any `+e2e-test@` address.
Each sign-in is one OTP send: switch Users with `button 'Account'` then
`menuitem 'Log out'`, and keep to three sends a minute.

- **Guide's Path.** `chrome-devtools-axi resize 1280 800`, then
  `link 'Pathfinder'`, `button 'Make New Path'` (fill `Path name`,
  `Description`), `button 'Manage Milestones'` → `button 'Add Milestone'`
  (fill `Milestone name`, `Description`, `Done when`) → `button 'Update
  Path'`, `textbox 'Task title'` + `button 'Add Task'`, `button 'Save as
  New Version'`, `button 'Manage Versions'` → `button 'Publish'` →
  `button 'Done'`, `button 'Open This Path'`. "Path Status:" and "Open"
  are separate snapshot nodes; wait for `button "Close This Path"`.
- **Add.** As the second User, open `$BASE_URL/app/paths/<pathId>`,
  `button 'Add This Path'`, then wait for `Start on Path`.
- **Proof.** `paths` has a row with the second User's `"userId"` and
  `"addedFrom"` = the Guide's Path id; `path_versions` has a row under it
  with `"copiedFrom"` = the Guide's version id; its `milestones` ids start
  with the copy's version id and a colon (`migrations/0027`).

## Gotchas

- At the default ~780px width the nav is the ☰ "Menu"; resize first.
- A page loaded straight after a few navigations can come back empty with
  `net::ERR_INSUFFICIENT_RESOURCES` in `chrome-devtools-axi console`: the
  headless Chromium choking on Vite's dev modules, not the app. Reload once.
- A copy has no address: `/app/paths/<copy's own id>` sends the User to
  `/app`. Use the Guide's Path id.

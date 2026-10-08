# Journeys

Every Product can start one Journey through the seeded Path (Dream
Sequence), which has 7 Milestones from "Rough One-Pager" to "Growth". The
User advances, returns, and finishes. Each Milestone has Tasks to tick, and
the Product Summary Worksheet is filled in from the Journey. The Product home
shows "Current Milestone: <name> (n of 7)".

## Sub-features

- `journey-preview` lists 7 Milestones before the start, none current, with
  "Start by describing your solution.".
- `journey-start` uses Start Journey to make "Rough One-Pager" current
  (`aria-current="step"`). It survives a reload.
- `journey-advance` / `journey-return` use "Advance to Next Milestone" and
  "Return to Previous Milestone". Return is absent on Milestone 1.
- `journey-finish` is "Finish Journey" on Growth, which shows the heading
  "Dream Sequence complete". Return then un-finishes, and Growth stays
  current.
- `journey-tasks` ticks a Milestone Task checkbox, and it stays ticked after
  a reload.
- `journey-worksheet` is the `Product Summary Incomplete` link, which goes to
  `/worksheets/product-summary`. Fields are labelled `1. Problem`,
  `2. Customer`, and so on. "Save Product Summary" returns to the Journey,
  and the values are kept on later Milestones.
- `journey-home-line` shows the current Milestone line and a `View Journey`
  link on the Product home.

## How to get to it (user POV)

- The Product home, then `Learn More` (before the start) or `View Journey`
  (after), which goes to `/app/products/<id>/journey`.
- From a Worksheet page, back to the Journey after a save.

## Driving it with chrome-devtools-axi

Preconditions: signed in, with a Product opened.

- **Open.** `$S/act.sh click link 'Learn More'`. Then
  `eval "location.pathname"` ends in `/journey`. The snapshot has
  `list "Milestones"` with 7 `listitem`s.
- **Start.** `$S/act.sh click button 'Start Journey'`. Current is
  `eval "document.querySelector('[aria-current=step]').textContent"`, which
  contains "Rough One-Pager".
- **Advance and return.** `$S/act.sh click button 'Advance to Next Milestone'`
  makes "Real Talk" current. `$S/act.sh click button 'Return to Previous Milestone'`
  goes back.
- **Task.** `$S/act.sh click checkbox 'Complete the Product Summary'`.
  After a reload the snapshot still shows the checkbox as `checked`.
- **Worksheet.** `$S/act.sh click link 'Product Summary Incomplete'`,
  then `$S/act.sh fill textbox '1. Problem' "Kitchen scales are clunky"`,
  then `$S/act.sh click button 'Save Product Summary'`. The path ends
  in `/journey` again.
- **Proof.** Query `journeys`, `task_completions` and `worksheet_answers`
  with `db.sh`. Read `migrations/0007`, `0013` and `0017` for the columns.

## Gotchas

- This module is under active change (#151 repeatable Worksheets, #156 the
  Journey module). Re-read the Journey route before trusting a handle listed
  here, and update this file when one changes.
- Seeded copy (Milestone names, Task text) lives in the migrations. Change it
  in a migration, never in the map.
- Getting from Milestone 1 to Growth takes six advances. Wait for the
  current text after each one before clicking the next.

# Paths are versioned by explicit snapshot, and a Journey stays on the version it started on

A Path has a Draft that its maker edits freely. When they save a version, the
Draft is snapshotted: everything under the Path (name, description,
Milestones, Tasks) exactly as it stood. A saved version never changes, and a
Journey can only start on one. A Journey stays on the version it started on,
so what a User has checked off never changes under them. A newer version is a
new release: a Guide can't push it to existing Journeys as a free update, for
now. Saving a version is separate from publishing it to other Users.

## Considered Options

- **Every edit makes a version.** Noisy: a maker fixing a typo would spawn a
  version, and the list of versions stops meaning anything.
- **Edits change live Journeys.** Corrupts Journeys in flight, and breaks
  "Return is never destructive" when a Milestone a User is on is removed.
- **No edits once anyone has started.** Safe, but leaves a Guide unable to fix
  a typo in a Path they've sold.
- **Free updates for existing buyers.** Wanted eventually, but moving a
  Journey between versions means reconciling changed Milestones, Tasks and
  checked answers. Left out of v1 on purpose.

## Consequences

A Path's content is stored per version, not once. Existing buyers can be
left on an old version indefinitely. A buyer receives their own copy of the
version they bought, so deleting the Guide's original never reaches them.

# Paths are versioned, and a Journey stays on the version it started on

Once a User has bought and started a Path, the Guide may reword, reorder or
remove Milestones and Tasks. Every published change produces a new Path
version, and a Journey stays on the version it started on, so what the buyer
paid for, and what they have already checked off, never changes under them.
A new version is a new release: a Guide can't push it to existing Journeys as
a free update, for now.

## Considered Options

- **Edits change live Journeys.** Corrupts Journeys in flight, and breaks
  "Return is never destructive" when a Milestone a User is on is removed.
- **No edits once anyone has started.** Safe, but leaves a Guide unable to fix
  a typo in a Path they've sold.
- **Free updates for existing buyers.** Wanted eventually, but moving a
  Journey between versions means reconciling changed Milestones, Tasks and
  checked answers. Left out of v1 on purpose.

## Consequences

A Path's content is stored per version, not once. Existing buyers can be
left on an old version indefinitely.

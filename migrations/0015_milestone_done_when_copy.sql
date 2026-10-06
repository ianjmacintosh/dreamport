-- Issue #139: copy edits to the Dream Sequence Milestones' "done when"
-- lines — the Rough One-Pager's "…and you'll agree" becomes "…and you
-- agree", and every line ends with a full stop (only Solution
-- Matchmaking's did). Each update sets a fixed value, so it's safe to
-- re-run.

update "milestones" set "doneWhen" = 'Someone else can read it, say it in their own words, and you agree.' where "id" = 'rough-one-pager';
update "milestones" set "doneWhen" = 'The one-pager matches the reality your audience consistently describes.' where "id" = 'real-talk';
update "milestones" set "doneWhen" = 'Your audience can pay for the solution your one-pager shows they want.' where "id" = 'make-it-real';
update "milestones" set "doneWhen" = 'Your customers can independently use your product to solve their problem and are happy to keep paying.' where "id" = 'observe-and-refine';
update "milestones" set "doneWhen" = 'Customers stick around and at least 40% indicate in surveys they''d be very disappointed if they could not use the product anymore.' where "id" = 'open-enrollment';
update "milestones" set "doneWhen" = 'You find a channel that is economically viable, bringing in new customers that can be retained long enough to be profitable.' where "id" = 'growth';

-- Issue #140: the first standalone Tasks on Dream Sequence. Separate from
-- `0017` so this half is re-runnable: every insert skips a row that's
-- already there.
--
-- "Complete the Product Summary" is checked off by hand like the rest —
-- it isn't tied to the Product Summary Worksheet (#141, which would have
-- ticked it automatically, was cancelled as too surprising).
--
-- The `EVENT:` prefix is a title convention (#136): it marks a Task as a
-- stand-in for a scheduled Event, to be found and converted once real
-- scheduling ships. Nothing in the data reads it; the Journey page shows
-- it as an Event pill instead of the prefix.

insert into "tasks" ("id", "title") values
('complete-product-summary', 'Complete the Product Summary'),
('event-schedule-product-summary', 'EVENT: Schedule time to write the Product Summary (optional)'),
('talk-to-five-customers', 'Talk to 5 potential customers')
on conflict do nothing;

insert into "milestone_tasks" ("milestoneId", "taskId", "position") values
('rough-one-pager', 'complete-product-summary', 1),
('rough-one-pager', 'event-schedule-product-summary', 2),
('real-talk', 'talk-to-five-customers', 1)
on conflict do nothing;

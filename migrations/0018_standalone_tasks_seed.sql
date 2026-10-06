-- Issue #140: the first standalone Tasks on Dream Sequence. Separate from
-- `0017` so this half is re-runnable: every insert skips a row that's
-- already there.
--
-- The `EVENT:` prefix is a title convention only (#136): it marks a Task as
-- a stand-in for a scheduled Event, to be found and converted once real
-- scheduling ships. Nothing reads it.

insert into "tasks" ("id", "title") values
('event-write-product-summary', 'EVENT: Set aside 1 hour to write the Product Summary'),
('talk-to-five-customers', 'Talk to 5 potential customers')
on conflict do nothing;

insert into "milestone_tasks" ("milestoneId", "taskId", "position") values
('rough-one-pager', 'event-write-product-summary', 1),
('real-talk', 'talk-to-five-customers', 1)
on conflict do nothing;

-- Issue #139: the Rough One-Pager Worksheet, on Milestones 1-4 of Dream
-- Sequence (#133: the one-pager is checked again at the end of Milestones
-- 2-4; from Milestone 5 on, the product is the evidence). Separate from
-- `0013` so this half is re-runnable: every insert skips a row that's
-- already there.
--
-- Its fields are adapted from Ash Maurya's Lean Canvas (CC BY-SA 3.0):
-- seven of its nine boxes kept, with their prompts rewritten and some names
-- shortened, and key metrics and unfair advantage left out. The Copyright
-- page's "Changes" sentence (`src/routes/_withFooter/copyright.tsx`) says
-- exactly that, and CC BY-SA requires it to be accurate — adding, dropping
-- or rewording a field here means updating that sentence too.

insert into "worksheets" ("id", "name", "cardinality") values ('rough-one-pager', 'Rough One-Pager', 'singleton') on conflict do nothing;

insert into "worksheet_fields" ("worksheetId", "id", "position", "name", "prompt") values
('rough-one-pager', 'problem', 1, 'Problem', 'What problem does your product solve? Name the one to three that matter most.'),
('rough-one-pager', 'customer', 2, 'Customer', 'Who has this problem? Who would want it first?'),
('rough-one-pager', 'value-proposition', 3, 'Value Proposition', 'In one sentence, why would someone choose your product?'),
('rough-one-pager', 'solution', 4, 'Solution', 'How does your product solve the problem?'),
('rough-one-pager', 'channels', 5, 'Channels', 'How will your customers find out about it?'),
('rough-one-pager', 'revenue', 6, 'Revenue', 'How will it make money, and what will you charge?'),
('rough-one-pager', 'costs', 7, 'Costs', 'What will it cost to build and run?')
on conflict do nothing;

insert into "milestone_worksheets" ("milestoneId", "worksheetId") values
('rough-one-pager', 'rough-one-pager'),
('real-talk', 'rough-one-pager'),
('solution-matchmaking', 'rough-one-pager'),
('make-it-real', 'rough-one-pager')
on conflict do nothing;

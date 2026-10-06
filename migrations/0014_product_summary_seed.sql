-- Issue #139: the Product Summary Worksheet — the one-pager the Rough
-- One-Pager Milestone has you write — on Milestones 1-4 of Dream Sequence
-- (#133: it's checked again at the end of Milestones 2-4; from Milestone 5
-- on, the product is the evidence). Separate from `0013` so this half is
-- re-runnable: every insert skips a row that's already there.
--
-- Its fields are adapted from Ash Maurya's Lean Canvas (CC BY-SA 3.0):
-- eight of its nine boxes kept and reordered, with their prompts rewritten,
-- some renamed, and existing alternatives asked under Value Proposition
-- rather than Problem; key metrics is left out. The Copyright
-- page's "Changes" sentence (`src/routes/_withFooter/copyright.tsx`) says
-- exactly that, and CC BY-SA requires it to be accurate — adding, dropping
-- or rewording a field here means updating that sentence too.

insert into "worksheets" ("id", "name", "cardinality") values ('product-summary', 'Product Summary', 'singleton') on conflict do nothing;

insert into "worksheet_fields" ("worksheetId", "id", "position", "name", "prompt") values
('product-summary', 'problem', 1, 'Problem', 'What problem does your product solve? If it solves multiple problems, list the most important two or three.'),
('product-summary', 'customer', 2, 'Customer', 'Whose problem is it? Who is most eager to solve it?'),
('product-summary', 'solution', 3, 'Solution', 'How does your product solve the problem?'),
('product-summary', 'value-proposition', 4, 'Value Proposition', 'What are people doing instead of using your product? Why would they choose yours?'),
('product-summary', 'unfair-advantage', 5, 'Unfair Advantage', 'What does your product offer that others can''t easily copy?'),
('product-summary', 'channel', 6, 'Channel', 'How will your customers find your product?'),
('product-summary', 'pricing', 7, 'Pricing', 'How will the product make money, and how much will you charge?'),
('product-summary', 'costs', 8, 'Costs', 'How much will the product cost to build and run?')
on conflict do nothing;

insert into "milestone_worksheets" ("milestoneId", "worksheetId") values
('rough-one-pager', 'product-summary'),
('real-talk', 'product-summary'),
('solution-matchmaking', 'product-summary'),
('make-it-real', 'product-summary')
on conflict do nothing;

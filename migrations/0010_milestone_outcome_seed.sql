-- Issue #137: the seven Dream Sequence Milestones' outcome lines, for the
-- column `0009` adds. Separate from `0009` so this half is re-runnable:
-- every statement sets a fixed value, so a partial apply is fixed by
-- applying it again.

update "milestones" set "outcome" = 'Make a one-page summary of your understanding' where "id" = 'rough-one-pager';
update "milestones" set "outcome" = 'Learn from future customers by hearing their perspective' where "id" = 'real-talk';
update "milestones" set "outcome" = 'Show a prototype and find its value' where "id" = 'solution-matchmaking';
update "milestones" set "outcome" = 'Build the essential core of your product' where "id" = 'make-it-real';
update "milestones" set "outcome" = 'Hone your product to meet real user needs' where "id" = 'observe-and-refine';
update "milestones" set "outcome" = 'Watch real users and make your product essential' where "id" = 'open-enrollment';
update "milestones" set "outcome" = 'Find your growth path' where "id" = 'growth';

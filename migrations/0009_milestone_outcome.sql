-- Issue #137: each Milestone's outcome line — a few words shown under its
-- name on the Journey page's route, before you reach it (the full
-- description only shows once it's current).
--
-- Not null with an empty default only so the column can be added to
-- existing rows; every seeded Milestone gets its line just below.

alter table "milestones" add column "outcome" text not null default '';

update "milestones" set "outcome" = 'Make a one-page summary of your understanding' where "id" = 'rough-one-pager';
update "milestones" set "outcome" = 'Learn from future customers by hearing their perspective' where "id" = 'real-talk';
update "milestones" set "outcome" = 'Show a prototype and find its value' where "id" = 'solution-matchmaking';
update "milestones" set "outcome" = 'Build the essential core of your product' where "id" = 'make-it-real';
update "milestones" set "outcome" = 'Hone your product to meet real user needs' where "id" = 'observe-and-refine';
update "milestones" set "outcome" = 'Watch real users and make your product essential' where "id" = 'open-enrollment';
update "milestones" set "outcome" = 'Find your growth path' where "id" = 'growth';

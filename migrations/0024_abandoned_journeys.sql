-- Abandoning a Journey (issue #172): the User steps away from a Path
-- partway. `abandonedAt` is when; null while the Journey is in progress or
-- completed. A Journey is never both completed and abandoned: the Journey
-- module only abandons one in progress, and Advance and Return leave an
-- abandoned one alone. Abandoned Journeys keep their answers and checked
-- Tasks, and don't count as in progress, so the Path can be started again.
--
-- Not re-runnable (adds a column).

alter table "journeys" add column "abandonedAt" date;

-- Issue #138: a Journey's finished state. `finishedAt` stays `null` while a
-- Journey is in progress; advancing past the last Milestone (Growth) sets
-- it instead of moving `currentMilestoneId` further, since there's no
-- Milestone after it to become current (confirmed on #133: a finished
-- state, not staying on the last Milestone forever).

alter table "journeys" add column "finishedAt" date;

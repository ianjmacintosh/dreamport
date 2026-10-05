-- Issue #137: the one Path's name is "Dream Sequence", not "Starter Path".
--
-- Its own migration rather than an edit to 0007's seed, since databases
-- that already ran 0007 wouldn't pick up the edit. Re-runnable.

update "paths" set "name" = 'Dream Sequence' where "id" = 'starter';

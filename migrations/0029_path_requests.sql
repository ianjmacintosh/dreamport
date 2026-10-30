-- A User's Request for one version of a By Request Path (issue #215,
-- parent #213; ADR-0018).
--
-- A row exists only while its Request is pending. Approving it (the Guide
-- sets the Path to Everyone, #214) or Denying it (Close, Unpublish, #215)
-- deletes the row, so nothing about past Requests is kept. One row per
-- User, Path and version number: asking again changes nothing.
--
-- Both foreign keys cascade, as `products.userId` and `path_versions.pathId`
-- do: deleting the requester's account or the Path takes the row.
--
-- Re-runnable: nothing here changes an existing table.

create table if not exists "path_requests" (
  "userId" text not null references "user" ("id") on delete cascade,
  "pathId" text not null references "paths" ("id") on delete cascade,
  "number" integer not null,
  "createdAt" text not null,
  primary key ("userId", "pathId", "number")
);

create index if not exists "path_requests_pathId_idx" on "path_requests" ("pathId");

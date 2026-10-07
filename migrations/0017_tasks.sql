-- Tasks (issue #140, parent #133): things a Path's Milestones ask the User
-- to do, checked off per Product.
--
-- `tasks` and `milestone_tasks` are a fixed, Dreamport-curated catalog like
-- `worksheets`/`milestone_worksheets` in `0013` — seeded in `0018`, never
-- added by a route. Every Task here is standalone: a plain title the User
-- checks off by hand, with no Worksheet behind it (#141, a Worksheet-bound
-- kind, was cancelled — see `0018`). `milestone_tasks` is many-to-many, the
-- same attachment as Worksheets; `position` orders a Milestone's Tasks.
--
-- `task_completions` is one checked-off Task, scoped per (Product, Path) the
-- same way `journeys` and `worksheet_instances` are. An unchecked Task has
-- no row. Cascades off `products`; the Product's own `userId` is still the
-- ownership boundary, checked by the route.

create table "tasks" ("id" text not null primary key, "title" text not null);

create table "milestone_tasks" ("milestoneId" text not null references "milestones" ("id"), "taskId" text not null references "tasks" ("id"), "position" integer not null, primary key ("milestoneId", "taskId"), unique ("milestoneId", "position"));

create table "task_completions" ("productId" text not null references "products" ("id") on delete cascade, "pathId" text not null references "paths" ("id"), "taskId" text not null references "tasks" ("id"), "completedAt" date not null, primary key ("productId", "pathId", "taskId"));

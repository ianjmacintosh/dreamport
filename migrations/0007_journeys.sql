-- Journeys (issue #137, parent #133): a Product follows a Path through its
-- ordered Milestones.
--
-- `paths` and `milestones` are a fixed, Dreamport-curated catalog, seeded
-- here the same way `0006` seeds `tags` — no route adds one. Phase 1 ships
-- exactly one Path, the free starter Path based on Running Lean, with its
-- seven Milestones in Dreamport's own words (#133). `methodology` is a
-- free-text note on the Path, not a modeled entity. A Milestone's place in
-- its Path is `position` (1-based), unique per Path.
--
-- `journeys` is one Product following one Path: one row per (Product,
-- Path), so a second Path later keeps its own progress rather than
-- overwriting the first's. `currentMilestoneId` is the one current
-- Milestone — everything before it is done, everything after it future.
-- Cascades off `products` the same way `ideas` does in `0004`; no ownership
-- column of its own — the Product's own `userId` is the boundary, checked
-- by the route.

create table "paths" ("id" text not null primary key, "name" text not null, "methodology" text not null);

create table "milestones" ("id" text not null primary key, "pathId" text not null references "paths" ("id"), "position" integer not null, "name" text not null, "description" text not null, "doneWhen" text not null, unique ("pathId", "position"));

insert into "paths" ("id", "name", "methodology") values ('starter', 'Starter Path', 'Based on Running Lean');

insert into "milestones" ("id", "pathId", "position", "name", "description", "doneWhen") values
('rough-one-pager', 'starter', 1, 'Rough One-Pager', 'Define your product in plain terms, including how it makes money, and what''s your biggest bet. You''ll refine this later -- not with better writing, but with more knowledge.', 'Someone else can read it, say it in their own words, and you''ll agree'),
('real-talk', 'starter', 2, 'Real Talk', 'Talk with actual humans to learn what you know and what you didn''t. You''re here to listen to the unadulterated context of the problem, so whatever you do, don''t describe anything about your solution.', 'The one-pager matches the reality your audience consistently describes'),
('solution-matchmaking', 'starter', 3, 'Solution Matchmaking', 'Show a possible version or prototype of your solution. See what parts of it your audience wants and what they''re willing to pay.', 'Your one-pager focuses on the features that your audience want and includes a price your audience is interested in paying.'),
('make-it-real', 'starter', 4, 'Make It Real', 'Build the smallest functioning version of your product (think days or weeks, not months) that still delivers on your promise. It doesn''t need to be polished and running on its own, but you do need to be able to accept real payments and hold up your end of the deal for your new paying customers.', 'Your audience can pay for the solution your one-pager shows they want'),
('observe-and-refine', 'starter', 5, 'Observe & Refine', 'On-board a small group of paying users. Listen to what they say but pay closer attention to: how easy the product is for them to use, what features they need most, and how they act when it''s time to pay. Do not add new features -- refine the existing ones.', 'Your customers can independently use your product to solve their problem and are happy to keep paying'),
('open-enrollment', 'starter', 6, 'Open Enrollment', 'Allow some organic growth and watch if existing users refer friends without prompting. Measure their usage without your on-boarding. Ask how disappointed they would be if they could no longer use your product.', 'Customers stick around and at least 40% indicate in surveys they''d be very disappointed if they could not use the product anymore'),
('growth', 'starter', 7, 'Growth', 'Identify which customers get the most from your product and find more of them, testing and measuring costs for each channel (paid search, partnerships, etc) one at a time. If your product still requires manual steps, automate what you can. Ensure retention stays consistent.', 'You find a channel that is economically viable, bringing in new customers that can be retained long enough to be profitable');

create table "journeys" ("id" text not null primary key, "productId" text not null references "products" ("id") on delete cascade, "pathId" text not null references "paths" ("id"), "currentMilestoneId" text not null references "milestones" ("id"), "startedAt" date not null, unique ("productId", "pathId"));

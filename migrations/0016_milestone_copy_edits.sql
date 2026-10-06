-- Issue #139: copy edits to the Dream Sequence Milestones. The "done when"
-- lines that named the "one-pager" now name the Product Summary, its
-- official name; and grammar and punctuation fixes to the descriptions
-- (real dashes for "--", "onboard" unhyphenated, "etc."). Each update
-- sets a fixed value, so it's safe to re-run.

update "milestones" set "doneWhen" = 'The Product Summary matches the reality your audience consistently describes.' where "id" = 'real-talk';
update "milestones" set "doneWhen" = 'Your Product Summary focuses on the features that your audience wants and includes a price your audience is interested in paying.' where "id" = 'solution-matchmaking';
update "milestones" set "doneWhen" = 'Your audience can pay for the solution your Product Summary shows they want.' where "id" = 'make-it-real';

update "milestones" set "description" = 'Define your product in plain terms, including how it makes money, and what your biggest bet is. You''ll refine this later — not with better writing, but with more knowledge.' where "id" = 'rough-one-pager';
update "milestones" set "description" = 'Talk with actual humans to learn what you know and what you don''t. You''re here to listen to the unadulterated context of the problem, so whatever you do, don''t describe anything about your solution.' where "id" = 'real-talk';
update "milestones" set "description" = 'Build the smallest functioning version of your product (think days or weeks, not months) that still delivers on your promise. It doesn''t need to be polished and you can give it some manual help, but you do need to be able to accept real payments and hold up your end of the deal for your new paying customers.' where "id" = 'make-it-real';
update "milestones" set "description" = 'Onboard a small group of paying users. Listen to what they say, but pay closer attention to how easy the product is for them to use, what features they need most, and how they act when it''s time to pay. Do not add new features — refine the existing ones.' where "id" = 'observe-and-refine';
update "milestones" set "description" = 'Allow some organic growth and watch if existing users refer friends without prompting. Measure their usage without your onboarding. Ask how disappointed they would be if they could no longer use your product.' where "id" = 'open-enrollment';
update "milestones" set "description" = 'Identify which customers get the most from your product and find more of them, testing and measuring costs for each channel (paid search, partnerships, etc.) one at a time. If your product still requires manual steps, automate what you can. Ensure retention stays consistent.' where "id" = 'growth';

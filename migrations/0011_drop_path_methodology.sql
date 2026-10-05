-- Issue #137: drop `paths.methodology` ("Based on Running Lean"). The
-- Journey page no longer shows it, and the spec drops methodology wording,
-- so nothing reads it. One statement, so it applies all-or-nothing.

alter table "paths" drop column "methodology";

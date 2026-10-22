# Dreamport

Dreamport is a tool for capturing product ideas in a private space that can
grow, over time, to hold richer detail about each one. It exists so that a
person can keep their list somewhere better than a scratch note, without that
list being public.

## Language

**Product**:
A top-level entry in a User's Private space — something the User might build
or make (e.g. "a phone app that turns the phone into a digital scale").
Starts minimal (a line of text that used to live in a scratch note) and is
expected to accrue detail over time — a free-text description alongside its
name is the first piece of that detail. The list a User keeps is a list of
Products.
_Avoid_: item, entry, thing

**Idea**:
A specific approach to, or piece of detail about, a Product — one way it
might be realised or elaborated (e.g. for the digital-scale Product:
"estimate weight from the camera", "ship a Bluetooth scale add-on",
"partner with a phone maker", "a companion phone case"). A Product has many
Ideas.
_Avoid_: angle, option, note, sub-product

**Tag**:
A short label marking an Idea's theme (e.g. "hardware", "subscription"),
drawn from a fixed, Dreamport-curated set — not something a User creates
themselves yet. Shared across a User's whole Private space, not scoped to
one Product: the same Tag can mark Ideas under different Products, which is
the point (it's how a pattern across a User's own Ideas would show up). An
Idea can carry more than one Tag.
_Avoid_: label, category

**Question**:
A prompt from a fixed, Dreamport-curated library (e.g. "What's your
repository URL?", "When we do a great job with this, how do we make
someone's life better?") that a User can browse and choose to answer
against one of their own Ideas, to help sharpen what the Idea actually is.
Not user-authored yet — the library is fixed content Dreamport ships, not
something a User adds to. Distinct from Tag: a Tag marks a theme, a
Question prompts for detail.
_Avoid_: prompt (as a noun for this), field

**Answer**:
One Idea's response to a single Question — free text, at most one Answer
per Idea per Question. What actually appears as the Idea's own detail once
a Question has been answered.
_Avoid_: response, reply

**Path**:
A route a Product can follow from idea to a growing, profitable product,
made of ordered Milestones. Any User can make one in Trailblazer; it starts
private to the User who made it. A Guide can Publish its versions and
Open it, free or for a Purchase. Its Guide can delete it only while nobody
has Added it; after that they Close it instead, and every copy carries on.
Only Dreamport can destroy a Path someone has Added (spam, legal trouble,
harm), and that removes it everywhere, every copy and every Journey on them
included. Dream Sequence, based on Running Lean, is the free Path Dreamport
itself publishes, and it's always open.
_Avoid_: methodology, plan, program; "path screen" or "path page" (name
the page: the Journey page, Trailhead, Pathfinder or Trailblazer)

**Draft**:
The editable working state of a Path in Trailblazer, kept up to date as
the User who made it edits: there is no save step, so edits to a Draft are never
called "saved". Nothing can be followed from a Draft: a Journey starts
only on a Path version.
_Avoid_: working copy, unsaved version

**Discard Changes**:
Put a Path's Draft back the way its latest Path version saved it: its
name, description, Milestones and Tasks. Saved versions and the Journeys
on them don't change. A Path with no saved version has nothing to go back
to, so it can't. Not the same as **Return**, which moves a Journey back a
Milestone, or as deleting the Path.
_Avoid_: revert, reset, undo

**Path version**:
A snapshot of a Path made from its Draft when the User who made it uses
**Save as New Version**: the name, description, Milestones and Tasks exactly as they
stood. It never changes afterwards, and it needs a name, a description and
at least one Milestone. A Journey stays on the version it started on; a newer version is
a new release, never a free update to existing Journeys (for now). Every
version is seen on the Path's Trailhead.
_Avoid_: revision, edition, update; final, frozen, locked, released

**Trailhead**:
A Path's own page: its name, its version (and price), its pitch, and its
Milestones with their outcomes, then **Start on Path**, which asks which of
the User's Products the Journey is for and starts on the version shown. A
Product already on the Path is pointed to its Journey instead; restarting
happens from the Journey. It belongs to the Path, not to a Product. The Path
has one Trailhead, plus one for each published version, and it's the link a
Guide gives out. Everyone, its Guide included, sees the newest published
version (or the one they asked for); a Path never published, such as a
User's own, shows its latest saved version. Another User Adds it there, or
sees their own copy once they have; a closed Path or an unpublished version
shows "no longer available" to anyone without a copy, and a Path with nothing
published reads like one that doesn't exist. A copy has no page of
its own. Its Guide's way into Trailblazer is the only difference for them.
Dream Sequence's pitch is written by Dreamport; a User's own Path shows its
description in its place.
_Avoid_: intro, introduction, summary, landing page, version page

**Publish**:
Make a saved Path version available for other Users to Add, free or for a
Purchase, once the Path is open. Only a Guide can. Publishing is per
version: saving a version is not publishing it, so a Guide can save
unfinished versions while the Path stays open. The Path's Trailhead offers
its newest published version, and each published version has a Trailhead
of its own. Publishing never opens a closed Path.
_Avoid_: release, launch, go live, share (as a noun for this)

**Unpublish**:
Stop offering one published Path version to Users who haven't Added it.
Users who already Added it keep their copies, and their Journeys on them
carry on. If it was the newest, the Path's Trailhead falls back to the next
newest published version; if it was the only one, the Path closes. The
mirror of Publish.
_Avoid_: retract, withdraw, take down, hide

**Open**:
Let other Users Add a Path's published versions. Only its Guide can, and
only once at least one version is published. Every Path starts closed, and
stays closed until its Guide opens it; Dream Sequence is always open.
_Avoid_: publish (for this), launch, go live

**Close**:
Stop a whole Path accepting new Adds ("Close This Path"), like a trail
closed to new hikers while those already on it finish. Users who Added it
keep their copies, and their Journeys on them carry on; its Trailhead still
shows them their copy. Nothing reopens it but its Guide Opening it again.
The mirror of Open, and how a Guide retires a Path someone has Added.
_Avoid_: unpublish (for this), archive, retire, delete (for this)

**Add**:
Take your own copy of a published version of an open Path, from its
Trailhead, so it's one of your Available Paths. Like a bought book: the copy
is yours, it doesn't change when the Guide publishes a later version (no
later versions reach you, for now), and you can't change it either. Any
published version can be Added, and you can hold copies of several versions
of the same Path. Nobody starts a Journey on another User's Path without
Adding it first. Adding is free for a free Path; a Purchase Adds the
version it pays for.
_Avoid_: import, save, subscribe, install, clone, fork, follow (for this)

**Available Paths**:
Every Path a User can start a Journey on: Dream Sequence, their own Paths
that have a saved version, and the copies they've Added. Dream Sequence and
their own Paths need no Add. "Available" is the point: not every one of
them is the User's own work.
_Avoid_: my Paths, library, followable

**Trailblazer**:
The one tool in which any User makes and edits a Path. Making a Path for
yourself and following it on your own Product is **self-guiding**, and
needs nothing beyond an account. Milestones and Tasks are always called by
name; there is no umbrella word for the two together. The app's section for
Paths is called Pathfinder; Trailblazer names the adding and editing inside
it, not the section.
_Avoid_: editor, builder, path builder; asset or item (for Milestones and
Tasks together)

**Guide**:
A User with permission to share and sell Paths they made, so that other
Users can follow them. Becoming one is by invitation at first. Neither side
sees the other: a Guide sees none of the work of Users who've Added their
Path, and those Users see nothing about the Guide (no name, no email
address).
_Avoid_: coach, author, creator, instructor, seller, maker

**Admin**:
A User with permission to manage other Users' accounts (list, remove, change
an email address, change permissions) and, later, to see platform finances
such as monthly revenue and Guide payouts. Has nothing to do with making
Paths: that is Trailblazer's job, open to any User.
_Avoid_: system administrator, staff, superuser

**Pathfinder**:
The page listing a User's Available Paths, at `/app/paths`: the Paths they
made, then Dream Sequence and the copies they've Added. It grows later into
the bookstore, where a User finds Paths they don't have yet, with search,
filters and sorting; until then, a shared Path is found only through the
Trailhead link its Guide gives out.
_Avoid_: marketplace, catalog, store

**Purchase**:
A User paying, once, for a Path version that a Guide sells. Paying Adds
that version: the buyer gets their own read-only copy, with its Milestones
and Tasks, to follow as often as they like. Dreamport
takes a cut of each; a Guide pays nothing otherwise. The Guide sets the
price per Path version, and a new price applies only to later Purchases. A
Guide is paid out once the buyer's refund window has passed.
_Avoid_: subscription, order, enrollment

**Milestone**:
One ordered step on a Path (e.g. "Rough One-Pager", then "Real Talk"),
with a one-line description of what it asks, a "done when" line for
knowing it's finished, and a short outcome line — a few words on what it
gets you, shown under its name on the Journey page. Fixed content within
a Path version.
_Avoid_: stage, phase, step

**Journey**:
One Product's progress following one Path version — started by the User,
at its first Milestone. Strictly sequenced: exactly one current Milestone,
everything before it done, everything after it future. A Product can be on
several Paths at once (e.g. one for building the product, one for marketing
it) and can follow the same Path again, each time its own Journey with its
own Worksheet answers and checked Tasks, though only one of its Journeys on
a Path is in progress at a time. A Journey is **in progress**,
**completed** (Advanced past its last Milestone) or **abandoned** (see
Abandon); in progress is **active**, and completed or abandoned is
**inactive**. One the User simply stops working on stays in progress. A User
can **delete** a completed or abandoned Journey, which removes it and
everything in it for good, after a confirmation that says so; one in
progress has to be abandoned first. A Journey
always belongs to its Product — it's "Tarot's Journey," never a Journey
called "Tarot." Its page is just "the Journey," the same way the
Product's Ideas section is "Ideas."
_Avoid_: progress, roadmap, track; finished
(say completed); paused, stopped (say abandoned, or just in progress)

**Advance**:
Move a Journey's current Milestone forward by one, something the User
does whenever they're ready — not automatic, and not gated on anything
the User hasn't themselves judged done. Advancing past the last Milestone
completes the Journey instead of moving further — a completed state, not
staying on the last Milestone forever. The mirror of Return.
_Avoid_: progress, complete (as another name for Advance), next

**Return**:
Move a Journey's current Milestone backward by one — the mirror of
Advance, for a User who wants to revisit a Milestone they've already
passed (misread its "done when," did too little, or just wants another
look). Returning from a completed Journey puts it back in progress, on
its last Milestone. Never destructive: nothing is deleted, since a
Milestone is fixed content, not something a User's own work is attached
to.
_Avoid_: step back, go back, revert, undo, retreat

**Abandon**:
Step away from a Journey in progress, for a User getting off that Path
partway. Everything is kept — the Milestone they stopped on, Worksheet
answers, checked Tasks — and Advance and Return no longer move it until
the User resumes it, or restarts the Path instead. Not the same as
completed: an abandoned Journey was left partway. Abandoning comes before
deleting a Journey in progress. There's no pausing: a Journey the User
isn't working on just stays in progress (#172).
_Avoid_: pause, stop, quit, archive, cancel

**Resume**:
Put an abandoned Journey back in progress, on the Milestone the User left
it on, answers and checked Tasks as they were. The mirror of Abandon. Not
while another of the Product's Journeys on the Path is in progress, since
only one can be; the User abandons that one first.
_Avoid_: unabandon, continue, reopen

**Restart**:
Start a new Journey on the same Path for a Product whose Journey on it is
completed or abandoned, on the Path's latest version — the alternative to
Resume. The new Journey is blank,
on the Path's first Milestone, in progress. Never destructive: the earlier
Journey stays as it was, answers and checked Tasks included, until the User
deletes it.
_Avoid_: reset, start over, start from scratch

**Worksheet**:
A fixed (within a Path version) set of ordered fields, each asking one thing
in plain words (e.g. the "Product Summary": problem, customer, solution,
value proposition, unfair advantage, channel, pricing, costs), that a
Path's Milestones hold for the User to fill in about their Product. One
Worksheet can sit on several Milestones (the Product Summary is on
Milestones 1 to 4) — the
ones whose "done when" checks it — but its answers can be changed at any
point in the Journey. Each
filled-in copy is an instance. A **singleton** Worksheet has exactly one
instance per Journey, the same one on every Milestone it's on; a
**repeatable** Worksheet (e.g. one per customer interview) can be filled
in any number of times, each instance separate. Instances belong to their
Journey, so a new Journey starts fresh. Distinct from
Question: a Question is one prompt answered against an Idea; a Worksheet
is a whole set of fields filled in along a Journey.
_Avoid_: form, template, canvas, questionnaire

**Task**:
Something a Path's Milestone asks the User to do (e.g. "Talk to 5
potential customers"), fixed content within a Path version like a
Worksheet, and checked off per Journey. A **standalone** Task has
no Worksheet behind it, just a title: the User checks it off, and can
uncheck it, by hand. Checking one off is informational only — it
never gates Advance. A Task titled `EVENT: …` (e.g. "EVENT: Set aside 1
hour to write the Product Summary") is a stand-in for something to
schedule once Dreamport schedules things; the prefix is title text, not
a different kind of Task.
_Avoid_: to-do, checklist item, step, action item

**User**:
A person with an account and a Private space of their own Products.
Identified by an email address. Also the word for someone following a
Guide's Path: there is no separate "client" or "buyer" account.
_Avoid_: account, member, customer, client, buyer, follower

**Private space**:
The set of Products (and, later, their Ideas) belonging to one User, visible
only to that User — including from the Guide of any Path they follow. The reason Dreamport needs accounts at all rather than
being a public pastebin.
_Avoid_: workspace, vault, board

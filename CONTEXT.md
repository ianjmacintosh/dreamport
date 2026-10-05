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
A fixed, Dreamport-authored route a Product can follow from idea to a
growing, profitable product, made of ordered Milestones — not something a
User creates. Dreamport ships one Path for now: Dream Sequence, the free
Path every Journey starts on, based on Running Lean.
_Avoid_: methodology, plan, program

**Milestone**:
One ordered step on a Path (e.g. "Rough One-Pager", then "Real Talk"),
with a one-line description of what it asks, a "done when" line for
knowing it's finished, and a short outcome line — a few words on what it
gets you, shown under its name on the Journey page. Fixed content that
ships with its Path.
_Avoid_: stage, phase, step

**Journey**:
One Product's progress following one Path — started by the User, at the
Path's first Milestone. Strictly sequenced: exactly one current Milestone,
everything before it done, everything after it future. A Product has at
most one Journey per Path, so following a different Path later wouldn't
overwrite progress on the first. A Journey always belongs to its Product
— it's "Tarot's Journey," never a Journey called "Tarot." Its page is just
"the Journey," the same way the Product's Ideas section is "Ideas."
_Avoid_: progress, roadmap, track

**Advance**:
Move a Journey's current Milestone forward by one, something the User
does whenever they're ready — not automatic, and not gated on anything
the User hasn't themselves judged done. Advancing past the last Milestone
finishes the Journey instead of moving further — a finished state, not
staying on the last Milestone forever. The mirror of Return.
_Avoid_: progress, complete (as a verb for this), next

**Return**:
Move a Journey's current Milestone backward by one — the mirror of
Advance, for a User who wants to revisit a Milestone they've already
passed (misread its "done when," did too little, or just wants another
look). Returning from a finished Journey un-finishes it. Never
destructive: nothing is deleted, since a Milestone is fixed content, not
something a User's own work is attached to.
_Avoid_: step back, go back, revert, undo, retreat

**Worksheet**:
A fixed, Dreamport-authored set of ordered fields, each asking one thing
in plain words (e.g. the "Rough One-Pager": problem, customer, value
proposition, solution, channels, revenue, costs), that a Path's Milestones
hold for the User to fill in about their Product. One Worksheet can sit on
several Milestones (the Rough One-Pager is on Milestones 1 to 4), and its
answers can be changed only while the Journey is on one of them. Each
filled-in copy is an instance. A **singleton** Worksheet has exactly one
instance per Product per Path, the same one on every Milestone it's on; a
**repeatable** Worksheet (e.g. one per customer interview) can be filled
in any number of times, each instance separate. Instances belong to the
Journey's Path, so a different Path later starts fresh. Distinct from
Question: a Question is one prompt answered against an Idea; a Worksheet
is a whole set of fields filled in along a Journey.
_Avoid_: form, template, canvas, questionnaire

**User**:
A person with an account and a Private space of their own Products.
Identified by an email address.
_Avoid_: account, member, customer

**Private space**:
The set of Products (and, later, their Ideas) belonging to one User, visible
only to that User. The reason Dreamport needs accounts at all rather than
being a public pastebin.
_Avoid_: workspace, vault, board

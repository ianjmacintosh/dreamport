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
User creates. Dreamport ships one Path for
now: the free starter Path, based on Running Lean. A Path can carry a
free-text note on the methodology it's based on; the methodology itself
isn't modeled.
_Avoid_: methodology (as the entity), plan, program

**Milestone**:
One ordered step on a Path (e.g. "Rough One-Pager", then "Real Talk"),
with a one-line description of what it asks and a "done when" line for
knowing it's finished. Fixed content that ships with its Path.
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

**User**:
A person with an account and a Private space of their own Products.
Identified by an email address.
_Avoid_: account, member, customer

**Private space**:
The set of Products (and, later, their Ideas) belonging to one User, visible
only to that User. The reason Dreamport needs accounts at all rather than
being a public pastebin.
_Avoid_: workspace, vault, board

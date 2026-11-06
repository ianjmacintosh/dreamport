# Copy guide

How Dreamport writes text that users read: buttons, notices, dialogs and labels. Read this before writing or changing product copy. Decisions about what the product does belong in [`design-decisions.md`](design-decisions.md) or the planning page, not here.

## Tone

- **Plain and complete.** Say what happens, what the user gets, and what they don't get. A user should understand a line the first time they read it, without a second line to explain it.
- **Explain, don't summarise.** "All sales are final" is a rule. Say what it means for the user: "All sales are final. No refunds."
- **One idea per sentence.** Put the price, the access and the exclusions in separate sentences, so each is easy to find.
- **No fragments as labels for facts.** "$8.00 · All sales are final" leaves the reader to work out what each part is.
- **Say what's not included.** When something is limited, name the limit in the same place the user is deciding.
- **Use the terms from [CONTEXT.md](../CONTEXT.md).** Path, Version, Add, Request, Purchase and Access mean what CONTEXT.md says. Don't use them loosely.
- **Avoid words that can be read two ways.** "Unlimited" can imply more than we mean. Say what is included, not how much.

## Paid Paths

The model, for writers: a Path is like a book. Once a User has bought a version, they can read it as often as they like, on any Product they like. Versions are bought separately, so a new version is not included in an earlier purchase.

Approved wording for buying a version (draft, pending review on the PR):

> Users pay $8.00 for access to this version of the Path. They may use this Path as many times, on as many Products, as they want. Updates and newer versions are not included, and all sales are final. No refunds.

Notes on the wording:

- The price comes first, and says what it buys.
- "Access to this version" names the limit in the same sentence that gives the price, so a User can't read it as covering future versions.
- "Not included" and "No refunds" are separate sentences, so each one can be found on its own.

## Checklist before merging copy

- [ ] Each sentence says one thing.
- [ ] Every limit is stated where the user makes the decision.
- [ ] Terms match CONTEXT.md.
- [ ] No fragment labels that need the reader to decode them.

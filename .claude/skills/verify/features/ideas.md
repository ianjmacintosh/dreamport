# Ideas

A Product home lists that Product's Ideas. A User can add an Idea, with
Tags or without, rename it in edit mode (or cancel), change its Tags, and
delete it after a confirm step.

## Sub-features

- `ideas-add` adds a named Idea, which appears in `list "Ideas"`, and
  the field clears.
- `ideas-add-tagged` checks Tags in the "Tags: …" menu before adding. The
  pills show in `list "Tags"`.
- `ideas-rename` uses Edit to show a `Rename` field, then Save shows the
  new name. Cancel keeps the old one.
- `ideas-retag` uses Edit to toggle `menuitemcheckbox` Tags, then Save.
- `ideas-delete` uses Delete, which turns into a confirm Delete or Cancel.
- `ideas-overflow` shows "Show N more tags" on desktop and every pill at
  375px.

## How to get to it (user POV)

- `/app`, then the Product's link, which opens the Product home with the
  `Idea name` field.
- `Back to <Product>` from that Product's Journey or Worksheet pages.

## Driving it with chrome-devtools-axi

Preconditions: signed in, with a Product created and opened (`products.md`).

- **Add.** `$S/act.sh fill textbox 'Idea name' "Bluetooth sync"`, then
  `$S/act.sh click button 'Add Idea'`, then `$S/wait.sh "Bluetooth sync"`.
  The `Idea name` textbox is empty.
- **Tag.** Before adding, click the `Tags: …` button (find it in the
  snapshot, since its name starts with `Tags:`), then
  `$S/act.sh click menuitemcheckbox '<Tag>'` and press `Escape`.
- **Rename.** `$S/act.sh click button 'Edit'`, then
  `$S/act.sh fill textbox 'Rename' "BLE sync"`, then
  `$S/act.sh click button 'Save'`.
- **Delete.** Click `Delete` twice, looking up a fresh ref each time.
- **Proof.** `db.sh 'SELECT i.name, t.name tag FROM ideas i LEFT JOIN idea_tags it ON it."ideaId"=i.id LEFT JOIN tags t ON t.id=it."tagId"'`.
  Check the column names in `migrations/0006_idea_tags.sql` first.

## Gotchas

- The same "first match" trap as Products: Edit and Delete repeat on every
  row.
- Editing one row must not shift other rows' layout (#102). Run
  `resize 1280 800` and `resize 375 812` when the change touches row markup.
- The Tag names come from the seeded `tags` table. Read them with
  `db.sh 'SELECT name FROM tags'`. Don't guess them.

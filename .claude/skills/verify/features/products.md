# Products

A signed-in User's `/app` lists their Products. They can add one by name,
open its home page, set or clear a description, and delete it after a
confirm step. A User never sees another User's Products.

## Sub-features

- `products-add` adds a named Product, which then appears as a link in the
  list.
- `products-open` opens `/app/products/<id>`, with the Product name as the
  heading.
- `products-describe` uses "Edit Description" to set a description and
  Save it. Saving an empty field clears it ("No description yet.").
- `products-delete` uses Delete, which turns into a confirm Delete or
  Cancel, and removes the row.

## How to get to it (user POV)

- Sign in, which lands on `/app` (Products).
- The `Products` link in AppNav from any `/app/...` page.
- `Back to <Product>` / `Back to Products` links on inner pages.

## Driving it with chrome-devtools-axi

Preconditions: signed in on `/app`.

- **Add.** `$S/act.sh fill textbox 'Product name' "Verify scale app"`,
  then `$S/act.sh click button 'Add Product'`, then
  `$S/wait.sh "Verify scale app"`. Result: a `link "Verify scale app"` to
  `/app/products/<uuid>`, and the textbox is empty again.
- **Persist.** `eval "location.reload()"`, then `$S/wait.sh "Verify scale app"`.
- **Open.** `$S/act.sh click link 'Verify scale app'`. Result:
  `heading "Verify scale app"`, plus `link "Learn More"` (Journey).
- **Describe.** `$S/act.sh click button 'Edit Description'`, then
  `$S/act.sh fill textbox 'Description' "Weighs flour"`, then
  `$S/act.sh click button 'Save'`. The text shows and the textbox is
  gone.
- **Delete.** On `/app`: `$S/act.sh click button 'Delete'`. Cancel
  and Delete now appear in that row. Click the fresh `Delete` again. The
  link is gone.
- **Proof.** `$S/db.sh 'SELECT name, description FROM products'`.
  `scripts/smoke.sh` runs Add, Persist and Delete end to end with this proof.

## Gotchas

- With more than one Product, every row has a `button "Delete"`, and
  `act.sh` acts on the first row's. To get a specific row, read
  `chrome-devtools-axi snapshot` and take the `Delete` uid listed after
  that row's link.
- Delete keeps the pending row for a minimum duration (#89), so wait for the
  text to vanish instead of asserting right away.
- Products columns are camelCase: `"userId"`, `"createdAt"`.

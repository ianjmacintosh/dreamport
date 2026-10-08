# Account

AppNav's account menu (the trigger is the signed-in email) holds Settings and
Log out. Settings offers Delete Account, which emails a deletion link.
Following that link deletes the User and the session.

## Sub-features

- `account-menu` opens a `menu` from `button "<email>"`. Escape closes it
  and returns focus to the trigger.
- `account-signout` uses "Log out" to land on `/`. A later `/app` visit
  bounces to `/login`.
- `account-settings` uses "Settings" to go to `/app/settings`, which has
  `Back to Products`.
- `account-delete` uses Delete Account, then "Email Me a Deletion Link"
  ("Check your email"). Opening the link lands on `/`, and the User is gone.
- `account-info-pages`: while signed in, `/privacy`, `/terms` and
  `/copyright` show AppNav and the in-app footer. Log out there falls back to
  the signed-out header.

## How to get to it (user POV)

- The account button in AppNav on any `/app/...` page or info page.

## Driving it with chrome-devtools-axi

Preconditions: signed in. Delete account destroys the User, so do it last,
or with a second address such as `delivered+verify-delete+e2e-test@resend.dev`.

- **Menu.** `$S/act.sh click button 'delivered+verify+e2e-test@resend.dev'`.
  The snapshot has `menu` with `menuitem "Settings"` and `menuitem "Log out"`.
- **Sign out.** `$S/act.sh click menuitem 'Log out'` lands on
  `location.pathname` `"/"`. Then `open "$BASE_URL/app"` ends up on `/login`.
- **Delete.** Go to Settings through the menu, then
  `$S/act.sh click button 'Delete Account'`, then
  `$S/act.sh click button 'Email Me a Deletion Link'`, then
  `$S/wait.sh "Check your email"`. Read the link with
  `curl -s "$BASE_URL/api/test/last-delete-link?email=delivered%2Bverify-delete%2Be2e-test%40resend.dev"`
  (JSON `{url}`), then `chrome-devtools-axi open "<url>"` in the same
  signed-in browser.
- **Proof.** `db.sh "SELECT count(*) n FROM user WHERE email='delivered+verify-delete+e2e-test@resend.dev'"`
  returns 0.

## Gotchas

- The delete link must be opened in the same signed-in browser. Opening it
  with curl or without a session returns 404.
- `/api/test/last-delete-link` is a mock-mode test hook, and reading it is
  the only exception to the real-user-path rule. It stands in for opening
  the email.
- The Delete-user endpoint has its own per-IP limit (3 per 60s).

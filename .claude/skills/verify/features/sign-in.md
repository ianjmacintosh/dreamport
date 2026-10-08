# Sign in

A visitor enters an email address and passes Turnstile. They then type the
six-digit code from their email and land on `/app`. Signed-in visitors who
open `/login` go straight to `/app`.

## Sub-features

- `signin-send` sends a code after Turnstile solves.
- `signin-verify` accepts the right code. The sixth digit auto-submits, and
  the user lands on `/app`.
- `signin-wrong-code` shows an error above the code field and clears the
  digit boxes.
- `signin-request-new` uses "Request a new code" to return to a blank
  email step.
- `signin-redirect` sends a signed-in visit to `/login` straight to `/app`.

## How to get to it (user POV)

- The `Log In` link in the homepage header (`banner`).
- The `Log in` / `Log In` links in the marketing footer (`contentinfo`).
- Going to `/login` directly, or to any `/app/...` URL while signed out,
  which bounces to `/login`.

## Driving it with chrome-devtools-axi

Preconditions: baseline. Use an address that carries `+e2e-test@`, so the
code is `000000`.

- **Open.** `chrome-devtools-axi open "$BASE_URL/"`, then
  `$S/act.sh click link 'Log In'`. This is the
  header link, which is the first match. Result: `heading "Sign in"`.
- **Turnstile.** `$S/wait.sh "Success!"`. The text appears inside the
  Turnstile iframe once it solves. Send only after it.
- **Send.** `$S/act.sh fill textbox 'Email address' "delivered+verify+e2e-test@resend.dev"`,
  then `$S/act.sh click button 'Send Code'`. Result:
  `StaticText "We sent a six-digit code to "`, plus
  `textbox "Six-digit code"` (focused) and `textbox "Digit 2 of 6"` through
  `"Digit 6 of 6"`.
- **Verify.** `chrome-devtools-axi type 000000`. Then
  `eval "location.pathname"` returns `"/app"`, and the snapshot has a
  `button "<email>"` (the account menu trigger) and `heading "Products"`.
- **Wrong code.** Run `type 111111` on the code step. An error appears above
  the code field and the digit boxes are empty.
- **Proof.** `db.sh "SELECT email FROM user"` returns the address, and
  `db.sh "SELECT count(*) n FROM session"` returns at least 1.

## Gotchas

- `fill` on the code box doesn't spread digits across the boxes the way
  Playwright does. Use `type 000000` with the first box focused.
- Per-IP send limit: 3 per 60s. The browser has no `cf-connecting-ip`, so
  a fourth send in a minute returns 429, and that's expected. Restart the
  instance with `down.sh` then `up.sh` to reset it.
- An address without `+e2e-test@` gets a random code that is never logged
  (#41). To use one you'd have to read the `verification` table, which
  stores the code hashed. Use the marker.
- "Log In" appears three times on the page. `act.sh` takes the header's,
  which comes first.

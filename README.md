# Alpha Centauri

This project is designed as a starting point for Vite projects hosted on Cloudflare. This is a template project that uses:

- TypeScript
- React
- Vite (with Cloudflare plugin)
- Vitest
- Playwright
- ESLint
- Prettier
- GitHub Actions
- Wrangler

## Quick Start

Your quick start steps will be split up logically by platform concern:

- GitHub
- Cloudflare
- More GitHub setup
- Application code

## Quick Start: GitHub

1. Create a new repository

- Pick a name
- Start with a template: `alpha-centauri`
- Do not include all branches

2. Grant repository permission to the Cloudflare's GitHub extension

- Go to user settings
- Extensions
- Cloudflare Workers and Pages
- Repository access > Only select repositories > Pick your new repo
- Save

3. Block PR's from random people

- In your repo: Settings
- Features > Pull requests > Pull request permissions "Creation allowed by: Collaborators only"

## Quick Start: Cloudflare

1. Create a new Cloudflare "Workers & Pages" Application ([details](#create-a-new-cloudflare-application))
2. Hook up to your custom domain ([details](#hook-up-your-custom-domain))
3. Optional: If you bought a domain for this, point WWW to apex ([details](#point-www-to-apex))
4. Disable web analytics ([details](#disable-web-analytics))
5. Point HTTP to HTTPS ([details](#point-http-to-https))
6. Create preview environments for PR's ([details](#create-preview-environments))

### Create a New Cloudflare Application

In the Cloudflare web UI:

- Build > Compute > Workers & Pages
- Create Application
- Continue with GitHub
- Select your repository you just created
- Set up your application
  - Ensure "Builds for non-production branches" is checked
  - Advanced: Create new build API token
- Ensure the app loads

### Hook up your custom domain

In your new application's "Domains" tab:

- Under "Custom Domains and Routes", click "+ Add Domain"
- Add your domain

### Point WWW to apex

This step is optional and only makes sense if you bought a domain name.

### Disable web analytics

Follow the instructions in [my article](https://www.ianjmacintosh.com/articles/disabling-cloudflare-web-analytics/).

If you are running in a subdomain on a domain where this has already been done, you don't need to do it again.

### Point HTTP to HTTPS

Write something. Anything. Read it when using it. Edit these instructions to make them better before moving onto the next step.

### Create Preview Environments

Write something. Anything. Read it when using it. Edit these instructions to make them better before moving onto the next step.

### Set Default Merge Strategy to "Squash & Merge"

You'll have to do this manually when you merge your first PR, but there may be a GitHub config file?

## Quick Start: Application Code

1. Prepare to work in a dev container; probably following instructions from [my article](https://www.ianjmacintosh.com/articles/make-a-dev-container/).
2. npm install
3. Set up local env vars — see [Local development setup](#local-development-setup)
4. Run `claude` and authenticate
5. Finish setting up Matt Pocock's skills

- In Claude CLI, run: `/setup-matt-pocock-skills`

3. Find all `text-alpha-centauri` and replace with your application name
4. Update `src/index.html` metadata/OpenGraph data with better shareables
5. Add analytics using Simple Analytics
6. Open a Pull Request and ensure tests pass
7. Merge your change (set default merge strategy to "Squash & Merge")

8. Get to "Hello World" deployed; Cloudflare setup, GitHub setup, CI, dev container
9. Style guide created
10. ~~Pick fonts: 1 heading font, 1 body text font~~ Elms Sans (heading), Nunito (body)
11. ~~Pick color scheme relying on one of the main four brands~~ Solarized Light (Ethan Schoonover)
12. Define primitive design elements like buttons, links, headings
13. If a motif arises, use it

## Development

### Local development setup

One-time, after cloning:

```bash
npm install
cp .dev.vars.example .dev.vars
cp .env.example .env
```

`.env` holds Vite build-time values (currently just `VITE_TURNSTILE_SITE_KEY`,
defaulted to Cloudflare's always-pass test key). It's gitignored; deployed
environments set their own build variables instead (see
[`docs/deployment.md`](docs/deployment.md)).

Then generate a real signing secret and put it in `.dev.vars` as
`BETTER_AUTH_SECRET`:

```bash
openssl rand -base64 32
```

`.dev.vars` is gitignored. `BETTER_AUTH_SECRET` signs Better Auth's session
cookies and one-time-code tokens; `createAuth()` throws if it's unset, so
`npm run dev` won't serve auth routes without it. The value is local-only and
disposable — regenerate it anytime (existing local sessions just stop
validating). Nothing enforces a length, but treat it like a key: 32 random
bytes, not a word.

Sign-in email uses the `mock` sender by default (codes are written to the dev
server console), so no Resend key is needed for local work. `staging` and
`production` set `BETTER_AUTH_SECRET` with `wrangler secret put` instead — see
[`docs/deployment.md`](docs/deployment.md).

The session cookie is always `Secure`, so reach the dev server at
`http://localhost:<port>` (browsers treat `localhost` as a secure context and
still store the cookie). A bare LAN IP or a non-`localhost` forwarded hostname
over plain HTTP won't hold the session — use `localhost` or an HTTPS tunnel.

### Start a dev server

```bash
npm run dev
```

### Build the app

```bash
npm run build
```

## Deployment

See [`docs/deployment.md`](docs/deployment.md) for the full picture:
environments, the three Cloudflare D1 databases, and the migration procedure.

- **Preview:** production and staging are two separate Workers Builds
  projects (`dreamport`, `dreamport-staging`) Git-connected to this repo.
  Every branch builds under `dreamport-staging` with
  `CLOUDFLARE_ENV=staging` and uploads as a preview version, so preview
  testing hits `dreamport-stage`, never production data.
- **Production:** merges to `main` build under the `dreamport` project with
  `CLOUDFLARE_ENV=production` and deploy. The environment is set at build
  time; `--env` on deploy does nothing (see the doc).
- **First-time D1 setup:** run [`scripts/setup-d1.sh`](scripts/setup-d1.sh)
  (needs `wrangler login` and Cloudflare account access).
- **Troubleshooting a broken environment:** run `npm run verify:production`,
  or for staging — which has no long-lived host, so which preview to test is
  never guessed — `npm run verify:staging -- <preview-url>` with the version's
  preview URL, or `npm run verify:staging -- --latest` to explicitly test
  whatever the newest version on the Worker happens to be (printed up front,
  since it may not be the version your most recent push produced). It checks
  version bindings, the workers.dev/preview trigger, migrations, secrets, and
  does a live sign-in request, reporting all five in one pass instead of
  discovering them one at a time. Needs `CLOUDFLARE_API_TOKEN` set. Note: the
  live check is a real write (a mock
  OTP record) against whichever environment's D1 database you point it at,
  including production — `EMAIL_MODE` is `mock` everywhere today, so nothing
  is actually sent.

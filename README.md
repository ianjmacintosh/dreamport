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
3. Run `claude` and authenticate
4. Finish setting up Matt Pocock's skills

- In Claude CLI, run: `/setup-matt-pocock-skills`

3. Find all `text-alpha-centauri` and replace with your application name
4. Update `src/index.html` metadata/OpenGraph data with better shareables
5. Add analytics using Simple Analytics
6. Open a Pull Request and ensure tests pass
7. Merge your change (set default merge strategy to "Squash & Merge")

8. Get to "Hello World" deployed; Cloudflare setup, GitHub setup, CI, dev container
9. Style guide created
10. ~~Pick fonts: 1 heading font, 1 body text font~~ Elms Sans (heading + body)
11. Pick color scheme relying on one of the main four brands
12. Define primitive design elements like buttons, links, headings
13. If a motif arises, use it

## Development

### Start a dev server

```bash
npm run dev
```

### Build the app

```bash
npm run build
```

## Deployment

### Deploying to Preview Environments

This project was intended to work with GitHub and Cloudflare to deploy each branch associated with a pull request to `main` to a new preview environment

### Deploying to Production

This project was intended to work with GitHub and Cloudflare to deploy all changes merged to `main` to production

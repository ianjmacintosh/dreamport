/// <reference types="vite/client" />

interface ImportMetaEnv {
  /**
   * Cloudflare Turnstile **site** key (public — it ships in the client
   * bundle). Per environment: the committed `.env` defaults it to
   * Cloudflare's always-pass test key; production and staging set the real
   * key as a Workers Builds build-time variable (see docs/deployment.md).
   */
  readonly VITE_TURNSTILE_SITE_KEY: string;
  /**
   * Which Workers Builds environment this bundle was built for — `production`
   * or `staging` set by that project's fixed Build command,
   * `CLOUDFLARE_ENV=local npm run dev` otherwise. `null` in any build that
   * never ran through `vite.config.ts`'s `define` block (e.g. the Seam 1
   * vitest-pool-workers project) — see
   * `src/worker/trusted-origins.ts#hostsForEnvironment`, which treats that the
   * same as `local`. Not `WorkerEnv` — this is a build-time constant, not a
   * runtime binding (see docs/deployment.md, docs/adr/0011).
   */
  readonly CLOUDFLARE_ENV: string | null;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

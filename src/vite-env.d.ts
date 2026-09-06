/// <reference types="vite/client" />

interface ImportMetaEnv {
  /**
   * Cloudflare Turnstile **site** key (public — it ships in the client
   * bundle). Per environment: the committed `.env` defaults it to
   * Cloudflare's always-pass test key; production and staging set the real
   * key as a Workers Builds build-time variable (see docs/deployment.md).
   */
  readonly VITE_TURNSTILE_SITE_KEY: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

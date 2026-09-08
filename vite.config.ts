import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { cloudflare } from "@cloudflare/vite-plugin";
import { tanstackRouter } from "@tanstack/router-plugin/vite";

/**
 * Public Cloudflare Turnstile SITE keys, one per `CLOUDFLARE_ENV`. Safe to
 * commit: the production key is scoped to `ianjmacintosh.com` (and already
 * appears in docs/deployment.md); staging and local use Cloudflare's
 * always-pass test key. This map is the source of truth for the key baked
 * into the client bundle — it replaces the Cloudflare dashboard "Build
 * variable" that kept getting dropped (see docs/deployment.md, "Build step").
 */
const TURNSTILE_SITE_KEY_BY_ENV: Record<string, string> = {
  production: "0x4AAAAAAEqY4wvljJsO_dJb",
  staging: "1x00000000000000000000AA",
  local: "1x00000000000000000000AA",
};

/**
 * The Turnstile site key to bake into this build. An explicit
 * `VITE_TURNSTILE_SITE_KEY` in the environment wins (the CI e2e workflow sets
 * one); then the per-`CLOUDFLARE_ENV` map; then the local default. Never
 * returns empty — an unrecognised `CLOUDFLARE_ENV` still yields the harmless
 * test key rather than shipping `undefined` and a widget that can't render.
 */
export function resolveTurnstileSiteKey(
  env: Record<string, string | undefined>,
): string {
  return (
    env.VITE_TURNSTILE_SITE_KEY ||
    TURNSTILE_SITE_KEY_BY_ENV[env.CLOUDFLARE_ENV ?? "local"] ||
    TURNSTILE_SITE_KEY_BY_ENV.local
  );
}

// https://vite.dev/config/
export default defineConfig({
  // Bake the resolved Turnstile site key in at build time, so nothing has to
  // be set in the Cloudflare dashboard — each Workers Builds project's Build
  // command only carries `CLOUDFLARE_ENV` (see docs/deployment.md).
  define: {
    "import.meta.env.VITE_TURNSTILE_SITE_KEY": JSON.stringify(
      resolveTurnstileSiteKey(process.env),
    ),
  },
  plugins: [
    tanstackRouter({ target: "react", autoCodeSplitting: true }),
    react(),
    cloudflare(),
  ],
});

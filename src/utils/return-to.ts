const BASE = "https://dreamport.invalid";

/**
 * Where `/login` sends the User once they're signed in (#205): the page
 * they tried to open signed out, from `?redirect=`. Only a path on this
 * site. It's parsed as a browser would, so `//host`, `/\host` and the
 * same with a tab or newline inside (browsers strip those) all read as
 * another site and are dropped.
 */
export function parseReturnTo(value: unknown): string | undefined {
  if (typeof value !== "string" || !value.startsWith("/")) {
    return undefined;
  }
  const url = new URL(value, BASE);
  return url.origin === BASE ? url.pathname + url.search + url.hash : undefined;
}

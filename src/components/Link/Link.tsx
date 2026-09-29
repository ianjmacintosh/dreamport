import type { AnchorHTMLAttributes, Ref } from "react";
import { createLink } from "@tanstack/react-router";

interface LinkProps extends AnchorHTMLAttributes<HTMLAnchorElement> {
  href: string;
  external?: boolean;
  /** Whether this link is the page the User is on (`aria-current="page"`).
   * Left out, the router decides: it marks the link current on `href` and
   * on every page under it. `true`/`false` override that — e.g. a nav
   * section that spans pages outside its own `href`, or a link that's
   * never a "you are here" item, like the wordmark (#125). Internal links
   * only. */
  current?: boolean;
}

/**
 * The `<a>` the router renders into — `createLink` hands it the router's
 * resolved props (href, handlers, and its own `aria-current`), so an
 * explicit `current` can replace the router's `aria-current` here, which
 * passing `aria-current` to the router's own `Link` can't do (it always
 * wins).
 */
function Anchor({
  current,
  ref,
  ...props
}: AnchorHTMLAttributes<HTMLAnchorElement> & {
  current?: boolean;
  ref?: Ref<HTMLAnchorElement>;
}) {
  const ariaCurrent =
    current === undefined
      ? props["aria-current"]
      : current
        ? "page"
        : undefined;
  return <a ref={ref} {...props} aria-current={ariaCurrent} />;
}

const RouterLink = createLink(Anchor);

export function Link({
  external = false,
  href,
  current,
  children,
  ...rest
}: LinkProps) {
  if (external) {
    return (
      <a href={href} target="_blank" rel="noreferrer noopener" {...rest}>
        {children}
      </a>
    );
  }

  return (
    <RouterLink to={href} current={current} {...rest}>
      {children}
    </RouterLink>
  );
}

export default Link;

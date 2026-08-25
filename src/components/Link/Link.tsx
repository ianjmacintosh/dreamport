import type { AnchorHTMLAttributes } from "react";
import { Link as RouterLink } from "@tanstack/react-router";

interface LinkProps extends AnchorHTMLAttributes<HTMLAnchorElement> {
  href: string;
  external?: boolean;
}

export function Link({ external = false, href, children, ...rest }: LinkProps) {
  if (external) {
    return (
      <a href={href} target="_blank" rel="noreferrer noopener" {...rest}>
        {children}
      </a>
    );
  }

  return (
    <RouterLink to={href} {...rest}>
      {children}
    </RouterLink>
  );
}

export default Link;

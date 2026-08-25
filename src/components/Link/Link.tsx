import type { AnchorHTMLAttributes } from "react";

interface LinkProps extends AnchorHTMLAttributes<HTMLAnchorElement> {
  external?: boolean;
}

export function Link({ external = false, children, ...rest }: LinkProps) {
  const externalProps = external
    ? { target: "_blank", rel: "noreferrer noopener" }
    : {};
  return (
    <a {...externalProps} {...rest}>
      {children}
    </a>
  );
}

export default Link;

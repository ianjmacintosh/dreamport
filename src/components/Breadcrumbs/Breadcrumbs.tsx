import { useRef } from "react";
import { CaretRightIcon } from "@phosphor-icons/react";

import Link from "../Link";
import { useBreadcrumbsFit } from "./fitBreadcrumbs";

export interface Crumb {
  label: string;
  href: string;
}

interface BreadcrumbsProps {
  /** Ancestor pages, root first. Always links. At least one: a top-level
   * page has no trail, since its one crumb would just repeat its h1. */
  trail: [Crumb, ...Crumb[]];
  /** The page you're on: unlinked, `aria-current="page"`. */
  current: string;
}

function crumbClass(shrinks: boolean) {
  return shrinks
    ? "breadcrumbs-crumb breadcrumbs-crumb--shrinks"
    : "breadcrumbs-crumb";
}

/**
 * Where the page sits under its section, on one line that never wraps
 * (#109): `Products › Tarot › Journey`. Ancestors shorten with "…" before
 * the current page does (see `fitBreadcrumbs`); separators never shorten.
 * No `title` tooltips: a shortened name is still whole in the accessible
 * text, and one tap away on its own page.
 *
 * Ancestors pass `current={false}`: every one is a prefix of this page's
 * URL, so the router would otherwise mark each as the current page.
 */
export function Breadcrumbs({ trail, current }: BreadcrumbsProps) {
  const boxRef = useRef<HTMLElement>(null);
  const fit = useBreadcrumbsFit(boxRef, [
    ...trail.map(({ label }) => label),
    current,
  ]);
  return (
    <nav ref={boxRef} aria-label="Breadcrumb" className="breadcrumbs">
      <ol className="breadcrumbs-list">
        {trail.map(({ label, href }, i) => (
          <li
            key={href}
            className={crumbClass(fit.ancestorShrinks[i] ?? false)}
          >
            <Link className="breadcrumbs-label" href={href} current={false}>
              {label}
            </Link>
            <CaretRightIcon aria-hidden className="breadcrumbs-separator" />
          </li>
        ))}
        <li className={crumbClass(fit.currentShrinks)}>
          <span className="breadcrumbs-label" aria-current="page">
            {current}
          </span>
        </li>
      </ol>
    </nav>
  );
}

export default Breadcrumbs;

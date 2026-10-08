import { useRef } from "react";
import { createPortal } from "react-dom";
import { CaretLeftIcon, CaretRightIcon } from "@phosphor-icons/react";

import Link from "../Link";
import { useBreadcrumbsFit } from "./fitBreadcrumbs";
import { useBreadcrumbsPrototype } from "../PrototypeSwitcher/breadcrumbsPrototype";

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
 * Below 640px the whole trail gives way to one link up to the parent
 * page (`‹ Back to Journey`): a phone has no room for the trail without
 * shortening every name in it.
 *
 * Ancestors pass `current={false}`: every one is a prefix of this page's
 * URL, so the router would otherwise mark each as the current page.
 */
export function Breadcrumbs({ trail, current }: BreadcrumbsProps) {
  const parent = trail[trail.length - 1];
  const { variant, bandSlot } = useBreadcrumbsPrototype();
  const boxRef = useRef<HTMLElement>(null);
  const fit = useBreadcrumbsFit(boxRef, [
    ...trail.map(({ label }) => label),
    current,
  ]);
  const nav = (
    <nav
      ref={boxRef}
      aria-label="Breadcrumb"
      className={`breadcrumbs proto-crumbs--${variant}`}
    >
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
      <Link className="breadcrumbs-up" href={parent.href} current={false}>
        <CaretLeftIcon aria-hidden />
        <span className="breadcrumbs-label">Back to {parent.label}</span>
      </Link>
    </nav>
  );
  if (variant === "B" && bandSlot) {
    return createPortal(
      <div className="proto-band">
        <div className="proto-band-inner">{nav}</div>
      </div>,
      bandSlot,
    );
  }
  return nav;
}

export default Breadcrumbs;

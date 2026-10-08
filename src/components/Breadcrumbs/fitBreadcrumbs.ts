import { useLayoutEffect, useState, type RefObject } from "react";

interface AncestorWidth {
  /** The label's natural width, untruncated. */
  label: number;
  /** Everything else in the crumb: its separator and the gap before it. */
  chrome: number;
}

interface FitInput {
  /** The width the trail has to fit in. */
  available: number;
  /** The gap between neighbouring crumbs. */
  gap: number;
  /** The ancestor crumbs, root first. */
  ancestors: AncestorWidth[];
  /** The current page's natural label width. */
  current: number;
  /** The narrowest a shortened ancestor's label may get. */
  minLabel: number;
}

export interface BreadcrumbsFit {
  /** Per ancestor, root first: whether it may shorten with "…". */
  ancestorShrinks: boolean[];
  /** Whether the current page may shorten with "…". */
  currentShrinks: boolean;
}

/**
 * Which crumbs may shorten to keep the trail on one line (#109). An
 * ancestor may whenever its name is wider than `minLabel`: flexbox only
 * shortens it if the line overflows, and never below `minLabel`, so a
 * name already narrower than that is never padded out to it. The current
 * page may only once the trail can't fit even with every ancestor at its
 * narrowest.
 */
export function fitBreadcrumbs({
  available,
  gap,
  ancestors,
  current,
  minLabel,
}: FitInput): BreadcrumbsFit {
  const narrowest =
    ancestors.reduce(
      (sum, { label, chrome }) => sum + chrome + Math.min(label, minLabel),
      0,
    ) +
    gap * ancestors.length +
    current;
  return {
    ancestorShrinks: ancestors.map(({ label }) => label > minLabel),
    currentShrinks: narrowest > available,
  };
}

const NOTHING_SHRINKS: BreadcrumbsFit = {
  ancestorShrinks: [],
  currentShrinks: false,
};

/**
 * `fitBreadcrumbs` against the real layout. `boxRef` is the `<nav>`; each
 * `.breadcrumbs-crumb` in it holds a `.breadcrumbs-label`, whose
 * `scrollWidth` is its full width even while shortened. The narrowest an
 * ancestor's label may get comes from the nav's `--breadcrumbs-min-label`,
 * so CSS and this measure agree. Refits when the box resizes, when the
 * labels change, and once web fonts finish loading (that changes the
 * labels' widths without resizing the box).
 */
export function useBreadcrumbsFit(
  boxRef: RefObject<HTMLElement | null>,
  labels: string[],
): BreadcrumbsFit {
  const [fit, setFit] = useState(NOTHING_SHRINKS);
  const labelsKey = labels.join("\n");
  useLayoutEffect(() => {
    const box = boxRef.current;
    if (!box) {
      return;
    }
    function refit() {
      if (!box) {
        return;
      }
      const crumbs = [
        ...box.querySelectorAll<HTMLElement>(".breadcrumbs-crumb"),
      ].map((crumb) => {
        const label = crumb.querySelector<HTMLElement>(".breadcrumbs-label");
        const labelBox = label?.getBoundingClientRect().width ?? 0;
        return {
          label: label?.scrollWidth ?? 0,
          chrome: crumb.getBoundingClientRect().width - labelBox,
        };
      });
      const current = crumbs.pop();
      const list = box.querySelector(".breadcrumbs-list");
      const style = getComputedStyle(box);
      setFit(
        fitBreadcrumbs({
          available: box.clientWidth,
          gap: list ? parseFloat(getComputedStyle(list).columnGap) || 0 : 0,
          ancestors: crumbs,
          current: current?.label ?? 0,
          minLabel:
            parseFloat(style.getPropertyValue("--breadcrumbs-min-label")) || 0,
        }),
      );
    }
    refit();
    let cancelled = false;
    void document.fonts.ready.then(() => {
      if (!cancelled) {
        refit();
      }
    });
    const observer = new ResizeObserver(refit);
    observer.observe(box);
    return () => {
      cancelled = true;
      observer.disconnect();
    };
  }, [boxRef, labelsKey]);
  return fit;
}

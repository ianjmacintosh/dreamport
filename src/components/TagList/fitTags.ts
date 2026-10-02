import { useLayoutEffect, useState, type RefObject } from "react";

interface FitInput {
  /** The width the Tags have to fit in. */
  available: number;
  /** Each Tag pill's natural width, in display order. */
  widths: number[];
  /** The gap between neighbouring pills. */
  gap: number;
  /** The "+N" more pill's width. */
  moreWidth: number;
}

/**
 * How many Tags, from the start, fit on one line of `available` width (#113).
 * If they all fit, all of them. If not, as many as fit with room left for
 * the "+N" more pill after them — but never fewer than one, since a lone
 * Tag too wide for the box still shows, cut off with "…" by CSS.
 */
export function countTagsThatFit({
  available,
  widths,
  gap,
  moreWidth,
}: FitInput): number {
  const total =
    widths.reduce((sum, w) => sum + w, 0) +
    gap * Math.max(0, widths.length - 1);
  if (total <= available) {
    return widths.length;
  }
  let used = moreWidth;
  let count = 0;
  for (const width of widths) {
    if (used + gap + width > available) {
      break;
    }
    used += gap + width;
    count++;
  }
  return Math.max(1, count);
}

/**
 * `countTagsThatFit` against the real layout: `boxRef` is the one-line box
 * the pills sit in, `measureRef` an invisible copy of every pill at its
 * natural width, followed last by a sample more pill. Re-counts when the
 * box resizes, when the Tags change, and once web fonts finish loading
 * (that changes the pills' widths without resizing the box).
 */
export function useTagsThatFit(
  boxRef: RefObject<HTMLElement | null>,
  measureRef: RefObject<HTMLElement | null>,
  tags: string[],
): number {
  const [count, setCount] = useState(tags.length);
  const tagsKey = tags.join("\n");
  useLayoutEffect(() => {
    const box = boxRef.current;
    const measure = measureRef.current;
    if (!box || !measure) {
      return;
    }
    function fit() {
      if (!box || !measure) {
        return;
      }
      const pills = [...measure.children].map(
        (child) => child.getBoundingClientRect().width,
      );
      const moreWidth = pills.pop() ?? 0;
      setCount(
        countTagsThatFit({
          available: box.clientWidth,
          widths: pills,
          gap: parseFloat(getComputedStyle(measure).columnGap) || 0,
          moreWidth,
        }),
      );
    }
    fit();
    let cancelled = false;
    void document.fonts.ready.then(() => {
      if (!cancelled) {
        fit();
      }
    });
    const observer = new ResizeObserver(fit);
    observer.observe(box);
    return () => {
      cancelled = true;
      observer.disconnect();
    };
  }, [boxRef, measureRef, tagsKey]);
  return Math.min(count, tags.length);
}

import { useRef, type ReactNode } from "react";

import { useTagsThatFit } from "./fitTags";

interface FittedTagsProps {
  /** Tag names, in the order to show them. */
  tags: string[];
  /** The "+N" more pill for the `hidden` Tags that didn't fit — a button in
   * `TagList`, plain text inside `TagPicker`'s trigger (already a button). */
  more: (hidden: number) => ReactNode;
  /** `"list"` renders a real `<ul>` named by `aria-label`; `"inline"`
   * renders `<span>`s, for inside a button, where a list isn't allowed. */
  as: "list" | "inline";
  "aria-label"?: string;
  /** An extra class on the box, e.g. `TagList`'s phone-width override. */
  className?: string;
}

/**
 * One line of Tag pills that never wraps (#113): as many as fit the box's
 * width, then a "+N" more pill. Shared by `TagList` and `TagPicker` so
 * both fit the same way. The pills that don't fit stay rendered but hidden
 * (`.tag--overflow`), so a caller's CSS can show them again (as `TagList`
 * does at phone width). Widths come from an invisible copy of every pill.
 */
export function FittedTags({
  tags,
  more,
  as,
  "aria-label": ariaLabel,
  className,
}: FittedTagsProps) {
  const boxRef = useRef<HTMLDivElement>(null);
  const measureRef = useRef<HTMLSpanElement>(null);
  const count = useTagsThatFit(boxRef, measureRef, tags);
  const hidden = tags.length - count;
  const Row = as === "list" ? "ul" : "span";
  const Pill = as === "list" ? "li" : "span";
  return (
    <div
      ref={boxRef}
      className={["fitted-tags", className].filter(Boolean).join(" ")}
    >
      <Row className="fitted-tags-row" aria-label={ariaLabel}>
        {tags.map((tag, i) => (
          <Pill
            key={tag}
            className={i < count ? "tag" : "tag tag--overflow"}
            title={tag}
          >
            {tag}
          </Pill>
        ))}
      </Row>
      {hidden > 0 && <span className="fitted-tags-more">{more(hidden)}</span>}
      <span ref={measureRef} className="fitted-tags-measure" aria-hidden="true">
        {tags.map((tag) => (
          <span key={tag} className="tag">
            {tag}
          </span>
        ))}
        {/* Sized for the widest count it could ever show. */}
        <span className="tag-more">+{tags.length}</span>
      </span>
    </div>
  );
}

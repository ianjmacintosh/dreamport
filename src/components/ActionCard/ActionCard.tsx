import type { ReactNode } from "react";
import { CaretRightIcon } from "@phosphor-icons/react";

import Link from "../Link";

interface ActionCardProps {
  /** A 1.5rem slot before the title: a `Checkbox`, or an icon. */
  leading: ReactNode;
  children: ReactNode;
  /** After the title, at the card's end: a Tag, or `ActionCard.Status`. */
  trailing?: ReactNode;
  /** Makes the card a link to `href`, with a caret at its end. */
  href?: string;
  /** Mutes the title, for something already done. */
  done?: boolean;
}

/**
 * One thing to do, as a full-width row on the sheet's white (#140) — the
 * whole card is the click target. Two shapes: with `href`, a link (e.g. a
 * Worksheet to fill in); without, a `<label>` wrapping its `leading`
 * `Checkbox` (e.g. a Task to tick). Hovering a label card outlines its
 * check box. Below 640px `trailing` drops under the title. List several
 * in a `<ul className="action-card-list">`.
 */
export function ActionCard({
  leading,
  children,
  trailing,
  href,
  done = false,
}: ActionCardProps) {
  const content = (
    <>
      <span className="action-card-leading">{leading}</span>
      <span className="action-card-title">{children}</span>
      {trailing && <span className="action-card-trailing">{trailing}</span>}
    </>
  );
  if (href) {
    return (
      <Link href={href} className="action-card" data-done={done || undefined}>
        {content}
        <CaretRightIcon
          weight="bold"
          aria-hidden="true"
          className="action-card-caret"
        />
      </Link>
    );
  }
  return (
    <label className="action-card" data-done={done || undefined}>
      {content}
    </label>
  );
}

/** Right-aligned italic status text for `trailing` (e.g. "Incomplete"). */
function Status({ children }: { children: ReactNode }) {
  return <span className="action-card-status">{children}</span>;
}

ActionCard.Status = Status;

export default ActionCard;

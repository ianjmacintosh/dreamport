import type { ReactNode } from "react";
import { CaretRightIcon, type Icon } from "@phosphor-icons/react";

import Link from "../Link";

interface SharedProps {
  children: ReactNode;
  /** After the title, at the card's end: a Tag, or `ActionCard.Status`. */
  trailing?: ReactNode;
  /** Mutes the title, for something already done. */
  done?: boolean;
}

interface LinkCardProps extends SharedProps {
  /** Makes the card a link to `href`, with a caret at its end. */
  href: string;
  /** The Phosphor icon before the title, bold, filled on hover (#199). */
  icon: Icon;
  leading?: never;
}

interface LabelCardProps extends SharedProps {
  href?: undefined;
  /** A 1.5rem slot before the title, for a `Checkbox`. */
  leading: ReactNode;
  icon?: never;
}

type ActionCardProps = LinkCardProps | LabelCardProps;

/**
 * One thing to do, as a full-width row on the sheet's white (#140) — the
 * whole card is the click target. Two shapes: with `href`, a link (e.g. a
 * Worksheet to fill in) led by its `icon`; without, a `<label>` wrapping
 * its `leading` `Checkbox` (e.g. a Task to tick). Hovering or focusing a
 * link card outlines it and fills its icon (#199); hovering a label card
 * outlines its check box. Below 640px `trailing` drops under the title.
 * List several in a `<ul className="action-card-list">`.
 */
export function ActionCard(props: ActionCardProps) {
  const { children, trailing, done = false } = props;
  const rest = (
    <>
      <span className="action-card-title">{children}</span>
      {trailing && <span className="action-card-trailing">{trailing}</span>}
    </>
  );
  if (props.href !== undefined) {
    const LeadingIcon = props.icon;
    return (
      <Link
        href={props.href}
        className="action-card"
        data-done={done || undefined}
      >
        <span className="action-card-leading">
          <LeadingIcon
            weight="bold"
            aria-hidden="true"
            className="action-card-icon-bold"
          />
          <LeadingIcon
            weight="fill"
            aria-hidden="true"
            className="action-card-icon-fill"
          />
        </span>
        {rest}
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
      <span className="action-card-leading">{props.leading}</span>
      {rest}
    </label>
  );
}

/** Right-aligned italic status text for `trailing` (e.g. "Incomplete"). */
function Status({ children }: { children: ReactNode }) {
  return <span className="action-card-status">{children}</span>;
}

ActionCard.Status = Status;

export default ActionCard;

import type { InputHTMLAttributes } from "react";
import { CheckIcon } from "@phosphor-icons/react";

type CheckboxProps = Omit<InputHTMLAttributes<HTMLInputElement>, "type">;

/**
 * A check box (#140): a real `<input type="checkbox">`, restyled to 1.5rem
 * with a bold check when ticked. No label of its own — wrap it in one
 * (e.g. an `ActionCard`'s), so the whole label is the click target. Hover
 * gets the same outline as `.button:hover`.
 */
export function Checkbox({ className, ...rest }: CheckboxProps) {
  const classes = ["checkbox", className].filter(Boolean).join(" ");
  return (
    <span className={classes}>
      <input type="checkbox" {...rest} />
      <CheckIcon weight="bold" aria-hidden="true" className="checkbox-mark" />
    </span>
  );
}

export default Checkbox;

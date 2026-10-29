import type { InputHTMLAttributes } from "react";

type RadioProps = Omit<InputHTMLAttributes<HTMLInputElement>, "type">;

/**
 * One choice of several (#214): a real `<input type="radio">`, restyled to
 * `Checkbox`'s 1.5rem, round, with an accent dot when picked. Give each
 * radio in a set the same `name`. No label of its own — wrap it in one,
 * with the choice's name after it, so the whole label is the click target.
 * Hover gets the same outline as `.button:hover`.
 */
export function Radio({ className, ...rest }: RadioProps) {
  const classes = ["radio", className].filter(Boolean).join(" ");
  return (
    <span className={classes}>
      <input type="radio" {...rest} />
    </span>
  );
}

export default Radio;

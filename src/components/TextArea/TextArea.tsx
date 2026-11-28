import type { TextareaHTMLAttributes } from "react";

type TextAreaProps = Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, "id"> & {
  id: string;
  helperText?: string;
  /** Ruled lines like notebook paper, for a Worksheet's answers (#139).
   * Without it, a box like `TextInput`'s. */
  lined?: boolean;
} & (
    | { label: string; labelledBy?: never }
    | {
        /** The id of a visible element already naming the field, such as
         * the heading of the section it edits. The field draws no label
         * of its own and takes its name from that element. */
        labelledBy: string;
        label?: never;
      }
  );

/**
 * A multi-line field with `TextInput`'s label and helper text, the helper
 * between the label and the field and tied to it with `aria-describedby`.
 * Named by its own `label`, or by `labelledBy` when a visible heading
 * already names it. A box like `TextInput`'s by default; `lined` draws a Worksheet's ruled
 * lines instead (#139, #167).
 */
export function TextArea({
  id,
  label,
  labelledBy,
  helperText,
  lined = false,
  rows = 3,
  className,
  ...rest
}: TextAreaProps) {
  const classes = [
    lined ? "textarea textarea--lined" : "input textarea",
    className,
  ]
    .filter(Boolean)
    .join(" ");
  const helperId = `${id}-helper`;
  return (
    <div className="input-group">
      {label !== undefined && (
        <label className="input-label" htmlFor={id}>
          {label}
        </label>
      )}
      {helperText && (
        <p id={helperId} className="input-helper">
          {helperText}
        </p>
      )}
      <textarea
        id={id}
        className={classes}
        rows={rows}
        aria-labelledby={labelledBy}
        aria-describedby={helperText ? helperId : undefined}
        {...rest}
      />
    </div>
  );
}

export default TextArea;

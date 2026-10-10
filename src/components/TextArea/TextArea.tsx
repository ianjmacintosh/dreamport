import type { TextareaHTMLAttributes } from "react";

interface TextAreaProps extends Omit<
  TextareaHTMLAttributes<HTMLTextAreaElement>,
  "id"
> {
  id: string;
  label: string;
  helperText?: string;
  /** Ruled lines like notebook paper, for a Worksheet's answers (#139).
   * Without it, a box like `TextInput`'s. */
  lined?: boolean;
}

/**
 * A multi-line field with `TextInput`'s label and helper text, the helper
 * between the label and the field and tied to it with `aria-describedby`.
 * A box like `TextInput`'s by default; `lined` draws a Worksheet's ruled
 * lines instead (#139, #167).
 */
export function TextArea({
  id,
  label,
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
      <label className="input-label" htmlFor={id}>
        {label}
      </label>
      {helperText && (
        <p id={helperId} className="input-helper">
          {helperText}
        </p>
      )}
      <textarea
        id={id}
        className={classes}
        rows={rows}
        aria-describedby={helperText ? helperId : undefined}
        {...rest}
      />
    </div>
  );
}

export default TextArea;

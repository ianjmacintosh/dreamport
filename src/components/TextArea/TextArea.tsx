import type { TextareaHTMLAttributes } from "react";

interface TextAreaProps extends Omit<
  TextareaHTMLAttributes<HTMLTextAreaElement>,
  "id"
> {
  id: string;
  label: string;
  helperText?: string;
}

/**
 * A multi-line answer on ruled lines (`.textarea`, #139), with
 * `TextInput`'s label and helper text — the helper between the label and
 * the lines, and tied to the field with `aria-describedby`.
 */
export function TextArea({
  id,
  label,
  helperText,
  rows = 3,
  className,
  ...rest
}: TextAreaProps) {
  const classes = ["textarea", className].filter(Boolean).join(" ");
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

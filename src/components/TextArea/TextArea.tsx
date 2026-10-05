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
 * `TextInput`'s multi-line sibling: the same label, `.input` box and
 * helper text, three lines tall and growing with its content.
 */
export function TextArea({
  id,
  label,
  helperText,
  rows = 3,
  className,
  ...rest
}: TextAreaProps) {
  const classes = ["input", "input--multiline", className]
    .filter(Boolean)
    .join(" ");
  return (
    <div className="input-group">
      <label className="input-label" htmlFor={id}>
        {label}
      </label>
      {helperText && (
        <p id={`${id}-helper`} className="input-helper">
          {helperText}
        </p>
      )}
      <textarea
        id={id}
        className={classes}
        rows={rows}
        aria-describedby={helperText ? `${id}-helper` : undefined}
        {...rest}
      />
    </div>
  );
}

export default TextArea;

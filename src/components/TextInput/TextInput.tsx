import { forwardRef } from "react";
import type { InputHTMLAttributes } from "react";

interface TextInputProps extends Omit<
  InputHTMLAttributes<HTMLInputElement>,
  "id"
> {
  id: string;
  label: string;
  helperText?: string;
}

// forwardRef so callers can move focus programmatically (e.g. to the code
// field when the sign-in form advances a step) — the input itself is what
// needs focus, not the wrapping group.
export const TextInput = forwardRef<HTMLInputElement, TextInputProps>(
  function TextInput(
    { id, label, helperText, type = "text", className, ...rest },
    ref,
  ) {
    const classes = ["input", className].filter(Boolean).join(" ");
    return (
      <div className="input-group">
        <label className="input-label" htmlFor={id}>
          {label}
        </label>
        <input id={id} ref={ref} className={classes} type={type} {...rest} />
        {helperText && <p className="input-helper">{helperText}</p>}
      </div>
    );
  },
);

export default TextInput;

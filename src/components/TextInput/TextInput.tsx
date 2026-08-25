import type { InputHTMLAttributes } from "react";

interface TextInputProps extends Omit<
  InputHTMLAttributes<HTMLInputElement>,
  "id"
> {
  id: string;
  label: string;
  helperText?: string;
}

export function TextInput({
  id,
  label,
  helperText,
  type = "text",
  className,
  ...rest
}: TextInputProps) {
  const classes = ["input", className].filter(Boolean).join(" ");
  return (
    <div className="input-group">
      <label className="input-label" htmlFor={id}>
        {label}
      </label>
      <input id={id} className={classes} type={type} {...rest} />
      {helperText && <p className="input-helper">{helperText}</p>}
    </div>
  );
}

export default TextInput;

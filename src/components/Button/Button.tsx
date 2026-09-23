import {
  Children,
  isValidElement,
  type ButtonHTMLAttributes,
  type ReactElement,
  type ReactNode,
} from "react";

interface ButtonStateProps {
  /** Which state this label belongs to — matched against the parent
   * `Button`'s own `state` prop. */
  name: string;
  children: ReactNode;
}

/**
 * One label for a specific state of a `Button` whose label swaps at
 * runtime (e.g. ready → pending, or a future "Sent!" once-submitted state)
 * — declare one `<Button.State>` per state as `Button`'s children, instead
 * of a plain string/node child. Renders nothing on its own; `Button` reads
 * these as data rather than rendering them directly, the same way e.g. a
 * `<select>`'s `<option>`s are data for the `<select>` rather than
 * independently-rendered elements.
 *
 * Chosen over a flat `readyLabel`/`pendingLabel`-style prop pair: that
 * shape hard-codes exactly two states into the prop list, and needs a new
 * prop for every future one (a `submittedLabel` for "Sent!", ADR-0012's
 * pre-Turnstile "Verifying you're human…" on `/login`, …). A `Button.State`
 * per state scales to any number without changing `Button`'s own props,
 * and each one can hold arbitrary content (an icon + text), not just a
 * string.
 */
function ButtonState(props: ButtonStateProps) {
  void props; // never actually rendered — see the comment above
  return null;
}

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary";
  /**
   * Which `Button.State` child's `name` is current. When given, `children`
   * must be one `<Button.State name="...">` per possible state rather than
   * a plain node — `Button` stacks all of them via `.button-label-stack`
   * (see global.css), which renders every state's content in the same Grid
   * cell so the button's own width is always as wide as its widest state
   * and changing `state` never resizes it. Omit both `state` and any
   * `Button.State` children for a normal button — `children` renders as-is.
   */
  state?: string;
}

export function Button({
  variant = "primary",
  type = "button",
  className,
  children,
  state,
  ...rest
}: ButtonProps) {
  const classes = ["button", `button--${variant}`, className]
    .filter(Boolean)
    .join(" ");

  const states =
    state === undefined
      ? null
      : (Children.toArray(children).filter(
          (child): child is ReactElement<ButtonStateProps> =>
            isValidElement(child) && child.type === ButtonState,
        ) as ReactElement<ButtonStateProps>[]);

  return (
    <button className={classes} type={type} {...rest}>
      {states ? (
        <span className="button-label-stack">
          {states.map(({ props }) => (
            <span
              key={props.name}
              data-active={props.name === state || undefined}
            >
              {props.children}
            </span>
          ))}
        </span>
      ) : (
        children
      )}
    </button>
  );
}

Button.State = ButtonState;

export default Button;

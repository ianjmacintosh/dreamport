import type { ReactNode } from "react";
import { Dialog as BaseDialog } from "@base-ui/react/dialog";

interface DialogProps {
  /** Whether the Dialog is showing. The caller owns it, usually opening it
   * from a button and closing it once its form is done. */
  open: boolean;
  /** Called with `false` when the User dismisses the Dialog (`Escape`, a
   * click on the dimmed page). A caller with a request in flight can ignore
   * it to keep the Dialog up until the request settles. */
  onOpenChange: (open: boolean) => void;
  /** The Dialog's heading, an h2, which also names it for assistive tech. */
  title: string;
  /** The Dialog's body: usually a form, its buttons last. */
  children: ReactNode;
}

/**
 * A form that opens over the page from a button (#167): adding or editing
 * something with several fields, one of them a `TextArea` (see
 * docs/design-decisions.md). Behavior (focus moving in and back to the
 * button that opened it, focus kept inside, closing on `Escape` or an
 * outside click) comes from Base UI's `Dialog`, as `Dropdown`'s comes from
 * its `Menu` (ADR-0014). The look is this component's own, in global.css:
 * a white square-cornered panel over a dimmed page. A panel taller than
 * the screen scrolls with the page behind it held still.
 */
export function Dialog({ open, onOpenChange, title, children }: DialogProps) {
  return (
    <BaseDialog.Root open={open} onOpenChange={(next) => onOpenChange(next)}>
      <BaseDialog.Portal>
        <BaseDialog.Backdrop className="dialog-backdrop" />
        <BaseDialog.Viewport className="dialog-viewport">
          <BaseDialog.Popup className="dialog-popup">
            <BaseDialog.Title className="dialog-title">
              {title}
            </BaseDialog.Title>
            {children}
          </BaseDialog.Popup>
        </BaseDialog.Viewport>
      </BaseDialog.Portal>
    </BaseDialog.Root>
  );
}

export default Dialog;

import type { ReactNode } from "react";
import { WarningCircleIcon } from "@phosphor-icons/react";

interface NoticeProps {
  /** One `<p>` per sentence. */
  children: ReactNode;
}

/**
 * Something the User should know that isn't an error (#191, #205): a
 * Path still closed after publishing, or closed by unpublishing its last
 * published version. A small warning icon, a left accent bar, no box, the
 * text in italics. A `role="status"`, so it's announced as it appears.
 */
export function Notice({ children }: NoticeProps) {
  return (
    <div role="status" className="notice">
      <WarningCircleIcon aria-hidden="true" className="notice-icon" />
      <div>{children}</div>
    </div>
  );
}

export default Notice;

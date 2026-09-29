import Dropdown from "../Dropdown";
import Link from "../Link";

interface AppNavProps {
  /** The signed-in User's email, shown as the trigger for the account
   * dropdown (Settings, Log out) — see `Dropdown` (#119). */
  email: string;
  /** Called on a Log out click. The caller owns the actual sign-out request
   * (see `_appShell.tsx`) — this component stays presentational, plain
   * elements only, same as `Header`. */
  onLogout: () => void;
}

/**
 * The persistent bar every signed-in page (`/app`, `/app/settings`, …) is
 * rendered inside of — the Dreamport wordmark (home to `/app`) on the left
 * (#118), then a plain Products link (#120 — a flat way back until #109's
 * breadcrumb), and on the right who you're signed in as, opening an account
 * dropdown for Settings and Log out (#119). Sign-out was originally its own
 * button on `/app/settings` (#26); it moved here so every signed-in page
 * carries the same way out, rather than only the one page that happened to
 * grow it first — Settings loses that section entirely rather than keeping a
 * second copy of the same action.
 *
 * No active-route highlighting (#90 sign-off, Q1: **B**; its "no dropdown"
 * call superseded by #119).
 */
export function AppNav({ email, onLogout }: AppNavProps) {
  return (
    <nav className="app-nav">
      <div className="app-nav-content">
        <Link href="/app" className="wordmark">
          Dreamport
        </Link>
        <Link href="/app" className="app-nav-link">
          Products
        </Link>
        <Dropdown label={email}>
          <Dropdown.LinkItem href="/app/settings">Settings</Dropdown.LinkItem>
          <Dropdown.Separator />
          <Dropdown.Item onClick={onLogout}>Log out</Dropdown.Item>
        </Dropdown>
      </div>
    </nav>
  );
}

export default AppNav;

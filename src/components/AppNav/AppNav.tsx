import Button from "../Button";
import Link from "../Link";

interface AppNavProps {
  /** The signed-in User's email, shown plainly — no dropdown (#90 Q1). */
  email: string;
  /** Called on a Log out click. The caller owns the actual sign-out request
   * (see `_appShell.tsx`) — this component stays presentational, plain
   * elements only, same as `Header`. */
  onLogout: () => void;
}

/**
 * The persistent bar every signed-in page (`/app`, `/app/settings`, …) is
 * rendered inside of — who you're signed in as, a link to Settings, and Log
 * out. Sign-out was originally its own button on `/app/settings` (#26); it
 * moved here so every signed-in page carries the same way out, rather than
 * only the one page that happened to grow it first — Settings loses that
 * section entirely rather than keeping a second copy of the same action.
 *
 * No dropdown, no active-route highlighting, nothing beyond the three
 * things listed above (#90 sign-off, Q1: **B**).
 */
export function AppNav({ email, onLogout }: AppNavProps) {
  return (
    <nav className="app-nav">
      <div className="app-nav-content">
        <span className="app-nav-email">{email}</span>
        <Link href="/app/settings">Settings</Link>
        <Button variant="secondary" onClick={onLogout}>
          Log out
        </Button>
      </div>
    </nav>
  );
}

export default AppNav;

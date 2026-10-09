import {
  ListIcon,
  PackageIcon,
  PathIcon,
  UserCircleIcon,
} from "@phosphor-icons/react";

import Dropdown from "../Dropdown";
import Link from "../Link";

interface AppNavProps {
  /** The signed-in User's email, named at the top of the account menu
   * ("Signed in as …") above Settings and Log out (#119, #167). */
  email: string;
  /** Called on a Log out click. The caller owns the actual sign-out request
   * (see `_appShell.tsx`) — this component stays presentational, plain
   * elements only, same as `Header`. */
  onLogout: () => void;
  /** The current URL path, used to mark which section the User is in. The
   * caller reads it from the router (see `_appShell.tsx`) so this component
   * needs no router hooks of its own. */
  pathname: string;
}

/**
 * The app's top-level sections, in bar order (#125, #167). `matches`
 * decides which pages count as "in" the section.
 */
const SECTIONS = [
  {
    label: "Products",
    href: "/app",
    icon: <PackageIcon />,
    matches: (pathname: string) =>
      pathname === "/app" || pathname.startsWith("/app/products/"),
  },
  {
    label: "Trailblazer",
    href: "/app/paths",
    icon: <PathIcon />,
    matches: (pathname: string) =>
      pathname === "/app/paths" || pathname.startsWith("/app/paths/"),
  },
];

/**
 * The persistent bar every signed-in page (`/app`, `/app/settings`, …) is
 * rendered inside of (#125). Left: the Dreamport wordmark, home to `/app`
 * (#118). Right: the section links, then a profile icon opening the
 * account menu: who you're signed in as, then Settings and Log out (#119,
 * #167). Sign-out was
 * originally its own button on `/app/settings` (#26); it moved here so
 * every signed-in page carries the same way out.
 *
 * The section you're in is highlighted (`aria-current="page"`) — #125
 * reversed #90's "no active-route highlighting" once the bar had real
 * sections rather than only a home link.
 *
 * Below about 820px the section links and account dropdown can't share the
 * row with the wordmark, so both collapse into one ☰ menu — rendered here
 * alongside the wide layout and swapped in by CSS (`.app-nav-*` in
 * global.css).
 */
export function AppNav({ email, onLogout, pathname }: AppNavProps) {
  // Who's signed in and the account actions, shared by the wide layout's
  // account menu and the phone ☰ menu so the two can't drift apart.
  const account = (
    <Dropdown.Group
      label={
        <>
          Signed in as <span className="app-nav-menu-email">{email}</span>
        </>
      }
    >
      <Dropdown.LinkItem href="/app/settings">Settings</Dropdown.LinkItem>
      <Dropdown.Item onClick={onLogout}>Log out</Dropdown.Item>
    </Dropdown.Group>
  );

  return (
    <nav className="app-nav">
      <div className="app-nav-content">
        <Link href="/app" className="wordmark" current={false}>
          Dreamport
        </Link>
        <ul className="app-nav-links">
          {SECTIONS.map((section) => (
            <li key={section.href}>
              <Link
                href={section.href}
                className="button button--nav"
                current={section.matches(pathname)}
              >
                {section.icon}
                <span className="app-nav-link-label" data-label={section.label}>
                  {section.label}
                </span>
              </Link>
            </li>
          ))}
        </ul>
        <Dropdown
          label={
            <>
              <UserCircleIcon size="1.5em" />
              Account
            </>
          }
          variant="nav"
          className="app-nav-account"
        >
          {account}
        </Dropdown>
        <Dropdown
          label={<ListIcon size="1.25em" />}
          aria-label="Menu"
          chevron={false}
          variant="nav"
          className="app-nav-menu"
        >
          {SECTIONS.map((section) => (
            <Dropdown.LinkItem
              key={section.href}
              href={section.href}
              current={section.matches(pathname)}
            >
              {section.icon}
              {section.label}
            </Dropdown.LinkItem>
          ))}
          <Dropdown.Separator />
          {account}
        </Dropdown>
      </div>
    </nav>
  );
}

export default AppNav;

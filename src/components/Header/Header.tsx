import Link from "../Link";

interface HeaderProps {
  /**
   * Show the "Dreamport" wordmark link on the left. Off on pages that
   * already display the app name prominently (the homepage hero), on
   * everywhere else. The route check lives in the layout, not here, so
   * this component stays presentational.
   */
  showWordmark?: boolean;
}

export function Header({ showWordmark = true }: HeaderProps) {
  return (
    <header className="header">
      <div className="header-content">
        {showWordmark && <Link href="/">Dreamport</Link>}
        <Link href="/login" className="button button--primary">
          Log in
        </Link>
      </div>
    </header>
  );
}

export default Header;

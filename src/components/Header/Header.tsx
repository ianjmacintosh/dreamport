import Link from "../Link";

export function Header() {
  return (
    <header className="header">
      <div className="header-content">
        <Link href="/" className="wordmark">
          Dreamport
        </Link>
        <Link href="/login" className="button button--bar">
          Log in
        </Link>
      </div>
    </header>
  );
}

export default Header;

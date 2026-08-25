import Link from "../Link";

import "./PatternLibrary.css";

const PAGE_TYPES = [
  {
    href: "/patterns/homepage",
    name: "Homepage",
    description: "Big hero, signup, etc.",
  },
  {
    href: "/patterns/legal",
    name: "Legal",
    description: "Terms, policies, and other dense legal text.",
  },
];

export function PatternLibrary() {
  return (
    <main className="pl">
      <header className="pl-header">
        <h1>Pattern Library</h1>
        <p className="pl-header-sub">
          Full-page mockups, grouped by page type. See the{" "}
          <Link href="/style-guide">style guide</Link> for the underlying
          primitives.
        </p>
      </header>

      <ul className="pl-list">
        {PAGE_TYPES.map(({ href, name, description }) => (
          <li key={href} className="pl-item">
            <Link href={href} className="pl-item-link">
              <span className="pl-item-name">{name}</span>
              <span className="pl-item-description">{description}</span>
            </Link>
          </li>
        ))}
      </ul>
    </main>
  );
}

export default PatternLibrary;

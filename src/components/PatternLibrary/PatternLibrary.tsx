import Link from "../Link";

import "./PatternLibrary.css";

const PAGE_TYPES = [
  {
    href: "/internal/pattern-library/homepage",
    name: "Homepage",
    description: "Uses Button, Link, TextInput.",
  },
  {
    href: "/internal/pattern-library/legal",
    name: "Legal",
    description: "Uses Link.",
  },
];

export function PatternLibrary() {
  return (
    <main className="pl">
      <header className="pl-header">
        <h1>Pattern Library</h1>
        <p className="pl-header-sub">
          Full-page mockups, grouped by page type. See the{" "}
          <Link href="/internal/style-guide">style guide</Link> for the
          underlying primitives.
        </p>
      </header>

      <h2>Page types</h2>
      <ul className="pl-list">
        {PAGE_TYPES.map(({ href, name, description }) => (
          <li key={href}>
            <Link href={href}>{name}</Link> — {description}
          </li>
        ))}
      </ul>
    </main>
  );
}

export default PatternLibrary;

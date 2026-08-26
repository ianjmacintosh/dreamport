import { createFileRoute } from "@tanstack/react-router";

import Link from "../../../../components/Link";

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

export const Route = createFileRoute("/_layout/internal/pattern-library/")({
  component: PatternLibraryIndex,
});

function PatternLibraryIndex() {
  return (
    <>
      <h1>Pattern Library</h1>
      <p>
        Full-page mockups, grouped by page type. See the{" "}
        <Link href="/internal/style-guide">style guide</Link> for the underlying
        primitives.
      </p>

      <h2>Page types</h2>
      <ul>
        {PAGE_TYPES.map(({ href, name, description }) => (
          <li key={href}>
            <Link href={href}>{name}</Link> — {description}
          </li>
        ))}
      </ul>
    </>
  );
}

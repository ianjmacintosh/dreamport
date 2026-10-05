import type { ReactNode } from "react";
import { createFileRoute } from "@tanstack/react-router";

import Link from "../../components/Link";

export const Route = createFileRoute("/_withFooter/copyright")({
  component: Copyright,
});

/**
 * Third-party material Dreamport adapts, one entry per source. A new Path
 * that adapts someone else's work adds its credit here (#145).
 */
const ATTRIBUTIONS: { title: string; credit: ReactNode }[] = [
  {
    title: "Lean Canvas",
    credit: (
      <>
        The Rough One-Pager worksheet is adapted from Ash Maurya&apos;s Lean
        Canvas, which is itself adapted from Alexander Osterwalder&apos;s
        Business Model Canvas. Both are licensed under{" "}
        <Link href="https://creativecommons.org/licenses/by-sa/3.0/" external>
          CC BY-SA 3.0
        </Link>
        . Dreamport rewords the canvasDreamport rewords the canvas&apos;s boxes
        as questions and uses sevenapos;s boxes in its own words and uses seven
        of its nine (leaving out key metrics and unfair advantage). The Rough
        One-Pager worksheet is shared under the same license.
      </>
    ),
  },
];

function Copyright() {
  return (
    <>
      <header>
        <h1>Copyright</h1>
        <p className="text-sm">Last updated: October 5, 2026</p>
      </header>

      <section>
        <h2>1. Dreamport&apos;s own work</h2>
        <p className="text-2xl">
          Dreamport is owned and operated by Ian J. MacIntosh. Dreamport&apos;s
          text and design are © 2026 Dreamport. All rights reserved, except for
          the material credited below.
        </p>
        <p className="text-2xl">
          Dreamport&apos;s{" "}
          <Link href="https://github.com/ianjmacintosh/dreamport" external>
            source code
          </Link>{" "}
          is free software under the{" "}
          <Link href="https://www.gnu.org/licenses/gpl-3.0.html" external>
            GNU General Public License, version 3
          </Link>
          .
        </p>
      </section>

      <section>
        <h2>2. Others&apos; work</h2>
        <p className="text-2xl">
          Some of Dreamport is adapted from other people&apos;s work, used under
          the licenses below.
        </p>
        {ATTRIBUTIONS.map(({ title, credit }) => (
          <section key={title}>
            <h3>{title}</h3>
            <p className="text-2xl">{credit}</p>
          </section>
        ))}
      </section>
    </>
  );
}

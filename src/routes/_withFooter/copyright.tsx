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
        . Dreamport puts the canvas&apos;s boxes in its own words and uses seven
        of the nine, leaving out key metrics and unfair advantage. The worksheet
        is shared under CC BY-SA 3.0 too.
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
          Dreamport is owned and operated by Ian J. MacIntosh.
        </p>
        <p className="text-2xl">
          Dreamport&apos;s{" "}
          <Link href="https://github.com/ianjmacintosh/dreamport" external>
            source code
          </Link>
          , including its styles and the text built into the app, is © 2026
          Dreamport and published under the{" "}
          <Link href="https://www.gnu.org/licenses/gpl-3.0.html" external>
            GNU General Public License, version 3
          </Link>
          , except for the adapted work in section 2.
        </p>
        <p className="text-2xl">
          That license covers the code, not the Dreamport name. Please
          don&apos;t use the name for your own product, or in a way that
          suggests Dreamport endorses you.
        </p>
      </section>

      <section>
        <h2>2. Others&apos; work</h2>
        <p className="text-2xl">
          Parts of Dreamport adapt other people&apos;s work, under the licenses
          below.
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

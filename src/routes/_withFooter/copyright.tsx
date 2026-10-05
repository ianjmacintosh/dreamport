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
const CC_BY_SA_3_URL = "https://creativecommons.org/licenses/by-sa/3.0/";

const ATTRIBUTIONS: { title: string; credit: ReactNode }[] = [
  {
    // The "Changes" sentence must match the Rough One-Pager worksheet's
    // actual fields, seeded in `migrations/0014_rough_one_pager_seed.sql`
    // (#139); CC BY-SA 3.0 requires the change note to be accurate. Update
    // it whenever a field is added, dropped or reworded.
    title: "Lean Canvas",
    credit: (
      <>
        The &quot;Rough One-Pager&quot; worksheet is adapted from &quot;Lean
        Canvas&quot; by Ash Maurya (itself adapted from &quot;
        <Link
          href="https://assets.strategyzer.com/assets/resources/the-business-model-canvas.pdf"
          external
        >
          Business Model Canvas
        </Link>
        &quot; by Strategyzer AG), used under{" "}
        <Link href={CC_BY_SA_3_URL} external>
          CC BY-SA 3.0
        </Link>
        . Changes: seven of the canvas&apos;s nine boxes are kept, with their
        prompts rewritten and some names shortened; the other two (key metrics
        and unfair advantage) are omitted. The &quot;Rough One-Pager&quot;
        worksheet is licensed under{" "}
        <Link href={CC_BY_SA_3_URL} external>
          CC BY-SA 3.0
        </Link>{" "}
        by Dreamport.
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
          , including its styles and the text built into the app, is copyright
          2026 Dreamport. It is free software: you can redistribute it and/or
          modify it under the terms of the{" "}
          <Link href="https://www.gnu.org/licenses/gpl-3.0.html" external>
            GNU General Public License, version 3
          </Link>
          , as published by the Free Software Foundation. Material adapted from
          other works is licensed as described in section 2.
        </p>
        <p className="text-2xl">
          The GNU General Public License does not grant permission to use the
          Dreamport name. Use of the Dreamport name requires advance written
          permission from Dreamport.
        </p>
      </section>

      <section>
        <h2>2. Others&apos; work</h2>
        <p className="text-2xl">
          Portions of Dreamport are adapted from works by others and are
          licensed as follows.
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

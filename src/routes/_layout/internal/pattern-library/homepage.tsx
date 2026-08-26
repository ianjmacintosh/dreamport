import { createFileRoute } from "@tanstack/react-router";

import Button from "../../../../components/Button";
import Link from "../../../../components/Link";
import TextInput from "../../../../components/TextInput";

export const Route = createFileRoute(
  "/_layout/internal/pattern-library/homepage",
)({
  component: HomepageMockup,
});

function HomepageMockup() {
  return (
    <>
      <Link href="/internal/pattern-library">← Pattern library</Link>

      <section>
        <h1>Plan your next trip, one dream at a time</h1>
        <p className="text-lg">
          Dreamport keeps every destination, flight, and reservation in one
          place, so planning feels like part of the adventure.
        </p>
        <div>
          <Button variant="primary">Get started</Button>{" "}
          <Button variant="secondary">See how it works</Button>
        </div>
      </section>

      <section>
        <h2>Get early access</h2>
        <p>
          We&apos;re inviting new travelers in waves. Drop your email and
          we&apos;ll let you know when it&apos;s your turn.
        </p>
        <form onSubmit={(event) => event.preventDefault()}>
          <TextInput id="hp-signup-email" label="Email" type="email" />
          <Button variant="primary" type="submit">
            Join the waitlist
          </Button>
        </form>
      </section>
    </>
  );
}

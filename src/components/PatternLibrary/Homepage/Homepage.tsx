import Button from "../../Button";
import Link from "../../Link";
import TextInput from "../../TextInput";

import "./Homepage.css";

export function Homepage() {
  return (
    <main className="hp">
      <Link href="/" className="hp-back">
        ← Pattern library
      </Link>

      <section className="hp-hero">
        <h1>Plan your next trip, one dream at a time</h1>
        <p className="text-lg hp-hero-sub">
          Dreamport keeps every destination, flight, and reservation in one
          place, so planning feels like part of the adventure.
        </p>
        <div className="hp-hero-actions">
          <Button variant="primary">Get started</Button>
          <Button variant="secondary">See how it works</Button>
        </div>
      </section>

      <section className="hp-signup">
        <h2>Get early access</h2>
        <p className="hp-signup-sub">
          We&apos;re inviting new travelers in waves. Drop your email and
          we&apos;ll let you know when it&apos;s your turn.
        </p>
        <form
          className="hp-signup-form"
          onSubmit={(event) => event.preventDefault()}
        >
          <TextInput
            id="hp-signup-email"
            label="Email"
            type="email"
            placeholder="ada@example.com"
          />
          <Button variant="primary" type="submit">
            Join the waitlist
          </Button>
        </form>
      </section>
    </main>
  );
}

export default Homepage;

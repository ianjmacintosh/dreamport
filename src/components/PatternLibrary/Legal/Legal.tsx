import Link from "../../Link";

import "./Legal.css";

export function Legal() {
  return (
    <main className="lg">
      <Link href="/" className="lg-back">
        ← Pattern library
      </Link>

      <header className="lg-header">
        <h1>Terms of Service</h1>
        <p className="lg-updated">Last updated: January 1, 2026</p>
      </header>

      <section className="lg-section">
        <h2>1. Acceptance of terms</h2>
        <p className="text-base">
          By using Dreamport, you agree to these terms. If you don&apos;t agree,
          please don&apos;t use the service. This is placeholder copy standing
          in for real legal text.
        </p>
      </section>

      <section className="lg-section">
        <h2>2. Using the service</h2>
        <p className="text-base">
          You&apos;re responsible for the trips you plan and the information you
          provide. Don&apos;t use Dreamport for anything unlawful or that
          interferes with other travelers&apos; use of the service.
        </p>
      </section>

      <section className="lg-section">
        <h2>3. Changes to these terms</h2>
        <p className="text-base">
          We may update these terms from time to time. We&apos;ll post the
          revised terms here with a new &quot;last updated&quot; date.
        </p>
      </section>
    </main>
  );
}

export default Legal;

import { createFileRoute } from "@tanstack/react-router";

import Link from "../../components/Link";

export const Route = createFileRoute("/_withFooter/privacy")({
  component: Privacy,
});

function Privacy() {
  return (
    <>
      <header>
        <h1>Privacy Policy</h1>
        <p className="text-sm">Last updated: September 30, 2026</p>
      </header>

      <section>
        <h2>1. Who we are</h2>
        <p>
          Dreamport is a tool for keeping product ideas in order, run by Ian J.
          MacIntosh. This policy explains what information Dreamport collects
          when you use it, why, and what you can do about it.
        </p>
      </section>

      <section>
        <h2>2. What we collect</h2>
        <p>
          <strong>Your email address.</strong> Dreamport signs you in by
          emailing you a one-time code, so it needs your email address to create
          and identify your account.
        </p>
        <p>
          <strong>What you write.</strong> The Products, Ideas, and other
          content you add are stored so you can come back to them.
        </p>
        <p>
          <strong>Technical information.</strong> Like most websites, Dreamport
          receives your IP address and basic browser information with each
          request. It&apos;s used to keep the service running and to protect it
          from abuse, such as limiting how often sign-in codes can be sent.
        </p>
      </section>

      <section>
        <h2>3. Cookies</h2>
        <p>
          Dreamport sets a cookie to keep you signed in. It doesn&apos;t use
          advertising or cross-site tracking cookies.
        </p>
      </section>

      <section>
        <h2>4. How we use your information</h2>
        <p>
          Your information is used only to run Dreamport: signing you in,
          storing and showing your content, keeping the service secure, and
          contacting you about your account when needed. It isn&apos;t sold, and
          it isn&apos;t used for advertising.
        </p>
      </section>

      <section>
        <h2>5. Who else handles it</h2>
        <p>
          Dreamport relies on a small number of service providers to operate:
          Cloudflare hosts the application and its data and provides the
          bot-protection challenge on the sign-in page, and an email delivery
          provider sends sign-in codes. They process information only as needed
          to provide those services. Information may also be disclosed if
          required by law.
        </p>
      </section>

      <section>
        <h2>6. Keeping and deleting your information</h2>
        <p>
          Your information is kept for as long as your account exists. You can
          delete your account at any time from your account settings, which
          removes your account and the content stored with it.
        </p>
      </section>

      <section>
        <h2>7. Changes to this policy</h2>
        <p>
          This policy may be updated from time to time. Any changes will be
          posted on this page with a new &quot;last updated&quot; date.
        </p>
      </section>

      <section>
        <h2>8. Contact</h2>
        <p>
          Questions about this policy?{" "}
          <Link href="https://ianjmacintosh.com/contact" external>
            Get in touch
          </Link>
          .
        </p>
      </section>
    </>
  );
}

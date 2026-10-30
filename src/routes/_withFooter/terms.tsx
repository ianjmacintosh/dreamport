import { createFileRoute } from "@tanstack/react-router";

import Link from "../../components/Link";

export const Route = createFileRoute("/_withFooter/terms")({
  component: Terms,
});

function Terms() {
  return (
    <>
      <header>
        <h1>Terms of Service</h1>
        <p className="text-sm">Last updated: October 30, 2026</p>
      </header>

      <section>
        <h2>1. Acceptance of terms</h2>
        <p className="text-2xl">
          Dreamport is run by Ian J. MacIntosh. By using Dreamport, you agree to
          these terms. If you don&apos;t agree, please don&apos;t use the
          service.
        </p>
      </section>

      <section>
        <h2>2. Your account</h2>
        <p className="text-2xl">
          You sign in with your email address. You&apos;re responsible for
          keeping access to that email account secure, and for everything that
          happens under your Dreamport account.
        </p>
      </section>

      <section>
        <h2>3. Your content</h2>
        <p className="text-2xl">
          The Products, Ideas, and other content you add to Dreamport remain
          yours. You give Dreamport permission to store and display that content
          only as needed to provide the service to you.
        </p>
      </section>

      <section>
        <h2>4. Acceptable use</h2>
        <p className="text-2xl">
          Don&apos;t use Dreamport for anything unlawful, and don&apos;t try to
          disrupt the service, get around its security or rate limits, or access
          other people&apos;s accounts or data.
        </p>
      </section>

      <section>
        <h2>5. Paths from other Users</h2>
        <p className="text-2xl">
          Some Users, called &quot;Guides,&quot; can create and edit Paths of
          their own that other Users can follow. Guides may limit access to any
          of their own Paths, requiring permission for other Users to access.
          Users may request permission to access a specific version of a Path,
          which the Guide may review. Each request lists the version number
          requested and the email address associated with the user requesting
          access. A Guide may accept or deny a user&apos;s request at will, at
          their sole discretion. Access to a particular version of a Path does
          not grant access to any other version of the same Path.
        </p>
        <p className="text-2xl">
          Any arrangement you make with a Guide to get that permission,
          including any payment, is between you and the Guide. Dreamport
          doesn&apos;t process payments for Paths, isn&apos;t a party to those
          arrangements, and isn&apos;t responsible for disputes about them, such
          as a Guide who doesn&apos;t approve a request after you&apos;ve paid.
        </p>
      </section>

      <section>
        <h2>6. Availability</h2>
        <p className="text-2xl">
          Dreamport is provided &quot;as is&quot; and &quot;as available,&quot;
          without warranties of any kind. Features may change, and the service
          may be interrupted or discontinued. Keep your own copy of anything you
          can&apos;t afford to lose.
        </p>
      </section>

      <section>
        <h2>7. Limitation of liability</h2>
        <p className="text-2xl">
          To the fullest extent permitted by law, Dreamport and its operator
          aren&apos;t liable for any indirect, incidental, or consequential
          damages, or for any loss of data, arising from your use of the
          service.
        </p>
      </section>

      <section>
        <h2>8. Ending your use</h2>
        <p className="text-2xl">
          You can stop using Dreamport and delete your account at any time from
          your account settings. Access may be suspended or ended for accounts
          that break these terms.
        </p>
      </section>

      <section>
        <h2>9. Changes to these terms</h2>
        <p className="text-2xl">
          These terms may be updated from time to time. Any changes will be
          posted on this page with a new &quot;last updated&quot; date.
          Continuing to use Dreamport after a change means you accept the
          updated terms.
        </p>
      </section>

      <section>
        <h2>10. Contact</h2>
        <p className="text-2xl">
          Questions about these terms?{" "}
          <Link href="https://ianjmacintosh.com/contact" external>
            Get in touch
          </Link>
          .
        </p>
      </section>
    </>
  );
}

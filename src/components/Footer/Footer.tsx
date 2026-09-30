import Link from "../Link";

interface FooterProps {
  /** `"app"` (the default) is the quiet footer every `_appShell` page
   * gets — copyright on one end, Privacy Policy/Terms of Service on the
   * other, on the page color. `"marketing"` is the dark footer for the
   * signed-out pages under `_withFooter`: a Dreamport description beside a
   * stacked "Learn More" link list, copyright below (#121). */
  variant?: "app" | "marketing";
}

const COPYRIGHT = "© 2026 Dreamport";

export function Footer({ variant = "app" }: FooterProps = {}) {
  if (variant === "marketing") {
    return (
      <footer className="footer footer--marketing">
        <div className="footer-content footer-content--marketing">
          <div>
            <h2 className="text-h3">Dreamport</h2>
            <p>[Ian: footer description pending]</p>
          </div>
          <div>
            <h2 className="text-h3">Learn More</h2>
            <ul className="footer-links text-sm">
              <li>
                <Link href="/login">Log In</Link>
              </li>
              <li>
                <Link href="/about">About Dreamport</Link>
              </li>
              <li>
                <Link href="https://ianjmacintosh.com/contact" external>
                  Contact
                </Link>
              </li>
              <li>
                <Link href="/privacy">Privacy Policy</Link>
              </li>
              <li>
                <Link href="/terms">Terms of Service</Link>
              </li>
            </ul>
          </div>
          <p className="footer-copyright">{COPYRIGHT}</p>
        </div>
      </footer>
    );
  }

  return (
    <footer className="footer footer--app">
      <div className="footer-content footer-content--app">
        <p className="footer-copyright">{COPYRIGHT}</p>
        <ul className="footer-links text-sm">
          <li>
            <Link href="/privacy">Privacy Policy</Link>
          </li>
          <li>
            <Link href="/terms">Terms of Service</Link>
          </li>
        </ul>
      </div>
    </footer>
  );
}

export default Footer;

import Link from "../Link";

interface FooterProps {
  /** `"app"` (the default) is the quieter footer every `_appShell` page
   * gets — copyright on one end, Privacy/Terms on the other. `"marketing"`
   * is for the signed-out pages under `_withFooter`: a Dreamport
   * description beside a "Learn More" link list, copyright below (#121). */
  variant?: "app" | "marketing";
}

const COPYRIGHT = "© 2026 Ian J. MacIntosh";

export function Footer({ variant = "app" }: FooterProps = {}) {
  if (variant === "marketing") {
    return (
      <footer className="footer">
        <div className="footer-content footer-content--marketing">
          <div>
            <h2>Dreamport</h2>
            <p>[Ian: footer description pending]</p>
          </div>
          <div className="footer-learn-more">
            <h2>Learn More</h2>
            <ul className="footer-links">
              <li>
                <Link href="/about">About</Link>
              </li>
              <li>
                <Link href="https://ianjmacintosh.com/contact" external>
                  Contact
                </Link>
              </li>
              <li>
                <Link href="/privacy">Privacy</Link>
              </li>
              <li>
                <Link href="/terms">Terms</Link>
              </li>
            </ul>
          </div>
          <p className="footer-copyright">{COPYRIGHT}</p>
        </div>
      </footer>
    );
  }

  return (
    <footer className="footer">
      <div className="footer-content footer-content--app">
        <p className="footer-copyright">{COPYRIGHT}</p>
        <ul className="footer-links">
          <li>
            <Link href="/privacy">Privacy</Link>
          </li>
          <li>
            <Link href="/terms">Terms</Link>
          </li>
        </ul>
      </div>
    </footer>
  );
}

export default Footer;

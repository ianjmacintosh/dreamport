import "./StyleGuide.css";

function Section({
  id,
  label,
  children,
}: {
  id: string;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <section className="sg-section" id={id}>
      <p className="sg-section-label">{label}</p>
      {children}
    </section>
  );
}

const PALETTE = [
  { label: "Page background", value: "oklch(1 0 0)", role: "--color-page-bg" },
  { label: "Surface", value: "oklch(0.98 0 0)", role: "--color-surface" },
  { label: "Border", value: "oklch(0.85 0 0)", role: "--color-border" },
  {
    label: "Muted text",
    value: "oklch(0.45 0 0)",
    role: "--color-text-muted",
  },
  {
    label: "Primary text",
    value: "oklch(0.25 0 0)",
    role: "--color-text-primary",
    light: true,
  },
  {
    label: "Accent (placeholder)",
    value: "oklch(0.55 0.18 250)",
    role: "--color-accent",
    light: true,
  },
];

const TYPE_SCALE = [
  { token: "--text-h1", size: "2.5rem", sample: "Heading 1", tag: "h1" },
  { token: "--text-h2", size: "1.875rem", sample: "Heading 2", tag: "h2" },
  { token: "--text-h3", size: "1.5rem", sample: "Heading 3", tag: "h3" },
  { token: "--text-lg", size: "1.125rem", sample: "Large text", tag: "p" },
  { token: "--text-base", size: "1rem", sample: "Body text", tag: "p" },
  { token: "--text-sm", size: "0.875rem", sample: "Small text", tag: "p" },
  { token: "--text-xs", size: "0.75rem", sample: "Extra-small text", tag: "p" },
] as const;

const SPACING = [
  { token: "--space-1", px: "4px" },
  { token: "--space-2", px: "8px" },
  { token: "--space-3", px: "12px" },
  { token: "--space-4", px: "16px" },
  { token: "--space-5", px: "20px" },
  { token: "--space-6", px: "24px" },
  { token: "--space-7", px: "28px" },
  { token: "--space-8", px: "32px" },
  { token: "--space-9", px: "40px" },
  { token: "--space-10", px: "48px" },
];

export function StyleGuide() {
  return (
    <main className="sg">
      <header className="sg-header">
        <h1>Style Guide</h1>
        <p className="sg-header-sub">
          Placeholder tokens — no font or brand color has been picked yet. See
          the README&apos;s Quick Start steps for what&apos;s still open.
        </p>
      </header>

      <nav className="sg-nav" aria-label="Style guide sections">
        <a href="#color">Color</a>
        <a href="#typography">Typography</a>
        <a href="#buttons">Buttons</a>
        <a href="#spacing">Spacing</a>
      </nav>

      <Section id="color" label="Color palette">
        <div className="sg-palette">
          {PALETTE.map(({ label, value, role }) => (
            <div key={label} className="sg-swatch">
              <div
                className="sg-swatch-block"
                style={{ background: value }}
                aria-hidden="true"
              />
              <div className="sg-swatch-meta">
                <div className="sg-swatch-name">{label}</div>
                <div className="sg-swatch-token">{role}</div>
                <div className="sg-swatch-value">{value}</div>
              </div>
            </div>
          ))}
        </div>
      </Section>

      <Section id="typography" label="Typography">
        <div className="sg-type-stack">
          {TYPE_SCALE.map(({ token, size, sample, tag: Tag }) => (
            <div className="sg-type-row" key={token}>
              <span className="sg-type-meta">
                {token} · {size}
              </span>
              <Tag className="sg-type-sample">{sample}</Tag>
            </div>
          ))}
        </div>
      </Section>

      <Section id="buttons" label="Buttons">
        <div className="sg-button-row">
          <button className="button button--primary">Primary</button>
          <button className="button button--secondary">Secondary</button>
        </div>
        <p className="sg-note">
          Use the <code>.button</code> base class plus a{" "}
          <code>.button--primary</code> or <code>.button--secondary</code>{" "}
          modifier — never style a raw <code>&lt;button&gt;</code> directly.
        </p>
      </Section>

      <Section id="spacing" label="Spacing">
        <p className="sg-note">
          4px base unit. All spacing from the <code>--space-*</code> token
          scale.
        </p>
        <div className="sg-spacing-list">
          {SPACING.map(({ token, px }) => (
            <div key={token} className="sg-spacing-row">
              <div
                className="sg-spacing-block"
                style={{ width: px }}
                aria-hidden="true"
              />
              <code className="sg-spacing-token">{token}</code>
              <span className="sg-spacing-value">{px}</span>
            </div>
          ))}
        </div>
      </Section>
    </main>
  );
}

export default StyleGuide;

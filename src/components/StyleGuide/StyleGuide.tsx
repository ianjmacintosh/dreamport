import "./StyleGuide.css";

function cssVar(name: string): string {
  if (typeof document === "undefined") return "";
  return getComputedStyle(document.documentElement)
    .getPropertyValue(name)
    .trim();
}

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

const SOLARIZED_PALETTE = [
  { label: "Base03", role: "--sol-base03" },
  { label: "Base02", role: "--sol-base02" },
  { label: "Base01", role: "--sol-base01" },
  { label: "Base00", role: "--sol-base00" },
  { label: "Base0", role: "--sol-base0" },
  { label: "Base1", role: "--sol-base1" },
  { label: "Base2", role: "--sol-base2" },
  { label: "Base3", role: "--sol-base3" },
  { label: "Yellow", role: "--sol-yellow" },
  { label: "Orange", role: "--sol-orange" },
  { label: "Red", role: "--sol-red" },
  { label: "Magenta", role: "--sol-magenta" },
  { label: "Violet", role: "--sol-violet" },
  { label: "Blue", role: "--sol-blue" },
  { label: "Cyan", role: "--sol-cyan" },
  { label: "Green", role: "--sol-green" },
];

const SEMANTIC_COLORS = [
  { label: "Page background", role: "--color-page-bg" },
  { label: "Surface", role: "--color-surface" },
  { label: "Border", role: "--color-border" },
  { label: "Muted text", role: "--color-text-muted" },
  { label: "Body text", role: "--color-text-primary" },
  { label: "Heading text", role: "--color-heading" },
  { label: "Accent / link", role: "--color-accent" },
];

const TYPE_SCALE = [
  { token: "--text-h1", sample: "Heading 1", tag: "h1" },
  { token: "--text-h2", sample: "Heading 2", tag: "h2" },
  { token: "--text-h3", sample: "Heading 3", tag: "h3" },
  { token: "--text-lg", sample: "Large text", tag: "p" },
  { token: "--text-base", sample: "Body text", tag: "p" },
  { token: "--text-sm", sample: "Small text", tag: "p" },
  { token: "--text-xs", sample: "Extra-small text", tag: "p" },
] as const;

const SPACING = [
  "--space-1",
  "--space-2",
  "--space-3",
  "--space-4",
  "--space-5",
  "--space-6",
  "--space-7",
  "--space-8",
  "--space-9",
  "--space-10",
];

export function StyleGuide() {
  return (
    <main className="sg">
      <header className="sg-header">
        <h1>Style Guide</h1>
        <p className="sg-header-sub">
          Headings: Elms Sans. Body: Nunito. Colors: Solarized Light. See the
          README&apos;s Quick Start steps for what&apos;s still open.
        </p>
      </header>

      <nav className="sg-nav" aria-label="Style guide sections">
        <a href="#palette">Palette</a>
        <a href="#colors">Colors</a>
        <a href="#typography">Typography</a>
        <a href="#buttons">Buttons</a>
        <a href="#spacing">Spacing</a>
      </nav>

      <Section id="palette" label="Palette — Solarized Light">
        <p className="sg-note">
          The raw swatches, from{" "}
          <a
            href="https://ethanschoonover.com/solarized/"
            target="_blank"
            rel="noreferrer"
          >
            Ethan Schoonover&apos;s Solarized
          </a>{" "}
          — the official spec these values and names come from. Nothing here
          should be used directly in a component — it&apos;s the source material
          for the semantic colors below.
        </p>
        <div className="sg-palette">
          {SOLARIZED_PALETTE.map(({ label, role }) => (
            <div key={label} className="sg-swatch">
              <div
                className="sg-swatch-block"
                style={{ background: `var(${role})` }}
                aria-hidden="true"
              />
              <div className="sg-swatch-meta">
                <div className="sg-swatch-name">{label}</div>
                <div className="sg-swatch-token">{role}</div>
                <div className="sg-swatch-value">{cssVar(role)}</div>
              </div>
            </div>
          ))}
        </div>
      </Section>

      <Section id="colors" label="Colors — by purpose">
        <p className="sg-note">
          What each palette swatch is actually used for. Components should only
          ever reference these, never a raw <code>--sol-*</code> value.
        </p>
        <div className="sg-palette">
          {SEMANTIC_COLORS.map(({ label, role }) => (
            <div key={label} className="sg-swatch">
              <div
                className="sg-swatch-block"
                style={{ background: `var(${role})` }}
                aria-hidden="true"
              />
              <div className="sg-swatch-meta">
                <div className="sg-swatch-name">{label}</div>
                <div className="sg-swatch-token">{role}</div>
                <div className="sg-swatch-value">{cssVar(role)}</div>
              </div>
            </div>
          ))}
        </div>
      </Section>

      <Section id="typography" label="Typography">
        <div className="sg-type-stack">
          {TYPE_SCALE.map(({ token, sample, tag: Tag }) => (
            <div className="sg-type-row" key={token}>
              <span className="sg-type-meta">
                {token} · {cssVar(token)}
              </span>
              <Tag
                className="sg-type-sample"
                style={{ fontSize: `var(${token})` }}
              >
                {sample}
              </Tag>
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
          {SPACING.map((token) => (
            <div key={token} className="sg-spacing-row">
              <div
                className="sg-spacing-block"
                style={{ width: `var(${token})` }}
                aria-hidden="true"
              />
              <code className="sg-spacing-token">{token}</code>
              <span className="sg-spacing-value">{cssVar(token)}</span>
            </div>
          ))}
        </div>
      </Section>
    </main>
  );
}

export default StyleGuide;

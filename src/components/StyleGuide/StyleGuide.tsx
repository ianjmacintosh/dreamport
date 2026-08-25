import Button from "../Button";
import Link from "../Link";
import TextInput from "../TextInput";

import "./StyleGuide.css";

function cssVar(name: string): string {
  if (typeof document === "undefined") return "";
  return getComputedStyle(document.documentElement)
    .getPropertyValue(name)
    .trim();
}

function Snippet({ code }: { code: string }) {
  return (
    <pre className="sg-snippet">
      <code>{code}</code>
    </pre>
  );
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
    <main className="sg" id="top">
      <header className="sg-header">
        <h1>Style Guide</h1>
        <p className="sg-header-sub">
          Headings: Elms Sans. Body: Nunito. Colors: Solarized Light. See the
          README&apos;s Quick Start steps for what&apos;s still open. See the{" "}
          <Link href="/internal/pattern-library">pattern library</Link> for
          full-page mockups built from these primitives.
        </p>
      </header>

      <nav className="sg-nav" aria-label="Style guide sections">
        <a href="#palette">Palette</a>
        <a href="#colors">Colors</a>
        <a href="#typography">Typography</a>
        <a href="#headings">Headings</a>
        <a href="#body-text">Body text</a>
        <a href="#links">Links</a>
        <a href="#buttons">Buttons</a>
        <a href="#text-inputs">Text inputs</a>
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

      <Section id="headings" label="Headings">
        <div className="sg-heading-stack">
          <h1>Heading level 1</h1>
          <h2>Heading level 2</h2>
          <h3>Heading level 3</h3>
        </div>
        <Snippet
          code={`<h1>Heading level 1</h1>\n<h2>Heading level 2</h2>\n<h3>Heading level 3</h3>`}
        />
        <p className="sg-note">
          Use a real <code>&lt;h1&gt;</code>–<code>&lt;h3&gt;</code> — size
          follows the tag automatically. When the visual size needs to diverge
          from the semantic level (say, an <code>&lt;h2&gt;</code> that should
          look like an <code>&lt;h3&gt;</code>), override just the size with a{" "}
          <code>.text-h1</code>/<code>.text-h2</code>/<code>.text-h3</code>{" "}
          class — never change the tag just to change how it looks.
        </p>
        <div className="sg-heading-stack">
          <h2 className="text-h3">
            An &lt;h2&gt; sized like an &lt;h3&gt;, via <code>.text-h3</code>
          </h2>
        </div>
        <Snippet code={`<h2 className="text-h3">Looks like an h3</h2>`} />
      </Section>

      <Section id="body-text" label="Body text">
        <div className="sg-heading-stack">
          <p className="text-lg">Large body text</p>
          <p className="text-base">Base body text</p>
          <p className="text-sm">Small body text</p>
          <p className="text-xs">Extra-small body text</p>
        </div>
        <Snippet
          code={`<p className="text-lg">Large body text</p>\n<p className="text-base">Base body text</p>\n<p className="text-sm">Small body text</p>\n<p className="text-xs">Extra-small body text</p>`}
        />
        <p className="sg-note">
          Use a plain <code>&lt;p&gt;</code> (or <code>&lt;span&gt;</code> for
          inline text) with a <code>.text-lg</code>/<code>.text-base</code>/
          <code>.text-sm</code>/<code>.text-xs</code> class for size.
        </p>
      </Section>

      <Section id="links" label="Links">
        <p className="sg-note">
          An internal <Link href="#top">link</Link>, and an{" "}
          <Link href="https://ethanschoonover.com/solarized/" external>
            external link
          </Link>{" "}
          that opens in a new tab.
        </p>
        <Snippet
          code={`<Link href="/about">Internal link</Link>\n<Link href="https://example.com" external>\n  External link\n</Link>`}
        />
        <p className="sg-note">
          Use the <code>&lt;Link&gt;</code> component with the{" "}
          <code>external</code> prop instead of setting <code>target</code>/
          <code>rel</code> by hand.
        </p>
      </Section>

      <Section id="buttons" label="Buttons">
        <div className="sg-button-row">
          <Button variant="primary">Primary</Button>
          <Button variant="secondary">Secondary</Button>
        </div>
        <Snippet
          code={`<Button variant="primary">Primary</Button>\n<Button variant="secondary">Secondary</Button>`}
        />
        <p className="sg-note">
          Use the <code>&lt;Button&gt;</code> component with a{" "}
          <code>variant</code> of <code>primary</code> or <code>secondary</code>{" "}
          — never style a raw <code>&lt;button&gt;</code> directly.
        </p>
      </Section>

      <Section id="text-inputs" label="Text inputs">
        <div className="sg-input-row">
          <TextInput id="sg-name" label="Name" placeholder="Ada Lovelace" />
          <TextInput
            id="sg-email"
            label="Email"
            type="email"
            helperText="We'll never share your email."
          />
        </div>
        <Snippet
          code={`<TextInput id="name" label="Name" placeholder="Ada Lovelace" />\n<TextInput\n  id="email"\n  label="Email"\n  type="email"\n  helperText="We'll never share your email."\n/>`}
        />
        <p className="sg-note">
          Use the <code>&lt;TextInput&gt;</code> component — it pairs an{" "}
          <code>.input</code> with an accessible <code>.input-label</code> and
          optional <code>.input-helper</code> text.
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

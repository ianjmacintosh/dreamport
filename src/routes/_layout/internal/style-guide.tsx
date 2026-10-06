import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { ListIcon, PackageIcon } from "@phosphor-icons/react";

import Button from "../../../components/Button";
import AppNav from "../../../components/AppNav";
import Dropdown from "../../../components/Dropdown";
import Footer from "../../../components/Footer";
import Header from "../../../components/Header";
import Link from "../../../components/Link";
import TagList from "../../../components/TagList";
import TagPicker from "../../../components/TagPicker";
import TextArea from "../../../components/TextArea";
import TextInput from "../../../components/TextInput";

import "./style-guide.css";

export const Route = createFileRoute("/_layout/internal/style-guide")({
  component: StyleGuide,
});

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

function TagPickerDemo() {
  const [tags, setTags] = useState<string[]>(["Pricing"]);
  return (
    <TagPicker
      id="sg-tag-picker"
      catalog={[
        "Design",
        "Distribution",
        "Functionality",
        "Pricing",
        "Promotion",
        "Staffing",
      ]}
      selected={tags}
      onChange={setTags}
    />
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
  { label: "Text on surface", role: "--color-text-on-surface" },
  { label: "Heading text", role: "--color-heading" },
  { label: "Accent / link", role: "--color-accent" },
  { label: "Selection background", role: "--color-selection-bg" },
  { label: "Selection text", role: "--color-selection-text" },
];

const TYPE_SCALE = [
  { token: "--text-hero", sample: "Hero", tag: "h1" },
  { token: "--text-display", sample: "Display", tag: "h1" },
  { token: "--text-h1", sample: "Heading 1", tag: "h1" },
  { token: "--text-h2", sample: "Heading 2", tag: "h2" },
  { token: "--text-h3", sample: "Heading 3", tag: "h3" },
  { token: "--text-h4", sample: "Heading 4", tag: "h4" },
  { token: "--text-2xl", sample: "2XL text", tag: "p" },
  { token: "--text-xl", sample: "XL text", tag: "p" },
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

function ButtonLabelStackDemo() {
  const [isSubmitting, setIsSubmitting] = useState(false);
  return (
    <div className="sg-button-label-stack-demo">
      <Button
        disabled={isSubmitting}
        state={isSubmitting ? "pending" : "ready"}
        onClick={() => {
          setIsSubmitting(true);
          setTimeout(() => setIsSubmitting(false), 1200);
        }}
      >
        <Button.State name="ready">Send Code</Button.State>
        <Button.State name="pending">Sending…</Button.State>
      </Button>
    </div>
  );
}

function StyleGuide() {
  return (
    <div id="top">
      <header className="sg-header">
        <h1>Style Guide</h1>
        <p className="sg-header-sub">
          Headings: Funnel Display (h4: Nunito). Body: Nunito. Colors: Solarized
          Light. See the README&apos;s Quick Start steps for what&apos;s still
          open. See the{" "}
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
        <a href="#button-label-stack">Button label stack</a>
        <a href="#button-group">Button group</a>
        <a href="#dropdown">Dropdown</a>
        <a href="#header-bars">Header bars</a>
        <a href="#footers">Footers</a>
        <a href="#text-inputs">Text inputs</a>
        <a href="#sheet">Sheet</a>
        <a href="#field-row">Field with action</a>
        <a href="#tags">Tags</a>
        <a href="#list-row">Row with action</a>
        <a href="#turnstile-container">Turnstile container</a>
        <a href="#form-shell">Form shell</a>
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
        <p className="sg-note">
          <code>--color-selection-text</code> is true white (
          <code>#ffffff</code>), not a Solarized swatch — no in-palette color
          clears WCAG AA (4.5:1) against magenta from either direction; pure
          white hits 4.55:1. Try selecting this text to see it.
        </p>
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
          <h4>Heading level 4</h4>
        </div>
        <Snippet
          code={`<h1>Heading level 1</h1>\n<h2>Heading level 2</h2>\n<h3>Heading level 3</h3>\n<h4>Heading level 4</h4>`}
        />
        <p className="sg-note">
          Use a real <code>&lt;h1&gt;</code>–<code>&lt;h4&gt;</code> — size
          follows the tag automatically. <code>&lt;h4&gt;</code> is set in the
          body face (Nunito), bold and tracked in, since Funnel Display
          doesn&apos;t read well that small. When the visual size needs to
          diverge from the semantic level (say, an <code>&lt;h2&gt;</code> that
          should look like an <code>&lt;h3&gt;</code>), override just the size
          with a <code>.text-h1</code>/<code>.text-h2</code>/
          <code>.text-h3</code> class — never change the tag just to change how
          it looks.
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
          <p className="text-2xl">2XL body text</p>
          <p className="text-xl">XL body text</p>
          <p className="text-lg">Large body text</p>
          <p className="text-base">Base body text</p>
          <p className="text-sm">Small body text</p>
          <p className="text-xs">Extra-small body text</p>
        </div>
        <Snippet
          code={`<p className="text-2xl">2XL body text</p>\n<p className="text-xl">XL body text</p>\n<p className="text-lg">Large body text</p>\n<p className="text-base">Base body text</p>\n<p className="text-sm">Small body text</p>\n<p className="text-xs">Extra-small body text</p>`}
        />
        <p className="sg-note">
          Use a plain <code>&lt;p&gt;</code> (or <code>&lt;span&gt;</code> for
          inline text) with a <code>.text-2xl</code>/<code>.text-xl</code>/
          <code>.text-lg</code>/<code>.text-base</code>/<code>.text-sm</code>/
          <code>.text-xs</code> class for size. Note <code>.text-2xl</code> is
          the same 1.5rem size as <code>.text-h3</code> — same rung, different
          semantic role (a large lead paragraph vs. an actual heading).
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
        <p className="sg-note">
          A{" "}
          <Link href="#links" className="link-quiet">
            quiet link
          </Link>{" "}
          (hover it) is for a link that shouldn&apos;t draw the eye, like the
          in-app footer&apos;s Privacy Policy and Terms of Service. It takes the
          text&apos;s own near-black, the underline alone marks it as a link,
          and hover drops the underline instead of changing color. It also
          passes WCAG AA where the default blue can&apos;t: 12.05:1 on the page
          color and 10.61:1 on the surface color, against blue&apos;s 3.41:1 and
          3.00:1.
        </p>
        <Snippet
          code={`<Link href="/privacy" className="link-quiet">\n  Privacy Policy\n</Link>`}
        />
      </Section>

      <Section id="wordmark" label="Wordmark — Motif">
        <p>
          <Link href="#top" className="wordmark">
            Dreamport
          </Link>
        </p>
        <Snippet
          code={`<Link href="/" className="wordmark">\n  Dreamport\n</Link>`}
        />
        <p className="sg-note">
          The app&apos;s name as styled text — heading font and color, bold, no
          underline, no hover color change; steps down a size below 640px. Shown
          at the left of every page with <code>Header</code> (links to{" "}
          <code>/</code>) or <code>AppNav</code> (links to <code>/app</code>),
          where the bar&apos;s gradient turns it cream (see the{" "}
          <code>--color-bar-*</code> tokens). Its box is trimmed to x-height →
          baseline, so a bar centring it lines up its lowercase letters with the
          bar&apos;s other items. No image asset for now.
        </p>
      </Section>

      <Section id="buttons" label="Buttons">
        <div className="sg-button-row">
          <Button variant="primary">Primary</Button>
          <Button variant="secondary">Secondary</Button>
          <Button variant="primary" disabled>
            Disabled
          </Button>
        </div>
        <Snippet
          code={`<Button variant="primary">Primary</Button>\n<Button variant="secondary">Secondary</Button>\n<Button disabled>Disabled</Button>`}
        />
        <div className="app-nav sg-button-row sg-bar-swatch">
          <Button variant="bar">Bar</Button>
          <a href="#buttons" className="button button--nav">
            Nav
          </a>
          <a href="#buttons" className="button button--nav" aria-current="page">
            Nav (current page)
          </a>
        </div>
        <Snippet
          code={`<Button variant="bar">Bar</Button>\n<Link href="/app" className="button button--nav">Nav</Link>\n<Link href="/app" className="button button--nav" current>\n  Nav (current page)\n</Link>`}
        />
        <p className="sg-note">
          Use the <code>&lt;Button&gt;</code> component with a{" "}
          <code>variant</code> of <code>primary</code>, <code>secondary</code>{" "}
          or <code>bar</code> — never style a raw <code>&lt;button&gt;</code>{" "}
          directly. Hover shows the same outline as keyboard focus, not a color
          swap. A <code>disabled</code> button uses the body-text color as its
          own background regardless of variant — muted and clearly inert,
          distinct from every variant's normal look. <code>bar</code> is only
          for a button sitting on the header bar (e.g. <code>Header</code>
          &apos;s Log In) — cream fill, dark text. <code>nav</code> is also
          bar-only: a nav link or menu trigger (e.g. <code>AppNav</code>&apos;s
          sections and account menu) — cream text on a dark wash, regular
          weight, and bold on a stronger wash when it&apos;s the current page.
          Both are shown above on the bar itself, and in place under Header bars
          below.
        </p>
      </Section>

      <Section id="button-label-stack" label="Button label stack">
        <ButtonLabelStackDemo />
        <Snippet
          code={`<Button disabled={isSubmitting} state={isSubmitting ? "pending" : "ready"}>\n  <Button.State name="ready">Send Code</Button.State>\n  <Button.State name="pending">Sending…</Button.State>\n</Button>`}
        />
        <p className="sg-note">
          Pass <code>state</code> plus one{" "}
          <code>&lt;Button.State name="..."&gt;</code> per state instead of a
          plain <code>children</code> node whenever a button's own label swaps
          at runtime (e.g. ready → pending, or a future submitted state) —{" "}
          <code>&lt;Button&gt;</code> renders every state at once, stacked in
          the same Grid cell via <code>.button-label-stack</code> (global.css),
          so the button's intrinsic width is always as wide as its widest state
          and changing
          <code>state</code> never resizes it. Click the button above to see the
          label change without a size change. A named state per{" "}
          <code>Button.State</code>, not a <code>readyLabel</code>/
          <code>pendingLabel</code>-style prop pair, is what lets a third state
          (e.g. "Sent!") get added later without changing <code>Button</code>'s
          own props — each one can also hold any content, not just a string.
          Every state except the active one is pulled out of the accessibility
          tree by <code>visibility: hidden</code>, not just hidden visually, so
          only the active one is ever announced.
        </p>
      </Section>

      <Section id="button-group" label="Button group">
        <div className="sg-button-group-demo">
          <div className="button-group">
            <Button variant="primary">Save</Button>
            <Button variant="secondary">Cancel</Button>
          </div>
        </div>
        <Snippet
          code={`<div className="button-group">\n  <Button variant="primary">Save</Button>\n  <Button variant="secondary">Cancel</Button>\n</div>`}
        />
        <p className="sg-note">
          Use <code>.button-group</code> for two or more related actions
          presented side by side (e.g. an Idea row&apos;s Save / Cancel /
          Delete) — the gap between them comes from the spacing scale via Grid,
          not inline-flex's incidental whitespace. For a single button attached
          to a single field, use <code>.field-row</code> below instead.
        </p>
      </Section>

      <Section id="dropdown" label="Dropdown">
        <div className="sg-dropdown-demo">
          <Dropdown label="someone@example.com">
            <Dropdown.LinkItem href="#dropdown">Settings</Dropdown.LinkItem>
            <Dropdown.Separator />
            <Dropdown.Item onClick={() => {}}>Log out</Dropdown.Item>
          </Dropdown>
        </div>
        <Snippet
          code={`<Dropdown label={email}>\n  <Dropdown.LinkItem href="/app/settings">Settings</Dropdown.LinkItem>\n  <Dropdown.Separator />\n  <Dropdown.Item onClick={onLogout}>Log out</Dropdown.Item>\n</Dropdown>`}
        />
        <div className="sg-dropdown-demo">
          <Dropdown
            label={<ListIcon size="1.25em" />}
            aria-label="Menu"
            chevron={false}
          >
            <Dropdown.LinkItem href="#dropdown" current>
              <PackageIcon />
              Products
            </Dropdown.LinkItem>
            <Dropdown.Separator />
            <Dropdown.Group label="Signed in as someone@example.com">
              <Dropdown.LinkItem href="#dropdown">Settings</Dropdown.LinkItem>
              <Dropdown.Item onClick={() => {}}>Log out</Dropdown.Item>
            </Dropdown.Group>
          </Dropdown>
        </div>
        <Snippet
          code={`<Dropdown label={<ListIcon size="1.25em" />} aria-label="Menu" chevron={false}>\n  <Dropdown.LinkItem href="/app" current>\n    <PackageIcon />\n    Products\n  </Dropdown.LinkItem>\n  <Dropdown.Separator />\n  <Dropdown.Group label={\`Signed in as \${email}\`}>\n    <Dropdown.LinkItem href="/app/settings">Settings</Dropdown.LinkItem>\n    <Dropdown.Item onClick={onLogout}>Log out</Dropdown.Item>\n  </Dropdown.Group>\n</Dropdown>`}
        />
        <p className="sg-note">
          Use <code>&lt;Dropdown&gt;</code> for a trigger that opens a short
          panel of actions (e.g. <code>AppNav</code>&apos;s account menu). The{" "}
          <code>label</code> is the trigger&apos;s text — a chevron is added
          after it for you, and a label too long for its container truncates
          with an ellipsis. Fill the panel with{" "}
          <code>&lt;Dropdown.LinkItem href&gt;</code> for navigation,{" "}
          <code>&lt;Dropdown.Item onClick&gt;</code> for an action, and{" "}
          <code>&lt;Dropdown.Separator /&gt;</code> between groups. A{" "}
          <code>&lt;Dropdown.Group label&gt;</code> heads a run of items with
          plain, non-clickable text (e.g. who you&apos;re signed in as), and{" "}
          <code>current</code> on a link item marks the page you&apos;re on
          (bold). For an icon-only trigger, pass the icon as <code>label</code>,
          give it an <code>aria-label</code>, and drop the chevron with{" "}
          <code>chevron={"{false}"}</code>. Keep an eye on the current item as
          this gets reused: a panel that marks where you are overlaps with a
          select input&apos;s chosen option, and bold is a first pass (#125),
          not a settled treatment. Behavior — focus moving into the panel and
          back to the trigger, arrow-key navigation, closing on{" "}
          <code>Escape</code> or an outside click — comes from Base UI&apos;s{" "}
          <code>Menu</code> (ADR-0014). The trigger is a <code>.button</code>:{" "}
          <code>variant</code> picks its look, like <code>Button</code>&apos;s —{" "}
          <code>"secondary"</code> by default, <code>"nav"</code> on the header
          bar. The panel aligns to the trigger&apos;s end edge so a trigger at
          the right of a bar opens inward; pass <code>align="start"</code> for a
          trigger at the left of a form. For on/off choices, fill it with{" "}
          <code>&lt;Dropdown.CheckboxItem checked onCheckedChange&gt;</code>{" "}
          instead — the panel stays open while they&apos;re toggled (see{" "}
          <code>TagPicker</code> below). Open it with the keyboard (Enter, then
          the arrow keys) to see the item highlight, which is the same for
          pointer and keyboard.
        </p>
      </Section>

      <Section id="header-bars" label="Header bars">
        <div className="sg-bar-demo">
          <Header />
        </div>
        <div className="sg-bar-demo">
          <AppNav
            email="someone@example.com"
            onLogout={() => {}}
            pathname="/app"
          />
        </div>
        <Snippet
          code={`<Link href="/login" className="button button--bar">Log In</Link>\n\n<Link href="/app" className="button button--nav" current={isCurrent}>\n  <PackageIcon />\n  Products\n</Link>\n\n<Dropdown label={email} variant="nav">…</Dropdown>`}
        />
        <p className="sg-note">
          The real <code>Header</code> (signed out) and <code>AppNav</code>{" "}
          (signed in, on <code>/app</code>) on the bar gradient. Everything
          clickable on a bar is a <code>.button</code>, so it&apos;s the same
          size and has the same hover outline as any other button:{" "}
          <code>button--bar</code> for Log In, <code>button--nav</code> for a
          section link, and a <code>Dropdown</code> with{" "}
          <code>variant=&quot;nav&quot;</code> for the account menu. The current
          section (<code>current</code> on its <code>Link</code>) takes a
          stronger wash and goes bold. Narrow the window below 640px to see{" "}
          <code>AppNav</code> collapse into its ☰ menu.
        </p>
      </Section>

      <Section id="footers" label="Footers">
        <div className="sg-bar-demo">
          <Footer />
        </div>
        <div className="sg-bar-demo">
          <Footer variant="marketing" />
        </div>
        <Snippet
          code={`<Footer />                      {/* in-app, the default */}\n<Footer variant="marketing" />  {/* public pages, signed out */}`}
        />
        <p className="sg-note">
          The layout picks the variant, not the page: <code>_appShell</code>{" "}
          always renders the in-app <code>Footer</code>, and{" "}
          <code>_withFooter</code> renders the marketing one when signed out and
          the in-app one when signed in (see{" "}
          <code>docs/design-decisions.md</code>).
        </p>
        <p className="sg-note">
          <strong>In-app</strong> (top): quiet, on the page color. Copyright on
          one end, Privacy Policy · Terms of Service as{" "}
          <a href="#links">quiet links</a> on the other, all at{" "}
          <code>--text-sm</code>. The middle dots are decorative and hidden from
          screen readers.
        </p>
        <p className="sg-note">
          <strong>Marketing</strong> (bottom): dark, from the{" "}
          <code>--color-footer-dark-*</code> tokens. Headings are{" "}
          <code>&lt;h2&gt;</code> sized as <code>.text-h3</code>; body and
          copyright gray; links cyan, going near-white on hover (4.75:1 and
          12.25:1 on the dark background). The description takes the left half,
          a sixth is left empty, and the stacked &ldquo;Learn More&rdquo; links
          take the right third.
        </p>
        <p className="sg-note">
          Narrow the window below 640px to see both stack into one column; the
          in-app links drop their dots and go vertical.
        </p>
      </Section>

      <Section id="text-inputs" label="Text inputs">
        <div className="sg-input-row">
          <TextInput id="sg-name" label="Name" />
          <TextInput
            id="sg-email"
            label="Email"
            type="email"
            helperText="We'll never share your email."
          />
        </div>
        <Snippet
          code={`<TextInput id="name" label="Name" />\n<TextInput\n  id="email"\n  label="Email"\n  type="email"\n  helperText="We'll never share your email."\n/>`}
        />
        <p className="sg-note">
          Use the <code>&lt;TextInput&gt;</code> component — it pairs an{" "}
          <code>.input</code> with an accessible <code>.input-label</code> and
          optional <code>.input-helper</code> text.
        </p>
      </Section>

      <Section id="sheet" label="Sheet">
        <article className="sheet">
          <h2>Product Summary</h2>
          <TextArea
            id="sg-sheet-problem"
            label="1. Problem"
            helperText="What problem does your product solve?"
          />
          <p className="sheet-credit">
            Credit: Adapted from Lean Canvas by Ash Maurya (
            <a href="#sheet">CC BY-SA 3.0</a>)
          </p>
        </article>
        <Snippet
          code={`<article className="sheet">\n  <h2>Product Summary</h2>\n  <TextArea\n    id="problem"\n    label="1. Problem"\n    helperText="What problem does your product solve?"\n  />\n  <p className="sheet-credit">Credit: …</p>\n</article>`}
        />
        <p className="sg-note">
          A Worksheet drawn as a sheet of paper: <code>.sheet</code> is white (
          <code>--color-sheet</code>) on the cream page, square, with no border
          or shadow. Its answers are <code>&lt;TextArea&gt;</code>s — ruled
          lines with the prompt between the question and the lines, three lines
          tall and growing as you type. A credit for adapted work goes last, in{" "}
          <code>.sheet-credit</code> (see <code>docs/design-decisions.md</code>
          ).
        </p>
      </Section>

      <Section id="field-row" label="Field with action">
        <div className="sg-field-row-demo">
          <div className="field-row">
            <TextInput id="sg-field-row-input" label="Email address" />
            <Button variant="primary">Send Code</Button>
          </div>
        </div>
        <Snippet
          code={`<div className="field-row">\n  <TextInput id="email" label="Email address" />\n  <Button>Send Code</Button>\n</div>`}
        />
        <p className="sg-note">
          Use <code>.field-row</code> whenever a labelled field has exactly one
          action attached to it (e.g. an email field + "Send Code"), instead of
          stacking the button below. Its button sits flush with the input&apos;s
          own top and bottom edges, not the label — verified pixel-for-pixel,
          not eyeballed (docs/adr/0012). It's for a single field with a single
          action — for two or more buttons with no field attached, use{" "}
          <code>.button-group</code> above instead. Below 640px (
          <code>--breakpoint-sm</code>) it stacks to a single column instead — a
          button's own widest label (e.g. "Verifying You're Human…") was
          squeezing the input down to almost nothing on a narrow screen
          otherwise (#90); resize the window to see it.
        </p>
      </Section>

      <Section id="tags" label="Tags">
        <form className="field-pair" onSubmit={(e) => e.preventDefault()}>
          <TextInput id="sg-idea-name" label="Idea name" />
          <TagPickerDemo />
        </form>
        <Snippet
          code={`<div className="field-pair">\n  <TextInput id="idea-name" label="Idea name" ... />\n  <TagPicker\n    id="idea-tags"\n    catalog={tagCatalog}\n    selected={tags}\n    onChange={setTags}\n  />\n</div>`}
        />
        <ul className="list list--tagged">
          <li className="list-row list-row--tagged">
            <div className="list-row-name">Onboarding checklist</div>
            <div className="list-row-tags">
              <TagList tags={["Design", "Pricing"]} />
            </div>
            <div className="list-row-action">
              <Button variant="secondary">Edit</Button>
            </div>
          </li>
          <li className="list-row list-row--tagged">
            <div className="list-row-name">
              An Idea with more Tags than its column holds
            </div>
            <div className="list-row-tags">
              <TagList
                tags={[
                  "Design",
                  "Distribution",
                  "Functionality",
                  "Pricing",
                  "Promotion",
                  "Staffing",
                ]}
              />
            </div>
            <div className="list-row-action">
              <Button variant="secondary">Edit</Button>
            </div>
          </li>
        </ul>
        <Snippet
          code={`<ul className="list list--tagged">\n  <li className="list-row list-row--tagged">\n    <div className="list-row-name">{idea.name}</div>\n    <div className="list-row-tags">\n      <TagList tags={idea.tags} />\n    </div>\n    <div className="list-row-action">...</div>\n  </li>\n</ul>`}
        />
        <p className="sg-note">
          A Tag is a condensed, filled pill — one neutral look for every Tag.
          The outlined &ldquo;+N&rdquo; pill stands for the Tags that
          didn&apos;t fit; it&apos;s outlined so it can never pass for a Tag.{" "}
          <code>&lt;TagList&gt;</code> shows an Idea&apos;s Tags on one line: as
          many as fit, then &ldquo;+N&rdquo;, a button opening a popover with
          every Tag. Below 640px it shows every pill, wrapped, instead. A pill
          too wide on its own is cut off with &ldquo;…&rdquo;.{" "}
          <code>&lt;TagPicker&gt;</code> is the form field for choosing them: a
          box shaped like a text input, always one line tall, holding the chosen
          pills the same way (its &ldquo;+N&rdquo; is plain text — the whole box
          opens the <code>Dropdown</code> of checkbox items). It isn&apos;t a
          native form control — the form holds <code>selected</code> and sends
          it on submit.
        </p>
        <p className="sg-note">
          <code>.field-pair</code> puts a main field and a narrow companion side
          by side, 3:1, the form&apos;s button(s) below (stacked below 640px).{" "}
          <code>.list--tagged</code>/<code>.list-row--tagged</code> give a row a
          fixed 14rem Tags column (<code>.list-row-tags</code>) between its name
          and its actions, so pills line up down the list; below 640px a row
          stacks name / Tags / actions with more room between rows. A tagged row
          edited in place takes <code>.list-row--editing</code>, a tinted panel.{" "}
          <code>.form-section</code> leaves a section&apos;s worth of room after
          a form, e.g. before the list it adds to (#113).
        </p>
      </Section>

      <Section id="list-row" label="Row with action">
        <div className="sg-list-row-demo">
          <ul className="list">
            <li className="list-row">
              <Link className="list-row-name" href="#">
                A phone-scale app
              </Link>
              <div className="list-row-action">
                <Button variant="secondary">Delete</Button>
              </div>
            </li>
            <li className="list-row">
              <Link className="list-row-name" href="#">
                A longer name to prove the actions still share a right edge
              </Link>
              <div className="list-row-action">
                <Button variant="secondary">Delete</Button>
              </div>
            </li>
          </ul>
        </div>
        <Snippet
          code={`<ul className="list">\n  <li className="list-row">\n    <Link className="list-row-name" href={...}>A phone-scale app</Link>\n    <div className="list-row-action">\n      <Button>Delete</Button>\n    </div>\n  </li>\n</ul>`}
        />
        <p className="sg-note">
          Use <code>.list</code>/<code>.list-row</code> for a row's own name or
          value with one action attached (e.g. a Product's name + Delete, an
          Idea's name + Edit/Delete) — instead of <code>.field-row</code> above,
          which is for a labelled input paired with one action, not a display
          row. Each row is laid out on its own — one row switching to a wider
          action set (a Delete/Cancel reveal, an inline rename) never shifts the
          others — while rows with the same actions still share a right edge.
          Below 640px every row stacks: name, then actions. A real{" "}
          <code>&lt;ul&gt;</code>/<code>&lt;li&gt;</code>, not a stack of{" "}
          <code>&lt;div&gt;</code>s — a list is a list, and assistive tech needs
          the actual markup to announce it as one.
        </p>
      </Section>

      <Section id="turnstile-container" label="Turnstile container">
        <div className="sg-turnstile-demo">
          <div className="turnstile-container" />
        </div>
        <Snippet
          code={`<div className="turnstile-container">\n  <Turnstile ... />\n</div>`}
        />
        <p className="sg-note">
          Wraps the Cloudflare Turnstile widget to reserve its footprint before
          it loads, so the challenge popping in doesn't shift a submit button
          below it. Fixed height, not <code>min-height</code> — Cloudflare's own
          widget sizing still wiggles within a min-height once it renders. Plain
          empty box in production — no placeholder background or skeleton; the
          dashed outline here exists only to make the reserved space visible in
          this demo.
        </p>
      </Section>

      <Section id="form-shell" label="Form shell">
        <div className="sg-form-shell-demo">
          <div className="form-shell">
            <h2>Sign in</h2>
            <p>Narrow column for short forms.</p>
          </div>
        </div>
        <Snippet
          code={`<div className="form-shell">\n  <h1>Sign in</h1>\n  <form>...</form>\n</div>`}
        />
        <p className="sg-note">
          Holds a short form (e.g. sign-in) in a narrow, left-aligned column,
          per AGENTS.md's rule that structural page layout is Grid, not Flexbox.
          The grid's own <code>gap</code> is the form's vertical rhythm — it
          covers spacing between top-level blocks (a heading, a{" "}
          <code>&lt;form&gt;</code>, error text) without page-local margins. The
          dashed outline here exists only to make the column&apos;s bounds
          visible in this demo.
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
    </div>
  );
}

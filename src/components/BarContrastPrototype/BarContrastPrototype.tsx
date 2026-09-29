/**
 * PROTOTYPE — throwaway, #120. Do not merge to main.
 *
 * Question: the account Dropdown's email trigger is normal-size text in
 * cream straight on the violet → magenta bar, under WCAG AA's 4.5:1. (The
 * wordmark is bold large text, so only 3:1 applies to it and it already
 * passes.) What background behind the trigger fixes it best?
 *
 * Four variants of the trigger, switchable via `?variant=` (or the
 * floating bar / ←→ keys), applied on every page so both Header (`/`) and
 * AppNav (`/app`) can be judged in place. The choice also sticks in
 * sessionStorage so navigating between pages keeps it.
 */
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

import "./BarContrastPrototype.css";

const VARIANTS = [
  {
    key: "A",
    name: "Baseline: cream text straight on the gradient",
    contrast: "worst 4.06",
  },
  {
    key: "B",
    name: "Trigger on a 20% dark translucent tint",
    contrast: "worst 5.20",
  },
  {
    key: "C",
    name: "Trigger on a 30% dark translucent tint",
    contrast: "worst 5.90",
  },
  {
    key: "D",
    name: "Trigger on solid cream, base01 text (matches bar button)",
    contrast: "4.99",
  },
] as const;

const STORAGE_KEY = "prototype-bar-variant";

function initialVariant(): string {
  const fromUrl = new URLSearchParams(window.location.search).get("variant");
  let fromStorage: string | null = null;
  try {
    fromStorage = sessionStorage.getItem(STORAGE_KEY);
  } catch {
    // storage unavailable — URL only
  }
  const key = fromUrl ?? fromStorage ?? "A";
  return VARIANTS.some((v) => v.key === key) ? key : "A";
}

export function BarContrastPrototype() {
  const [current, setCurrent] = useState(initialVariant);

  useEffect(() => {
    document.documentElement.dataset.barVariant = current;
    try {
      sessionStorage.setItem(STORAGE_KEY, current);
    } catch {
      // ignore
    }
    const url = new URL(window.location.href);
    url.searchParams.set("variant", current);
    window.history.replaceState(window.history.state, "", url);
  }, [current]);

  function step(delta: number) {
    setCurrent((key) => {
      const i = VARIANTS.findIndex((v) => v.key === key);
      return VARIANTS[(i + delta + VARIANTS.length) % VARIANTS.length].key;
    });
  }

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
      const target = event.target as HTMLElement | null;
      if (
        target?.closest(
          'input, textarea, [contenteditable], [role="menu"], [role="menuitem"]',
        )
      )
        return;
      step(event.key === "ArrowLeft" ? -1 : 1);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const variant = VARIANTS.find((v) => v.key === current)!;

  // Portaled to <body> so it never becomes a sibling of <main> inside
  // #root (that would break global.css's `main:only-child` layout rule).
  return createPortal(
    <div className="prototype-switcher" role="toolbar" aria-label="Prototype">
      <button type="button" onClick={() => step(-1)} aria-label="Previous">
        ←
      </button>
      <div className="prototype-switcher-label">
        <strong>
          {variant.key} ({variant.name})
        </strong>
        <span>Email trigger; AA needs 4.5 — {variant.contrast}</span>
      </div>
      <button type="button" onClick={() => step(1)} aria-label="Next">
        →
      </button>
    </div>,
    document.body,
  );
}

export default BarContrastPrototype;

// PROTOTYPE — throwaway. Lives on prototype/* branches only; never merge.
import { useEffect } from "react";

interface PrototypeSwitcherProps {
  variants: { key: string; name: string }[];
  current: string;
  onChange: (key: string) => void;
}

/**
 * A floating bar for flipping between a prototype's variants: arrows (or
 * ← / → when no field is focused) cycle, wrapping around. Dev builds only.
 */
export function PrototypeSwitcher({
  variants,
  current,
  onChange,
}: PrototypeSwitcherProps) {
  const index = Math.max(
    0,
    variants.findIndex((v) => v.key === current),
  );
  const step = (delta: number) =>
    onChange(variants[(index + delta + variants.length) % variants.length].key);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const t = e.target as HTMLElement;
      if (t.closest("input, textarea, select, [contenteditable]")) return;
      if (e.key === "ArrowLeft") step(-1);
      if (e.key === "ArrowRight") step(1);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  if (!import.meta.env.DEV) return null;
  const { key, name } = variants[index];
  return (
    <div
      style={{
        position: "fixed",
        bottom: "1rem",
        left: "50%",
        transform: "translateX(-50%)",
        display: "grid",
        gridAutoFlow: "column",
        alignItems: "center",
        gap: "0.75rem",
        padding: "0.5rem 0.75rem",
        borderRadius: "999px",
        background: "#111",
        color: "#fff",
        fontFamily: "system-ui, sans-serif",
        fontSize: "0.875rem",
        boxShadow: "0 4px 16px rgba(0,0,0,0.35)",
        zIndex: 1000,
        whiteSpace: "nowrap",
        maxWidth: "calc(100vw - 2rem)",
      }}
    >
      <button
        type="button"
        onClick={() => step(-1)}
        aria-label="Previous variant"
        style={{
          color: "#fff",
          background: "none",
          border: 0,
          cursor: "pointer",
          fontSize: "1rem",
        }}
      >
        ←
      </button>
      <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>
        {key} ({name})
      </span>
      <button
        type="button"
        onClick={() => step(1)}
        aria-label="Next variant"
        style={{
          color: "#fff",
          background: "none",
          border: 0,
          cursor: "pointer",
          fontSize: "1rem",
        }}
      >
        →
      </button>
    </div>
  );
}

export default PrototypeSwitcher;

// PROTOTYPE (#109) — throwaway. Lives on 109-prototype-breadcrumbs only; never merge.
import { createContext, useContext } from "react";

export const BREADCRUMB_VARIANTS = [
  { key: "A", name: "Plain text under the h1 (as built)" },
  { key: "B", name: "White band, edge to edge, under the nav bar" },
  { key: "C", name: "White box under the h1 (ActionCard / sheet)" },
  { key: "D", name: "Tag pills under the h1" },
  { key: "E", name: "White band, edge to edge, under the h1" },
  { key: "F", name: "Beige (surface) band, edge to edge, under the h1" },
  { key: "G", name: "Border rules, edge to edge, under the h1" },
];

export function initialVariant(): string {
  const fromUrl = new URLSearchParams(window.location.search).get("variant");
  let stored: string | null = null;
  try {
    stored = localStorage.getItem("proto-breadcrumbs-variant");
  } catch {
    stored = null;
  }
  const key = fromUrl ?? stored ?? "A";
  return BREADCRUMB_VARIANTS.some((v) => v.key === key) ? key : "A";
}

export function rememberVariant(key: string) {
  try {
    localStorage.setItem("proto-breadcrumbs-variant", key);
  } catch {
    // Private mode: the URL param still carries it.
  }
  const url = new URL(window.location.href);
  url.searchParams.set("variant", key);
  window.history.replaceState(window.history.state, "", url);
}

export const BreadcrumbsPrototype = createContext<{
  variant: string;
  bandSlot: HTMLElement | null;
}>({ variant: "A", bandSlot: null });

export const useBreadcrumbsPrototype = () => useContext(BreadcrumbsPrototype);

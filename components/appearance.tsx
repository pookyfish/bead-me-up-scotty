"use client";
import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Viewer-local appearance customization (accent + UI font), persisted in
 * localStorage and applied as CSS-variable overrides on <html>. Presets keep
 * every combination readable — accents carry a matched weak/strong pair so
 * chips and hovers stay in tune, and fonts are system stacks (no network
 * fetches; DM Sans is first in its stack for machines that have it — the
 * owner's standard font across her projects).
 */

export interface AccentPreset {
  key: string;
  name: string;
  brand: string;
  brand2: string;
  weakLight: string;
  weakDark: string;
}

export const ACCENT_PRESETS: AccentPreset[] = [
  { key: "indigo", name: "Indigo (default)", brand: "#6152ee", brand2: "#5546e0", weakLight: "#f4f3fe", weakDark: "#2a2749" },
  { key: "nord", name: "Nord frost", brand: "#5e81ac", brand2: "#4c6a91", weakLight: "#e9eef5", weakDark: "#2e3440" },
  { key: "teal", name: "Teal", brand: "#0d9488", brand2: "#0b7d73", weakLight: "#e6f5f3", weakDark: "#1f3a37" },
  { key: "rose", name: "Rose", brand: "#e11d63", brand2: "#c11855", weakLight: "#fdeaf1", weakDark: "#421a28" },
  { key: "amber", name: "Amber", brand: "#b45309", brand2: "#934408", weakLight: "#fbf0e3", weakDark: "#3d2b16" },
  { key: "grove", name: "Grove green", brand: "#15803d", brand2: "#116a33", weakLight: "#e8f5ec", weakDark: "#1d3326" },
];

export interface FontPreset {
  key: string;
  name: string;
  stack: string;
}

export const FONT_PRESETS: FontPreset[] = [
  { key: "geist", name: "Geist (default)", stack: "" }, // empty = leave the bundled font
  { key: "dmsans", name: "DM Sans", stack: '"DM Sans", "Segoe UI", system-ui, sans-serif' },
  { key: "system", name: "System", stack: 'system-ui, "Segoe UI", sans-serif' },
  { key: "serif", name: "Serif", stack: 'Georgia, "Times New Roman", serif' },
  { key: "mono", name: "Mono", stack: 'var(--font-geist-mono), Consolas, monospace' },
];

const KEY = "bmus.appearance";

export interface AppearanceState {
  accent: string;
  font: string;
}

export function loadAppearance(): AppearanceState {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || "{}");
    return { accent: raw.accent || "indigo", font: raw.font || "geist" };
  } catch {
    return { accent: "indigo", font: "geist" };
  }
}

export function applyAppearance(state: AppearanceState) {
  const root = document.documentElement;
  const accent = ACCENT_PRESETS.find((a) => a.key === state.accent) ?? ACCENT_PRESETS[0];
  if (accent.key === "indigo") {
    root.style.removeProperty("--brand");
    root.style.removeProperty("--brand-2");
    root.style.removeProperty("--brand-weak");
  } else {
    root.style.setProperty("--brand", accent.brand);
    root.style.setProperty("--brand-2", accent.brand2);
    const dark = root.classList.contains("dark");
    root.style.setProperty("--brand-weak", dark ? accent.weakDark : accent.weakLight);
  }
  const font = FONT_PRESETS.find((f) => f.key === state.font) ?? FONT_PRESETS[0];
  if (font.stack) root.style.setProperty("--font-sans", font.stack);
  else root.style.removeProperty("--font-sans");
}

export function saveAppearance(state: AppearanceState) {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    /* applies for the session regardless */
  }
  applyAppearance(state);
}

/** Mounted once in the shell: applies saved appearance and re-applies when the
 *  light/dark class flips (brand-weak differs per scheme). */
export function AppearanceBoot() {
  React.useEffect(() => {
    applyAppearance(loadAppearance());
    const observer = new MutationObserver(() => applyAppearance(loadAppearance()));
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    return () => observer.disconnect();
  }, []);
  return null;
}

export function AppearanceControls() {
  const [state, setState] = React.useState<AppearanceState>(() =>
    typeof window === "undefined" ? { accent: "indigo", font: "geist" } : loadAppearance(),
  );
  const update = (patch: Partial<AppearanceState>) => {
    const next = { ...state, ...patch };
    setState(next);
    saveAppearance(next);
  };
  return (
    <div className="flex flex-col gap-3">
      <div>
        <div className="mb-[6px] text-[12px] font-[600] text-[var(--text-2)]">Accent</div>
        <div className="flex flex-wrap gap-[8px]">
          {ACCENT_PRESETS.map((a) => (
            <button
              key={a.key}
              title={a.name}
              onClick={() => update({ accent: a.key })}
              className={cn(
                "h-7 w-7 rounded-full border-2 transition-transform hover:scale-110",
                state.accent === a.key ? "border-[var(--text)]" : "border-transparent",
              )}
              style={{ background: a.brand }}
            />
          ))}
        </div>
      </div>
      <div>
        <div className="mb-[6px] text-[12px] font-[600] text-[var(--text-2)]">UI font</div>
        <div className="flex flex-wrap gap-[6px]">
          {FONT_PRESETS.map((f) => (
            <button
              key={f.key}
              onClick={() => update({ font: f.key })}
              style={f.stack ? { fontFamily: f.stack } : undefined}
              className={cn(
                "rounded-[8px] border px-[10px] py-[5px] text-[12.5px]",
                state.font === f.key
                  ? "border-[var(--brand)]/50 bg-[var(--brand-weak)] text-[var(--brand)] font-[650]"
                  : "border-border bg-[var(--surface-2)] text-[var(--text-2)] hover:text-[var(--text)]",
              )}
            >
              {f.name}
            </button>
          ))}
        </div>
        <p className="mt-[6px] text-[11px] text-[var(--text-3)]">
          Viewer-local — stored in this browser, applies instantly, never touches beads data.
        </p>
      </div>
    </div>
  );
}

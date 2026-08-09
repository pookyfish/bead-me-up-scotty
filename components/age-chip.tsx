"use client";
import { ageOf } from "@/lib/bead-age";
import { cn } from "@/lib/utils";
import type { Bead } from "@/lib/schema";

/** Compact last-touched age. Stale beads (~a patch old or more) get a warm
 *  tint so probably-obsolete work is visibly suspect at a glance. */
export function AgeChip({ bead, className }: { bead: Bead; className?: string }) {
  const age = ageOf(bead);
  if (!age) return null;
  return (
    <span
      title={age.title}
      className={cn(
        "inline-flex items-center gap-[3px] rounded-full px-[6px] py-px font-mono text-[10.5px] leading-[1.4]",
        age.tone === "stale"
          ? "bg-[var(--ink-orange)]/12 font-semibold text-[var(--ink-orange)]"
          : age.tone === "aging"
            ? "text-[var(--text-3)]"
            : "text-[var(--text-3)] opacity-80",
        className,
      )}
    >
      {age.tone === "stale" && <span aria-hidden>⌛</span>}
      {age.label}
    </span>
  );
}

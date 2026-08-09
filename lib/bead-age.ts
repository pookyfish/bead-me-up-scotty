import type { Bead } from "./schema";

/**
 * Age + staleness for a bead — the owner's rule: work from several patches ago
 * is probably stale, especially fixes for things that change patch to patch.
 * Buckets (game patches land roughly monthly):
 *   fresh  < 7 days    — current work
 *   aging  < 45 days   — within the current patch window, roughly
 *   stale  ≥ 45 days   — likely predates the current patch; treat with suspicion
 * Age is measured from the LAST TOUCH (updated_at, else created_at): an old
 * bead that is actively worked is not stale.
 */
export type AgeTone = "fresh" | "aging" | "stale";

export interface BeadAge {
  days: number;
  label: string;
  tone: AgeTone;
  /** Hover text, incl. the patch-drift warning when stale. */
  title: string;
}

export function ageLabel(days: number): string {
  if (days < 1) return "today";
  if (days < 30) return `${Math.floor(days)}d`;
  if (days < 365) return `${Math.floor(days / 30)}mo`;
  return `${(days / 365).toFixed(1)}y`;
}

export function ageOf(bead: Bead, now: number = Date.now()): BeadAge | null {
  const touched = bead.updated_at ?? bead.created_at;
  if (!touched) return null;
  const t = new Date(touched).getTime();
  if (isNaN(t)) return null;
  const days = Math.max(0, (now - t) / 86_400_000);
  const tone: AgeTone = days < 7 ? "fresh" : days < 45 ? "aging" : "stale";
  const label = ageLabel(days);
  const title =
    tone === "stale"
      ? `Last touched ${label} ago — likely predates the current game patch; verify it still applies.`
      : `Last touched ${label} ago`;
  return { days, label, tone, title };
}

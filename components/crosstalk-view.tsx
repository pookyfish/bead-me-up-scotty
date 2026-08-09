"use client";
import * as React from "react";
import { useApp } from "@/components/app-context";
import { Icon } from "@/components/icons";
import { originOf } from "@/lib/attribution";
import { avatarColor, initials, relTime, fmtDateTime } from "@/lib/beads-view";
import { cn } from "@/lib/utils";
import type { Bead } from "@/lib/schema";

/**
 * Crosstalk — agent-to-agent dialogue as it happens. In this workflow the
 * channel of record for inter-agent communication is BEAD COMMENTS (routing
 * rule, AGENTS.md 2026-08-08): reviews, verdicts, directives, nudges, and
 * counter-proposals all land there, each stamped with its BEADS_ACTOR. So a
 * conversation = a bead whose comments come from more than one actor, and an
 * exchange = consecutive comments by different actors.
 *
 * The view stays live for free: it derives from the same beads query the SSE
 * stream invalidates on every .beads write.
 *
 * Not captured (honestly): direct herdr pane prompts — by the routing rule
 * those are optional signaling and don't count as delivered anyway.
 */

interface Exchange {
  bead: Bead;
  actors: string[];
  hops: number; // actor-change transitions across the comment run
  lastAt: string;
  comments: { author: string; text: string; at: string }[];
}

function buildExchanges(beads: Bead[]): {
  exchanges: Exchange[];
  pairs: Map<string, number>;
  actors: Map<string, number>;
} {
  const exchanges: Exchange[] = [];
  const pairs = new Map<string, number>();
  const actors = new Map<string, number>();
  for (const bead of beads) {
    const comments = (bead.comments ?? [])
      .filter((c) => c.author && c.created_at)
      .map((c) => ({ author: c.author as string, text: c.text ?? "", at: c.created_at as string }));
    if (comments.length < 2) continue;
    const distinct = [...new Set(comments.map((c) => c.author))];
    if (distinct.length < 2) continue;
    let hops = 0;
    for (let i = 1; i < comments.length; i++) {
      const a = comments[i - 1].author;
      const b = comments[i].author;
      if (a !== b) {
        hops++;
        const key = [a, b].sort().join(" ⇄ ");
        pairs.set(key, (pairs.get(key) ?? 0) + 1);
      }
    }
    for (const c of comments) actors.set(c.author, (actors.get(c.author) ?? 0) + 1);
    exchanges.push({
      bead,
      actors: distinct,
      hops,
      lastAt: comments[comments.length - 1].at,
      comments,
    });
  }
  exchanges.sort((a, b) => b.lastAt.localeCompare(a.lastAt));
  return { exchanges, pairs, actors };
}

/** Who-talks-to-whom: actors as nodes on a line, arcs weighted by exchanges. */
function ActorArcs({ pairs, actors }: { pairs: Map<string, number>; actors: Map<string, number> }) {
  const names = [...actors.keys()].sort((a, b) => (actors.get(b) ?? 0) - (actors.get(a) ?? 0)).slice(0, 8);
  if (names.length < 2) return null;
  const W = 640;
  const H = 120;
  const xOf = (i: number) => 60 + (i * (W - 120)) / Math.max(1, names.length - 1);
  const maxW = Math.max(1, ...pairs.values());
  return (
    <div className="overflow-x-auto rounded-[10px] border border-border bg-[var(--surface)] px-3 py-2">
      <div className="mb-1 text-[11.5px] font-[650] text-[var(--text-2)]">Who talks to whom</div>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", maxWidth: 760, height: "auto", display: "block" }}>
        {[...pairs.entries()].map(([key, count]) => {
          const [a, b] = key.split(" ⇄ ");
          const ia = names.indexOf(a);
          const ib = names.indexOf(b);
          if (ia < 0 || ib < 0) return null;
          const x1 = xOf(Math.min(ia, ib));
          const x2 = xOf(Math.max(ia, ib));
          const lift = Math.min(58, 16 + (x2 - x1) / 8);
          return (
            <path
              key={key}
              d={`M ${x1} ${H - 34} C ${x1} ${H - 34 - lift}, ${x2} ${H - 34 - lift}, ${x2} ${H - 34}`}
              fill="none"
              stroke="var(--brand)"
              strokeOpacity={0.25 + 0.6 * (count / maxW)}
              strokeWidth={1 + (count / maxW) * 3.5}
            >
              <title>{`${key}: ${count} exchange${count === 1 ? "" : "s"}`}</title>
            </path>
          );
        })}
        {names.map((name, i) => (
          <g key={name}>
            <circle cx={xOf(i)} cy={H - 28} r={10} fill={avatarColor(name)}>
              <title>{`${name}: ${actors.get(name)} comments in conversations`}</title>
            </circle>
            <text x={xOf(i)} y={H - 24} textAnchor="middle" fontSize={7.5} fill="#fff" fontWeight={700}>
              {initials(name)}
            </text>
            <text x={xOf(i)} y={H - 8} textAnchor="middle" fontSize={8.5} fill="var(--text-2)">
              {name.length > 16 ? name.slice(0, 15) + "…" : name}
            </text>
          </g>
        ))}
      </svg>
    </div>
  );
}

function ExchangeCard({ ex }: { ex: Exchange }) {
  const { humanAllowlist, index, openDetail } = useApp();
  const [expanded, setExpanded] = React.useState(false);
  const shown = expanded ? ex.comments : ex.comments.slice(-3);
  return (
    <section className="rounded-[11px] border border-border bg-[var(--surface)] px-3 py-[9px]">
      <button
        onClick={() => (index.has(ex.bead.id) ? openDetail(ex.bead.id) : undefined)}
        className="flex w-full items-baseline gap-2 text-left"
      >
        <span className="font-mono text-[10.5px] text-[var(--text-3)]">{ex.bead.id.split("-").slice(-1)[0]}</span>
        <span className="min-w-0 flex-1 truncate text-[13px] font-[600]">{ex.bead.title}</span>
        <span className="flex-shrink-0 text-[10.5px] text-[var(--text-3)]">
          {ex.actors.length} actors · {ex.hops} hops · {relTime(ex.lastAt)}
        </span>
      </button>
      <ol className="mt-2 flex flex-col gap-[6px]">
        {!expanded && ex.comments.length > 3 && (
          <button
            onClick={() => setExpanded(true)}
            className="self-start rounded-[7px] border border-border px-[8px] py-[2px] text-[10.5px] text-[var(--text-3)] hover:text-[var(--text)]"
          >
            show {ex.comments.length - 3} earlier…
          </button>
        )}
        {shown.map((c, i) => {
          const origin = originOf(c.author, humanAllowlist);
          return (
            <li key={`${c.at}-${i}`} className="flex items-start gap-2">
              <span
                title={c.author}
                className="mt-[2px] flex h-[20px] w-[20px] flex-shrink-0 items-center justify-center rounded-full text-[8.5px] font-bold text-white"
                style={{ background: avatarColor(c.author) }}
              >
                {initials(c.author)}
              </span>
              <div
                className={cn(
                  "min-w-0 flex-1 rounded-[9px] border px-[10px] py-[6px]",
                  origin === "human"
                    ? "border-[var(--brand)]/30 bg-[var(--brand-weak)]"
                    : "border-border bg-[var(--surface-2)]",
                )}
              >
                <div className="mb-[2px] flex items-baseline gap-[6px]">
                  <span className="text-[11px] font-[700]">{c.author}</span>
                  <span aria-hidden className="text-[10px]">{origin === "human" ? "👤" : "🤖"}</span>
                  <span title={fmtDateTime(c.at)} className="ml-auto text-[10px] text-[var(--text-3)]">
                    {relTime(c.at)}
                  </span>
                </div>
                <p className="whitespace-pre-wrap break-words text-[11.5px] leading-[1.45] text-[var(--text-2)]">
                  {c.text.length > 420 && !expanded ? c.text.slice(0, 420) + "…" : c.text}
                </p>
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

export function CrosstalkView() {
  const { beads } = useApp();
  const { exchanges, pairs, actors } = React.useMemo(() => buildExchanges(beads), [beads]);
  const [shownCount, setShownCount] = React.useState(12);

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 border-b border-border px-6 py-4">
        <Icon name="crosstalk" size={18} className="text-[var(--text-2)]" />
        <h1 className="text-[15px] font-[650]">Crosstalk</h1>
        <span className="text-[12px] text-[var(--text-3)]">
          · agent-to-agent dialogue on beads, live · {exchanges.length} conversations
        </span>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
        {exchanges.length === 0 ? (
          <div className="p-8 text-center text-[13px] text-[var(--text-3)]">
            No multi-actor conversations yet. Cross-talk lands here as soon as two actors comment
            on the same bead — reviews, verdicts, directives, nudges. (Direct herdr pane pings are
            not recorded; by the routing rule, dialogue that matters goes on the bead.)
          </div>
        ) : (
          <div className="mx-auto flex max-w-3xl flex-col gap-3">
            <ActorArcs pairs={pairs} actors={actors} />
            {exchanges.slice(0, shownCount).map((ex) => (
              <ExchangeCard key={ex.bead.id} ex={ex} />
            ))}
            {exchanges.length > shownCount && (
              <button
                onClick={() => setShownCount((n) => n + 12)}
                className="self-center rounded-[9px] border border-border px-[12px] py-[6px] text-[12px] text-[var(--text-2)] hover:bg-[var(--surface-2)]"
              >
                show more conversations
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

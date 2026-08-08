"use client";
import * as React from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useApp } from "@/components/app-context";
import { useUnmerged } from "@/hooks/use-beads";
import { api } from "@/lib/api-client";
import { Icon } from "@/components/icons";
import { relTime, fmtDateTime } from "@/lib/beads-view";
import { cn } from "@/lib/utils";
import type { UnmergedBranch, PairConflict } from "@/lib/unmerged-types";

/**
 * Unmerged Work — the panel this fork exists for. Multi-agent repos grow
 * branches whose features get finished and then lost unmerged; this view lists
 * every branch not merged into the base ref, links each to its bead, and
 * screams about the lethal combo: bead CLOSED but branch never merged.
 *
 * Acks ("deliberately unmerged") are keyed on name@sha in localStorage, so a
 * new commit on an acked branch re-surfaces it.
 */

const ackKey = (projectId: string) => `bmus.unmergedAck.${projectId}`;

function loadAcks(projectId: string): Set<string> {
  try {
    const raw = localStorage.getItem(ackKey(projectId));
    return new Set(raw ? (JSON.parse(raw) as string[]) : []);
  } catch {
    return new Set();
  }
}

function Chip({
  tone,
  title,
  children,
}: {
  tone: "red" | "amber" | "green" | "muted" | "brand";
  title?: string;
  children: React.ReactNode;
}) {
  const tones: Record<string, string> = {
    red: "bg-[#ef4444]/12 text-[#ef4444] border-[#ef4444]/35",
    amber: "bg-[#f59e0b]/12 text-[#b45309] dark:text-[#fbbf24] border-[#f59e0b]/35",
    green: "bg-[#22c55e]/12 text-[#15803d] dark:text-[#4ade80] border-[#22c55e]/35",
    muted: "border-border bg-[var(--surface-2)] text-[var(--text-3)]",
    brand: "border-[var(--brand)]/35 bg-[var(--brand-weak)] text-[var(--brand)]",
  };
  return (
    <span
      title={title}
      className={cn(
        "inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-[7px] py-px text-[10.5px] font-semibold",
        tones[tone],
      )}
    >
      {children}
    </span>
  );
}

function BranchRow({
  b,
  pairs,
  acked,
  onAck,
}: {
  b: UnmergedBranch;
  pairs: PairConflict[];
  acked: boolean;
  onAck: (ack: boolean) => void;
}) {
  const { index, openDetail } = useApp();
  const [open, setOpen] = React.useState(false);
  const myPairs = pairs.filter(
    (p) => p.state === "conflicts" && (p.a === b.name || p.b === b.name),
  );
  const red = b.closedBeadUnmerged && !acked;

  return (
    <li
      className={cn(
        "rounded-[10px] border px-3 py-[9px]",
        red
          ? "border-[#ef4444]/50 bg-[#ef4444]/[.06]"
          : "border-border bg-[var(--surface)]",
        acked && "opacity-55",
      )}
    >
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <button
          onClick={() => setOpen((o) => !o)}
          className="flex min-w-0 items-center gap-[6px] text-left"
          title={open ? "Hide files" : "Show changed files"}
        >
          <Icon
            name="chevron"
            size={13}
            className={cn("flex-shrink-0 text-[var(--text-3)] transition-transform", !open && "-rotate-90")}
          />
          <span className="truncate font-mono text-[12.5px] font-semibold">{b.name}</span>
        </button>
        <span className="font-mono text-[10.5px] text-[var(--text-3)]">{b.sha}</span>
        <span title={fmtDateTime(b.committedAt)} className="text-[11px] text-[var(--text-3)]">
          {relTime(b.committedAt)} · {b.aheadCount} ahead
        </span>

        <span className="flex-1" />

        {red && <Chip tone="red" title="The linked bead is CLOSED but this branch was never merged — finished work is sitting unmerged.">⛔ closed bead, unmerged</Chip>}
        {b.conflict.state === "clean" && <Chip tone="green" title="Trial merge against the base ref is clean (git merge-tree, in-memory).">✓ merges clean</Chip>}
        {b.conflict.state === "conflicts" && (
          <Chip tone="amber" title={`Conflicts with the base ref:\n${b.conflict.files.join("\n")}`}>
            ⚠ {b.conflict.files.length} conflict{b.conflict.files.length === 1 ? "" : "s"}
          </Chip>
        )}
        {myPairs.length > 0 && (
          <Chip
            tone="amber"
            title={myPairs.map((p) => `vs ${p.a === b.name ? p.b : p.a}: ${p.files.length} conflicting file(s)`).join("\n")}
          >
            ⚔ fights {myPairs.length} branch{myPairs.length === 1 ? "" : "es"}
          </Chip>
        )}
        {b.buildAlongside && (
          <Chip tone="amber" title="This branch ONLY adds new files — possible parallel system built alongside existing code instead of extending it.">
            adds-only
          </Chip>
        )}
        {b.clusterId >= 0 && (
          <Chip tone="muted" title="Shares changed files with other unmerged branches (see cluster grouping).">
            cluster {b.clusterId + 1}
          </Chip>
        )}
        {b.deliberateHint && <Chip tone="muted" title="Branch name marks it deliberately unmerged.">named deliberate</Chip>}

        {b.bead ? (
          <button
            onClick={() => (index.has(b.bead!.id) ? openDetail(b.bead!.id) : undefined)}
            title={`${b.bead.title}\n(${b.bead.match === "id" ? "matched by bead id" : "fuzzy title match"})`}
            className={cn(
              "inline-flex items-center gap-1 rounded-full border px-[7px] py-px font-mono text-[10.5px] font-semibold",
              b.bead.status === "closed"
                ? "border-[#ef4444]/40 text-[#ef4444]"
                : "border-[var(--brand)]/40 text-[var(--brand)] hover:bg-[var(--brand-weak)]",
              b.bead.match === "fuzzy" && "border-dashed",
            )}
          >
            {b.bead.id.split("-").slice(-1)[0]} · {b.bead.status}
          </button>
        ) : (
          <Chip tone="amber" title="No bead found matching this branch name or its commit subjects — untracked work.">
            no bead
          </Chip>
        )}

        <button
          onClick={() => onAck(!acked)}
          title={acked ? "Un-mark: surface this branch again" : "Mark deliberately unmerged (kept locally; re-surfaces if the branch gets new commits)"}
          className="rounded-md border border-border px-[7px] py-px text-[10.5px] font-medium text-[var(--text-3)] hover:bg-[var(--surface-2)] hover:text-[var(--text)]"
        >
          {acked ? "un-ack" : "ack"}
        </button>
      </div>

      <div className="mt-[2px] truncate pl-[19px] text-[12px] text-[var(--text-2)]">{b.subject}</div>

      {open && (
        <div className="mt-2 rounded-[8px] bg-[var(--surface-2)] px-3 py-2 pl-[19px]">
          <div className="text-[11px] font-semibold text-[var(--text-2)]">
            {b.changedFiles.length}
            {b.filesTruncated ? "+" : ""} changed file{b.changedFiles.length === 1 ? "" : "s"} vs merge-base
          </div>
          <ul className="mt-1 max-h-[220px] overflow-y-auto font-mono text-[11px] leading-[1.6] text-[var(--text-3)]">
            {b.changedFiles.map((f) => (
              <li key={f.path} className="truncate">
                <span
                  className={cn(
                    "mr-[6px] inline-block w-[10px] font-semibold",
                    f.status === "A" && "text-[#22c55e]",
                    f.status === "D" && "text-[#ef4444]",
                    f.status === "M" && "text-[#f59e0b]",
                  )}
                >
                  {f.status}
                </span>
                <span className={cn(b.conflict.files.includes(f.path) && "text-[#ef4444]")}>{f.path}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </li>
  );
}

export function UnmergedView() {
  const { projectId } = useApp();
  const { data, isLoading } = useUnmerged(projectId);
  const qc = useQueryClient();
  const [refreshing, setRefreshing] = React.useState(false);
  const [acks, setAcks] = React.useState<Set<string>>(() =>
    typeof window === "undefined" ? new Set() : loadAcks(projectId),
  );

  const setAck = React.useCallback(
    (key: string, on: boolean) => {
      setAcks((prev) => {
        const next = new Set(prev);
        if (on) next.add(key);
        else next.delete(key);
        try {
          localStorage.setItem(ackKey(projectId), JSON.stringify([...next]));
        } catch {
          /* best-effort */
        }
        return next;
      });
    },
    [projectId],
  );

  const refresh = React.useCallback(async () => {
    setRefreshing(true);
    try {
      const fresh = await api.unmerged(projectId, true);
      qc.setQueryData(["unmerged", projectId], fresh);
    } finally {
      setRefreshing(false);
    }
  }, [projectId, qc]);

  const branches = React.useMemo(() => {
    const list = [...(data?.branches ?? [])];
    const key = (b: UnmergedBranch) => `${b.name}@${b.sha}`;
    // Red flags first, then untracked (no bead), then by recency; acked sink.
    list.sort((a, b) => {
      const aAck = acks.has(key(a)) || a.deliberateHint;
      const bAck = acks.has(key(b)) || b.deliberateHint;
      if (aAck !== bAck) return aAck ? 1 : -1;
      const aRed = a.closedBeadUnmerged && !aAck;
      const bRed = b.closedBeadUnmerged && !bAck;
      if (aRed !== bRed) return aRed ? -1 : 1;
      if (!a.bead !== !b.bead) return a.bead ? 1 : -1;
      return b.committedAt.localeCompare(a.committedAt);
    });
    return list;
  }, [data, acks]);

  const redCount = branches.filter(
    (b) => b.closedBeadUnmerged && !acks.has(`${b.name}@${b.sha}`) && !b.deliberateHint,
  ).length;
  const pairs = data?.pairs ?? [];
  const conflictPairs = pairs.filter((p) => p.state === "conflicts");

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 border-b border-border px-6 py-4">
        <Icon name="branch" size={18} className="text-[var(--text-2)]" />
        <h1 className="text-[15px] font-[650]">Unmerged Work</h1>
        <span className="text-[12px] text-[var(--text-3)]">
          · branches not merged into {data?.baseRef ?? "the base ref"} — finished work must not get lost here
        </span>
        <span className="flex-1" />
        {data?.generatedAt && (
          <span title={fmtDateTime(data.generatedAt)} className="text-[11px] text-[var(--text-3)]">
            scanned {relTime(data.generatedAt)}
          </span>
        )}
        <button
          onClick={refresh}
          disabled={refreshing}
          className="rounded-md border border-border px-[10px] py-1 text-[12px] font-medium text-[var(--text-2)] hover:bg-[var(--surface-2)] hover:text-[var(--text)] disabled:opacity-50"
        >
          {refreshing ? "Scanning…" : "Rescan"}
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
        {isLoading && !data ? (
          <div className="p-8 text-center text-[13px] text-[var(--text-3)]">
            Scanning branches (read-only git — trial merges never touch the working tree)…
          </div>
        ) : !data?.available ? (
          <div className="p-8 text-center text-[13px] text-[var(--text-3)]">{data?.reason}</div>
        ) : branches.length === 0 ? (
          <div className="p-8 text-center text-[13px] text-[var(--text-3)]">
            🎉 Every local branch is merged into {data.baseRef}. Nothing is lost.
          </div>
        ) : (
          <div className="mx-auto flex max-w-4xl flex-col gap-3">
            {redCount > 0 && (
              <div className="rounded-[10px] border border-[#ef4444]/50 bg-[#ef4444]/[.08] px-4 py-2 text-[12.5px] font-medium text-[#ef4444]">
                ⛔ {redCount} branch{redCount === 1 ? " has" : "es have"} a CLOSED bead but never
                merged — that work is finished and lost. Merge it or ack it as deliberate.
              </div>
            )}

            <ul className="flex flex-col gap-[6px]">
              {branches.map((b) => (
                <BranchRow
                  key={`${b.name}@${b.sha}`}
                  b={b}
                  pairs={pairs}
                  acked={acks.has(`${b.name}@${b.sha}`) || b.deliberateHint}
                  onAck={(on) => setAck(`${b.name}@${b.sha}`, on)}
                />
              ))}
            </ul>

            {conflictPairs.length > 0 && (
              <section>
                <h2 className="mb-1 mt-2 text-[12.5px] font-[650] text-[var(--text-2)]">
                  ⚔ Branch-vs-branch conflicts ({conflictPairs.length})
                </h2>
                <ul className="flex flex-col gap-[4px]">
                  {conflictPairs.map((p) => (
                    <li
                      key={`${p.a}|${p.b}`}
                      className="rounded-[8px] border border-[#f59e0b]/40 bg-[#f59e0b]/[.06] px-3 py-[6px] text-[12px]"
                      title={p.files.join("\n")}
                    >
                      <span className="font-mono font-semibold">{p.a}</span>
                      <span className="mx-[6px] text-[var(--text-3)]">vs</span>
                      <span className="font-mono font-semibold">{p.b}</span>
                      <span className="ml-2 text-[var(--text-3)]">
                        {p.files.length} conflicting file{p.files.length === 1 ? "" : "s"} — whichever
                        merges second will fight
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {(data.similarOpenBeads?.length ?? 0) > 0 && (
              <SimilarBeads pairs={data.similarOpenBeads} />
            )}

            {data.notes.length > 0 && (
              <div className="text-[11px] text-[var(--text-3)]">{data.notes.join(" · ")}</div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function SimilarBeads({ pairs }: { pairs: { aId: string; aTitle: string; bId: string; bTitle: string; score: number }[] }) {
  const { index, openDetail } = useApp();
  const chip = (id: string, title: string) => (
    <button
      onClick={() => (index.has(id) ? openDetail(id) : undefined)}
      title={title}
      className="inline-flex max-w-[45%] items-center gap-1 truncate rounded-full border border-[var(--brand)]/40 px-[8px] py-px text-[11px] font-medium text-[var(--brand)] hover:bg-[var(--brand-weak)]"
    >
      <span className="font-mono font-semibold">{id.split("-").slice(-1)[0]}</span>
      <span className="truncate">{title}</span>
    </button>
  );
  return (
    <section>
      <h2 className="mb-1 mt-2 text-[12.5px] font-[650] text-[var(--text-2)]">
        👯 Possibly duplicate open beads
      </h2>
      <p className="mb-1 text-[11.5px] text-[var(--text-3)]">
        Near-identical titles — two agents may be building the same system in parallel. The board
        flags; you and the supervisor judge.
      </p>
      <ul className="flex flex-col gap-[4px]">
        {pairs.map((p) => (
          <li
            key={`${p.aId}|${p.bId}`}
            className="flex items-center gap-2 rounded-[8px] border border-border bg-[var(--surface)] px-3 py-[6px]"
          >
            {chip(p.aId, p.aTitle)}
            <span className="text-[11px] text-[var(--text-3)]">≈</span>
            {chip(p.bId, p.bTitle)}
            <span className="ml-auto font-mono text-[10.5px] text-[var(--text-3)]">
              {Math.round(p.score * 100)}%
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

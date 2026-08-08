"use client";
import * as React from "react";
import { useApp } from "@/components/app-context";
import { Icon } from "@/components/icons";
import { OriginBadge } from "@/components/board/bead-card";
import { originOf } from "@/lib/attribution";
import { catColor, statusLabel, typeLabel, fmtDate } from "@/lib/beads-view";
import { cn } from "@/lib/utils";
import type { Bead } from "@/lib/schema";

/**
 * Timeline — a month calendar of what actually happened: beads created, closed,
 * and commented, day by day, with an overview strip and a per-day detail list.
 * Built entirely from the beads the app already holds (created_at / closed_at /
 * comment timestamps) — no extra API, so it stays live with the SSE stream.
 */

type DayEvent = {
  kind: "created" | "closed" | "commented";
  bead: Bead;
  actor?: string;
  at: string;
};

/** Local-date key (YYYY-MM-DD) so events land on the day the owner experienced. */
function dayKey(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function collectEvents(beads: Bead[]): Map<string, DayEvent[]> {
  const map = new Map<string, DayEvent[]>();
  const push = (key: string, ev: DayEvent) => {
    if (!key) return;
    const list = map.get(key);
    if (list) list.push(ev);
    else map.set(key, [ev]);
  };
  for (const b of beads) {
    if (b.created_at) {
      push(dayKey(b.created_at), { kind: "created", bead: b, actor: b.created_by ?? undefined, at: b.created_at });
    }
    if (b.closed_at) {
      push(dayKey(b.closed_at), { kind: "closed", bead: b, at: b.closed_at });
    }
    for (const c of b.comments ?? []) {
      if (c.created_at) {
        push(dayKey(c.created_at), { kind: "commented", bead: b, actor: c.author ?? undefined, at: c.created_at });
      }
    }
  }
  for (const list of map.values()) list.sort((a, b) => a.at.localeCompare(b.at));
  return map;
}

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const EVENT_META: Record<DayEvent["kind"], { label: string; symbol: string; color: string }> = {
  created: { label: "created", symbol: "+", color: "var(--brand)" },
  closed: { label: "closed", symbol: "✓", color: "#22c55e" },
  commented: { label: "commented on", symbol: "💬", color: "var(--text-3)" },
};

function DayCell({
  date,
  inMonth,
  isToday,
  events,
  selected,
  onSelect,
  maxCount,
}: {
  date: Date;
  inMonth: boolean;
  isToday: boolean;
  events: DayEvent[];
  selected: boolean;
  onSelect: () => void;
  maxCount: number;
}) {
  const created = events.filter((e) => e.kind === "created").length;
  const closed = events.filter((e) => e.kind === "closed").length;
  const commented = events.filter((e) => e.kind === "commented").length;
  // Heat: activity relative to the month's busiest day.
  const heat = maxCount > 0 ? Math.min(1, events.length / maxCount) : 0;

  return (
    <button
      onClick={onSelect}
      className={cn(
        "flex min-h-[74px] flex-col items-stretch gap-[3px] rounded-[9px] border p-[6px] text-left transition-colors",
        selected
          ? "border-[var(--brand)] bg-[var(--brand-weak)]"
          : "border-border hover:border-[var(--brand)]/45",
        !inMonth && "opacity-35",
      )}
      style={
        !selected && heat > 0
          ? { background: `color-mix(in srgb, var(--brand) ${Math.round(4 + heat * 16)}%, var(--surface))` }
          : undefined
      }
    >
      <span
        className={cn(
          "self-end text-[11px] font-semibold leading-none",
          isToday
            ? "rounded-full bg-[var(--brand)] px-[6px] py-[3px] text-white"
            : "text-[var(--text-3)]",
        )}
      >
        {date.getDate()}
      </span>
      {events.length > 0 && (
        <span className="flex flex-wrap gap-x-[6px] gap-y-[2px] text-[10.5px] font-semibold leading-[1.3]">
          {created > 0 && <span style={{ color: "var(--brand)" }}>+{created}</span>}
          {closed > 0 && <span style={{ color: "#16a34a" }}>✓{closed}</span>}
          {commented > 0 && <span className="text-[var(--text-3)]">💬{commented}</span>}
        </span>
      )}
    </button>
  );
}

function DayDetail({ date, events }: { date: Date; events: DayEvent[] }) {
  const { humanAllowlist, index, openDetail } = useApp();
  if (events.length === 0) {
    return (
      <div className="rounded-[10px] border border-border bg-[var(--surface)] px-4 py-3 text-[12.5px] text-[var(--text-3)]">
        Nothing recorded on {fmtDate(date.toISOString())}.
      </div>
    );
  }
  return (
    <div className="rounded-[10px] border border-border bg-[var(--surface)] px-3 py-2">
      <div className="px-1 pb-1 text-[12px] font-[650]">
        {fmtDate(date.toISOString())} · {events.length} event{events.length === 1 ? "" : "s"}
      </div>
      <ol className="flex max-h-[300px] flex-col overflow-y-auto">
        {events.map((ev, i) => {
          const meta = EVENT_META[ev.kind];
          const time = new Date(ev.at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
          return (
            <li key={`${ev.bead.id}-${ev.kind}-${i}`}>
              <button
                onClick={() => (index.has(ev.bead.id) ? openDetail(ev.bead.id) : undefined)}
                className="flex w-full items-center gap-2 rounded-[8px] px-2 py-[5px] text-left hover:bg-[var(--surface-2)]"
              >
                <span className="w-[40px] flex-shrink-0 font-mono text-[10.5px] text-[var(--text-3)]">{time}</span>
                <span className="w-[14px] flex-shrink-0 text-center text-[11px]" style={{ color: meta.color }}>
                  {meta.symbol}
                </span>
                {ev.actor ? (
                  <span className="flex flex-shrink-0 items-center gap-1 text-[11.5px] font-semibold">
                    {ev.actor}
                    <OriginBadge
                      origin={originOf(ev.actor, humanAllowlist)}
                      title={originOf(ev.actor, humanAllowlist) === "human" ? "Human" : "Agent"}
                    />
                  </span>
                ) : (
                  <span className="flex-shrink-0 text-[11.5px] text-[var(--text-3)]">{meta.label}</span>
                )}
                {ev.actor && <span className="flex-shrink-0 text-[11.5px] text-[var(--text-3)]">{meta.label}</span>}
                <span
                  className="h-[7px] w-[7px] flex-shrink-0 rounded-full"
                  style={{ background: catColor(ev.bead.status) }}
                  title={statusLabel(ev.bead.status)}
                />
                <span className="min-w-0 flex-1 truncate text-[12.5px]">{ev.bead.title}</span>
                <span className="flex-shrink-0 font-mono text-[10.5px] text-[var(--text-3)]">
                  {typeLabel(ev.bead.issue_type)} · {ev.bead.id.split("-").slice(-1)[0]}
                </span>
              </button>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

export function TimelineView() {
  const { beads } = useApp();
  const today = new Date();
  const [anchor, setAnchor] = React.useState(() => new Date(today.getFullYear(), today.getMonth(), 1));
  const [selected, setSelected] = React.useState<string>(dayKey(today.toISOString()));

  const events = React.useMemo(() => collectEvents(beads), [beads]);

  const year = anchor.getFullYear();
  const month = anchor.getMonth();
  const gridStart = new Date(year, month, 1 - new Date(year, month, 1).getDay());
  const cells: Date[] = Array.from({ length: 42 }, (_, i) => {
    const d = new Date(gridStart);
    d.setDate(gridStart.getDate() + i);
    return d;
  });
  const monthKeys = cells.filter((d) => d.getMonth() === month).map((d) => dayKey(d.toISOString()));
  const monthEvents = monthKeys.flatMap((k) => events.get(k) ?? []);
  const maxCount = Math.max(0, ...monthKeys.map((k) => events.get(k)?.length ?? 0));
  const busiest = monthKeys.reduce(
    (best, k) => ((events.get(k)?.length ?? 0) > (events.get(best)?.length ?? 0) ? k : best),
    monthKeys[0] ?? "",
  );
  const actors = new Set(monthEvents.map((e) => e.actor).filter(Boolean));
  const created = monthEvents.filter((e) => e.kind === "created").length;
  const closed = monthEvents.filter((e) => e.kind === "closed").length;
  const commented = monthEvents.filter((e) => e.kind === "commented").length;

  const selectedDate = selected ? new Date(`${selected}T12:00:00`) : today;
  const todayKeyStr = dayKey(today.toISOString());

  const Stat = ({ label, value }: { label: string; value: React.ReactNode }) => (
    <div className="flex flex-col rounded-[10px] border border-border bg-[var(--surface)] px-3 py-[7px]">
      <span className="text-[15px] font-[700] leading-tight">{value}</span>
      <span className="text-[10.5px] text-[var(--text-3)]">{label}</span>
    </div>
  );

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 border-b border-border px-6 py-4">
        <Icon name="calendar" size={18} className="text-[var(--text-2)]" />
        <h1 className="text-[15px] font-[650]">Timeline</h1>
        <span className="text-[12px] text-[var(--text-3)]">· what got done, and when</span>
        <span className="flex-1" />
        <button
          onClick={() => setAnchor(new Date(year, month - 1, 1))}
          className="rounded-md border border-border px-[9px] py-1 text-[13px] text-[var(--text-2)] hover:bg-[var(--surface-2)]"
          title="Previous month"
        >
          ‹
        </button>
        <span className="w-[150px] text-center text-[13.5px] font-[650]">
          {MONTHS[month]} {year}
        </span>
        <button
          onClick={() => setAnchor(new Date(year, month + 1, 1))}
          className="rounded-md border border-border px-[9px] py-1 text-[13px] text-[var(--text-2)] hover:bg-[var(--surface-2)]"
          title="Next month"
        >
          ›
        </button>
        <button
          onClick={() => {
            setAnchor(new Date(today.getFullYear(), today.getMonth(), 1));
            setSelected(todayKeyStr);
          }}
          className="rounded-md border border-border px-[10px] py-1 text-[12px] font-medium text-[var(--text-2)] hover:bg-[var(--surface-2)]"
        >
          Today
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
        <div className="mx-auto flex max-w-4xl flex-col gap-3">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
            <Stat label="created this month" value={<span style={{ color: "var(--brand)" }}>+{created}</span>} />
            <Stat label="closed this month" value={<span style={{ color: "#16a34a" }}>✓{closed}</span>} />
            <Stat label="comments" value={commented} />
            <Stat label="active actors" value={actors.size} />
            <Stat
              label="busiest day"
              value={
                busiest && (events.get(busiest)?.length ?? 0) > 0 ? (
                  <button className="underline decoration-dotted underline-offset-2" onClick={() => setSelected(busiest)}>
                    {new Date(`${busiest}T12:00:00`).getDate()} {MONTHS[month].slice(0, 3)}
                  </button>
                ) : (
                  "—"
                )
              }
            />
          </div>

          <div>
            <div className="mb-1 grid grid-cols-7 gap-[6px]">
              {DOW.map((d) => (
                <div key={d} className="text-center text-[10.5px] font-semibold text-[var(--text-3)]">
                  {d}
                </div>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-[6px]">
              {cells.map((d) => {
                const k = dayKey(d.toISOString());
                return (
                  <DayCell
                    key={k}
                    date={d}
                    inMonth={d.getMonth() === month}
                    isToday={k === todayKeyStr}
                    events={events.get(k) ?? []}
                    selected={k === selected}
                    onSelect={() => setSelected(k)}
                    maxCount={maxCount}
                  />
                );
              })}
            </div>
          </div>

          <DayDetail date={selectedDate} events={events.get(selected) ?? []} />

          <div className="text-[11px] text-[var(--text-3)]">
            + created · ✓ closed · 💬 commented — cell tint deepens with activity; click a day for
            its full event list, click an event to open the bead.
          </div>
        </div>
      </div>
    </div>
  );
}

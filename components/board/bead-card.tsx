"use client";
import * as React from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { Bead } from "@/lib/schema";
import { Icon, typeIconName } from "@/components/icons";
import { useApp } from "@/components/app-context";
import { CopyableId } from "@/components/copyable-id";
import { AgeChip } from "@/components/age-chip";
import { beadOrigin, originTitle } from "@/lib/attribution";
import { cn } from "@/lib/utils";
import {
  catColor,
  catInk,
  statusLabel,
  prioColor,
  prioLabel,
  typeColor,
  typeLabel,
  avatarColor,
  initials,
  isBlocked,
  parentOf,
  checklistProgress,
} from "@/lib/beads-view";

export function BeadCard({ bead, childCount = 0 }: { bead: Bead; childCount?: number }) {
  const { index, humanAllowlist, openDetail } = useApp();
  // setActivatorNodeRef (not setNodeRef) is what dnd-kit calls a drag HANDLE.
  // The handle here is the title button, whose ::after covers the whole card —
  // so the card is still dragged and clicked from anywhere, while the card
  // element itself stops being an interactive control with controls inside it.
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: bead.id });

  const o = beadOrigin(bead, humanAllowlist);
  const parent = parentOf(bead, index);
  const blocked = isBlocked(bead, index);
  const visLabels = (bead.labels ?? []).filter((l) => l !== "archived").slice(0, 2);
  const depCount = (bead.dependencies ?? []).filter((d) => d.type !== "parent-child").length;
  const commentCount = (bead.comments ?? []).length;
  const checklist = checklistProgress(bead.description);

  return (
    <article
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.4 : 1,
        boxShadow: "var(--shadow)",
        zIndex: isDragging ? 10 : undefined,
      }}
      className="bd-stretch flex cursor-pointer touch-none flex-col gap-[9px] rounded-[11px] border border-border bg-[var(--surface)] p-[12px_13px] transition-[border-color,box-shadow] hover:border-[var(--border-strong)] hover:shadow-[var(--shadow-lg)]"
    >
      <div className="flex items-center gap-2">
        <span
          className="h-2 w-2 flex-shrink-0 rounded-full"
          style={{ background: catColor(bead.status) }}
          title={statusLabel(bead.status)}
        />
        <CopyableId
          id={bead.id}
          className="bd-raise font-mono text-[11.5px] tracking-[-.01em] text-[var(--text-3)]"
        />
        <span className="flex-1" />
        {/* .bd-raise on the chips whose hover title is the ONLY place their
            information exists — the stretched overlay would otherwise swallow
            the hover. Chips that merely label a visible icon stay under it, so
            most of the card remains drag surface. */}
        <AgeChip bead={bead} className="bd-raise" />
        <PriorityChip p={bead.priority} />
        <OriginBadge origin={o} title={originTitle(bead.created_by, o)} className="bd-raise" />
      </div>

      {/* The card's single primary action AND its drag handle. Its ::after
          covers the whole card (.bd-stretch-action), so pointer-down anywhere
          but a .bd-raise child still starts a drag and a plain click still
          opens the bead — with one accessible name instead of a control nest. */}
      <h3 className="m-0 text-[13.5px] font-[550] leading-[1.35] tracking-[-.006em] text-[var(--text)] [text-wrap:pretty]">
        <button
          type="button"
          ref={setActivatorNodeRef}
          {...listeners}
          {...attributes}
          onClick={() => openDetail(bead.id)}
          className="bd-stretch-action touch-none rounded-[11px] text-left font-[inherit] tracking-[inherit]"
        >
          {bead.title}
        </button>
      </h3>

      <div className="flex flex-wrap items-center gap-2">
        <span className="inline-flex items-center gap-[5px] text-[11.5px] text-[var(--text-2)]">
          <Icon
            name={typeIconName(bead.issue_type)}
            size={13}
            style={{ color: typeColor(bead.issue_type) }}
          />
          <span>{typeLabel(bead.issue_type)}</span>
        </span>
        {visLabels.map((l) => (
          <span
            key={l}
            className="rounded-md border border-border bg-[var(--surface-2)] px-[6px] py-px font-mono text-[10.5px] text-[var(--text-3)]"
          >
            {l}
          </span>
        ))}
      </div>

      <div className="mt-px flex items-center gap-[10px] border-t border-border pt-[9px]">
        <span className="inline-flex min-w-0 items-center gap-[6px]">
          <span
            className="flex h-[19px] w-[19px] flex-shrink-0 items-center justify-center rounded-full text-[9.5px] font-semibold text-white"
            style={{ background: avatarColor(bead.assignee ?? "") }}
          >
            {initials(bead.assignee ?? "")}
          </span>
          <span className="overflow-hidden text-ellipsis whitespace-nowrap text-[11.5px] text-[var(--text-2)]">
            {bead.assignee || "Unassigned"}
          </span>
        </span>
        <span className="flex-1" />
        {depCount > 0 && (
          <span
            title="dependencies"
            className="inline-flex items-center gap-[3px] font-mono text-[11px]"
            style={{ color: blocked ? "var(--ink-red)" : "var(--text-3)" }}
          >
            <Icon name="link" size={13} />
            {depCount}
          </span>
        )}
        {commentCount > 0 && (
          <span
            title="comments"
            className="inline-flex items-center gap-[3px] font-mono text-[11px] text-[var(--text-3)]"
          >
            <Icon name="comment" size={13} />
            {commentCount}
          </span>
        )}
        {checklist.total > 0 && (
          <span
            title="checklist progress"
            className="inline-flex items-center gap-[3px] font-mono text-[11px]"
            style={{ color: checklist.done === checklist.total ? "var(--ok)" : "var(--text-3)" }}
          >
            <Icon name="check" size={13} />
            {checklist.done}/{checklist.total}
          </span>
        )}
        {/* Epic parents keep the brand-coloured chip; any other parent gets a
            neutral one with its own type icon. Previously every parent rendered
            as an "epic", which was already wrong and gets much more visible
            now that arbitrary subtasks exist. */}
        {parent && (
          <span
            title={`${parent.id} · ${parent.title}`}
            className={
              parent.issue_type === "epic"
                ? "bd-raise inline-flex max-w-[96px] items-center gap-1 rounded-md bg-[var(--brand-weak)] px-[6px] py-px text-[10.5px] font-[550] text-[var(--brand)]"
                : "bd-raise inline-flex max-w-[96px] items-center gap-1 rounded-md border border-border bg-[var(--surface-2)] px-[6px] py-px text-[10.5px] font-[550] text-[var(--text-3)]"
            }
          >
            <Icon
              name={parent.issue_type === "epic" ? "target" : typeIconName(parent.issue_type)}
              size={11}
              className="flex-shrink-0"
            />
            <span className="overflow-hidden text-ellipsis whitespace-nowrap">
              {parent.title.replace(/\s*\([^)]*\)\s*/, "")}
            </span>
          </span>
        )}
        {/* Subtask count — distinct from depCount, which deliberately excludes
            parent-child edges. Counted once per render by the board/list, not
            per card, to avoid an O(n^2) scan. */}
        {childCount > 0 && (
          <span
            title={`${childCount} subtask${childCount === 1 ? "" : "s"}`}
            className="inline-flex items-center gap-1 rounded-md border border-border bg-[var(--surface-2)] px-[6px] py-px text-[10.5px] font-[550] text-[var(--text-3)]"
          >
            <Icon name="list" size={11} className="flex-shrink-0" />
            {childCount}
          </span>
        )}
      </div>
    </article>
  );
}

export function PriorityChip({ p }: { p: number }) {
  const c = prioColor(p);
  return (
    <span
      className="inline-flex flex-shrink-0 items-center rounded-md px-[7px] py-[3px] text-[10.5px] font-semibold leading-none tracking-[.01em]"
      style={{
        color: c,
        background: `color-mix(in srgb, ${c} 7%, transparent)`,
        border: `1px solid color-mix(in srgb, ${c} 16%, transparent)`,
      }}
    >
      {prioLabel(p)}
    </span>
  );
}

/**
 * Status pill. Lived as a byte-identical private copy in BOTH epics-view and
 * bead-detail-drawer; it now lives once, next to the other chips.
 * `catInk`, not `catColor`: this one carries text, so it needs the AA-safe ink
 * rather than the dot fill.
 */
export function StatusChip({ status }: { status: string }) {
  const c = catInk(status);
  return (
    <span
      className="inline-flex items-center rounded-full px-2 py-px text-[10.5px] font-semibold tracking-[.01em]"
      style={{
        color: c,
        background: `color-mix(in srgb, ${c} 7%, transparent)`,
        border: `1px solid color-mix(in srgb, ${c} 16%, transparent)`,
      }}
    >
      {statusLabel(status)}
    </span>
  );
}

export function OriginBadge({
  origin,
  title,
  withLabel = false,
  className,
}: {
  origin: "human" | "agent";
  title: string;
  withLabel?: boolean;
  className?: string;
}) {
  const human = origin === "human";
  return (
    <span
      title={title}
      className={cn("inline-flex flex-shrink-0 items-center justify-center gap-[5px] rounded-md", className)}
      style={
        withLabel
          ? {
              padding: "3px 9px",
              fontSize: "11.5px",
              fontWeight: 550,
              color: human ? "var(--text-2)" : "var(--brand)",
              background: human ? "var(--surface-2)" : "var(--brand-weak)",
              border: `1px solid ${human ? "var(--border)" : "transparent"}`,
            }
          : {
              width: 20,
              height: 20,
              color: human ? "var(--text-2)" : "var(--brand)",
              background: human ? "var(--surface-2)" : "var(--brand-weak)",
              border: `1px solid ${human ? "var(--border)" : "var(--brand-weak)"}`,
            }
      }
    >
      <Icon name={human ? "user" : "bot"} size={withLabel ? 13 : 12} />
      {withLabel && (human ? "Human" : "Agent")}
    </span>
  );
}

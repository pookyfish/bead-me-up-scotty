"use client";
import * as React from "react";
import {
  ReactFlow,
  Background,
  Controls,
  Handle,
  Position,
  type Node,
  type Edge,
  type Connection,
  type NodeProps,
  type ReactFlowInstance,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { Icon, typeIconName } from "@/components/icons";
import { useApp } from "@/components/app-context";
import { useAddDep } from "@/hooks/use-beads";
import { catColor, typeColor } from "@/lib/beads-view";
import { cn } from "@/lib/utils";
import type { Bead } from "@/lib/schema";

/**
 * Dependency graph, rebuilt for real trackers (the upstream layout stacked
 * every non-epic bead into ONE vertical column — unreadable past ~40 beads,
 * hopeless at 1,000+):
 *  - defaults to OPEN work; closed beads are a toggle
 *  - isolated nodes (no edges under the current filters) are hidden behind a
 *    toggle — a graph is for relationships; unlinked work lives on the Board
 *  - edge kinds are toggleable; "related" (the spaghetti) is OFF by default
 *  - left-to-right layered layout per connected component: dependencies on
 *    the left, dependents flow right; components stack with breathing room
 *  - double-click a node to FOCUS its neighborhood (±2 hops); single click
 *    opens the drawer as before
 */

type BeadNodeData = { bead: Bead; onOpen: (id: string) => void; dim?: boolean };

function BeadNode({ data }: NodeProps) {
  const { bead, onOpen, dim } = data as unknown as BeadNodeData;
  return (
    <div
      onClick={() => onOpen(bead.id)}
      className={cn(
        "w-[150px] cursor-pointer rounded-[11px] border border-border bg-[var(--surface)] p-[9px_11px] shadow-[var(--shadow)] hover:border-[var(--border-strong)] hover:shadow-[var(--shadow-lg)]",
        dim && "opacity-40",
      )}
    >
      <Handle type="target" position={Position.Left} style={{ background: "var(--text-3)" }} />
      <div className="mb-[5px] flex items-center gap-[6px]">
        <span className="h-2 w-2 rounded-full" style={{ background: catColor(bead.status) }} />
        <span className="font-mono text-[10.5px] text-[var(--text-3)]">{bead.id.split("-").slice(-1)[0]}</span>
        <span className="flex-1" />
        <Icon name={typeIconName(bead.issue_type)} size={12} style={{ color: typeColor(bead.issue_type) }} />
      </div>
      <div className="text-[12px] font-[550] leading-[1.3] text-[var(--text)] [text-wrap:pretty]">
        {bead.title.replace(/\s*\([^)]*\)\s*/, "")}
      </div>
      <Handle type="source" position={Position.Right} style={{ background: "var(--text-3)" }} />
    </div>
  );
}

const nodeTypes = { bead: BeadNode };

interface EdgeKinds {
  blocks: boolean;
  parent: boolean;
  related: boolean;
}

function edgeKindOf(type: string): keyof EdgeKinds {
  if (type === "related" || type === "relates-to") return "related";
  if (type === "parent-child") return "parent";
  return "blocks"; // blocks / conditional-blocks / waits-for
}

const COLW = 240;
const ROWH = 118;
const COMPONENT_GAP = 60;

function buildGraph(
  beads: Bead[],
  kinds: EdgeKinds,
  showUnlinked: boolean,
  focusId: string | null,
  onOpen: (id: string) => void,
): { nodes: Node[]; edges: Edge[]; hiddenUnlinked: number } {
  const present = new Map(beads.map((b) => [b.id, b]));

  // Collect edges surviving the kind filters, both endpoints present.
  type RawEdge = { from: string; to: string; type: string; kind: keyof EdgeKinds };
  let raw: RawEdge[] = [];
  for (const b of beads) {
    for (const d of b.dependencies ?? []) {
      if (!present.has(d.depends_on_id)) continue;
      const kind = edgeKindOf(d.type);
      if (!kinds[kind]) continue;
      raw.push({ from: b.id, to: d.depends_on_id, type: d.type, kind });
    }
  }

  // Focus mode: keep only the ±2-hop neighborhood of the focused bead.
  if (focusId && present.has(focusId)) {
    const keep = new Set([focusId]);
    for (let hop = 0; hop < 2; hop++) {
      for (const e of raw) {
        if (keep.has(e.from)) keep.add(e.to);
        if (keep.has(e.to)) keep.add(e.from);
      }
    }
    raw = raw.filter((e) => keep.has(e.from) && keep.has(e.to));
    for (const id of [...present.keys()]) {
      if (!keep.has(id)) present.delete(id);
    }
  }

  const linked = new Set<string>();
  for (const e of raw) {
    linked.add(e.from);
    linked.add(e.to);
  }
  const allIds = [...present.keys()];
  const shownIds = showUnlinked || focusId ? allIds : allIds.filter((id) => linked.has(id));
  const hiddenUnlinked = allIds.length - shownIds.length;
  const shown = new Set(shownIds);

  // Connected components over the shown nodes.
  const adj = new Map<string, Set<string>>();
  for (const id of shownIds) adj.set(id, new Set());
  for (const e of raw) {
    if (shown.has(e.from) && shown.has(e.to)) {
      adj.get(e.from)!.add(e.to);
      adj.get(e.to)!.add(e.from);
    }
  }
  const componentOf = new Map<string, number>();
  const components: string[][] = [];
  for (const id of shownIds) {
    if (componentOf.has(id)) continue;
    const comp: string[] = [];
    const queue = [id];
    componentOf.set(id, components.length);
    while (queue.length) {
      const cur = queue.pop()!;
      comp.push(cur);
      for (const nx of adj.get(cur) ?? []) {
        if (!componentOf.has(nx)) {
          componentOf.set(nx, components.length);
          queue.push(nx);
        }
      }
    }
    components.push(comp);
  }
  // Big components first — they set the visual narrative.
  components.sort((a, b) => b.length - a.length);

  // Layer within each component: dependencies (edge targets) sit LEFT of
  // their dependents. Longest-path layering via repeated relaxation.
  const nodes: Node[] = [];
  let yOffset = 0;
  for (const comp of components) {
    const inComp = new Set(comp);
    const compEdges = raw.filter((e) => inComp.has(e.from) && inComp.has(e.to));
    const layer = new Map<string, number>(comp.map((id) => [id, 0]));
    for (let i = 0; i < comp.length; i++) {
      let moved = false;
      for (const e of compEdges) {
        // e.from depends on e.to → e.from goes at least one layer right.
        const want = (layer.get(e.to) ?? 0) + 1;
        if ((layer.get(e.from) ?? 0) < want && want < comp.length + 1) {
          layer.set(e.from, want);
          moved = true;
        }
      }
      if (!moved) break;
    }
    const byLayer = new Map<number, string[]>();
    for (const id of comp) {
      const l = layer.get(id) ?? 0;
      if (!byLayer.has(l)) byLayer.set(l, []);
      byLayer.get(l)!.push(id);
    }
    let compHeight = 0;
    for (const [l, ids] of [...byLayer.entries()].sort((a, b) => a[0] - b[0])) {
      ids.sort();
      ids.forEach((id, ri) => {
        nodes.push({
          id,
          type: "bead",
          position: { x: l * COLW, y: yOffset + ri * ROWH },
          data: { bead: present.get(id)!, onOpen },
        });
      });
      compHeight = Math.max(compHeight, ids.length * ROWH);
    }
    yOffset += compHeight + COMPONENT_GAP;
  }

  const edges: Edge[] = raw
    .filter((e) => shown.has(e.from) && shown.has(e.to))
    .map((e) => ({
      id: `${e.from}->${e.to}:${e.type}`,
      // Visual flow: dependency (left) → dependent (right).
      source: e.to,
      target: e.from,
      animated: e.kind === "blocks",
      style: {
        stroke: e.kind === "blocks" ? "#ef4444" : e.kind === "related" ? "var(--brand)" : "var(--text-3)",
        strokeWidth: e.kind === "blocks" ? 2 : 1.6,
        strokeDasharray: e.kind === "related" ? "5 4" : undefined,
      },
    }));

  return { nodes, edges, hiddenUnlinked };
}

function Toggle({ on, onClick, children, title }: { on: boolean; onClick: () => void; children: React.ReactNode; title?: string }) {
  return (
    <button
      onClick={onClick}
      title={title}
      className={cn(
        "flex h-8 items-center gap-[6px] rounded-[9px] border px-[10px] text-[12px] font-[550]",
        on
          ? "border-[var(--brand)]/45 bg-[var(--brand-weak)] text-[var(--brand)]"
          : "border-border bg-[var(--surface-2)] text-[var(--text-3)] hover:text-[var(--text)]",
      )}
    >
      {children}
    </button>
  );
}

export function GraphView() {
  const { beads, openDetail } = useApp();
  const addDep = useAddDep();
  const rf = React.useRef<ReactFlowInstance | null>(null);
  const center = React.useCallback(() => rf.current?.fitView({ padding: 0.2, duration: 400 }), []);

  const [includeClosed, setIncludeClosed] = React.useState(false);
  const [showUnlinked, setShowUnlinked] = React.useState(false);
  const [kinds, setKinds] = React.useState<EdgeKinds>({ blocks: true, parent: true, related: false });
  const [focusId, setFocusId] = React.useState<string | null>(null);

  const scoped = React.useMemo(
    () =>
      beads.filter(
        (b) =>
          !(b.labels ?? []).includes("archived") &&
          (includeClosed || focusId ? true : b.status !== "closed"),
      ),
    [beads, includeClosed, focusId],
  );

  const openDrawer = React.useCallback((id: string) => openDetail(id), [openDetail]);
  const { nodes, edges, hiddenUnlinked } = React.useMemo(
    () => buildGraph(scoped, kinds, showUnlinked, focusId, openDrawer),
    [scoped, kinds, showUnlinked, focusId, openDrawer],
  );

  // Refit whenever the visible graph changes shape.
  React.useEffect(() => {
    const t = setTimeout(() => rf.current?.fitView({ padding: 0.2, duration: 300 }), 60);
    return () => clearTimeout(t);
  }, [nodes.length, edges.length]);

  const onConnect = React.useCallback(
    (c: Connection) => {
      if (c.source && c.target && c.source !== c.target) {
        // Visual edges run dependency→dependent, so the DRAGGED direction is
        // "source is a prerequisite of target": target depends on source.
        addDep.mutate({ id: c.target, dependsOnId: c.source, type: "blocks" });
      }
    },
    [addDep],
  );

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex flex-shrink-0 flex-wrap items-center gap-2 border-b border-border bg-[var(--surface)] p-[12px_22px]">
        <div className="min-w-[220px] flex-1">
          <h1 className="m-0 text-base font-[650] tracking-[-.01em]">Dependency graph</h1>
          <span className="text-[11.5px] text-[var(--text-3)]">
            {nodes.length} beads · {edges.length} edges
            {hiddenUnlinked > 0 && ` · ${hiddenUnlinked} unlinked hidden`}
            {" — double-click a node to focus its neighborhood; drag handle-to-handle to add a blocks link"}
          </span>
        </div>
        {focusId && (
          <Toggle on onClick={() => setFocusId(null)} title="Clear focus and show the scoped graph">
            focused: {focusId.split("-").slice(-1)[0]} ✕
          </Toggle>
        )}
        <Toggle on={kinds.blocks} onClick={() => setKinds((k) => ({ ...k, blocks: !k.blocks }))} title="Blocking dependencies">
          <span className="h-[2px] w-[14px] bg-[#ef4444]" /> blocks
        </Toggle>
        <Toggle on={kinds.parent} onClick={() => setKinds((k) => ({ ...k, parent: !k.parent }))} title="Epic parent-child edges">
          <span className="h-[2px] w-[14px] bg-[var(--text-3)]" /> parent
        </Toggle>
        <Toggle on={kinds.related} onClick={() => setKinds((k) => ({ ...k, related: !k.related }))} title="Loose 'related' links — the spaghetti; off by default">
          <span className="h-0 w-[14px] border-t-2 border-dashed border-[var(--brand)]" /> related
        </Toggle>
        <Toggle on={includeClosed} onClick={() => setIncludeClosed((v) => !v)} title="Include closed beads (history)">
          closed
        </Toggle>
        <Toggle on={showUnlinked} onClick={() => setShowUnlinked((v) => !v)} title="Show beads with no edges under the current filters">
          unlinked
        </Toggle>
        <button
          onClick={center}
          title="Center the graph"
          className="flex h-8 flex-shrink-0 items-center gap-[6px] rounded-[9px] border border-border bg-[var(--surface-2)] px-[10px] text-[12px] font-[550] text-[var(--text-2)] hover:bg-[var(--surface-3)]"
        >
          <Icon name="target" size={14} />
          Center
        </button>
      </header>
      <div className="relative min-h-0 flex-1">
        {nodes.length === 0 ? (
          <div className="flex h-full items-center justify-center text-[13px] text-[var(--text-3)]">
            No linked open work under the current filters — try “unlinked”, “closed”, or “related”.
          </div>
        ) : (
          <ReactFlow
            nodes={nodes}
            edges={edges}
            nodeTypes={nodeTypes}
            onConnect={onConnect}
            onNodeDoubleClick={(_, node) => setFocusId(node.id)}
            onInit={(inst) => {
              rf.current = inst;
            }}
            fitView
            minZoom={0.05}
            proOptions={{ hideAttribution: true }}
          >
            <Background gap={22} color="var(--border)" />
            <Controls />
          </ReactFlow>
        )}
      </div>
    </div>
  );
}

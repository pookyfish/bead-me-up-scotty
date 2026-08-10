import { describe, expect, it, vi } from "vitest";
import { observeOrchestra } from "./orchestra";
import {
  buildFixtureArray,
  buildFixtureRecord,
  fakeFs,
} from "./test-helpers";

vi.mock("server-only", () => ({}));

const orchestraMixedFixture = {
  schema_version: 2,
  supervisor: {
    actor: "codex-supervisor",
    holder: "Codex pane",
    session_id: "session-1",
    pane_id: "w6:p2",
    channel_of_record: "bead comments",
    raw_details_blob: "must not escape",
  },
  active_work: {
    "valid-entry": {
      bead_id: "better-palia-maps-l4cq3.1",
      status: "in_progress",
      repo: "bead-me-up-scotty",
      branch: "codex/scotty-control-plane-foundation",
      files_touching: ["lib/control-plane/orchestra.ts"],
      notes: "raw_details_blob",
    },
  },
  file_locks: {
    "lib/control-plane/orchestra.ts": {
      locked_by: "codex-scotty-control-plane-foundation-20260809",
      bead_id: "better-palia-maps-l4cq3.1",
      locked_at: "2026-08-09T21:00:00.000Z",
      reason: "Stage 1 orchestra observation adapter",
    },
  },
  integration_queue: [
    {
      agent: "codex-stage-1",
      branch: "codex/scotty-control-plane-foundation",
      repo: "bead-me-up-scotty",
      bead_id: "better-palia-maps-l4cq3.1",
      status: "ready_for_review",
      submitted_at: "2026-08-09T21:30:00.000Z",
    },
    {
      agent: "old-agent",
      status: "merged",
      raw_validation_blob: "must not escape",
    },
  ],
  conflicts: [
    {
      reporter: "codex-stage-1",
      at: "2026-08-09T21:40:00.000Z",
      type: "file_contention",
      detail: "Waiting on a locked path.",
      bead_id: "better-palia-maps-l4cq3.1",
      files: ["lib/control-plane/orchestra.ts"],
    },
    {
      reporter: "old-agent",
      detail: "Already handled.",
      resolution: "Released by supervisor.",
    },
  ],
  impacts: [
    {
      source_agent: "codex-stage-1",
      at: "2026-08-09T21:45:00.000Z",
      type: "interface_change",
      summary: "Observation contract changed.",
      affected_beads: ["better-palia-maps-l4cq3.2"],
      urgency: "important",
      resolved: false,
    },
    {
      source_agent: "old-agent",
      summary: "Already handled.",
      resolved: true,
    },
  ],
  decisions: [
    {
      agent: "codex-stage-1",
      at: "2026-08-09T21:50:00.000Z",
      decision: "Keep the adapter read-only.",
      affects: ["lib/control-plane/orchestra.ts"],
      reason: "Authority stays with orchestra.",
    },
    "malformed-history-record",
  ],
};

const longText = "x".repeat(2_500);
const orchestraLargeFixture = {
  schema_version: 2,
  supervisor: null,
  active_work: {
    ...buildFixtureRecord(2, (index) => ({
      bead_id: `bead-${index}`,
      status: "in_progress",
      repo: "bead-me-up-scotty",
      branch: `branch-${index}`,
      files_touching: buildFixtureArray(60, (file) => `file-${file}`),
      raw_details_blob: longText,
    })),
  },
  file_locks: {},
  integration_queue: [
    ...buildFixtureArray(60, (index) => ({
      agent: `agent-${index}`,
      branch: `branch-${index}`,
      repo: "bead-me-up-scotty",
      bead_id: `bead-${index}`,
      status: "ready_for_review",
      submitted_at: `2026-08-09T21:${String(index % 60).padStart(2, "0")}:00.000Z`,
      raw_validation_blob: longText,
      raw_files_changed_blob: longText,
    })),
    ...buildFixtureArray(5, (index) => ({
      agent: `merged-${index}`,
      status: "merged",
    })),
  ],
  conflicts: [
    ...buildFixtureArray(55, (index) => ({
      reporter: `reporter-${index}`,
      detail: `${index}-${longText}`,
      files: buildFixtureArray(60, (file) => `conflict-${index}-${file}`),
      raw_details_blob: longText,
    })),
    { reporter: "resolved", detail: "resolved", status: "resolved" },
  ],
  impacts: [
    ...buildFixtureArray(55, (index) => ({
      source_agent: `agent-${index}`,
      summary: `${index}-${longText}`,
      affected_beads: buildFixtureArray(60, (bead) => `bead-${index}-${bead}`),
      urgency: "important",
      resolved: false,
      raw_details_blob: longText,
    })),
    { source_agent: "resolved", summary: "resolved", resolved: true },
  ],
  decisions: buildFixtureArray(30, (index) => ({
    agent: `agent-${index}`,
    at: `2026-08-${String(index + 1).padStart(2, "0")}T20:00:00.000Z`,
    decision: `${index}-${longText}`,
    affects: buildFixtureArray(60, (affect) => `path-${index}-${affect}`),
    reason: longText,
    raw_details_blob: longText,
  })),
};

describe("observeOrchestra", () => {
  it("returns not_configured when .orchestra/state.json is absent", async () => {
    const result = await observeOrchestra("C:/missing-repo", fakeFs({ missing: true }));

    expect(result.capability).toBe("unavailable");
    expect(result.freshness).toBe("unknown");
    expect(result.error?.code).toBe("not_configured");
  });

  it("rejects an unsupported top-level schema version", async () => {
    const result = await observeOrchestra(
      "C:/unsupported-repo",
      fakeFs({ json: { schema_version: 3 } }),
    );

    expect(result.capability).toBe("unavailable");
    expect(result.error?.code).toBe("unsupported_version");
  });

  it("keeps valid current records around malformed history", async () => {
    const result = await observeOrchestra(
      "C:/mixed-repo",
      fakeFs({ json: orchestraMixedFixture }),
    );

    expect(result.capability).toBe("degraded");
    expect(result.freshness).toBe("live");
    expect(result.error?.code).toBe("incomplete_observation");
    expect(result.data?.supervisor?.actor).toBe("codex-supervisor");
    expect(result.data?.activeWork).toHaveProperty("valid-entry");
    expect(result.data?.sections.decisions.rejected).toBe(1);
    expect(result.data?.pendingIntegration.map((entry) => entry.status)).toEqual([
      "ready_for_review",
    ]);
    expect(result.data?.unresolvedConflicts).toHaveLength(1);
    expect(result.data?.unresolvedImpacts).toHaveLength(1);
    expect(result.sourceUpdatedAt).toBe("2026-08-09T21:59:00.000Z");
  });

  it("bounds and projects history instead of exposing raw records", async () => {
    const result = await observeOrchestra(
      "C:/large-repo",
      fakeFs({ json: orchestraLargeFixture }),
    );

    expect(result.data?.pendingIntegration).toHaveLength(50);
    expect(result.data?.unresolvedConflicts).toHaveLength(50);
    expect(result.data?.unresolvedImpacts).toHaveLength(50);
    expect(result.data?.recentDecisions).toHaveLength(20);
    expect(result.data?.recentDecisions[0]?.agent).toBe("agent-29");
    expect(result.data?.activeWork["entry-0"]?.filesTouching).toHaveLength(50);
    expect(result.data?.unresolvedConflicts[0]?.files).toHaveLength(50);
    expect(result.data?.unresolvedImpacts[0]?.beadIds).toHaveLength(50);
    expect(result.data?.recentDecisions[0]?.affects).toHaveLength(50);
    expect(result.data?.unresolvedConflicts[0]?.detail).toHaveLength(2_000);
    expect(result.data?.unresolvedImpacts[0]?.summary).toHaveLength(2_000);
    expect(result.data?.recentDecisions[0]?.decision).toHaveLength(2_000);
    expect(result.data?.sections.integrationQueue).toEqual({
      total: 65,
      included: 60,
      rejected: 0,
      truncated: true,
    });
    expect(result.data?.sections.conflicts.truncated).toBe(true);
    expect(result.data?.sections.impacts.truncated).toBe(true);
    expect(result.data?.sections.decisions.truncated).toBe(true);

    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain("raw_validation_blob");
    expect(serialized).not.toContain("raw_details_blob");
    expect(serialized).not.toContain("raw_files_changed_blob");
  });

  it("reuses a path/mtime/size cache hit and labels it cached", async () => {
    const deps = fakeFs({
      json: orchestraMixedFixture,
      mtimeMs: 10,
      size: 100,
    });

    await observeOrchestra("C:/cached-repo", deps);
    const second = await observeOrchestra("C:/cached-repo", deps);

    expect(deps.statCount()).toBe(2);
    expect(deps.readCount()).toBe(1);
    expect(deps.writeCount()).toBe(0);
    expect(second.freshness).toBe("cached");
    expect(second.capability).toBe("degraded");
    expect(second.error?.code).toBe("incomplete_observation");
  });
});

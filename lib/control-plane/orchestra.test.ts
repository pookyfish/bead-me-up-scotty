import { describe, expect, it, vi } from "vitest";
import { observeOrchestra } from "./orchestra";
import { evaluateSupervisorContinuity } from "./continuity";
import { availableObservation } from "./types";
import {
  buildFixtureArray,
  buildFixtureRecord,
  fakeFs,
} from "./test-helpers";

vi.mock("server-only", () => ({}));

const continuityHerdr = availableObservation("herdr", "managed-session-runtime", { protocol: 19, version: "0.8", sessions: [] }, ["observe"], { observedAt: "2026-08-09T22:00:00.000Z" });
const continuityNow = new Date("2026-08-09T22:00:00.000Z");
const rawCheckpoint = (overrides: Record<string, unknown> = {}) => ({
  schema_version: 1, objective_status: "approved_incomplete", objective: "Complete the plan", plan_path: "docs/plan.md", completed_stages: 1, total_stages: 2, stage: "Task 7", phase: "transition", supervisor_binding: null, worker_binding: null, reviewer_binding: null, next_action: "finish the plan", last_transition_at: "2026-08-09T20:00:00.000Z", last_owner_update_at: null, transition_due_at: "2026-08-09T20:30:00.000Z", owner_update_due_at: "2026-08-09T20:30:00.000Z", pause_reason: null, blocker: null, handoff_generation: 1, ...overrides,
});

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

function orchestraResolutionFixture({
  conflicts = [],
  impacts = [],
}: {
  conflicts?: unknown[];
  impacts?: unknown[];
}) {
  return {
    schema_version: 2,
    supervisor: null,
    active_work: {},
    file_locks: {},
    integration_queue: [],
    conflicts,
    impacts,
    decisions: [],
  };
}

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

  it("treats a nonempty conflict resolution as authoritative over resolved false", async () => {
    const result = await observeOrchestra(
      "C:/resolved-conflict-repo",
      fakeFs({
        json: orchestraResolutionFixture({
          conflicts: [{
            reporter: "codex-reviewer",
            detail: "The original conflict.",
            resolved: false,
            resolution: "The supervisor released the lock.",
          }],
        }),
      }),
    );

    expect(result.data?.unresolvedConflicts).toEqual([]);
    expect(result.data?.sections.conflicts.included).toBe(0);
  });

  it("excludes conflicts carrying resolved or closed status", async () => {
    const result = await observeOrchestra(
      "C:/status-resolved-conflict-repo",
      fakeFs({
        json: orchestraResolutionFixture({
          conflicts: [
            { reporter: "reviewer-a", detail: "Resolved conflict.", status: "resolved" },
            { reporter: "reviewer-b", detail: "Closed conflict.", status: "closed" },
          ],
        }),
      }),
    );

    expect(result.data?.unresolvedConflicts).toEqual([]);
    expect(result.data?.sections.conflicts.included).toBe(0);
  });

  it("keeps an impact unresolved when resolved false despite resolution metadata", async () => {
    const result = await observeOrchestra(
      "C:/unresolved-impact-repo",
      fakeFs({
        json: orchestraResolutionFixture({
          impacts: [{
            source_agent: "codex-reviewer",
            summary: "Downstream work remains blocked.",
            resolved: false,
            status: "resolved",
            resolution: "Operational recovery completed, policy decision pending.",
          }],
        }),
      }),
    );

    expect(result.data?.unresolvedImpacts).toEqual([{
      sourceAgent: "codex-reviewer",
      at: null,
      type: null,
      summary: "Downstream work remains blocked.",
      beadIds: [],
      urgency: null,
    }]);
    expect(result.data?.sections.impacts.included).toBe(1);
  });

  it("excludes an impact only when resolved is true", async () => {
    const result = await observeOrchestra(
      "C:/resolved-impact-repo",
      fakeFs({
        json: orchestraResolutionFixture({
          impacts: [{
            source_agent: "codex-reviewer",
            summary: "Downstream work is unblocked.",
            resolved: true,
          }],
        }),
      }),
    );

    expect(result.data?.unresolvedImpacts).toEqual([]);
    expect(result.data?.sections.impacts.included).toBe(0);
  });

  it.each(["bad\u0000key", "x".repeat(513)])("keeps control-bearing or oversized active work fail-closed", async (key) => {
    const result = await observeOrchestra("C:/unsafe-key", fakeFs({
      json: { ...orchestraMixedFixture, active_work: { [key]: orchestraMixedFixture.active_work["valid-entry"] } },
    }));
    expect(result.data?.activeWork).toHaveProperty("invalid-active-work-1");
    expect(result.error?.code).toBe("incomplete_observation");
    expect(evaluateSupervisorContinuity({ orchestra: result, herdr: continuityHerdr, now: continuityNow })).toContainEqual(expect.objectContaining({
      code: "supervisor_continuity_unproven", workKey: "invalid-active-work-1", stage: "invalid supervision checkpoint",
    }));
  });

  it("keeps a 2001-character raw active-work key fail-closed through continuity", async () => {
    const result = await observeOrchestra("C:/oversized-key", fakeFs({
      json: { ...orchestraMixedFixture, active_work: { ["x".repeat(2_001)]: orchestraMixedFixture.active_work["valid-entry"] } },
    }));
    expect(result.error?.code).toBe("incomplete_observation");
    expect(result.data?.activeWork).toHaveProperty("invalid-active-work-1");
    expect(evaluateSupervisorContinuity({ orchestra: result, herdr: continuityHerdr, now: continuityNow })).toEqual([{
      code: "supervisor_continuity_unproven", severity: "info", workKey: "invalid-active-work-1", beadId: null, stage: "invalid supervision checkpoint",
      message: "Supervision checkpoint for invalid-active-work-1 is invalid, so approved-plan continuity cannot be proven. Next action: replace the invalid SUPERVISION-CHECKPOINT/v1 record before supervisor exit",
      nextAction: "replace the invalid SUPERVISION-CHECKPOINT/v1 record before supervisor exit",
    }]);
  });

  it("allocates unique deterministic sentinels without overwriting a safe existing name", async () => {
    const source = {
      ...orchestraMixedFixture,
      active_work: {
        "invalid-active-work-1": orchestraMixedFixture.active_work["valid-entry"],
        "bad\u0000one": orchestraMixedFixture.active_work["valid-entry"],
        ["x".repeat(2_001)]: orchestraMixedFixture.active_work["valid-entry"],
      },
    };
    const fs = fakeFs({ json: source });
    const first = await observeOrchestra("C:/unique-unsafe", fs);
    const second = await observeOrchestra("C:/unique-unsafe", fs);
    expect(Object.keys(first.data?.activeWork ?? {}).sort()).toEqual(["invalid-active-work-1", "invalid-active-work-2", "invalid-active-work-3"]);
    expect(evaluateSupervisorContinuity({ orchestra: first, herdr: continuityHerdr, now: continuityNow }).filter(({ code }) => code === "supervisor_continuity_unproven").map(({ workKey }) => workKey).sort()).toEqual(["invalid-active-work-2", "invalid-active-work-3"]);
    expect(second.data?.activeWork).toEqual(first.data?.activeWork);
  });

  it("keeps a control-bearing active-work bead ID fail-closed", async () => {
    const result = await observeOrchestra("C:/unsafe-bead", fakeFs({
      json: { ...orchestraMixedFixture, active_work: { safe: { ...orchestraMixedFixture.active_work["valid-entry"], bead_id: "bad\u0000bead" } } },
    }));
    expect(result.data?.activeWork.safe.beadId).toBeNull();
    expect(result.error?.code).toBe("incomplete_observation");
    expect(evaluateSupervisorContinuity({ orchestra: result, herdr: continuityHerdr, now: continuityNow })).toContainEqual(expect.objectContaining({
      code: "supervisor_continuity_unproven", workKey: "safe", stage: "invalid supervision checkpoint",
    }));
  });

  it("projects a raw noncanonical checkpoint path as an invalid sentinel and stable unproven diagnostic", async () => {
    const result = await observeOrchestra("C:/bad-path", fakeFs({
      json: { ...orchestraMixedFixture, active_work: { safe: { ...orchestraMixedFixture.active_work["valid-entry"], supervision: rawCheckpoint({ plan_path: "docs\\sub/plan.md" }) } } },
    }));
    expect(result.data?.activeWork.safe.supervision).toEqual({ status: "invalid", code: "invalid_checkpoint" });
    expect(result.error?.code).toBe("incomplete_observation");
    expect(evaluateSupervisorContinuity({ orchestra: result, herdr: continuityHerdr, now: continuityNow })).toContainEqual({
      code: "supervisor_continuity_unproven", severity: "info", workKey: "safe", beadId: "better-palia-maps-l4cq3.1", stage: "invalid supervision checkpoint",
      message: "Supervision checkpoint for better-palia-maps-l4cq3.1 is invalid, so approved-plan continuity cannot be proven. Next action: replace the invalid SUPERVISION-CHECKPOINT/v1 record before supervisor exit",
      nextAction: "replace the invalid SUPERVISION-CHECKPOINT/v1 record before supervisor exit",
    });
  });

  it.each(["supervisor_session_id", "worker_session_id", "reviewer_session_id", "supervisorSessionId", "workerSessionId", "reviewerSessionId"])("rejects raw legacy flat v1 binding %s", async (legacyKey) => {
    const result = await observeOrchestra("C:/legacy", fakeFs({
      json: { ...orchestraMixedFixture, active_work: { safe: { ...orchestraMixedFixture.active_work["valid-entry"], supervision: rawCheckpoint({ [legacyKey]: "old" }) } } },
    }));
    expect(result.data?.activeWork.safe.supervision).toEqual({ status: "invalid", code: "invalid_checkpoint" });
    expect(evaluateSupervisorContinuity({ orchestra: result, herdr: continuityHerdr, now: continuityNow })).toContainEqual(expect.objectContaining({ code: "supervisor_continuity_unproven", stage: "invalid supervision checkpoint" }));
  });

  it("serializes a valid handoff checkpoint with its new exact supervisor session and redacts notes", async () => {
    const result = await observeOrchestra("C:/handoff", fakeFs({
      json: { ...orchestraMixedFixture, active_work: { safe: { ...orchestraMixedFixture.active_work["valid-entry"], supervision: rawCheckpoint({ phase: "handoff", handoff_generation: 2, supervisor_binding: { source: "herdr", surface: "herdr", session_id: "new-session" }, notes: "do not leak" }) } } },
    }));
    const restored = JSON.parse(JSON.stringify(result));
    expect(restored.data.activeWork.safe.supervision).toMatchObject({ status: "valid", checkpoint: { handoffGeneration: 2, supervisorBinding: { source: "herdr", surface: "herdr", sessionId: "new-session" } } });
    expect(JSON.stringify(restored)).not.toContain("do not leak");
    const herdr = availableObservation("herdr", "managed-session-runtime", { protocol: 19, version: "0.8", sessions: [
      { provider: "codex", displayName: "supervisor", sessionId: "old-session", surface: "herdr" as const, status: "working" as const, workspaceId: "w", tabId: "t", paneId: "p", terminalId: "old", cwd: "C:/repo", focused: false, revision: 1, stateChangeSeq: 1, agentSession: null },
      { provider: "codex", displayName: "supervisor", sessionId: "new-session", surface: "herdr" as const, status: "idle" as const, workspaceId: "w", tabId: "t", paneId: "p", terminalId: "new", cwd: "C:/repo", focused: false, revision: 1, stateChangeSeq: 1, agentSession: null },
    ] }, ["observe"], { observedAt: "2026-08-09T22:00:00.000Z" });
    expect(evaluateSupervisorContinuity({ orchestra: restored, herdr, now: continuityNow })).toContainEqual(expect.objectContaining({ code: "supervisor_continuity_stalled" }));
  });

  it("rejects empty raw binding IDs", async () => {
    const result = await observeOrchestra("C:/binding", fakeFs({
      json: { ...orchestraMixedFixture, active_work: { safe: { ...orchestraMixedFixture.active_work["valid-entry"], supervision: rawCheckpoint({ phase: "implementation", worker_binding: { source: "herdr", surface: "herdr", session_id: "" } }) } } },
    }));
    expect(result.data?.activeWork.safe.supervision).toEqual({ status: "invalid", code: "invalid_checkpoint" });
  });
});

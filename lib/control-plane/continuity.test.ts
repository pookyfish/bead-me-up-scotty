import { describe, expect, it } from "vitest";
import { evaluateSupervisorContinuity } from "./continuity";
import { availableObservation, CHECKPOINT_TEXT_MAX_LENGTH, controlPlaneDiagnosticSchema, failedObservation, supervisorCheckpointSchema, type OrchestraSnapshot } from "./types";

const now = new Date("2026-08-09T21:00:00.000Z");

function orchestra(checkpoint: unknown) {
  const data: OrchestraSnapshot = {
    schemaVersion: 2, supervisor: null,
    activeWork: {
      work: { beadId: "better-palia-maps-l4cq3.1", status: "active", repo: null, branch: null, filesTouching: [], supervision: checkpoint as OrchestraSnapshot["activeWork"][string]["supervision"] },
    },
    fileLocks: {}, pendingIntegration: [], unresolvedConflicts: [], unresolvedImpacts: [], recentDecisions: [],
    sections: {
      activeWork: { total: 1, included: 1, rejected: 0, truncated: false }, fileLocks: { total: 0, included: 0, rejected: 0, truncated: false }, integrationQueue: { total: 0, included: 0, rejected: 0, truncated: false }, conflicts: { total: 0, included: 0, rejected: 0, truncated: false }, decisions: { total: 0, included: 0, rejected: 0, truncated: false }, impacts: { total: 0, included: 0, rejected: 0, truncated: false },
    },
  };
  return availableObservation("orchestra", "coordination", data, ["observe"], { observedAt: now.toISOString() });
}

const checkpoint = {
  status: "valid" as const,
  checkpoint: {
    schemaVersion: 1 as const, objectiveStatus: "approved_incomplete" as const, objective: "Complete plan", planPath: "docs/plan.md", completedStages: 5, totalStages: 9, stage: "Task 5 complete", phase: "transition" as const,
    supervisorBinding: null, workerBinding: null, reviewerBinding: null,
    nextAction: "review Task 5 commit 0285f01, then dispatch Task 6", lastTransitionAt: "2026-08-09T20:00:00.000Z", lastOwnerUpdateAt: "2026-08-09T20:00:00.000Z", transitionDueAt: "2026-08-09T20:45:00.000Z", ownerUpdateDueAt: "2026-08-09T20:40:00.000Z", pauseReason: null, blocker: null, handoffGeneration: 1,
  },
};

const herdr = availableObservation("herdr", "managed-session-runtime", { protocol: 19, version: "0.8", sessions: [] }, ["observe"], { observedAt: now.toISOString() });
const session = (sessionId: string, status: "idle" | "working" | "blocked" | "done" | "unknown", extras: Record<string, unknown> = {}) => ({
  provider: "codex", displayName: "supervisor", sessionId, surface: "herdr" as const, status,
  workspaceId: "w", tabId: "t", paneId: "p", terminalId: "terminal", cwd: "C:/repo", focused: false, revision: 1, stateChangeSeq: 1, agentSession: null, ...extras,
});
const herdrWith = (...sessions: ReturnType<typeof session>[]) => availableObservation("herdr", "managed-session-runtime", { protocol: 19, version: "0.8", sessions }, ["observe"], { observedAt: now.toISOString() });
const checkpointFor = (phase: "planning" | "implementation" | "review" | "correction" | "transition" | "handoff", binding: unknown = null) => ({
  ...checkpoint,
  checkpoint: {
    ...checkpoint.checkpoint,
    phase,
    supervisorBinding: phase === "planning" || phase === "handoff" ? binding : null,
    workerBinding: phase === "implementation" || phase === "correction" ? binding : null,
    reviewerBinding: phase === "review" ? binding : null,
  },
});

describe("supervisor continuity", () => {
  it("reports the exact declared next action when an approved plan silently stalls", () => {
    expect(evaluateSupervisorContinuity({ orchestra: orchestra(checkpoint), herdr, now })).toContainEqual({
      code: "supervisor_continuity_stalled", severity: "warning", workKey: "work", beadId: "better-palia-maps-l4cq3.1", stage: "Task 5 complete",
      message: "Approved plan better-palia-maps-l4cq3.1 is unfinished after Task 5 complete; no active worker or reviewer was proven before the transition deadline. Next action: review Task 5 commit 0285f01, then dispatch Task 6",
      nextAction: "review Task 5 commit 0285f01, then dispatch Task 6",
    });
  });

  it("keeps an invalid checkpoint unproven without exposing malformed fields", () => {
    expect(evaluateSupervisorContinuity({ orchestra: orchestra({ status: "invalid", code: "invalid_checkpoint" }), herdr, now })).toContainEqual({
      code: "supervisor_continuity_unproven", severity: "info", workKey: "work", beadId: "better-palia-maps-l4cq3.1", stage: "invalid supervision checkpoint",
      message: "Supervision checkpoint for better-palia-maps-l4cq3.1 is invalid, so approved-plan continuity cannot be proven. Next action: replace the invalid SUPERVISION-CHECKPOINT/v1 record before supervisor exit",
      nextAction: "replace the invalid SUPERVISION-CHECKPOINT/v1 record before supervisor exit",
    });
  });

  it("treats unavailable coordination as unproven rather than passing", () => {
    const unavailable = failedObservation("orchestra", "coordination", "unavailable", "unavailable", "No state", undefined, [], { observedAt: now.toISOString(), freshness: "unknown" });
    expect(evaluateSupervisorContinuity({ orchestra: unavailable, herdr, now })).toContainEqual(expect.objectContaining({ code: "supervisor_continuity_unproven", workKey: "orchestra" }));
  });

  it("keeps diagnostic messages valid at the schema-valid checkpoint text boundary", () => {
    const boundary = "x".repeat(CHECKPOINT_TEXT_MAX_LENGTH);
    const parsed = supervisorCheckpointSchema.parse({
      ...checkpoint.checkpoint,
      stage: boundary,
      nextAction: boundary,
    });
    const result = evaluateSupervisorContinuity({
      orchestra: orchestra({ status: "valid", checkpoint: parsed }), herdr, now,
    }).find((diagnostic) => diagnostic.code === "supervisor_continuity_stalled");
    expect(controlPlaneDiagnosticSchema.safeParse(result).success).toBe(true);
  });

  it.each(["idle", "blocked", "done"] as const)("treats exact Herdr %s evidence as conclusively not working", (status) => {
    const binding = { source: "herdr" as const, surface: "herdr" as const, sessionId: "exact" };
    expect(evaluateSupervisorContinuity({ orchestra: orchestra(checkpointFor("implementation", binding)), herdr: herdrWith(session("exact", status)), now })).toContainEqual(expect.objectContaining({ code: "supervisor_continuity_stalled" }));
  });

  it("requires the exact Herdr session ID rather than actor, provider, or display name", () => {
    const binding = { source: "herdr" as const, surface: "herdr" as const, sessionId: "new-session" };
    const diagnostics = evaluateSupervisorContinuity({ orchestra: orchestra(checkpointFor("handoff", binding)), herdr: herdrWith(session("old-session", "working")), now });
    expect(diagnostics).toContainEqual(expect.objectContaining({ code: "supervisor_continuity_stalled" }));
    expect(diagnostics).not.toContainEqual(expect.objectContaining({ code: "supervisor_continuity_unproven" }));
  });

  it.each([
    { source: "codex-collaboration", surface: "collaboration", sessionId: "c" },
    { source: "claude-desktop", surface: "desktop", sessionId: "d" },
    { source: "codex-desktop", surface: "desktop", sessionId: "cd" },
    { source: "external", surface: "external", sessionId: "e" },
  ] as const)("keeps non-Herdr bindings unproven", (binding) => {
    const diagnostics = evaluateSupervisorContinuity({ orchestra: orchestra(checkpointFor("implementation", binding)), herdr, now });
    expect(diagnostics).toContainEqual(expect.objectContaining({ code: "supervisor_continuity_unproven" }));
    expect(diagnostics).not.toContainEqual(expect.objectContaining({ code: "supervisor_continuity_stalled" }));
  });

  it("keeps unknown, degraded, and missing liveness evidence unproven", () => {
    const binding = { source: "herdr" as const, surface: "herdr" as const, sessionId: "exact" };
    const degraded = failedObservation("herdr", "managed-session-runtime", "degraded", "incomplete_observation", "partial", { protocol: 19, version: "0.8", sessions: [] }, ["observe"], { observedAt: now.toISOString(), freshness: "live" });
    for (const observed of [herdrWith(session("exact", "unknown")), degraded]) {
      const diagnostics = evaluateSupervisorContinuity({ orchestra: orchestra(checkpointFor("review", binding)), herdr: observed, now });
      expect(diagnostics).toContainEqual(expect.objectContaining({ code: "supervisor_continuity_unproven" }));
      expect(diagnostics).not.toContainEqual(expect.objectContaining({ code: "supervisor_continuity_stalled" }));
    }
    expect(evaluateSupervisorContinuity({ orchestra: orchestra(checkpointFor("review")), herdr, now })).toContainEqual(expect.objectContaining({ code: "supervisor_continuity_unproven" }));
  });

  it.each(["paused", "blocked", "complete"] as const)("suppresses all diagnostics for terminal %s checkpoints", (objectiveStatus) => {
    const terminal = { ...checkpoint, checkpoint: { ...checkpoint.checkpoint, objectiveStatus, pauseReason: objectiveStatus === "paused" ? "Paused" : null, blocker: objectiveStatus === "blocked" ? "Blocked" : null, completedStages: objectiveStatus === "complete" ? 9 : 5 } };
    expect(evaluateSupervisorContinuity({ orchestra: orchestra(terminal), herdr, now })).toEqual([]);
  });

  it("reports an owner update overdue while an exact worker is live", () => {
    const binding = { source: "herdr" as const, surface: "herdr" as const, sessionId: "worker" };
    const diagnostics = evaluateSupervisorContinuity({ orchestra: orchestra(checkpointFor("implementation", binding)), herdr: herdrWith(session("worker", "working")), now });
    expect(diagnostics).toContainEqual(expect.objectContaining({ code: "supervisor_owner_update_overdue" }));
    expect(diagnostics).not.toContainEqual(expect.objectContaining({ code: "supervisor_continuity_stalled" }));
  });

  it.each(["planning", "correction"] as const)("requires the declared %s phase binding", (phase) => {
    expect(evaluateSupervisorContinuity({ orchestra: orchestra(checkpointFor(phase)), herdr, now })).toContainEqual(expect.objectContaining({ code: "supervisor_continuity_unproven" }));
  });

  it("keeps unavailable Herdr evidence unproven", () => {
    const unavailable = failedObservation("herdr", "managed-session-runtime", "unavailable", "unavailable", "No Herdr", undefined, [], { observedAt: now.toISOString(), freshness: "unknown" });
    const binding = { source: "herdr" as const, surface: "herdr" as const, sessionId: "worker" };
    expect(evaluateSupervisorContinuity({ orchestra: orchestra(checkpointFor("implementation", binding)), herdr: unavailable, now })).toContainEqual(expect.objectContaining({ code: "supervisor_continuity_unproven" }));
  });

  it("accepts a post-handoff new exact working supervisor session", () => {
    const binding = { source: "herdr" as const, surface: "herdr" as const, sessionId: "new" };
    const live = herdrWith(session("old", "idle"), session("new", "working"));
    const later = new Date("2026-08-09T20:35:00.000Z");
    expect(evaluateSupervisorContinuity({ orchestra: orchestra(checkpointFor("handoff", binding)), herdr: live, now: later }).some(({ code }) => code === "supervisor_continuity_stalled" || code === "supervisor_continuity_unproven")).toBe(false);
  });

  it("evaluates an independent stalled lane beside a live lane", () => {
    const liveBinding = { source: "herdr" as const, surface: "herdr" as const, sessionId: "live" };
    const data = orchestra(checkpointFor("implementation", liveBinding)).data!;
    data.activeWork.stalled = { ...data.activeWork.work, beadId: "stalled", supervision: checkpointFor("transition") as never };
    const diagnostics = evaluateSupervisorContinuity({ orchestra: availableObservation("orchestra", "coordination", data, ["observe"], { observedAt: now.toISOString() }), herdr: herdrWith(session("live", "working")), now });
    expect(diagnostics).toContainEqual(expect.objectContaining({ code: "supervisor_continuity_stalled", workKey: "stalled" }));
    expect(diagnostics).not.toContainEqual(expect.objectContaining({ workKey: "work", code: "supervisor_continuity_stalled" }));
  });

  it.each(["planning", "correction"] as const)("uses the correct live %s binding despite live decoys", (phase) => {
    const correct = { source: "herdr" as const, surface: "herdr" as const, sessionId: "correct" };
    const fixture = checkpointFor(phase, correct);
    fixture.checkpoint.supervisorBinding = phase === "correction" ? { source: "herdr", surface: "herdr", sessionId: "decoy" } : fixture.checkpoint.supervisorBinding;
    fixture.checkpoint.workerBinding = phase === "planning" ? { source: "herdr", surface: "herdr", sessionId: "decoy" } : fixture.checkpoint.workerBinding;
    expect(evaluateSupervisorContinuity({ orchestra: orchestra(fixture), herdr: herdrWith(session("correct", "working"), session("decoy", "working")), now }).some(({ code }) => code === "supervisor_continuity_stalled" || code === "supervisor_continuity_unproven")).toBe(false);
  });
});

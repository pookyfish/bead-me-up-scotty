import { describe, expect, it } from "vitest";
import { evaluateSupervisorContinuity } from "./continuity";
import { availableObservation, failedObservation, type OrchestraSnapshot } from "./types";

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
});

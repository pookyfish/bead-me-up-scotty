import {
  type ControlPlaneDiagnostic,
  type HerdrSnapshot,
  type Observation,
  type OrchestraSnapshot,
  type SupervisorCheckpoint,
} from "./types";

const INVALID_STAGE = "invalid supervision checkpoint";
const INVALID_NEXT_ACTION = "replace the invalid SUPERVISION-CHECKPOINT/v1 record before supervisor exit";
const MISSING_COORDINATION_ACTION = "restore a valid orchestra observation before supervisor exit";

function unproven(workKey: string, beadId: string | null, stage: string, message: string, nextAction: string): ControlPlaneDiagnostic {
  return { code: "supervisor_continuity_unproven", severity: "info", workKey, beadId, stage, message, nextAction };
}

function invalidCheckpointDiagnostic(workKey: string, beadId: string | null): ControlPlaneDiagnostic {
  const subject = beadId ?? workKey;
  return unproven(workKey, beadId, INVALID_STAGE, `Supervision checkpoint for ${subject} is invalid, so approved-plan continuity cannot be proven. Next action: ${INVALID_NEXT_ACTION}`, INVALID_NEXT_ACTION);
}

function requiredBinding(checkpoint: SupervisorCheckpoint) {
  switch (checkpoint.phase) {
    case "planning": case "handoff": return checkpoint.supervisorBinding;
    case "implementation": case "correction": return checkpoint.workerBinding;
    case "review": return checkpoint.reviewerBinding;
    case "transition": return null;
  }
}

function liveness(checkpoint: SupervisorCheckpoint, herdr: Observation<HerdrSnapshot>): "working" | "not-working" | "unproven" {
  const binding = requiredBinding(checkpoint);
  if (checkpoint.phase === "transition") return "not-working";
  if (!binding || binding.source !== "herdr" || binding.surface !== "herdr") return "unproven";
  if (herdr.capability !== "available") return "unproven";
  const session = herdr.data.sessions.find((candidate) => candidate.surface === "herdr" && candidate.sessionId === binding.sessionId);
  if (!session || session.status === "idle" || session.status === "blocked" || session.status === "done") return "not-working";
  return session.status === "working" ? "working" : "unproven";
}

export function evaluateSupervisorContinuity(input: { orchestra: Observation<OrchestraSnapshot>; herdr: Observation<HerdrSnapshot>; now: Date }): ControlPlaneDiagnostic[] {
  if (!input.orchestra.data) {
    return [unproven("orchestra", null, "coordination observation", `Coordination observation is unavailable, so supervisor continuity cannot be proven. Next action: ${MISSING_COORDINATION_ACTION}`, MISSING_COORDINATION_ACTION)];
  }
  const diagnostics: ControlPlaneDiagnostic[] = [];
  for (const [workKey, work] of Object.entries(input.orchestra.data.activeWork)) {
    if (work.supervision === null) continue;
    if (work.supervision.status === "invalid") { diagnostics.push(invalidCheckpointDiagnostic(workKey, work.beadId)); continue; }
    const checkpoint = work.supervision.checkpoint;
    if (checkpoint.objectiveStatus !== "approved_incomplete") continue;
    const state = liveness(checkpoint, input.herdr);
    if (input.now.getTime() > Date.parse(checkpoint.ownerUpdateDueAt!)) {
      diagnostics.push({ code: "supervisor_owner_update_overdue", severity: "warning", workKey, beadId: work.beadId, stage: checkpoint.stage, message: `Approved plan ${work.beadId ?? workKey} has not received its required owner update. Next action: ${checkpoint.nextAction}`, nextAction: checkpoint.nextAction });
    }
    if (state === "unproven") {
      diagnostics.push(unproven(workKey, work.beadId, checkpoint.stage, `Supervisor continuity for ${work.beadId ?? workKey} cannot be proven. Next action: ${checkpoint.nextAction}`, checkpoint.nextAction));
      continue;
    }
    if (state === "not-working" && input.now.getTime() > Date.parse(checkpoint.transitionDueAt!)) {
      diagnostics.push({ code: "supervisor_continuity_stalled", severity: "warning", workKey, beadId: work.beadId, stage: checkpoint.stage, message: `Approved plan ${work.beadId ?? workKey} is unfinished after ${checkpoint.stage}; no active worker or reviewer was proven before the transition deadline. Next action: ${checkpoint.nextAction}`, nextAction: checkpoint.nextAction });
    }
  }
  return diagnostics;
}

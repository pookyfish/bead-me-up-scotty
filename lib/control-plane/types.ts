import { z } from "zod";

export const sourceIdSchema = z.enum([
  "orchestra",
  "herdr",
  "runtime-manager",
  "hooks",
  "git",
]);
export const freshnessSchema = z.enum(["live", "cached", "stale", "unknown"]);
export const capabilitySchema = z.enum(["available", "degraded", "unavailable"]);
export const observationErrorCodeSchema = z.enum([
  "not_configured",
  "unavailable",
  "unauthorized",
  "timeout",
  "parse_error",
  "unsupported_version",
  "incomplete_observation",
  "dependency_unavailable",
]);

export const observationErrorSchema = z.object({
  code: observationErrorCodeSchema,
  message: z.string().min(1),
  retryAfterMs: z.number().int().positive().optional(),
});

const baseObservationSchema = z.object({
  source: sourceIdSchema,
  authority: z.string().min(1),
  observedAt: z.iso.datetime(),
  sourceUpdatedAt: z.iso.datetime().optional(),
  freshness: freshnessSchema,
  capabilities: z.array(z.string().min(1)),
});

export function observationOf<T extends z.ZodType>(dataSchema: T) {
  return z.discriminatedUnion("capability", [
    baseObservationSchema.extend({
      capability: z.literal("available"),
      data: dataSchema,
      error: z.undefined().optional(),
    }),
    baseObservationSchema.extend({
      capability: z.literal("degraded"),
      data: dataSchema.optional(),
      error: observationErrorSchema,
    }),
    baseObservationSchema.extend({
      capability: z.literal("unavailable"),
      data: dataSchema.optional(),
      error: observationErrorSchema,
    }),
  ]);
}

export const observationSchema = observationOf(
  z.unknown().refine((value) => value !== undefined, "Available observation data is required"),
);

export type SourceId = z.infer<typeof sourceIdSchema>;
export type Freshness = z.infer<typeof freshnessSchema>;
export type Capability = z.infer<typeof capabilitySchema>;
export type ObservationError = z.infer<typeof observationErrorSchema>;
export interface ObservationMeta {
  observedAt?: string;
  sourceUpdatedAt?: string;
  freshness?: Freshness;
  retryAfterMs?: number;
}
interface BaseObservation {
  source: SourceId;
  authority: string;
  observedAt: string;
  sourceUpdatedAt?: string;
  freshness: Freshness;
  capabilities: string[];
}

export interface AvailableObservation<T> extends BaseObservation {
  capability: "available";
  data: T;
  error?: never;
}

export interface FailedObservation<T> extends BaseObservation {
  capability: "degraded" | "unavailable";
  data?: T;
  error: ObservationError;
}

export type Observation<T> = AvailableObservation<T> | FailedObservation<T>;

const orchestraBoundedStringSchema = z.string().max(2_000);
const orchestraNullableStringSchema = orchestraBoundedStringSchema.nullable();
const orchestraBoundedStringListSchema = z
  .array(orchestraBoundedStringSchema)
  .max(50);

export interface OrchestraSectionStats {
  total: number;
  included: number;
  rejected: number;
  truncated: boolean;
}

export interface OrchestraSnapshot {
  schemaVersion: 2;
  supervisor: {
    actor: string;
    holder: string | null;
    sessionId: string | null;
    paneId: string | null;
    channelOfRecord: string | null;
  } | null;
  activeWork: Record<string, {
    beadId: string | null;
    status: string | null;
    repo: string | null;
    branch: string | null;
    filesTouching: string[];
    supervision: SupervisorCheckpointProjection | null;
  }>;
  fileLocks: Record<string, {
    lockedBy: string;
    beadId: string | null;
    lockedAt: string | null;
    reason: string | null;
  }>;
  pendingIntegration: Array<{
    agent: string | null;
    branch: string | null;
    repo: string | null;
    beadId: string | null;
    status: string;
    submittedAt: string | null;
  }>;
  unresolvedConflicts: Array<{
    reporter: string | null;
    at: string | null;
    type: string | null;
    detail: string;
    beadId: string | null;
    files: string[];
  }>;
  unresolvedImpacts: Array<{
    sourceAgent: string | null;
    at: string | null;
    type: string | null;
    summary: string;
    beadIds: string[];
    urgency: string | null;
  }>;
  recentDecisions: Array<{
    agent: string | null;
    at: string | null;
    decision: string;
    affects: string[];
    reason: string | null;
  }>;
  sections: Record<
    "activeWork" | "fileLocks" | "integrationQueue" | "conflicts" | "decisions" | "impacts",
    OrchestraSectionStats
  >;
}

export type ExactSessionBinding =
  | { source: "herdr"; surface: "herdr"; sessionId: string }
  | { source: "codex-collaboration"; surface: "collaboration"; sessionId: string }
  | { source: "claude-desktop"; surface: "desktop"; sessionId: string }
  | { source: "codex-desktop"; surface: "desktop"; sessionId: string }
  | { source: "external"; surface: "external"; sessionId: string };

export interface SupervisorCheckpoint {
  schemaVersion: 1;
  objectiveStatus: "approved_incomplete" | "paused" | "blocked" | "complete";
  objective: string;
  planPath: string;
  completedStages: number;
  totalStages: number;
  stage: string;
  phase: "planning" | "implementation" | "review" | "correction" | "transition" | "handoff";
  supervisorBinding: ExactSessionBinding | null;
  workerBinding: ExactSessionBinding | null;
  reviewerBinding: ExactSessionBinding | null;
  nextAction: string;
  lastTransitionAt: string;
  lastOwnerUpdateAt: string | null;
  transitionDueAt: string | null;
  ownerUpdateDueAt: string | null;
  pauseReason: string | null;
  blocker: string | null;
  handoffGeneration: number;
}

export type SupervisorCheckpointProjection =
  | { status: "valid"; checkpoint: SupervisorCheckpoint }
  | { status: "invalid"; code: "invalid_checkpoint" };

export const CHECKPOINT_TEXT_MAX_LENGTH = 512;
export const CONTROL_PLANE_DIAGNOSTIC_TEXT_MAX_LENGTH = 2_000;
export const coordinationIdentitySchema = z.string().min(1).max(CHECKPOINT_TEXT_MAX_LENGTH).regex(/^[^\u0000-\u001F\u007F]*$/);
const checkpointTextSchema = coordinationIdentitySchema;
const diagnosticTextSchema = z.string().min(1).max(CONTROL_PLANE_DIAGNOSTIC_TEXT_MAX_LENGTH).regex(/^[^\u0000-\u001F\u007F]*$/);
const planPathSchema = checkpointTextSchema.refine((value) =>
  !/^[A-Za-z]:/.test(value) && !value.startsWith("/") && !value.startsWith("\\") && !value.includes("\\") && !/\/{2,}/.test(value) && value.split("/").every((segment) => segment !== "" && segment !== "." && segment !== ".."),
  "planPath must be project-relative",
);
const exactSessionBindingSchema: z.ZodType<ExactSessionBinding> = z.discriminatedUnion("source", [
  z.object({ source: z.literal("herdr"), surface: z.literal("herdr"), sessionId: checkpointTextSchema }),
  z.object({ source: z.literal("codex-collaboration"), surface: z.literal("collaboration"), sessionId: checkpointTextSchema }),
  z.object({ source: z.literal("claude-desktop"), surface: z.literal("desktop"), sessionId: checkpointTextSchema }),
  z.object({ source: z.literal("codex-desktop"), surface: z.literal("desktop"), sessionId: checkpointTextSchema }),
  z.object({ source: z.literal("external"), surface: z.literal("external"), sessionId: checkpointTextSchema }),
]);

export const supervisorCheckpointSchema: z.ZodType<SupervisorCheckpoint> = z.object({
  schemaVersion: z.literal(1), objectiveStatus: z.enum(["approved_incomplete", "paused", "blocked", "complete"]),
  objective: checkpointTextSchema, planPath: planPathSchema, completedStages: z.number().int().nonnegative(), totalStages: z.number().int().nonnegative(),
  stage: checkpointTextSchema, phase: z.enum(["planning", "implementation", "review", "correction", "transition", "handoff"]),
  supervisorBinding: exactSessionBindingSchema.nullable(), workerBinding: exactSessionBindingSchema.nullable(), reviewerBinding: exactSessionBindingSchema.nullable(),
  nextAction: checkpointTextSchema, lastTransitionAt: z.iso.datetime(), lastOwnerUpdateAt: z.iso.datetime().nullable(), transitionDueAt: z.iso.datetime().nullable(), ownerUpdateDueAt: z.iso.datetime().nullable(),
  pauseReason: checkpointTextSchema.nullable(), blocker: checkpointTextSchema.nullable(), handoffGeneration: z.number().int().nonnegative(),
}).superRefine((value, ctx) => {
  if (value.objectiveStatus === "approved_incomplete" && (value.totalStages === 0 || value.completedStages >= value.totalStages || value.transitionDueAt === null || value.ownerUpdateDueAt === null)) ctx.addIssue({ code: "custom", message: "approved_incomplete must have unfinished stages and deadlines" });
  if (value.objectiveStatus === "complete" && (value.totalStages === 0 || value.completedStages !== value.totalStages)) ctx.addIssue({ code: "custom", message: "complete must have all stages complete" });
  if (value.objectiveStatus === "paused" && !value.pauseReason) ctx.addIssue({ code: "custom", message: "paused requires pauseReason" });
  if (value.objectiveStatus === "blocked" && !value.blocker) ctx.addIssue({ code: "custom", message: "blocked requires blocker" });
});
export const supervisorCheckpointProjectionSchema: z.ZodType<SupervisorCheckpointProjection> = z.discriminatedUnion("status", [
  z.object({ status: z.literal("valid"), checkpoint: supervisorCheckpointSchema }),
  z.object({ status: z.literal("invalid"), code: z.literal("invalid_checkpoint") }),
]);

export interface ControlPlaneDiagnostic {
  code: "supervisor_continuity_stalled" | "supervisor_owner_update_overdue" | "supervisor_continuity_unproven";
  severity: "warning" | "info";
  workKey: string;
  beadId: string | null;
  stage: string;
  message: string;
  nextAction: string;
}
export const controlPlaneDiagnosticSchema: z.ZodType<ControlPlaneDiagnostic> = z.object({
  code: z.enum(["supervisor_continuity_stalled", "supervisor_owner_update_overdue", "supervisor_continuity_unproven"]), severity: z.enum(["warning", "info"]), workKey: coordinationIdentitySchema, beadId: coordinationIdentitySchema.nullable(), stage: checkpointTextSchema, message: diagnosticTextSchema, nextAction: checkpointTextSchema,
});

export const orchestraSectionStatsSchema: z.ZodType<OrchestraSectionStats> = z.object({
  total: z.number().int().nonnegative(),
  included: z.number().int().nonnegative(),
  rejected: z.number().int().nonnegative(),
  truncated: z.boolean(),
});

const orchestraSupervisorSchema = z.object({
  actor: orchestraBoundedStringSchema,
  holder: orchestraNullableStringSchema,
  sessionId: orchestraNullableStringSchema,
  paneId: orchestraNullableStringSchema,
  channelOfRecord: orchestraNullableStringSchema,
});

const orchestraActiveWorkSchema = z.object({
  beadId: coordinationIdentitySchema.nullable(),
  status: orchestraNullableStringSchema,
  repo: orchestraNullableStringSchema,
  branch: orchestraNullableStringSchema,
  filesTouching: orchestraBoundedStringListSchema,
  supervision: supervisorCheckpointProjectionSchema.nullable().default(null),
});

const orchestraFileLockSchema = z.object({
  lockedBy: orchestraBoundedStringSchema,
  beadId: orchestraNullableStringSchema,
  lockedAt: orchestraNullableStringSchema,
  reason: orchestraNullableStringSchema,
});

const orchestraPendingIntegrationSchema = z.object({
  agent: orchestraNullableStringSchema,
  branch: orchestraNullableStringSchema,
  repo: orchestraNullableStringSchema,
  beadId: orchestraNullableStringSchema,
  status: orchestraBoundedStringSchema,
  submittedAt: orchestraNullableStringSchema,
});

const orchestraConflictSchema = z.object({
  reporter: orchestraNullableStringSchema,
  at: orchestraNullableStringSchema,
  type: orchestraNullableStringSchema,
  detail: orchestraBoundedStringSchema,
  beadId: orchestraNullableStringSchema,
  files: orchestraBoundedStringListSchema,
});

const orchestraImpactSchema = z.object({
  sourceAgent: orchestraNullableStringSchema,
  at: orchestraNullableStringSchema,
  type: orchestraNullableStringSchema,
  summary: orchestraBoundedStringSchema,
  beadIds: orchestraBoundedStringListSchema,
  urgency: orchestraNullableStringSchema,
});

const orchestraDecisionSchema = z.object({
  agent: orchestraNullableStringSchema,
  at: orchestraNullableStringSchema,
  decision: orchestraBoundedStringSchema,
  affects: orchestraBoundedStringListSchema,
  reason: orchestraNullableStringSchema,
});

const orchestraSectionNameSchema = z.enum([
  "activeWork",
  "fileLocks",
  "integrationQueue",
  "conflicts",
  "decisions",
  "impacts",
]);

export const orchestraSnapshotSchema: z.ZodType<OrchestraSnapshot> = z.object({
  schemaVersion: z.literal(2),
  supervisor: orchestraSupervisorSchema.nullable(),
  activeWork: z.record(coordinationIdentitySchema, orchestraActiveWorkSchema),
  fileLocks: z.record(orchestraBoundedStringSchema, orchestraFileLockSchema),
  pendingIntegration: z.array(orchestraPendingIntegrationSchema).max(50),
  unresolvedConflicts: z.array(orchestraConflictSchema).max(50),
  unresolvedImpacts: z.array(orchestraImpactSchema).max(50),
  recentDecisions: z.array(orchestraDecisionSchema).max(20),
  sections: z.record(orchestraSectionNameSchema, orchestraSectionStatsSchema),
});

export interface HerdrSessionObservation {
  provider: string | null;
  displayName: string | null;
  sessionId: string | null;
  agentSession: {
    source: string | null;
    agent: string | null;
    kind: string | null;
    value: string | null;
  } | null;
  surface: "herdr";
  status: "idle" | "working" | "blocked" | "done" | "unknown";
  workspaceId: string;
  tabId: string;
  paneId: string;
  terminalId: string;
  cwd: string | null;
  focused: boolean;
  revision: number;
  stateChangeSeq: number;
}

export interface HerdrSnapshot {
  protocol: number;
  version: string;
  sessions: HerdrSessionObservation[];
}

const herdrAgentSessionSchema = z.object({
  source: z.string().nullable(),
  agent: z.string().nullable(),
  kind: z.string().nullable(),
  value: z.string().nullable(),
});

const herdrSessionObservationSchema: z.ZodType<HerdrSessionObservation> = z.object({
  provider: z.string().nullable(),
  displayName: z.string().nullable(),
  sessionId: z.string().nullable(),
  agentSession: herdrAgentSessionSchema.nullable(),
  surface: z.literal("herdr"),
  status: z.enum(["idle", "working", "blocked", "done", "unknown"]),
  workspaceId: z.string(),
  tabId: z.string(),
  paneId: z.string(),
  terminalId: z.string(),
  cwd: z.string().nullable(),
  focused: z.boolean(),
  revision: z.number().int().nonnegative(),
  stateChangeSeq: z.number().int().nonnegative(),
});

export const herdrSnapshotSchema: z.ZodType<HerdrSnapshot> = z.object({
  protocol: z.number().int().nonnegative(),
  version: z.string(),
  sessions: z.array(herdrSessionObservationSchema),
});

export interface RuntimeManagerService {
  description: string;
  port: number;
  stateful: boolean;
  running: boolean;
  verdict: "adopted" | "foreign" | "down" | "unknown";
  occupant: { pid: number; exe: string; startTime?: string } | null;
  record: { startedBy?: string; reason?: string; since?: string } | null;
  inflightOp: string | null;
}

export interface RuntimeManagerSnapshot {
  epoch: number;
  managerPid: number;
  services: Record<string, RuntimeManagerService> | null;
}

const runtimeManagerOccupantSchema = z.object({
  pid: z.number().int().positive(),
  exe: z.string(),
  startTime: z.string().optional(),
});

const runtimeManagerRecordSchema = z.object({
  startedBy: z.string().optional(),
  reason: z.string().optional(),
  since: z.string().optional(),
});

const runtimeManagerServiceSchema: z.ZodType<RuntimeManagerService> = z.object({
  description: z.string(),
  port: z.number().int().min(1).max(65_535),
  stateful: z.boolean(),
  running: z.boolean(),
  verdict: z.enum(["adopted", "foreign", "down", "unknown"]),
  occupant: runtimeManagerOccupantSchema.nullable(),
  record: runtimeManagerRecordSchema.nullable(),
  inflightOp: z.string().nullable(),
});

export const runtimeManagerSnapshotSchema: z.ZodType<RuntimeManagerSnapshot> = z.object({
  epoch: z.number().int().nonnegative(),
  managerPid: z.number().int().positive(),
  services: z.record(z.string(), runtimeManagerServiceSchema).nullable(),
});

export interface HookReference {
  provider: "claude" | "codex";
  event: string;
  executableBasename: string | null;
  fileRef: string | null;
  fileScope: "project" | "external" | "unknown";
  exists: boolean | null;
}

export interface HookCoverageSnapshot {
  scope: "project-only";
  claudeSettingsPresent: boolean;
  codexHookConfigPresent: boolean;
  references: HookReference[];
  missingConfiguredFiles: string[];
  codexGlobalCoverage: "unknown";
}

const hookReferenceSchema: z.ZodType<HookReference> = z.object({
  provider: z.enum(["claude", "codex"]),
  event: z.string(),
  executableBasename: z.string().nullable(),
  fileRef: z.string().nullable(),
  fileScope: z.enum(["project", "external", "unknown"]),
  exists: z.boolean().nullable(),
});

export const hookCoverageSnapshotSchema: z.ZodType<HookCoverageSnapshot> = z.object({
  scope: z.literal("project-only"),
  claudeSettingsPresent: z.boolean(),
  codexHookConfigPresent: z.boolean(),
  references: z.array(hookReferenceSchema),
  missingConfiguredFiles: z.array(z.string()),
  codexGlobalCoverage: z.literal("unknown"),
});

export interface GitHealthSnapshot {
  repository: true;
  branch: string | null;
  detached: boolean;
  head: string;
  dirty: boolean;
  changedPathCount: number;
  baseRef: string | null;
  ahead: number | null;
  behind: number | null;
  unmergedLocalBranchCount: number | null;
}

const gitHealthStringSchema = z.string().min(1).max(512);
const gitHealthCountSchema = z.number().int().nonnegative().max(1_000_000);

export const gitHealthSnapshotSchema: z.ZodType<GitHealthSnapshot> = z.object({
  repository: z.literal(true),
  branch: gitHealthStringSchema.nullable(),
  detached: z.boolean(),
  head: gitHealthStringSchema,
  dirty: z.boolean(),
  changedPathCount: gitHealthCountSchema,
  baseRef: gitHealthStringSchema.nullable(),
  ahead: gitHealthCountSchema.nullable(),
  behind: gitHealthCountSchema.nullable(),
  unmergedLocalBranchCount: gitHealthCountSchema.nullable(),
});

export interface ControlPlaneSnapshot {
  generatedAt: string;
  project: { id: string; name: string; path: string | null };
  sources: {
    orchestra: Observation<OrchestraSnapshot>;
    herdr: Observation<HerdrSnapshot>;
    runtimeManager: Observation<RuntimeManagerSnapshot>;
    hooks: Observation<HookCoverageSnapshot>;
    git: Observation<GitHealthSnapshot>;
  };
  diagnostics: ControlPlaneDiagnostic[];
}

export const controlPlaneSnapshotSchema: z.ZodType<ControlPlaneSnapshot> = z.object({
  generatedAt: z.iso.datetime(),
  project: z.object({ id: z.string().min(1), name: z.string().min(1), path: z.string().nullable() }),
  sources: z.object({
    orchestra: observationOf(orchestraSnapshotSchema), herdr: observationOf(herdrSnapshotSchema), runtimeManager: observationOf(runtimeManagerSnapshotSchema), hooks: observationOf(hookCoverageSnapshotSchema), git: observationOf(gitHealthSnapshotSchema),
  }),
  diagnostics: z.array(controlPlaneDiagnosticSchema),
});

export function availableObservation<T>(
  source: SourceId,
  authority: string,
  data: T,
  capabilities: string[],
  meta: ObservationMeta = {},
): AvailableObservation<T> {
  const observedAt = meta.observedAt ?? new Date().toISOString();
  return observationSchema.parse({
    source,
    authority,
    observedAt,
    sourceUpdatedAt: meta.sourceUpdatedAt,
    freshness: meta.freshness ?? "live",
    capability: "available",
    capabilities,
    data,
  }) as AvailableObservation<T>;
}

export function failedObservation<T>(
  source: SourceId,
  authority: string,
  capability: "degraded" | "unavailable",
  code: ObservationError["code"],
  message: string,
  data: T | undefined,
  capabilities: string[],
  meta: ObservationMeta = {},
): FailedObservation<T> {
  const observedAt = meta.observedAt ?? new Date().toISOString();
  return observationSchema.parse({
    source,
    authority,
    observedAt,
    sourceUpdatedAt: meta.sourceUpdatedAt,
    freshness: meta.freshness ?? (data === undefined ? "unknown" : "stale"),
    capability,
    capabilities,
    data,
    error: { code, message, retryAfterMs: meta.retryAfterMs },
  }) as FailedObservation<T>;
}

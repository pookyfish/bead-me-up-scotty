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
  beadId: orchestraNullableStringSchema,
  status: orchestraNullableStringSchema,
  repo: orchestraNullableStringSchema,
  branch: orchestraNullableStringSchema,
  filesTouching: orchestraBoundedStringListSchema,
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
  activeWork: z.record(orchestraBoundedStringSchema, orchestraActiveWorkSchema),
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

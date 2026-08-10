import "server-only";

import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import {
  availableObservation,
  failedObservation,
  orchestraSnapshotSchema,
  type Observation,
  type OrchestraSectionStats,
  type OrchestraSnapshot,
} from "./types";

const HISTORY_LIMIT = 50;
const DECISION_LIMIT = 20;
const STRING_LIST_LIMIT = 50;
const STRING_LIMIT = 2_000;
const AUTHORITY = "coordination";
const CAPABILITIES = ["observe"];

export interface OrchestraDependencies {
  resolveStatePath(projectPath: string): string;
  stat(path: string): Promise<{ mtimeMs: number; size: number }>;
  readFile(path: string): Promise<string>;
  now(): Date;
}

const defaultDependencies: OrchestraDependencies = {
  resolveStatePath: (projectPath) =>
    path.resolve(projectPath, ".orchestra", "state.json"),
  stat: async (statePath) => stat(statePath),
  readFile: async (statePath) => readFile(statePath, "utf8"),
  now: () => new Date(),
};

const rawRootSchema = z.object({ schema_version: z.number().int() }).passthrough();
const rawSupervisorSchema = z.object({
  actor: z.string(),
  holder: z.string().nullish(),
  session_id: z.string().nullish(),
  pane_id: z.string().nullish(),
  channel_of_record: z.string().nullish(),
}).passthrough();
const rawActiveWorkSchema = z.object({
  bead_id: z.string().nullish(),
  status: z.string().nullish(),
  repo: z.string().nullish(),
  branch: z.string().nullish(),
  files_touching: z.array(z.string()).optional(),
}).passthrough();
const rawFileLockSchema = z.object({
  locked_by: z.string(),
  bead_id: z.string().nullish(),
  locked_at: z.string().nullish(),
  reason: z.string().nullish(),
}).passthrough();
const rawIntegrationSchema = z.object({
  agent: z.string().nullish(),
  branch: z.string().nullish(),
  repo: z.string().nullish(),
  bead_id: z.string().nullish(),
  status: z.string().nullish(),
  submitted_at: z.string().nullish(),
}).passthrough();
const rawConflictSchema = z.object({
  reporter: z.string().nullish(),
  at: z.string().nullish(),
  type: z.string().nullish(),
  detail: z.string(),
  bead_id: z.string().nullish(),
  files: z.array(z.string()).optional(),
  status: z.string().nullish(),
  resolved: z.boolean().optional(),
  resolution: z.unknown().optional(),
}).passthrough();
const rawImpactSchema = z.object({
  source_agent: z.string().nullish(),
  at: z.string().nullish(),
  type: z.string().nullish(),
  summary: z.string(),
  affected_beads: z.array(z.string()).optional(),
  urgency: z.string().nullish(),
  status: z.string().nullish(),
  resolved: z.boolean().optional(),
  resolution: z.unknown().optional(),
}).passthrough();
const rawDecisionSchema = z.object({
  agent: z.string().nullish(),
  at: z.string().nullish(),
  decision: z.string(),
  affects: z.array(z.string()).optional(),
  reason: z.string().nullish(),
}).passthrough();

const terminalIntegrationStatuses = new Set([
  "merged",
  "merged_to_master",
  "merged_and_pushed",
  "integrated_on_master",
  "released",
  "superseded",
]);
const resolvedConflictStatuses = new Set(["resolved", "closed"]);

interface CachedOrchestraSnapshot {
  mtimeMs: number;
  size: number;
  data: OrchestraSnapshot;
  incomplete: boolean;
}

const cacheByPath = new Map<string, CachedOrchestraSnapshot>();

interface ParsedSection<T> {
  total: number;
  rejected: number;
  entries: T[];
}

interface ParsedMapSection<T> {
  total: number;
  rejected: number;
  entries: Array<[string, T]>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseArraySection<T>(
  value: unknown,
  schema: z.ZodType<T>,
): ParsedSection<T> {
  if (value === undefined) return { total: 0, rejected: 0, entries: [] };
  if (!Array.isArray(value)) return { total: 1, rejected: 1, entries: [] };

  const entries: T[] = [];
  let rejected = 0;
  for (const record of value) {
    const result = schema.safeParse(record);
    if (result.success) entries.push(result.data);
    else rejected += 1;
  }
  return { total: value.length, rejected, entries };
}

function parseMapSection<T>(
  value: unknown,
  schema: z.ZodType<T>,
): ParsedMapSection<T> {
  if (value === undefined) return { total: 0, rejected: 0, entries: [] };
  if (!isRecord(value)) return { total: 1, rejected: 1, entries: [] };

  const rawEntries = Object.entries(value);
  const entries: Array<[string, T]> = [];
  let rejected = 0;
  for (const [key, record] of rawEntries) {
    if (key.length > STRING_LIMIT) {
      rejected += 1;
      continue;
    }
    const result = schema.safeParse(record);
    if (result.success) entries.push([key, result.data]);
    else rejected += 1;
  }
  return { total: rawEntries.length, rejected, entries };
}

function bounded(value: string): string {
  return value.slice(0, STRING_LIMIT);
}

function nullable(value: string | null | undefined): string | null {
  return value == null ? null : bounded(value);
}

function boundedList(values: string[] | undefined): string[] {
  return (values ?? []).slice(0, STRING_LIST_LIMIT).map(bounded);
}

function sectionStats(
  total: number,
  included: number,
  rejected: number,
  truncated = false,
): OrchestraSectionStats {
  return { total, included, rejected, truncated };
}

function conflictIsResolved(record: {
  status?: string | null;
  resolution?: unknown;
}): boolean {
  if (resolvedConflictStatuses.has(record.status?.toLowerCase() ?? "")) return true;
  return typeof record.resolution === "string" && record.resolution.trim().length > 0;
}

function impactIsResolved(record: { resolved?: boolean }): boolean {
  return record.resolved === true;
}

function newestFirst(
  left: { at?: string | null; index: number },
  right: { at?: string | null; index: number },
): number {
  const leftTime = left.at == null ? Number.NEGATIVE_INFINITY : Date.parse(left.at);
  const rightTime = right.at == null ? Number.NEGATIVE_INFINITY : Date.parse(right.at);
  const safeLeftTime = Number.isFinite(leftTime) ? leftTime : Number.NEGATIVE_INFINITY;
  const safeRightTime = Number.isFinite(rightTime) ? rightTime : Number.NEGATIVE_INFINITY;
  return safeRightTime - safeLeftTime || right.index - left.index;
}

function parseSnapshot(raw: Record<string, unknown>): {
  data: OrchestraSnapshot;
  incomplete: boolean;
} {
  let supervisor: OrchestraSnapshot["supervisor"] = null;
  let rejectedSupervisor = 0;
  if (raw.supervisor != null) {
    const result = rawSupervisorSchema.safeParse(raw.supervisor);
    if (result.success) {
      supervisor = {
        actor: bounded(result.data.actor),
        holder: nullable(result.data.holder),
        sessionId: nullable(result.data.session_id),
        paneId: nullable(result.data.pane_id),
        channelOfRecord: nullable(result.data.channel_of_record),
      };
    } else {
      rejectedSupervisor = 1;
    }
  }

  const activeWorkSection = parseMapSection(raw.active_work, rawActiveWorkSchema);
  const activeWorkEntries = activeWorkSection.entries.map(([key, record]) => [
    key,
    {
      beadId: nullable(record.bead_id),
      status: nullable(record.status),
      repo: nullable(record.repo),
      branch: nullable(record.branch),
      filesTouching: boundedList(record.files_touching),
    },
  ] as const);
  const activeWork = Object.fromEntries(activeWorkEntries);

  const fileLocksSection = parseMapSection(raw.file_locks, rawFileLockSchema);
  const fileLocks = Object.fromEntries(
    fileLocksSection.entries.map(([key, record]) => [
      key,
      {
        lockedBy: bounded(record.locked_by),
        beadId: nullable(record.bead_id),
        lockedAt: nullable(record.locked_at),
        reason: nullable(record.reason),
      },
    ]),
  );

  const integrationSection = parseArraySection(raw.integration_queue, rawIntegrationSchema);
  const pendingIntegrationEntries = integrationSection.entries.filter(
    (record) => !terminalIntegrationStatuses.has(record.status?.toLowerCase() ?? "unknown"),
  );
  const pendingIntegration = pendingIntegrationEntries
    .slice(0, HISTORY_LIMIT)
    .map((record) => ({
      agent: nullable(record.agent),
      branch: nullable(record.branch),
      repo: nullable(record.repo),
      beadId: nullable(record.bead_id),
      status: bounded(record.status ?? "unknown"),
      submittedAt: nullable(record.submitted_at),
    }));

  const conflictSection = parseArraySection(raw.conflicts, rawConflictSchema);
  const unresolvedConflictEntries = conflictSection.entries.filter(
    (record) => !conflictIsResolved(record),
  );
  const unresolvedConflicts = unresolvedConflictEntries
    .slice(0, HISTORY_LIMIT)
    .map((record) => ({
      reporter: nullable(record.reporter),
      at: nullable(record.at),
      type: nullable(record.type),
      detail: bounded(record.detail),
      beadId: nullable(record.bead_id),
      files: boundedList(record.files),
    }));

  const impactSection = parseArraySection(raw.impacts, rawImpactSchema);
  const unresolvedImpactEntries = impactSection.entries.filter(
    (record) => !impactIsResolved(record),
  );
  const unresolvedImpacts = unresolvedImpactEntries
    .slice(0, HISTORY_LIMIT)
    .map((record) => ({
      sourceAgent: nullable(record.source_agent),
      at: nullable(record.at),
      type: nullable(record.type),
      summary: bounded(record.summary),
      beadIds: boundedList(record.affected_beads),
      urgency: nullable(record.urgency),
    }));

  const decisionSection = parseArraySection(raw.decisions, rawDecisionSchema);
  const recentDecisions = decisionSection.entries
    .map((record, index) => ({ ...record, index }))
    .sort(newestFirst)
    .slice(0, DECISION_LIMIT)
    .map((record) => ({
      agent: nullable(record.agent),
      at: nullable(record.at),
      decision: bounded(record.decision),
      affects: boundedList(record.affects),
      reason: nullable(record.reason),
    }));

  const activeWorkNestedTruncation = activeWorkSection.entries.some(
    ([, record]) => (record.files_touching?.length ?? 0) > STRING_LIST_LIMIT,
  );
  const conflictNestedTruncation = unresolvedConflictEntries.some(
    (record) => (record.files?.length ?? 0) > STRING_LIST_LIMIT,
  );
  const impactNestedTruncation = unresolvedImpactEntries.some(
    (record) => (record.affected_beads?.length ?? 0) > STRING_LIST_LIMIT,
  );
  const decisionNestedTruncation = decisionSection.entries.some(
    (record) => (record.affects?.length ?? 0) > STRING_LIST_LIMIT,
  );

  const data = orchestraSnapshotSchema.parse({
    schemaVersion: 2,
    supervisor,
    activeWork,
    fileLocks,
    pendingIntegration,
    unresolvedConflicts,
    unresolvedImpacts,
    recentDecisions,
    sections: {
      activeWork: sectionStats(
        activeWorkSection.total,
        activeWorkSection.entries.length,
        activeWorkSection.rejected,
        activeWorkNestedTruncation,
      ),
      fileLocks: sectionStats(
        fileLocksSection.total,
        fileLocksSection.entries.length,
        fileLocksSection.rejected,
      ),
      integrationQueue: sectionStats(
        integrationSection.total,
        pendingIntegrationEntries.length,
        integrationSection.rejected,
        pendingIntegrationEntries.length > HISTORY_LIMIT,
      ),
      conflicts: sectionStats(
        conflictSection.total,
        unresolvedConflictEntries.length,
        conflictSection.rejected,
        unresolvedConflictEntries.length > HISTORY_LIMIT || conflictNestedTruncation,
      ),
      decisions: sectionStats(
        decisionSection.total,
        decisionSection.entries.length,
        decisionSection.rejected,
        decisionSection.entries.length > DECISION_LIMIT || decisionNestedTruncation,
      ),
      impacts: sectionStats(
        impactSection.total,
        unresolvedImpactEntries.length,
        impactSection.rejected,
        unresolvedImpactEntries.length > HISTORY_LIMIT || impactNestedTruncation,
      ),
    },
  });

  const incomplete = rejectedSupervisor +
    activeWorkSection.rejected +
    fileLocksSection.rejected +
    integrationSection.rejected +
    conflictSection.rejected +
    impactSection.rejected +
    decisionSection.rejected > 0;

  return { data, incomplete };
}

function observedResult(
  data: OrchestraSnapshot,
  incomplete: boolean,
  freshness: "live" | "cached",
  observedAt: string,
  sourceUpdatedAt: string,
): Observation<OrchestraSnapshot> {
  const meta = { observedAt, sourceUpdatedAt, freshness } as const;
  if (incomplete) {
    return failedObservation(
      "orchestra",
      AUTHORITY,
      "degraded",
      "incomplete_observation",
      "Some orchestra records were malformed and were omitted.",
      data,
      CAPABILITIES,
      meta,
    );
  }
  return availableObservation("orchestra", AUTHORITY, data, CAPABILITIES, meta);
}

function errorCode(error: unknown): string | undefined {
  return isRecord(error) && typeof error.code === "string" ? error.code : undefined;
}

export async function observeOrchestra(
  projectPath: string,
  deps: OrchestraDependencies = defaultDependencies,
): Promise<Observation<OrchestraSnapshot>> {
  const observedAt = deps.now().toISOString();
  const statePath = deps.resolveStatePath(projectPath);
  let fileStat: { mtimeMs: number; size: number };

  try {
    fileStat = await deps.stat(statePath);
  } catch (error) {
    const missing = errorCode(error) === "ENOENT";
    return failedObservation(
      "orchestra",
      AUTHORITY,
      "unavailable",
      missing ? "not_configured" : "unavailable",
      missing
        ? "The project has no .orchestra/state.json file."
        : "The orchestra state file could not be inspected.",
      undefined,
      CAPABILITIES,
      { observedAt, freshness: "unknown" },
    );
  }

  const sourceUpdatedAt = new Date(fileStat.mtimeMs).toISOString();
  const cached = cacheByPath.get(statePath);
  if (cached?.mtimeMs === fileStat.mtimeMs && cached.size === fileStat.size) {
    return observedResult(
      cached.data,
      cached.incomplete,
      "cached",
      observedAt,
      sourceUpdatedAt,
    );
  }

  let rawText: string;
  try {
    rawText = await deps.readFile(statePath);
  } catch {
    return failedObservation(
      "orchestra",
      AUTHORITY,
      "unavailable",
      "unavailable",
      "The orchestra state file could not be read.",
      undefined,
      CAPABILITIES,
      { observedAt, sourceUpdatedAt, freshness: "unknown" },
    );
  }

  let raw: unknown;
  try {
    raw = JSON.parse(rawText);
  } catch {
    return failedObservation(
      "orchestra",
      AUTHORITY,
      "unavailable",
      "parse_error",
      "The orchestra state file is not valid JSON.",
      undefined,
      CAPABILITIES,
      { observedAt, sourceUpdatedAt, freshness: "unknown" },
    );
  }

  const rootResult = rawRootSchema.safeParse(raw);
  if (!rootResult.success) {
    return failedObservation(
      "orchestra",
      AUTHORITY,
      "unavailable",
      "parse_error",
      "The orchestra state file has no valid schema version.",
      undefined,
      CAPABILITIES,
      { observedAt, sourceUpdatedAt, freshness: "unknown" },
    );
  }
  if (rootResult.data.schema_version !== 2) {
    return failedObservation(
      "orchestra",
      AUTHORITY,
      "unavailable",
      "unsupported_version",
      `Orchestra schema version ${rootResult.data.schema_version} is not supported.`,
      undefined,
      CAPABILITIES,
      { observedAt, sourceUpdatedAt, freshness: "unknown" },
    );
  }

  const parsed = parseSnapshot(rootResult.data);
  cacheByPath.set(statePath, {
    mtimeMs: fileStat.mtimeMs,
    size: fileStat.size,
    ...parsed,
  });
  return observedResult(
    parsed.data,
    parsed.incomplete,
    "live",
    observedAt,
    sourceUpdatedAt,
  );
}

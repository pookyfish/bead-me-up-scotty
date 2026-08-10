import "server-only";

import { execFile as nodeExecFile } from "node:child_process";
import path from "node:path";
import { z } from "zod";
import {
  availableObservation,
  failedObservation,
  herdrSnapshotSchema,
  type HerdrSessionObservation,
  type HerdrSnapshot,
  type Observation,
  type ObservationError,
} from "./types";

const AUTHORITY = "managed-session-runtime";
const CAPABILITIES = ["observe-managed-sessions"];
const HERDR_TIMEOUT_MS = 3_000;
const HERDR_MAX_OUTPUT_BYTES = 4 * 1024 * 1024;
const SUPPORTED_HERDR_PROTOCOLS = new Set([19]);
const HERDR_STATUSES = new Set<HerdrSessionObservation["status"]>([
  "idle",
  "working",
  "blocked",
  "done",
  "unknown",
]);

export interface HerdrExecOptions {
  encoding: "utf8";
  maxBuffer: number;
  timeout: number;
  signal?: AbortSignal;
  windowsHide: true;
}

export interface HerdrExecResult {
  stdout: string;
  stderr: string;
}

export interface HerdrDependencies {
  execFile?: (
    file: string,
    args: readonly string[],
    options: HerdrExecOptions,
  ) => Promise<HerdrExecResult>;
  now?: () => Date;
  signal?: AbortSignal;
}

const rawAgentSessionSchema = z.object({
  source: z.string(),
  agent: z.string(),
  kind: z.enum(["id", "path"]),
  value: z.string(),
});

const rawAgentSchema = z.object({
  agent: z.string().nullable().optional(),
  name: z.string().nullable().optional(),
  agent_session: rawAgentSessionSchema.nullish(),
  agent_status: z.string(),
  workspace_id: z.string(),
  tab_id: z.string(),
  pane_id: z.string(),
  terminal_id: z.string(),
  cwd: z.string().nullable().optional(),
  focused: z.boolean(),
  revision: z.number().int().nonnegative(),
  state_change_seq: z.number().int().nonnegative().default(0),
});

const envelopeHeadSchema = z.object({
  id: z.string(),
  result: z.object({ type: z.string() }).passthrough(),
});

const snapshotHeadSchema = z.object({
  id: z.string(),
  result: z.object({
    type: z.literal("session_snapshot"),
    snapshot: z.object({ protocol: z.number().int().nonnegative() }).passthrough(),
  }).passthrough(),
});

const snapshotEnvelopeSchema = z.object({
  id: z.string(),
  result: z.object({
    type: z.literal("session_snapshot"),
    snapshot: z.object({
      protocol: z.number().int().nonnegative(),
      version: z.string(),
      agents: z.array(rawAgentSchema),
    }).passthrough(),
  }).passthrough(),
});

function defaultExecFile(
  file: string,
  args: readonly string[],
  options: HerdrExecOptions,
): Promise<HerdrExecResult> {
  return new Promise((resolve, reject) => {
    nodeExecFile(file, [...args], options, (error, stdout, stderr) => {
      if (error) {
        reject(error);
        return;
      }
      resolve({ stdout, stderr });
    });
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function errorCode(error: unknown): string | undefined {
  return isRecord(error) && typeof error.code === "string" ? error.code : undefined;
}

function failureDetails(error: unknown): {
  code: ObservationError["code"];
  message: string;
} {
  const code = errorCode(error);
  if (code === "ENOENT") {
    return {
      code: "not_configured",
      message: "Herdr is not installed or is not available on PATH.",
    };
  }
  if (
    code === "ETIMEDOUT" ||
    code === "ABORT_ERR" ||
    (error instanceof Error && error.name === "AbortError")
  ) {
    return {
      code: "timeout",
      message: "Herdr did not return a session snapshot within the read budget.",
    };
  }
  if (code === "ERR_CHILD_PROCESS_STDIO_MAXBUFFER") {
    return {
      code: "unavailable",
      message: "Herdr session output exceeded the 4 MiB read budget.",
    };
  }
  return {
    code: "unavailable",
    message: "Herdr session state could not be observed.",
  };
}

function usesWindowsPaths(value: string): boolean {
  return /^[A-Za-z]:[\\/]/.test(value) || value.startsWith("\\\\");
}

function containsPath(projectPath: string, sessionPath: string): boolean {
  const pathApi = usesWindowsPaths(projectPath) || usesWindowsPaths(sessionPath)
    ? path.win32
    : path.posix;
  const resolvedProject = pathApi.resolve(projectPath);
  const resolvedSession = pathApi.resolve(sessionPath);
  const relative = pathApi.relative(resolvedProject, resolvedSession);
  return relative === "" || (
    relative !== ".." &&
    !relative.startsWith(`..${pathApi.sep}`) &&
    !pathApi.isAbsolute(relative)
  );
}

function normalizeStatus(value: string): HerdrSessionObservation["status"] {
  return HERDR_STATUSES.has(value as HerdrSessionObservation["status"])
    ? value as HerdrSessionObservation["status"]
    : "unknown";
}

function parseSnapshot(raw: unknown, projectPath: string):
  | { data: HerdrSnapshot }
  | { code: ObservationError["code"]; message: string } {
  const head = envelopeHeadSchema.safeParse(raw);
  if (!head.success || head.data.result.type !== "session_snapshot") {
    return {
      code: "parse_error",
      message: "Herdr returned an invalid session_snapshot envelope.",
    };
  }

  const snapshotHead = snapshotHeadSchema.safeParse(raw);
  if (!snapshotHead.success) {
    return {
      code: "parse_error",
      message: "Herdr returned an invalid session_snapshot envelope.",
    };
  }
  const protocol = snapshotHead.data.result.snapshot.protocol;
  if (!SUPPORTED_HERDR_PROTOCOLS.has(protocol)) {
    return {
      code: "unsupported_version",
      message: `Herdr protocol ${protocol} is not supported.`,
    };
  }

  const envelope = snapshotEnvelopeSchema.safeParse(raw);
  if (!envelope.success) {
    return {
      code: "parse_error",
      message: "Herdr returned a malformed protocol-19 session snapshot.",
    };
  }

  const rawSnapshot = envelope.data.result.snapshot;
  const sessions = rawSnapshot.agents
    .filter((agent) => agent.cwd !== null && agent.cwd !== undefined)
    .filter((agent) => containsPath(projectPath, agent.cwd!));

  return {
    data: herdrSnapshotSchema.parse({
      protocol: rawSnapshot.protocol,
      version: rawSnapshot.version,
      sessions: sessions.map((agent) => {
        const agentSession = agent.agent_session
          ? {
              source: agent.agent_session.source,
              agent: agent.agent_session.agent,
              kind: agent.agent_session.kind,
              value: agent.agent_session.value,
            }
          : null;
        return {
          provider: agent.agent ?? null,
          displayName: agent.name ?? null,
          sessionId: agentSession?.kind === "id" ? agentSession.value : null,
          agentSession,
          surface: "herdr",
          status: normalizeStatus(agent.agent_status),
          workspaceId: agent.workspace_id,
          tabId: agent.tab_id,
          paneId: agent.pane_id,
          terminalId: agent.terminal_id,
          cwd: agent.cwd ?? null,
          focused: agent.focused,
          revision: agent.revision,
          stateChangeSeq: agent.state_change_seq,
        };
      }),
    }),
  };
}

export async function observeHerdr(
  projectPath: string,
  deps: HerdrDependencies = {},
): Promise<Observation<HerdrSnapshot>> {
  const observedAt = (deps.now ?? (() => new Date()))().toISOString();
  const execFile = deps.execFile ?? defaultExecFile;
  let stdout: string;

  try {
    ({ stdout } = await execFile("herdr", ["api", "snapshot"], {
      encoding: "utf8",
      maxBuffer: HERDR_MAX_OUTPUT_BYTES,
      timeout: HERDR_TIMEOUT_MS,
      signal: deps.signal,
      windowsHide: true,
    }));
  } catch (error) {
    const failure = failureDetails(error);
    return failedObservation(
      "herdr",
      AUTHORITY,
      "unavailable",
      failure.code,
      failure.message,
      undefined,
      CAPABILITIES,
      { observedAt, freshness: "unknown" },
    );
  }

  let raw: unknown;
  try {
    raw = JSON.parse(stdout);
  } catch {
    return failedObservation(
      "herdr",
      AUTHORITY,
      "unavailable",
      "parse_error",
      "Herdr returned invalid JSON.",
      undefined,
      CAPABILITIES,
      { observedAt, freshness: "unknown" },
    );
  }

  const parsed = parseSnapshot(raw, projectPath);
  if ("code" in parsed) {
    return failedObservation(
      "herdr",
      AUTHORITY,
      "unavailable",
      parsed.code,
      parsed.message,
      undefined,
      CAPABILITIES,
      { observedAt, freshness: "unknown" },
    );
  }

  return availableObservation(
    "herdr",
    AUTHORITY,
    parsed.data,
    CAPABILITIES,
    { observedAt, freshness: "live" },
  );
}

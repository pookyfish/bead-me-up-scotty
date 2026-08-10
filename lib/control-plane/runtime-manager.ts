import "server-only";

import { readFile as nodeReadFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import {
  availableObservation,
  failedObservation,
  runtimeManagerSnapshotSchema,
  type Observation,
  type ObservationError,
  type RuntimeManagerSnapshot,
} from "./types";

const AUTHORITY = "service-runtime";
const CAPABILITIES = ["observe-health", "observe-services"];
const RUNTIME_MANAGER_BASE_URL = "http://127.0.0.1:1735";
const HEALTH_TIMEOUT_MS = 2_000;
const SERVICES_TIMEOUT_MS = 8_000;

type TimerHandle = ReturnType<typeof setTimeout>;

export interface RuntimeManagerDependencies {
  resolveTokenPath?: (projectPath: string) => string;
  readFile?: (tokenPath: string) => Promise<string>;
  fetch?: (url: string, init: RequestInit) => Promise<Response>;
  now?: () => Date;
  setTimeout?: (callback: () => void, delayMs: number) => TimerHandle;
  clearTimeout?: (timer: TimerHandle) => void;
}

interface ActiveRequest {
  promise: Promise<unknown>;
  abort(): void;
}

class RuntimeManagerFailure extends Error {
  constructor(
    readonly code: ObservationError["code"],
    message: string,
  ) {
    super(message);
    this.name = "RuntimeManagerFailure";
  }
}

class RuntimeManagerRequestAborted extends Error {
  constructor() {
    super("Runtime Manager request exceeded its read budget.");
    this.name = "RuntimeManagerRequestAborted";
  }
}

const healthResponseSchema = z.object({
  ok: z.literal(true),
  epoch: z.number().int().nonnegative(),
  pid: z.number().int().positive(),
});

const servicesEnvelopeSchema = z.object({
  epoch: z.number().int().nonnegative(),
  services: z.unknown(),
});

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function errorCode(error: unknown): string | undefined {
  return isRecord(error) && typeof error.code === "string" ? error.code : undefined;
}

function startRequest(
  url: string,
  token: string,
  timeoutMs: number,
  parentSignal: AbortSignal | undefined,
  deps: Required<Pick<RuntimeManagerDependencies, "fetch" | "setTimeout" | "clearTimeout">>,
): ActiveRequest {
  const controller = new AbortController();
  let timer: TimerHandle | undefined;
  let settled = false;
  let resolveRequest!: (data: unknown) => void;
  let rejectRequest!: (reason: unknown) => void;

  const cleanup = () => {
    if (timer !== undefined) {
      deps.clearTimeout(timer);
      timer = undefined;
    }
    parentSignal?.removeEventListener("abort", onParentAbort);
    controller.signal.removeEventListener("abort", onChildAbort);
  };
  const settle = (complete: () => void) => {
    if (settled) return;
    settled = true;
    cleanup();
    complete();
  };
  const onChildAbort = () => {
    settle(() => rejectRequest(new RuntimeManagerRequestAborted()));
  };
  const onParentAbort = () => {
    controller.abort();
  };

  const promise = new Promise<unknown>((resolve, reject) => {
    resolveRequest = resolve;
    rejectRequest = reject;
  });

  controller.signal.addEventListener("abort", onChildAbort, { once: true });
  if (parentSignal?.aborted) {
    controller.abort();
  } else {
    parentSignal?.addEventListener("abort", onParentAbort, { once: true });
  }

  if (!settled) {
    timer = deps.setTimeout(() => controller.abort(), timeoutMs);
    try {
      const fetchPromise = deps.fetch(url, {
        method: "GET",
        headers: {
          Accept: "application/json",
          "X-RM-Token": token,
        },
        signal: controller.signal,
      }).then((response) => readJson(response));
      void fetchPromise.then(
        (data) => settle(() => resolveRequest(data)),
        (error) => settle(() => rejectRequest(error)),
      );
    } catch (error) {
      settle(() => rejectRequest(error));
    }
  }

  return {
    promise,
    abort: () => controller.abort(),
  };
}

function requestFailure(error: unknown): RuntimeManagerFailure {
  if (
    error instanceof RuntimeManagerRequestAborted ||
    (error instanceof Error && error.name === "AbortError") ||
    errorCode(error) === "ABORT_ERR"
  ) {
    return new RuntimeManagerFailure(
      "timeout",
      "Runtime Manager did not respond within the read budget.",
    );
  }
  if (error instanceof RuntimeManagerFailure) return error;
  return new RuntimeManagerFailure(
    "unavailable",
    "Runtime Manager could not be reached.",
  );
}

async function readJson(response: Response): Promise<unknown> {
  if (response.status === 401) {
    throw new RuntimeManagerFailure(
      "unauthorized",
      "The project-local Runtime Manager token was rejected.",
    );
  }
  if (!response.ok) {
    throw new RuntimeManagerFailure(
      "unavailable",
      "Runtime Manager returned an unsuccessful response.",
    );
  }
  try {
    return await response.json();
  } catch {
    throw new RuntimeManagerFailure(
      "parse_error",
      "Runtime Manager returned invalid JSON.",
    );
  }
}

function parseHealth(raw: unknown) {
  const parsed = healthResponseSchema.safeParse(raw);
  if (!parsed.success) {
    throw new RuntimeManagerFailure(
      "parse_error",
      "Runtime Manager returned a malformed health response.",
    );
  }
  return parsed.data;
}

function parseServices(
  raw: unknown,
  health: z.infer<typeof healthResponseSchema>,
): RuntimeManagerSnapshot {
  const envelope = servicesEnvelopeSchema.safeParse(raw);
  if (!envelope.success) {
    throw new RuntimeManagerFailure(
      "parse_error",
      "Runtime Manager returned a malformed service inventory.",
    );
  }
  const snapshot = runtimeManagerSnapshotSchema.safeParse({
    epoch: health.epoch,
    managerPid: health.pid,
    services: envelope.data.services,
  });
  if (!snapshot.success) {
    throw new RuntimeManagerFailure(
      "parse_error",
      "Runtime Manager returned a malformed service inventory.",
    );
  }
  return snapshot.data;
}

function unavailableObservation(
  failure: RuntimeManagerFailure,
  observedAt: string,
): Observation<RuntimeManagerSnapshot> {
  return failedObservation(
    "runtime-manager",
    AUTHORITY,
    "unavailable",
    failure.code,
    failure.message,
    undefined,
    CAPABILITIES,
    { observedAt, freshness: "unknown" },
  );
}

export async function observeRuntimeManager(
  projectPath: string,
  deps: RuntimeManagerDependencies = {},
  parentSignal?: AbortSignal,
): Promise<Observation<RuntimeManagerSnapshot>> {
  const observedAt = (deps.now ?? (() => new Date()))().toISOString();
  const resolveTokenPath = deps.resolveTokenPath ?? ((value: string) =>
    path.resolve(value, "tools", "runtime-manager", "state", "manager-token"));
  const readFile = deps.readFile ?? (async (tokenPath: string) =>
    nodeReadFile(tokenPath, "utf8"));
  const fetchRequest = deps.fetch ?? ((url: string, init: RequestInit) =>
    globalThis.fetch(url, init));
  const schedule = deps.setTimeout ?? ((callback: () => void, delayMs: number) =>
    setTimeout(callback, delayMs));
  const clear = deps.clearTimeout ?? ((timer: TimerHandle) => clearTimeout(timer));

  let token: string;
  try {
    token = (await readFile(resolveTokenPath(projectPath))).trim();
  } catch (error) {
    const missing = errorCode(error) === "ENOENT";
    return unavailableObservation(
      new RuntimeManagerFailure(
        missing ? "not_configured" : "unavailable",
        missing
          ? "The project-local Runtime Manager token is not configured."
          : "The project-local Runtime Manager token could not be read.",
      ),
      observedAt,
    );
  }

  if (!token) {
    return unavailableObservation(
      new RuntimeManagerFailure(
        "not_configured",
        "The project-local Runtime Manager token is empty.",
      ),
      observedAt,
    );
  }

  const requestDeps = {
    fetch: fetchRequest,
    setTimeout: schedule,
    clearTimeout: clear,
  };
  const healthRequest = startRequest(
    `${RUNTIME_MANAGER_BASE_URL}/health`,
    token,
    HEALTH_TIMEOUT_MS,
    parentSignal,
    requestDeps,
  );
  const servicesRequest = startRequest(
    `${RUNTIME_MANAGER_BASE_URL}/services`,
    token,
    SERVICES_TIMEOUT_MS,
    parentSignal,
    requestDeps,
  );
  const servicesResult = servicesRequest.promise.then(
    (data) => ({ data } as const),
    (error) => ({ error } as const),
  );

  let health: z.infer<typeof healthResponseSchema>;
  try {
    health = parseHealth(await healthRequest.promise);
  } catch (error) {
    servicesRequest.abort();
    await servicesResult;
    return unavailableObservation(requestFailure(error), observedAt);
  }

  const inventoryResult = await servicesResult;
  if ("error" in inventoryResult) {
    const failure = requestFailure(inventoryResult.error);
    return failedObservation(
      "runtime-manager",
      AUTHORITY,
      "degraded",
      failure.code,
      failure.message,
      { epoch: health.epoch, managerPid: health.pid, services: null },
      CAPABILITIES,
      { observedAt, freshness: "live" },
    );
  }

  let snapshot: RuntimeManagerSnapshot;
  try {
    snapshot = parseServices(inventoryResult.data, health);
  } catch (error) {
    const failure = requestFailure(error);
    return failedObservation(
      "runtime-manager",
      AUTHORITY,
      "degraded",
      failure.code,
      failure.message,
      { epoch: health.epoch, managerPid: health.pid, services: null },
      CAPABILITIES,
      { observedAt, freshness: "live" },
    );
  }

  return availableObservation(
    "runtime-manager",
    AUTHORITY,
    snapshot,
    CAPABILITIES,
    { observedAt, freshness: "live" },
  );
}

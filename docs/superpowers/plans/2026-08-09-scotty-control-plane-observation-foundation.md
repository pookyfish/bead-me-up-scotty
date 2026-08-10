# Scotty Control-Plane Observation Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a read-only, failure-isolated control-plane observation API for orchestra coordination, Herdr sessions, Runtime Manager services, project hook coverage, and lightweight Git health, plus an executable Better Palia supervisor exit gate, without creating new task/runtime authority or touching the Mission Control UI.

**Architecture:** Client-safe Zod wire contracts live in `lib/control-plane/types.ts`, separately from server-only source adapters. Each adapter returns a provenance-bearing `Observation<T>` and degrades independently; deadline-wrapped observation promises prevent one source from hanging the snapshot, which never calls `bd`, `getStore()`, or the Beads API. A pure evaluator derives surface-safe continuity diagnostics for every current versioned supervision checkpoint, and a dependent Better Palia CLI consumes a fresh snapshot to block supervisor exit without dispatching or mutating authority. A shared signal-only SSE lifecycle serves the existing Beads stream and an orchestra invalidation stream while retaining the existing global shutdown registry; Stage 2 adds the client query and polling fallback.

**Tech Stack:** Next.js 16.2 route handlers, TypeScript 5, Zod 4, Node `execFile`, Web `fetch`/`ReadableStream`, Vitest 4.1.10.

## Global Constraints

- Beads remains the sole task/work/dependency/comment authority; this plan must not read `.beads` files, call `bd`, call `getStore()`, or add a second task schema.
- Herdr remains the sole controller of Herdr-managed CLI sessions. Stage 1 observes `herdr api snapshot`; it does not prompt, focus, stop, launch, or infer authorization.
- Runtime Manager remains the service authority. Stage 1 uses only authenticated `GET /health` and `GET /services`; it never calls a lifecycle endpoint.
- Git health uses only an exact read-command allowlist and must not fetch, mutate refs, write the index/object database, create/remove worktrees, or recursively watch `.git`. The extracted neutral runner preserves existing Unmerged Work `merge-tree --write-tree` behavior and is not mislabeled read-only.
- `.orchestra/state.json` is coordination truth for this fork, but its large real schema is parsed section-by-section; malformed history records do not erase valid current records.
- Preserve `actor identity != session != execution surface != orchestration role != Bead/task` in every type and fixture.
- Every source reports stable provenance, observation time, freshness, capabilities, and stable diagnostic codes. Unknown and unavailable are not rendered as down, idle, or uncontrolled facts.
- Freshness has one cross-source meaning: `live` was acquired successfully in this request (even if incomplete); `cached` is a validated unchanged-source cache hit; `stale` is retained last-known data after current acquisition failed; `unknown` means no trustworthy data. Adapters pass an explicit nondefault freshness for partial-live versus retained-stale results.
- One failed source never fails the complete snapshot. Unknown project IDs still return the existing `ConfigError`/404 envelope.
- Stage 1 has no UI, Board/List semantics, new Beads statuses, dispatch, lease writes, review writes, local persistence, or source configuration fields.
- Supervisor liveness is surface-qualified evidence. Stage 1 can prove only an exact Herdr binding from an available, complete Herdr observation; Codex collaboration, Desktop, external, and any other non-Herdr binding remain explicitly unproven until their declared source supplies conclusive liveness. Actor, provider, display name, pane title, and orchestration role are never substitutes for an exact binding.
- Version-1 checkpoint fields are client-visible coordination metadata. Writers store only non-secret text, reject control characters, keep `planPath` project-relative, and preserve validated `nextAction` text verbatim. Stage 1 projects and diagnoses this metadata but never writes it.
- AgentChattr remains the separately approved optional communication-provider Stage 1.5. This milestone neither installs it nor adds it as a sixth observation source.
- The Stage 1 signal stream carries only invalidation source IDs, never domain state. It reuses `lib/sse-registry.ts`; no second Beads watcher or shutdown registry is allowed.
- The supervisor ruling on Beads `better-palia-maps-l4cq3.1` assigns the reusable SSE lifecycle to Stage 1. Focused Workbench consumes it later and retains ownership of client reconnect UX and Board/List behavior.
- This repository forbids worktrees. All work uses the root checkout on `codex/scotty-control-plane-foundation`, and the checkout must return to clean `main` after integration.
- Tests are behavioral, not source-shape pins. Stage 1 adds a Node-20-compatible Vitest command before implementation code.
- No browser or pixel gate is required while Stage 1 remains API-only. Any visible UI change is out of scope and triggers desktop plus 390x844 rendered verification.
- Before the single final `npm run build`, inspect browser/Node/Python/listening-process memory and run no other resource-heavy job concurrently.
- This delivery includes a dependent Better Palia Maps executable exit gate and both normal `supervisor-check` skill entrypoints. That cross-repo change may begin only after the registered supervisor grants an explicit checkout lease and the shared Better Palia checkout is clean on `master`; never switch away from an unrelated dirty branch, stash it, or create a worktree. Neither Stage 1 nor Bead `better-palia-maps-82d3z` closes before the gate is merged and its fresh-snapshot behavior is verified.

## Execution Gate Before Task 1

- [ ] Re-read `.orchestra/state.json`, verify `codex-supervisor` still holds supervision, and confirm no unresolved owner/lock conflict covers this work.
- [ ] Verify the root Scotty checkout is `codex/scotty-control-plane-foundation`, the branch tracks its pushed remote, and the only uncommitted path is this registered plan.
- [ ] Expand `active_work.files_touching` and acquire locks before implementation for every path named by Tasks 1-9: `package.json`, `package-lock.json`, `lib/control-plane/**`, `lib/git-command.ts`, `lib/git-command.test.ts`, `lib/git-unmerged.ts`, `lib/git-unmerged.test.ts`, `lib/signal-sse.ts`, `lib/signal-sse.test.ts`, `lib/signal-sse-test-helpers.ts`, `lib/orchestra-watch.ts`, `lib/orchestra-watch.test.ts`, `lib/api-client.ts`, `app/api/p/[projectId]/control-plane/route.ts`, `app/api/p/[projectId]/control-plane/route.test.ts`, `app/api/p/[projectId]/control-plane/stream/route.ts`, `app/api/p/[projectId]/control-plane/stream/route.test.ts`, `app/api/p/[projectId]/beads/stream/route.ts`, `next.config.ts`, and `docs/control-plane-sources.md`.
- [ ] Stop and record a conflict if any listed path is locked by another active owner. Do not switch branches, stash, use a worktree, or absorb unrelated dirty files.
- [ ] Read the installed Next 16 route-handler and streaming references before editing routes: `node_modules/next/dist/docs/01-app/01-getting-started/15-route-handlers.md`, `node_modules/next/dist/docs/01-app/02-guides/streaming.md`, `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/route.md`, and `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/02-route-segment-config/runtime.md`.
- [ ] Record Task 1 BASE in the SDD ledger. Every task commit must use an explicit pathspec and immediately run `git show --stat --oneline HEAD`; stop if an unrelated path entered the commit.

---

### Task 1: Establish the behavioral test runner and observation wire contract

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Create: `lib/control-plane/types.ts`
- Test: `lib/control-plane/types.test.ts`

**Interfaces:**
- Produces: `SourceId`, `Freshness`, `Capability`, `ObservationError`, `ObservationMeta`, `AvailableObservation<T>`, `FailedObservation<T>`, `Observation<T>`, `observationOf()`, `observationSchema`, `availableObservation()`, and `failedObservation()`.
- Consumes: no application source; this is the client-safe foundation for every later task.

- [ ] **Step 1: Install and wire the Node-20-compatible runner**

Run after the resource/process preflight required for installs:

```powershell
npm install --save-dev vitest@4.1.10
```

Add this script to `package.json`:

```json
"test:unit": "vitest run"
```

- [ ] **Step 2: Write failing contract tests**

Create `lib/control-plane/types.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  availableObservation,
  failedObservation,
  observationSchema,
} from "./types";

describe("control-plane observation contract", () => {
  it("requires data for an available observation", () => {
    expect(
      observationSchema.safeParse({
        source: "herdr",
        authority: "managed-session-runtime",
        observedAt: "2026-08-09T22:00:00.000Z",
        freshness: "live",
        capability: "available",
        capabilities: ["observe"],
      }).success,
    ).toBe(false);
  });

  it("allows degraded data only with a stable diagnostic", () => {
    const result = failedObservation(
      "runtime-manager",
      "service-runtime",
      "degraded",
      "timeout",
      "Service inventory exceeded the read budget.",
      { epoch: 13 },
      ["observe-health"],
      { observedAt: "2026-08-09T22:00:00.000Z", freshness: "live" },
    );
    expect(observationSchema.parse(result).error?.code).toBe("timeout");
    expect(result.freshness).toBe("live");
  });

  it("preserves explicit live, cached, stale, and unknown freshness", () => {
    expect(availableObservation("git", "repository", {}, ["observe"], { freshness: "live" }).freshness).toBe("live");
    expect(availableObservation("orchestra", "coordination", {}, ["observe"], { freshness: "cached" }).freshness).toBe("cached");
    expect(failedObservation("git", "repository", "degraded", "timeout", "Timed out.", {}, ["observe"], { freshness: "stale" }).freshness).toBe("stale");
    expect(failedObservation("herdr", "runtime", "unavailable", "unavailable", "Unavailable.", undefined, [], { freshness: "unknown" }).freshness).toBe("unknown");
  });

  it("does not merge actor, session, surface, role, or task identity", () => {
    const result = availableObservation(
      "herdr",
      "managed-session-runtime",
      { sessions: [{ actor: "codex-supervisor", sessionId: "s1" }, { actor: "codex-supervisor", sessionId: "s2" }] },
      ["observe"],
      { observedAt: "2026-08-09T22:00:00.000Z" },
    );
    expect(result.data.sessions).toHaveLength(2);
  });
});
```

- [ ] **Step 3: Run the tests and verify the import fails**

Run:

```powershell
npm run test:unit -- lib/control-plane/types.test.ts
```

Expected: FAIL because `lib/control-plane/types.ts` does not exist.

- [ ] **Step 4: Implement the exact shared contract**

Create `lib/control-plane/types.ts`:

```ts
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
```

- [ ] **Step 5: Run the focused test and full runner**

Run:

```powershell
npm run test:unit -- lib/control-plane/types.test.ts
npm run test:unit
```

Expected: all tests PASS.

- [ ] **Step 6: Commit the test foundation**

```powershell
git add -- package.json package-lock.json lib/control-plane/types.ts lib/control-plane/types.test.ts
git commit --only -m "test: establish control-plane observation contracts" -- package.json package-lock.json lib/control-plane/types.ts lib/control-plane/types.test.ts
git show --stat --oneline HEAD
```

---

### Task 2: Add the optional orchestra coordination adapter

**Files:**
- Modify: `lib/control-plane/types.ts`
- Create: `lib/control-plane/orchestra.ts`
- Create: `lib/control-plane/test-helpers.ts`
- Test: `lib/control-plane/types.test.ts`
- Test: `lib/control-plane/orchestra.test.ts`

**Interfaces:**
- Consumes: `Observation<T>` helpers from Task 1.
- Produces client-safe `OrchestraSnapshot` and `orchestraSnapshotSchema` from `types.ts`; the server-only adapter exports `observeOrchestra(projectPath, deps?)`.
- Guarantee: cache identity is resolved state path plus `mtimeMs` plus size; the adapter performs no write.
- Payload budget: current maps plus bounded projections only. Never place raw historical arrays or arbitrary record blobs on the wire.

- [ ] **Step 1: Write failing tests for live-file realities**

Create tests covering:

```ts
it("returns not_configured when .orchestra/state.json is absent", async () => {
  const result = await observeOrchestra("C:/repo", fakeFs({ missing: true }));
  expect(result.error?.code).toBe("not_configured");
});

it("rejects an unsupported top-level schema version", async () => {
  const result = await observeOrchestra("C:/repo", fakeFs({ json: { schema_version: 3 } }));
  expect(result.error?.code).toBe("unsupported_version");
});

it("keeps valid current records around malformed history", async () => {
  const result = await observeOrchestra("C:/repo", fakeFs({ json: orchestraMixedFixture }));
  expect(result.data?.supervisor?.actor).toBe("codex-supervisor");
  expect(result.data?.activeWork).toHaveProperty("valid-entry");
  expect(result.data?.sections.decisions.rejected).toBe(1);
});

it("bounds and projects history instead of exposing raw records", async () => {
  const result = await observeOrchestra("C:/repo", fakeFs({ json: orchestraLargeFixture }));
  expect(result.data?.pendingIntegration).toHaveLength(50);
  expect(result.data?.recentDecisions).toHaveLength(20);
  expect(result.data?.sections.integrationQueue.truncated).toBe(true);
  const serialized = JSON.stringify(result);
  expect(serialized).not.toContain("raw_validation_blob");
  expect(serialized).not.toContain("raw_details_blob");
  expect(serialized).not.toContain("raw_files_changed_blob");
});

it("reuses a path/mtime/size cache hit and labels it cached", async () => {
  const deps = fakeFs({ json: orchestraMixedFixture, mtimeMs: 10, size: 100 });
  await observeOrchestra("C:/repo", deps);
  const second = await observeOrchestra("C:/repo", deps);
  expect(deps.readCount()).toBe(1);
  expect(second.freshness).toBe("cached");
});
```

- [ ] **Step 2: Run the tests and verify they fail**

```powershell
npm run test:unit -- lib/control-plane/orchestra.test.ts
```

Expected: FAIL because the adapter is missing.

- [ ] **Step 3: Implement passthrough section schemas and independent record parsing**

Define these exact client-safe shapes and their Zod schemas in `types.ts`; `orchestra.ts` imports them and contains only server-side file/parse/cache behavior:

```ts
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

export const orchestraSnapshotSchema: z.ZodType<OrchestraSnapshot>;
```

Use `.passthrough()` only for raw input schemas. Parse top-level `schema_version` first, then parse every map/array item with `safeParse` and project only the fields above. Include only nonterminal integration records, unresolved conflicts, unresolved impacts, and the newest decisions. Cap pending integration/conflicts/impacts at 50 each, decisions at 20, every projected file/affects list at 50, and every projected human-readable string at 2,000 characters. Populate `sections` from the uncapped counts so the UI can explain omissions without receiving the raw history. Report `capability: "degraded"` plus `incomplete_observation` when rejected counts are nonzero, but retain all valid projections. Report file mtime as `sourceUpdatedAt`.

Create `test-helpers.ts` with typed `fakeFs`, fake clock, abort-aware deferred promise, and bounded large-fixture builders used by later adapter tests. Helpers must expose counters explicitly; tests must not depend on module-global mocks.

- [ ] **Step 4: Run adapter tests**

```powershell
npm run test:unit -- lib/control-plane/orchestra.test.ts
```

Expected: PASS for missing, malformed-record, version, cache, and valid cases.

- [ ] **Step 5: Commit the orchestra adapter**

```powershell
git add -- lib/control-plane/types.ts lib/control-plane/types.test.ts lib/control-plane/test-helpers.ts lib/control-plane/orchestra.ts lib/control-plane/orchestra.test.ts
git commit --only -m "feat: observe orchestra coordination state" -- lib/control-plane/types.ts lib/control-plane/types.test.ts lib/control-plane/test-helpers.ts lib/control-plane/orchestra.ts lib/control-plane/orchestra.test.ts
git show --stat --oneline HEAD
```

---

### Task 3: Add the Herdr managed-session adapter

**Files:**
- Modify: `lib/control-plane/types.ts`
- Create: `lib/control-plane/herdr.ts`
- Test: `lib/control-plane/types.test.ts`
- Test: `lib/control-plane/herdr.test.ts`

**Interfaces:**
- Consumes: Task 1 observation helpers.
- Produces client-safe `HerdrSessionObservation`, `HerdrSnapshot`, and `herdrSnapshotSchema` from `types.ts`; the server-only adapter exports `observeHerdr(projectPath, deps?)`.
- Acquisition: `herdr api snapshot`, timeout 3000 ms, maximum output 4 MiB, accepting the aggregate snapshot `AbortSignal`.

- [ ] **Step 1: Write failing session-identity and failure tests**

```ts
it("keeps two sessions for one actor distinct", async () => {
  const result = await observeHerdr("C:/repo", fakeExec(herdrTwoSessionFixture));
  expect(result.data?.sessions.map((s) => s.sessionId)).toEqual(["session-a", "session-b"]);
});

it("filters by path containment rather than matching a name", async () => {
  const result = await observeHerdr("C:/repo", fakeExec(herdrMixedProjectFixture));
  expect(result.data?.sessions.map((s) => s.cwd)).toEqual(["C:\\repo", "C:\\repo\\packages\\ui"]);
  expect(result.data?.sessions.some((s) => s.cwd === "C:\\repo2")).toBe(false);
});

it("rejects unsupported protocol versions and wrong envelope types", async () => {
  const unsupported = await observeHerdr("C:/repo", fakeExec({
    id: "request-1",
    result: { type: "session_snapshot", snapshot: { ...herdrSnapshotFixture, protocol: 20 } },
  }));
  const wrongType = await observeHerdr("C:/repo", fakeExec({ id: "request-2", result: { type: "event" } }));
  expect(unsupported.error?.code).toBe("unsupported_version");
  expect(wrongType.error?.code).toBe("parse_error");
});

it.each([
  ["ENOENT", "not_configured"],
  ["ETIMEDOUT", "timeout"],
])("maps %s without claiming agents are idle", async (code, expected) => {
  const result = await observeHerdr("C:/repo", failingExec(code));
  expect(result.error?.code).toBe(expected);
  expect(result.data).toBeUndefined();
});
```

- [ ] **Step 2: Run the focused test and verify failure**

```powershell
npm run test:unit -- lib/control-plane/herdr.test.ts
```

- [ ] **Step 3: Implement the official snapshot parser**

Define this normalized client-safe shape in `types.ts` without merging identity dimensions:

```ts
export interface HerdrSessionObservation {
  provider: string | null;       // raw session.agent
  displayName: string | null;    // raw optional session.name
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

export const herdrSnapshotSchema: z.ZodType<HerdrSnapshot>;
```

Parse the official protocol-19 envelope exactly as `{ id, result: { type: "session_snapshot", snapshot: { protocol, version, agents, ... } } }`. Require `result.type === "session_snapshot"` before reading `result.snapshot`; normalize `snapshot.agents` to `sessions` and ignore the request `id` after validation. Define `SUPPORTED_HERDR_PROTOCOLS = new Set([19])`; any other `result.snapshot.protocol` is `unsupported_version`, never best-effort parsing. Map raw `agent` to `provider`, raw optional `name` to `displayName`, raw `agent_session.{source,agent,kind,value}` to `agentSession`, and `agent_status` through the explicit status enum with unknown fallback. Populate `sessionId` only from a session reference whose kind is `id`; preserve other references without pretending they are IDs.

Resolve project and session paths, then include a session only when the paths are equal or the session path begins with `resolvedProject + path.sep`; a lexical sibling such as `C:\repo2` must not match `C:\repo`. Do not infer role, supervisor, task, or actor identity from `name`, title, provider, or pane state. Set capabilities to `observe-managed-sessions`; later stages separately authorize controls.

- [ ] **Step 4: Run Herdr tests**

```powershell
npm run test:unit -- lib/control-plane/herdr.test.ts
```

- [ ] **Step 5: Commit the Herdr adapter**

```powershell
git add -- lib/control-plane/types.ts lib/control-plane/types.test.ts lib/control-plane/herdr.ts lib/control-plane/herdr.test.ts
git commit --only -m "feat: observe Herdr managed sessions" -- lib/control-plane/types.ts lib/control-plane/types.test.ts lib/control-plane/herdr.ts lib/control-plane/herdr.test.ts
git show --stat --oneline HEAD
```

---

### Task 4: Add the Runtime Manager health and service adapter

**Files:**
- Modify: `lib/control-plane/types.ts`
- Create: `lib/control-plane/runtime-manager.ts`
- Test: `lib/control-plane/types.test.ts`
- Test: `lib/control-plane/runtime-manager.test.ts`

**Interfaces:**
- Consumes: Task 1 observation helpers.
- Produces client-safe `RuntimeManagerSnapshot` and `runtimeManagerSnapshotSchema` from `types.ts`; the server-only adapter exports `observeRuntimeManager(projectPath, deps?)`.
- Acquisition: project-local `tools/runtime-manager/state/manager-token`, authenticated read-only HTTP on `127.0.0.1:1735`.

- [ ] **Step 1: Write failing behavior tests**

Cover these exact outcomes:

```ts
it("returns not_configured without the project-local manager token", async () => {
  const result = await observeRuntimeManager("C:/repo", fakeRuntime({ tokenMissing: true }));
  expect(result.error?.code).toBe("not_configured");
});

it("returns degraded health when services exceed eight seconds", async () => {
  vi.useFakeTimers();
  const pending = observeRuntimeManager("C:/repo", fakeRuntime({ health: { ok: true, epoch: 13, pid: 7 }, servicesTimeout: true }));
  await vi.advanceTimersByTimeAsync(8000);
  const result = await pending;
  expect(result.capability).toBe("degraded");
  expect(result.data?.epoch).toBe(13);
  expect(result.data?.services).toBeNull();
  expect(result.error?.code).toBe("timeout");
  vi.useRealTimers();
});

it("aborts both reads when the aggregate snapshot deadline fires", async () => {
  const parent = new AbortController();
  const deps = fakeRuntime({ neverResolves: true });
  const pending = observeRuntimeManager("C:/repo", deps, parent.signal);
  parent.abort();
  expect((await pending).error?.code).toBe("timeout");
  expect(deps.activeRequests()).toBe(0);
});

it("preserves foreign ownership and never emits the token", async () => {
  const result = await observeRuntimeManager("C:/repo", fakeRuntime({ serviceVerdict: "foreign" }));
  expect(result.data?.services?.scotty.verdict).toBe("foreign");
  expect(JSON.stringify(result)).not.toContain("test-token");
});

it("maps HTTP 401 to unauthorized", async () => {
  const result = await observeRuntimeManager("C:/repo", fakeRuntime({ status: 401 }));
  expect(result.error?.code).toBe("unauthorized");
});
```

- [ ] **Step 2: Verify tests fail**

```powershell
npm run test:unit -- lib/control-plane/runtime-manager.test.ts
```

- [ ] **Step 3: Implement read-only authenticated observations**

Define these public client-safe types and schemas in `types.ts`:

```ts
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

export const runtimeManagerSnapshotSchema: z.ZodType<RuntimeManagerSnapshot>;
```

Use separate child AbortControllers: 2000 ms for `/health`, 8000 ms for `/services`, both linked to an optional parent `AbortSignal` supplied by the aggregate snapshot. A healthy manager plus failed inventory is degraded with retained health data shaped exactly as `{ epoch, managerPid, services: null }`. Inject clock/timer/fetch dependencies so tests advance fake time and never wait eight real seconds. Every completion path clears timers and parent listeners. Never return the token, response headers, or raw body. `foreign` is a first-class verdict, not an error and not an adopted service.

- [ ] **Step 4: Run Runtime Manager tests**

```powershell
npm run test:unit -- lib/control-plane/runtime-manager.test.ts
```

- [ ] **Step 5: Commit the Runtime Manager adapter**

```powershell
git add -- lib/control-plane/types.ts lib/control-plane/types.test.ts lib/control-plane/runtime-manager.ts lib/control-plane/runtime-manager.test.ts
git commit --only -m "feat: observe Runtime Manager health" -- lib/control-plane/types.ts lib/control-plane/types.test.ts lib/control-plane/runtime-manager.ts lib/control-plane/runtime-manager.test.ts
git show --stat --oneline HEAD
```

---

### Task 5: Add truthful project hook coverage observation

**Files:**
- Modify: `lib/control-plane/types.ts`
- Create: `lib/control-plane/hooks.ts`
- Test: `lib/control-plane/types.test.ts`
- Test: `lib/control-plane/hooks.test.ts`

**Interfaces:**
- Consumes: Task 1 observation helpers.
- Produces client-safe `HookCoverageSnapshot` and `hookCoverageSnapshotSchema` from `types.ts`; the server-only adapter exports `observeHookCoverage(projectPath, deps?)`.
- This adapter reports only redacted project-local configuration evidence; it never returns raw command strings, command arguments, environment values, or absolute external paths, does not claim global Codex interception, and never executes a hook.

- [ ] **Step 1: Write failing coverage tests**

```ts
it("reports project-only scope and unknown global Codex coverage", async () => {
  const result = await observeHookCoverage("C:/repo", fakeFiles(completeClaudeFixture));
  expect(result.data?.scope).toBe("project-only");
  expect(result.data?.codexGlobalCoverage).toBe("unknown");
  expect(result.data?.claudeSettingsPresent).toBe(true);
  expect(result.data?.codexHookConfigPresent).toBe(false);
});

it("degrades when configured hook commands point at missing files", async () => {
  const result = await observeHookCoverage("C:/repo", fakeFiles(missingActorStampFixture));
  expect(result.capability).toBe("degraded");
  expect(result.data?.missingConfiguredFiles).toContain(".claude/hooks/actor-stamp.cjs");
});

it("does not execute hook code", async () => {
  const files = fakeFiles(completeClaudeFixture);
  await observeHookCoverage("C:/repo", files);
  expect(files.executions()).toBe(0);
});

it("inspects Claude and Codex independently", async () => {
  const result = await observeHookCoverage("C:/repo", fakeFiles(codexOnlyFixture));
  expect(result.capability).toBe("available");
  expect(result.data?.claudeSettingsPresent).toBe(false);
  expect(result.data?.codexHookConfigPresent).toBe(true);
});

it("never serializes raw commands, secrets, or absolute external paths", async () => {
  const result = await observeHookCoverage("C:/repo", fakeFiles(secretBearingExternalFixture));
  const serialized = JSON.stringify(result);
  expect(serialized).not.toContain("TOP_SECRET");
  expect(serialized).not.toContain("C:\\outside\\private-hook.ps1");
  expect(result.data?.references[0]).toMatchObject({ fileRef: null, fileScope: "external" });
});
```

- [ ] **Step 2: Verify tests fail**

```powershell
npm run test:unit -- lib/control-plane/hooks.test.ts
```

- [ ] **Step 3: Implement presence/configuration-only inspection**

Define in `types.ts`:

```ts
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
  missingConfiguredFiles: string[]; // project-relative refs only
  codexGlobalCoverage: "unknown";
}

export const hookCoverageSnapshotSchema: z.ZodType<HookCoverageSnapshot>;
```

Inspect `.claude/settings.json` and `.codex/hooks.json` independently. `not_configured` applies only when neither file exists. If one file is valid and the other malformed, return the valid projection as degraded `parse_error` evidence rather than erasing it. Parse only enough syntax to identify event, executable basename, and a referenced file. A contained file is returned as a normalized project-relative `fileRef`; an external path is represented only by `{ fileRef: null, fileScope: "external" }`; an unresolvable command is `unknown`. Never include the raw command, arguments, environment values, home-directory expansion, response headers, or parse exception text in the wire payload. Do not treat configuration as authorization and do not execute JavaScript/PowerShell.

- [ ] **Step 4: Run hook tests**

```powershell
npm run test:unit -- lib/control-plane/hooks.test.ts
```

- [ ] **Step 5: Commit hook observation**

```powershell
git add -- lib/control-plane/types.ts lib/control-plane/types.test.ts lib/control-plane/hooks.ts lib/control-plane/hooks.test.ts
git commit --only -m "feat: observe project hook coverage" -- lib/control-plane/types.ts lib/control-plane/types.test.ts lib/control-plane/hooks.ts lib/control-plane/hooks.test.ts
git show --stat --oneline HEAD
```

---

### Task 6: Extract the neutral Git process runner and add allowlisted lightweight health

**Files:**
- Create: `lib/git-command.ts`
- Modify: `lib/git-unmerged.ts:1-73`
- Modify: `lib/control-plane/types.ts`
- Create: `lib/control-plane/git-health.ts`
- Test: `lib/git-command.test.ts`
- Test: `lib/git-unmerged.test.ts`
- Test: `lib/control-plane/types.test.ts`
- Test: `lib/control-plane/git-health.test.ts`

**Interfaces:**
- Produces neutral `runGitCommand(repoPath, args, options?)` for existing Git consumers; client-safe `GitHealthSnapshot` and `gitHealthSnapshotSchema` from `types.ts`; and server-only allowlisted `observeGitHealth(projectPath, deps?, signal?)`.
- Consumes: Task 1 observation helpers.
- Existing `analyzeUnmerged()` behavior and its 60-second route cache remain unchanged.
- Safety boundary: `runGitCommand` is not advertised as read-only because existing Unmerged Work legitimately uses `merge-tree --write-tree`, which writes Git objects. The health adapter alone enforces a strict read-command allowlist.

- [ ] **Step 1: Write failing command-allowlist and health tests**

```ts
it("uses only the approved lightweight read commands", async () => {
  const git = fakeGit({ branch: "feature/x", head: "abcdef1", dirty: true, ahead: 2, behind: 1, unmergedBranches: 3 });
  await observeGitHealth("C:/repo", { runGit: git.run });
  expect(git.commands()).toEqual([
    ["rev-parse", "--is-inside-work-tree"],
    ["symbolic-ref", "--quiet", "--short", "HEAD"],
    ["rev-parse", "--short=12", "HEAD"],
    ["status", "--porcelain=v1", "--untracked-files=normal"],
    ["rev-parse", "--verify", "--quiet", "origin/master^{commit}"],
    ["rev-list", "--left-right", "--count", "origin/master...HEAD"],
    ["for-each-ref", "refs/heads", "--no-merged", "origin/master", "--format=%(refname:short)"],
  ]);
});

it("does not call full unmerged analysis", async () => {
  const git = fakeGit({ branch: "main", head: "abcdef1", dirty: false, ahead: 0, behind: 0, unmergedBranches: 0 });
  const result = await observeGitHealth("C:/repo", { runGit: git.run });
  expect(result.data?.branch).toBe("main");
  expect(git.commands().some((args) => args.includes("merge-tree"))).toBe(false);
});

it("rejects a command outside the health allowlist before spawning Git", async () => {
  const git = fakeGit({});
  await expect(runGitHealthCommand("C:/repo", ["fetch"], { runGit: git.run })).rejects.toMatchObject({ code: "forbidden_git_command" });
  expect(git.commands()).toEqual([]);
});

it.each(["nonzero", "spawn_error"])("preserves neutral runner %s semantics", async (mode) => {
  const result = runGitCommand("C:/repo", ["rev-parse", "HEAD"], fakeExecMode(mode));
  if (mode === "nonzero") await expect(result).resolves.toMatchObject({ code: 128 });
  else await expect(result).rejects.toThrow();
});
```

- [ ] **Step 2: Verify tests fail**

```powershell
npm run test:unit -- lib/control-plane/git-health.test.ts
```

- [ ] **Step 3: Move the existing `runGit` implementation without changing semantics**

Create `lib/git-command.ts` with the current `execFile("git", ["-C", repo, ...args])`, 15-second default timeout, 16 MiB buffer, `windowsHide: true`, and numeric nonzero-exit handling from `lib/git-unmerged.ts:49-65`. Export it as `runGitCommand`, accept an optional timeout and `AbortSignal`, and import it from `git-unmerged.ts`. Update the misleading module comment: `merge-tree --write-tree` does not alter refs/index/worktree, but it can write object-database entries and therefore is not literally read-only.

Add `git-command.test.ts` for numeric nonzero exits, spawn failures, timeouts/abort, buffer configuration, and argument preservation. Add `git-unmerged.test.ts` fixtures that pin existing base detection, clean/conflict trial-merge interpretation, and nonzero handling before and after extraction; these tests guard behavior parity rather than file location or function spelling.

- [ ] **Step 4: Implement lightweight Git health**

Define the client-safe shape/schema in `types.ts`:

```ts
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

export const gitHealthSnapshotSchema: z.ZodType<GitHealthSnapshot>;
```

Detect base refs in this order: `origin/master`, `origin/main`, `master`, `main`. If no base exists, return available Git identity with null comparison fields and a degraded `incomplete_observation` diagnostic. Do not invoke `fetch`, `merge-tree`, `update-index`, `worktree`, `checkout`, or any write command.

Inside `git-health.ts`, expose a testable server-only `runGitHealthCommand` whose exact allowlist covers only the command forms needed above. Reject every other command before invoking the neutral runner. Give the complete health observation one five-second budget, no more than two seconds per command, link every command to the parent aggregate `AbortSignal`, and retain partial identity as degraded data when later comparison commands exhaust the budget. Do not fetch or mutate to make health look current.

- [ ] **Step 5: Run Git and existing checks**

```powershell
npm run test:unit -- lib/control-plane/git-health.test.ts
npm run test:unit -- lib/git-command.test.ts lib/git-unmerged.test.ts
npm run lint
```

Expected: tests and lint PASS; Unmerged Work imports the shared runner without behavior changes.

- [ ] **Step 6: Commit shared Git reads and health**

```powershell
git add -- lib/git-command.ts lib/git-command.test.ts lib/git-unmerged.ts lib/git-unmerged.test.ts lib/control-plane/types.ts lib/control-plane/types.test.ts lib/control-plane/git-health.ts lib/control-plane/git-health.test.ts
git commit --only -m "feat: expose lightweight Git health" -- lib/git-command.ts lib/git-command.test.ts lib/git-unmerged.ts lib/git-unmerged.test.ts lib/control-plane/types.ts lib/control-plane/types.test.ts lib/control-plane/git-health.ts lib/control-plane/git-health.test.ts
git show --stat --oneline HEAD
```

---

### Task 7: Build the failure-isolated project snapshot and GET contract

**Files:**
- Modify: `lib/control-plane/types.ts`
- Modify: `lib/control-plane/orchestra.ts`
- Test: `lib/control-plane/orchestra.test.ts`
- Create: `lib/control-plane/continuity.ts`
- Test: `lib/control-plane/continuity.test.ts`
- Create: `lib/control-plane/snapshot.ts`
- Test: `lib/control-plane/types.test.ts`
- Test: `lib/control-plane/snapshot.test.ts`
- Create: `app/api/p/[projectId]/control-plane/route.ts`
- Test: `app/api/p/[projectId]/control-plane/route.test.ts`
- Modify: `lib/api-client.ts`

**Interfaces:**
- Consumes: all five adapters from Tasks 2-6 plus `getProject()`.
- Produces: `ExactSessionBinding`, `SupervisorCheckpoint`, `SupervisorCheckpointProjection`, `ControlPlaneDiagnostic`, pure `evaluateSupervisorContinuity({ orchestra, herdr, now })`, `ControlPlaneSnapshot`, `buildControlPlaneSnapshot(projectId, deps?)`, `GET /api/p/:projectId/control-plane`, `api.controlPlane.get(projectId)`.
- Explicit non-interface: no Beads collection or task summary appears in this snapshot; Stage 2 joins it with the existing Beads React Query cache.
- Continuity is derived coordination evidence, not task state or authority. The checkpoint is optional versioned metadata on an existing orchestra `active_work` record and carries the supervisor's declared next action; Scotty never infers a new task or dispatches from it in Stage 1.

- [ ] **Step 1: Write failing aggregation tests**

```ts
it("does not acquire Beads while building observations", async () => {
  const deps = snapshotDeps({ allAvailable: true });
  await buildControlPlaneSnapshot("better-palia-maps", deps);
  expect(deps.calls()).toEqual(["orchestra", "herdr", "runtime-manager", "hooks", "git"]);
});

it("preserves four sources when one rejects", async () => {
  const result = await buildControlPlaneSnapshot("better-palia-maps", snapshotDeps({ herdrRejects: true }));
  expect(result.sources.orchestra.capability).toBe("available");
  expect(result.sources.herdr.error?.code).toBe("unavailable");
  expect(result.sources.git.capability).toBe("available");
});

it("never collapses sessions into actor or task identity", async () => {
  const result = await buildControlPlaneSnapshot("better-palia-maps", snapshotDeps({ twoSessionsOneActor: true }));
  expect(result.sources.herdr.data?.sessions).toHaveLength(2);
});

it("bounds the complete snapshot when an adapter never settles", async () => {
  vi.useFakeTimers();
  const pending = buildControlPlaneSnapshot("better-palia-maps", snapshotDeps({ herdrNeverSettles: true }));
  await vi.advanceTimersByTimeAsync(SNAPSHOT_DEADLINE_MS);
  const result = await pending;
  expect(result.sources.herdr.error?.code).toBe("timeout");
  expect(result.sources.git.capability).toBe("available");
  expect(vi.getTimerCount()).toBe(0);
  vi.useRealTimers();
});

it("returns a source-empty Demo snapshot without invoking adapters", async () => {
  const deps = snapshotDeps({ failIfCalled: true });
  const result = await buildControlPlaneSnapshot("demo", deps);
  expect(result.project.path).toBeNull();
  expect(Object.values(result.sources).every((source) => source.error?.code === "not_configured")).toBe(true);
  expect(deps.calls()).toEqual([]);
});

it("rejects an unknown project with the existing 404 code", async () => {
  await expect(buildControlPlaneSnapshot("missing", snapshotDeps({}))).rejects.toMatchObject({ code: "unknown_project" });
});

it("reports the exact declared next action when an approved plan silently stalls", () => {
  const diagnostics = evaluateSupervisorContinuity({
    orchestra: orchestraWithCheckpoint({
      objectiveStatus: "approved_incomplete",
      objective: "Complete the approved Scotty control-plane observation foundation.",
      planPath: "docs/superpowers/plans/2026-08-09-scotty-control-plane-observation-foundation.md",
      completedStages: 5,
      totalStages: 9,
      stage: "Task 5 complete",
      phase: "transition",
      supervisorBinding: null,
      workerBinding: null,
      reviewerBinding: null,
      nextAction: "review Task 5 commit 0285f01, then dispatch Task 6",
      transitionDueAt: "2026-08-09T20:45:00.000Z",
      ownerUpdateDueAt: "2026-08-09T20:40:00.000Z",
    }),
    herdr: availableHerdr([]),
    now: new Date("2026-08-09T21:00:00.000Z"),
  });
  expect(diagnostics).toContainEqual({
    code: "supervisor_continuity_stalled",
    severity: "warning",
    workKey: "codex-scotty-control-plane-foundation-20260809",
    beadId: "better-palia-maps-l4cq3.1",
    stage: "Task 5 complete",
    message: "Approved plan better-palia-maps-l4cq3.1 is unfinished after Task 5 complete; no active worker or reviewer was proven before the transition deadline. Next action: review Task 5 commit 0285f01, then dispatch Task 6",
    nextAction: "review Task 5 commit 0285f01, then dispatch Task 6",
  });
});

it.each(["paused", "blocked", "complete"])(
  "suppresses every continuity warning for terminal %s state",
  (mode) => {
    const codes = evaluateContinuityFixture(mode).map(({ code }) => code);
    expect(codes).not.toContain("supervisor_continuity_stalled");
    expect(codes).not.toContain("supervisor_owner_update_overdue");
    expect(codes).not.toContain("supervisor_continuity_unproven");
  },
);

it.each([
  "codex-collaboration-binding",
  "external-binding",
  "herdr-status-unknown",
  "missing-required-phase-binding",
  "herdr-unavailable",
  "orchestra-unavailable",
  "invalid-checkpoint",
])("marks %s unproven and never stalled", (mode) => {
  const diagnostics = evaluateContinuityFixture(mode);
  expect(diagnostics).toContainEqual(expect.objectContaining({
    code: "supervisor_continuity_unproven",
  }));
  expect(diagnostics).not.toContainEqual(expect.objectContaining({
    code: "supervisor_continuity_stalled",
  }));
});

it("survives handoff and compaction with the new exact supervisor binding", async () => {
  const orchestra = await observeOrchestra("C:/repo", fakeFs({
    json: orchestraStateWithCheckpoint({
      phase: "handoff",
      handoffGeneration: 2,
      supervisorBinding: {
        source: "herdr",
        surface: "herdr",
        sessionId: "supervisor-session-after-handoff",
      },
      transitionDueAt: "2026-08-09T22:00:00.000Z",
      ownerUpdateDueAt: "2026-08-09T22:00:00.000Z",
    }),
  }));
  const restored = JSON.parse(JSON.stringify(orchestra));
  expect(restored.data.activeWork[WORK_KEY].supervision).toMatchObject({
    status: "valid",
    checkpoint: {
      handoffGeneration: 2,
      supervisorBinding: {
        source: "herdr",
        surface: "herdr",
        sessionId: "supervisor-session-after-handoff",
      },
      transitionDueAt: "2026-08-09T22:00:00.000Z",
      ownerUpdateDueAt: "2026-08-09T22:00:00.000Z",
    },
  });
  expect(evaluateSupervisorContinuity({
    orchestra: restored,
    herdr: availableHerdr([herdrSession({
      sessionId: "supervisor-session-after-handoff",
      status: "working",
    })]),
    now: new Date("2026-08-09T21:00:00.000Z"),
  })).toEqual([]);
});

it("does not resurrect an old same-label supervisor session after handoff", async () => {
  const orchestra = JSON.parse(JSON.stringify(await observeOrchestra("C:/repo", fakeFs({
    json: orchestraStateWithCheckpoint({
      phase: "handoff",
      handoffGeneration: 2,
      supervisorBinding: {
        source: "herdr",
        surface: "herdr",
        sessionId: "supervisor-session-after-handoff",
      },
      transitionDueAt: "2026-08-09T20:45:00.000Z",
      ownerUpdateDueAt: "2026-08-09T20:40:00.000Z",
    }),
  }))));
  const diagnostics = evaluateSupervisorContinuity({
    orchestra,
    herdr: availableHerdr([
      herdrSession({
        sessionId: "supervisor-session-before-handoff",
        provider: "codex",
        displayName: "supervisor",
        status: "working",
      }),
      herdrSession({
        sessionId: "supervisor-session-after-handoff",
        provider: "codex",
        displayName: "supervisor",
        status: "idle",
      }),
    ]),
    now: new Date("2026-08-09T21:00:00.000Z"),
  });
  expect(diagnostics).toContainEqual(expect.objectContaining({
    code: "supervisor_continuity_stalled",
  }));
});

it("reports an overdue owner update even while a bound worker is live", () => {
  expect(evaluateContinuityFixture("live-worker-owner-update-overdue")).toContainEqual(
    expect.objectContaining({ code: "supervisor_owner_update_overdue" }),
  );
});

it("does not let one live implementation lane hide an unrelated awaiting-spec-review fault", () => {
  const diagnostics = evaluateSupervisorContinuity({
    orchestra: orchestraWithCurrentCheckpoints({
      "codex-scotty-control-plane-foundation-20260809": approvedCheckpoint({
        phase: "implementation",
        workerBinding: { source: "herdr", surface: "herdr", sessionId: "stage-1-worker" },
        transitionDueAt: "2026-08-09T22:30:00.000Z",
        ownerUpdateDueAt: "2026-08-09T22:30:00.000Z",
      }),
      "codex-scotty-agentchattr-design-20260809": approvedCheckpoint({
        stage: "AgentChattr spec awaiting independent review",
        phase: "transition",
        nextAction: "dispatch an independent AgentChattr spec reviewer",
        transitionDueAt: "2026-08-09T21:30:00.000Z",
        ownerUpdateDueAt: "2026-08-09T21:30:00.000Z",
      }),
    }),
    herdr: availableHerdr([herdrSession({ sessionId: "stage-1-worker", status: "working" })]),
    now: new Date("2026-08-09T22:00:00.000Z"),
  });
  expect(diagnostics).not.toContainEqual(expect.objectContaining({
    workKey: "codex-scotty-control-plane-foundation-20260809",
  }));
  expect(diagnostics).toContainEqual(expect.objectContaining({
    code: "supervisor_continuity_stalled",
    workKey: "codex-scotty-agentchattr-design-20260809",
    nextAction: "dispatch an independent AgentChattr spec reviewer",
  }));
});
```

- [ ] **Step 2: Verify tests fail**

```powershell
npm run test:unit -- lib/control-plane/orchestra.test.ts lib/control-plane/continuity.test.ts lib/control-plane/snapshot.test.ts
```

- [ ] **Step 3: Implement the deadline-bounded snapshot using `Promise.allSettled`**

First extend the bounded orchestra projection. An `active_work` record may carry this optional snake-case `supervision` object; unknown fields remain ignored:

```ts
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
```

Project it as `activeWork[key].supervision: SupervisorCheckpointProjection | null`. An absent `supervision` remains `null`; a present malformed checkpoint becomes `{ status: "invalid", code: "invalid_checkpoint" }` and degrades the orchestra observation as `incomplete_observation`, so the evaluator can emit `supervisor_continuity_unproven` instead of silently treating malformed data as an optional omission.

Validate `schema_version: 1`; exact discriminated binding pairs; nonempty binding session IDs; nonnegative counts and handoff generation; ISO timestamps; and client-visible text with no U+0000-U+001F or U+007F control characters. Reject rather than truncate checkpoint strings beyond their declared limits, so a validated `nextAction` crosses the wire verbatim. `planPath` must be a normalized project-relative path: reject drive-qualified paths, UNC paths, leading `/` or `\\`, and any `..` segment. Never expose free-form `notes`, raw parse errors, rejected secret-bearing strings, or the invalid raw checkpoint through the wire.

Apply these state-specific invariants with `superRefine` rather than accepting internally contradictory state:

- `approved_incomplete`: `totalStages > 0`, `completedStages < totalStages`, and both `transitionDueAt` and `ownerUpdateDueAt` are non-null canonical ISO timestamps;
- `complete`: `totalStages > 0` and `completedStages === totalStages`;
- `paused`: nonempty `pauseReason`;
- `blocked`: nonempty `blocker`;
- all states: nonempty `objective`, `stage`, `nextAction`, and `planPath`; optional bindings, when present, contain nonempty exact session IDs.

Add orchestra adapter and wire-schema tests for valid projection; every contradictory approved-incomplete combination (`totalStages = 0`, `completedStages === totalStages`, `completedStages > totalStages`, null transition due time, null owner-update due time); invalid optional binding IDs; absolute/UNC/parent-traversal paths; control characters; verbatim accepted `nextAction`; invalid sentinel/degradation; bounds; and raw-note/invalid-value redaction.

Create `continuity.ts` with no I/O and these client-safe results:

```ts
export interface ControlPlaneDiagnostic {
  code:
    | "supervisor_continuity_stalled"
    | "supervisor_owner_update_overdue"
    | "supervisor_continuity_unproven";
  severity: "warning" | "info";
  workKey: string;
  beadId: string | null;
  stage: string;
  message: string;
  nextAction: string | null;
}

export function evaluateSupervisorContinuity(input: {
  orchestra: Observation<OrchestraSnapshot>;
  herdr: Observation<HerdrSnapshot>;
  now: Date;
}): ControlPlaneDiagnostic[];
```

Evaluate every current `activeWork` entry that carries a present versioned checkpoint independently. A healthy/live implementation lane must not suppress a fault on another planning, transition, or review lane. Do not inspect terminal/legacy `integration_queue` history or invent checkpoints for unversioned records. If the orchestra observation has no usable projected data, emit one `supervisor_continuity_unproven` diagnostic with `workKey: "orchestra"`, stage `coordination observation`, and next action `restore a valid orchestra observation before supervisor exit`; never let missing coordination evidence produce an empty, passing diagnostic set. Return no continuity diagnostic at all for a valid `paused`, `blocked`, or `complete` checkpoint, even if it retains an old due time. For `planning` and `handoff`, require `supervisorBinding`; for `implementation` and `correction`, require `workerBinding`; for `review`, require `reviewerBinding`; `transition` intentionally declares that no execution owner is active and needs no binding. Never fall back to the top-level orchestra supervisor, actor/provider/display name, role, pane title, or another phase's binding.

Resolve a binding by its complete `{ source, surface, sessionId }` identity. In Stage 1 only `{ source: "herdr", surface: "herdr" }` has a liveness source. A complete available Herdr observation is conclusive: an exact matching `working` session is live; an exact `idle`, `blocked`, or `done` session, or no exact match, is not working; an exact match with status `unknown` is unproven. A missing required phase binding, an invalid checkpoint sentinel, any non-Herdr binding, or unavailable/degraded Herdr observation is `supervisor_continuity_unproven`, never stalled. This is an explicit extension seam: a later declared source may become conclusive only by adding its own provenance-bearing observation and exact resolver.

For a valid `approved_incomplete` checkpoint with conclusive no-working evidence, do not report `supervisor_continuity_stalled` before `transitionDueAt`; after the deadline emit one warning with this exact message template and the checkpoint's validated `nextAction` unchanged: `Approved plan ${beadId ?? workKey} is unfinished after ${stage}; no active worker or reviewer was proven before the transition deadline. Next action: ${nextAction}`. Independently emit `supervisor_owner_update_overdue` after `ownerUpdateDueAt`, including while a bound worker/reviewer is live, but only for `approved_incomplete`. A genuinely absent optional checkpoint produces no diagnostic.

Define the public shape and assembled `controlPlaneSnapshotSchema` in client-safe `types.ts`:

```ts
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
```

Resolve the registered project with `getProject()` only. If it returns `undefined`, throw `new ConfigError(\`Unknown project: ${projectId}\`, "unknown_project")` so the existing `fail()` envelope remains a 404. If it returns Demo (`path === null`), do not invoke any adapter: return five `not_configured` observations with `project.path: null`.

For a real project, create one aggregate AbortController and `SNAPSHOT_DEADLINE_MS = 7000`. Start all five adapters together with its signal. Wrap every adapter promise in an injected-timer deadline race so even an adapter that ignores abort and never settles becomes a stable source-specific `timeout` observation. The aggregate deadline aborts child work; every wrapper clears timers/listeners. Then use `Promise.allSettled` to convert unexpected rejection to an `unavailable` observation with a stable source-specific message. Stage 2 owns the client query/polling consumer; Stage 1 guarantees only that this request itself is bounded.

After all observations settle, call the pure continuity evaluator with the final orchestra and Herdr observations and the same injected clock. Parse the final response with `controlPlaneSnapshotSchema`, assembled in `types.ts` with `observationOf(orchestraSnapshotSchema)`, `observationOf(herdrSnapshotSchema)`, `observationOf(runtimeManagerSnapshotSchema)`, `observationOf(hookCoverageSnapshotSchema)`, `observationOf(gitHealthSnapshotSchema)`, and `controlPlaneDiagnosticSchema`. Demo returns `diagnostics: []`. Never import `store.ts`, `bd.ts`, `schema.ts`, `interactions.ts`, or `git-unmerged.ts` here.

- [ ] **Step 4: Add the dynamic Node route and client type**

Create the route following current Next 16 conventions:

```ts
import { fail, ok } from "@/lib/api";
import { buildControlPlaneSnapshot } from "@/lib/control-plane/snapshot";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Ctx = { params: Promise<{ projectId: string }> };

export async function GET(_req: Request, { params }: Ctx) {
  try {
    const { projectId } = await params;
    return ok(await buildControlPlaneSnapshot(projectId));
  } catch (error) {
    return fail(error);
  }
}
```

Import `ControlPlaneSnapshot` from `lib/control-plane/types.ts`, never from the server-only aggregator, and add:

```ts
controlPlane: {
  get: (projectId: string) =>
    request<ControlPlaneSnapshot>(`${base(projectId)}/control-plane`),
},
```

- [ ] **Step 5: Run contract tests, lint, and a type/build-free route check**

```powershell
npm run test:unit -- lib/control-plane/snapshot.test.ts
npm run test:unit -- lib/control-plane/orchestra.test.ts lib/control-plane/continuity.test.ts
npm run test:unit -- app/api/p/[projectId]/control-plane/route.test.ts
npm run lint
```

The route test must prove unknown projects return the existing 404 envelope and Demo returns a source-empty snapshot without adapter calls. The focused continuity coverage must include exact plain-language stalled output; external/Collaboration bindings; exact Herdr `unknown`; missing phase binding; unavailable/degraded Herdr; every approved-incomplete count/deadline invariant; terminal-state suppression of all three codes; invalid-checkpoint unproven behavior; control-character/path rejection; and the post-handoff serialized checkpoint with a new exact supervisor binding and incremented generation. Expected: all PASS. The resource-heavy full build remains reserved for Task 9.

Before Task 7 review, the registered supervisor must migrate this plan's live orchestra checkpoint to the qualified version-1 shape and post the same non-secret checkpoint as a `SUPERVISION-CHECKPOINT/v1` comment on Bead `better-palia-maps-l4cq3.1`. The Bead comment is the durable handoff/audit record; `.orchestra/state.json` is the observed coordination projection. Stage 1 code writes neither one.

- [ ] **Step 6: Commit the snapshot API**

```powershell
git add -- lib/control-plane/types.ts lib/control-plane/types.test.ts lib/control-plane/orchestra.ts lib/control-plane/orchestra.test.ts lib/control-plane/continuity.ts lib/control-plane/continuity.test.ts lib/control-plane/snapshot.ts lib/control-plane/snapshot.test.ts app/api/p/[projectId]/control-plane/route.ts app/api/p/[projectId]/control-plane/route.test.ts lib/api-client.ts
git commit --only -m "feat: expose control-plane observations" -- lib/control-plane/types.ts lib/control-plane/types.test.ts lib/control-plane/orchestra.ts lib/control-plane/orchestra.test.ts lib/control-plane/continuity.ts lib/control-plane/continuity.test.ts lib/control-plane/snapshot.ts lib/control-plane/snapshot.test.ts app/api/p/[projectId]/control-plane/route.ts app/api/p/[projectId]/control-plane/route.test.ts lib/api-client.ts
git show --stat --oneline HEAD
```

---

### Task 8: Share the signal-only SSE lifecycle and observe coordination changes

**Files:**
- Create: `lib/signal-sse.ts`
- Test: `lib/signal-sse.test.ts`
- Create: `lib/signal-sse-test-helpers.ts`
- Create: `lib/orchestra-watch.ts`
- Test: `lib/orchestra-watch.test.ts`
- Modify: `app/api/p/[projectId]/beads/stream/route.ts`
- Create: `app/api/p/[projectId]/control-plane/stream/route.ts`
- Test: `app/api/p/[projectId]/control-plane/stream/route.test.ts`
- Modify: `next.config.ts`

**Interfaces:**
- Consumes: existing `subscribeBeadsChange()` and `registerSseStream()`.
- Produces `createSignalSseResponse()` and `subscribeOrchestraChange()` only.
- Signal contracts stay separate: the legacy Beads route still emits `event: change` / `data: 1`; the new control-plane stream emits `event: change` / `data: orchestra`. Herdr, Runtime Manager, hooks, and Git have no Stage 1 stream. Stage 2 will add the client polling/query consumer for all five observations.

- [ ] **Step 1: Write failing lifecycle tests**

```ts
it("emits source ids without domain state", async () => {
  const harness = signalHarness();
  const response = createSignalSseResponse(harness.request, harness.subscribe);
  const reader = harness.readerFor(response);
  try {
    harness.emit("orchestra");
    const chunk = await reader.readUntil("orchestra", 1000);
    expect(chunk).toContain("event: change\ndata: orchestra\n\n");
    expect(chunk).not.toContain("active_work");
  } finally {
    harness.abort();
    await reader.cancel();
  }
});

it("cleans subscribe, heartbeat, and global registration exactly once", async () => {
  const harness = signalHarness();
  createSignalSseResponse(harness.request, harness.subscribe, harness.deps);
  harness.abort();
  harness.abort();
  expect(harness.unsubscribeCount()).toBe(1);
  expect(harness.unregisterCount()).toBe(1);
  expect(harness.clearedHeartbeatCount()).toBe(1);
});

it("shares one orchestra watcher across subscribers and tears it down at zero", () => {
  const fs = watchHarness();
  const a = subscribeOrchestraChange("project", () => {}, fs.deps);
  const b = subscribeOrchestraChange("project", () => {}, fs.deps);
  expect(fs.watchCount()).toBe(1);
  a();
  expect(fs.closeCount()).toBe(0);
  b();
  expect(fs.closeCount()).toBe(1);
});

it.each(["request-abort", "reader-cancel", "shutdown", "enqueue-failure"])("cleans every %s path exactly once", async (mode) => {
  const harness = signalHarness({ mode });
  try {
    await harness.trigger(mode);
  } finally {
    await harness.dispose();
  }
  expect(harness.unsubscribeCount()).toBe(1);
  expect(harness.unregisterCount()).toBe(1);
  expect(harness.clearedHeartbeatCount()).toBe(1);
  expect(harness.openTimerCount()).toBe(0);
});

it("cleans registration when subscribe throws", () => {
  const harness = signalHarness({ subscribeThrows: true });
  expect(() => createSignalSseResponse(harness.request, harness.subscribe, harness.deps)).toThrow();
  expect(harness.cleanupCounts()).toEqual({ unsubscribe: 0, unregister: 1, heartbeat: 0 });
});

it("preserves the Beads data: 1 contract", async () => {
  const harness = signalHarness();
  const response = createSignalSseResponse(harness.request, harness.subscribe);
  const reader = harness.readerFor(response);
  try {
    harness.emit("1");
    expect(await reader.readUntil("data: 1", 1000)).toContain("event: change\ndata: 1\n\n");
  } finally {
    await reader.cancel();
    await harness.dispose();
  }
});
```

`signal-sse-test-helpers.ts` implements the bounded reader, fake timers, request abort, reader cancellation, enqueue failure, shutdown closer, throwing subscribe, and cleanup counters used above. Every stream test uses `try/finally`; no test awaits `response.text()` on an open SSE body.

- [ ] **Step 2: Verify the tests fail**

```powershell
npm run test:unit -- lib/signal-sse.test.ts lib/orchestra-watch.test.ts
```

- [ ] **Step 3: Extract the existing route lifecycle into `createSignalSseResponse`**

Move, rather than duplicate, the current encoder, heartbeat, abort, idempotent close, controller close, and `registerSseStream` behavior from `beads/stream/route.ts`. Preserve `HEARTBEAT_MS = 25_000`, response headers, `dynamic = "force-dynamic"`, and `runtime = "nodejs"`. Fix the existing enqueue-failure trap: enqueue failure must call the single `close()` path rather than setting `closed` first and thereby skipping unsubscribe/timer/registry cleanup. Reader cancellation, request abort, shutdown registry closure, subscribe failure, and duplicate close calls all converge on that same idempotent cleanup.

The helper signature is:

```ts
export type SubscribeSignal = (emit: (payload: string) => void) => () => void;

export function createSignalSseResponse(
  request: Request,
  subscribe: SubscribeSignal,
  deps: SignalSseDeps = defaultSignalSseDeps,
): Response;
```

- [ ] **Step 4: Add a non-recursive, ref-counted orchestra watcher**

Watch only the project `.orchestra` directory and filter for `state.json`; never watch the entire project recursively. Coalesce bursts for 200 ms, share one watcher per project, and tear it down at zero subscribers. Missing directory is a no-op. Do not claim a Stage 1 polling fallback exists; the snapshot remains requestable and Stage 2 supplies the polling consumer.

- [ ] **Step 5: Route the independent Beads and orchestra streams through the helper**

The transport helper treats payloads as opaque strings and never receives domain state. The existing Beads stream adapts `subscribeBeadsChange()` to `emit("1")` so its legacy `data: 1` wire contract does not change. The new control-plane stream subscribes only to `subscribeOrchestraChange()` and emits `"orchestra"`, matching the snapshot's non-Beads boundary.

Before opening a stream, the route resolves `getProject(projectId)`. Unknown projects use the existing `ConfigError("unknown_project")` 404 envelope; Demo returns `204 No Content` and creates no watcher/heartbeat/registry entry. Add route tests for both cases plus a real project subscription. Add `/control-plane(/stream)?` to the existing high-frequency request-log ignore pattern.

- [ ] **Step 6: Run lifecycle tests and lint**

```powershell
npm run test:unit -- lib/signal-sse.test.ts lib/orchestra-watch.test.ts app/api/p/[projectId]/control-plane/stream/route.test.ts
npm run lint
```

Expected: all PASS; no second Beads watcher or SSE shutdown registry exists.

- [ ] **Step 7: Commit the shared stream lifecycle**

```powershell
git add -- lib/signal-sse.ts lib/signal-sse.test.ts lib/signal-sse-test-helpers.ts lib/orchestra-watch.ts lib/orchestra-watch.test.ts app/api/p/[projectId]/beads/stream/route.ts app/api/p/[projectId]/control-plane/stream/route.ts app/api/p/[projectId]/control-plane/stream/route.test.ts next.config.ts
git commit --only -m "feat: stream control-plane invalidations" -- lib/signal-sse.ts lib/signal-sse.test.ts lib/signal-sse-test-helpers.ts lib/orchestra-watch.ts lib/orchestra-watch.test.ts app/api/p/[projectId]/beads/stream/route.ts app/api/p/[projectId]/control-plane/stream/route.ts app/api/p/[projectId]/control-plane/stream/route.test.ts next.config.ts
git show --stat --oneline HEAD
```

---

### Task 9: Document authority boundaries, land the executable exit gate, and complete integrated validation

**Files:**
- Scotty create: `docs/control-plane-sources.md`
- Scotty modify only if needed for an actual discovered command mismatch: files from Tasks 1-8
- Better Palia Maps create after an explicit checkout lease: `scripts/orchestration/supervisor-continuity-exit-check.cjs`
- Better Palia Maps test: `tests/supervisor-continuity-exit-check.test.cjs`
- Better Palia Maps modify: `.claude/skills/supervisor-check/skill.md`
- Better Palia Maps modify: `.agents/skills/supervisor-check/skill.md`

**Interfaces:**
- Consumes: every Stage 1 adapter and route.
- Produces: the durable source/timeout/freshness/capability contract used by Stage 2; Better Palia Maps `assessSupervisorContinuity(snapshot)`, `fetchFreshSnapshot(endpoint, deps?)`, and `runSupervisorContinuityExitCheck(options?)`; and a fixture-tested CLI that exits nonzero on any current continuity fault while printing an actionable `nextAction` verbatim.
- Authority boundary: the Scotty API and Better Palia gate are read-only. The gate detects and blocks supervisor exit; it never dispatches, prompts, writes checkpoints, changes Beads, or controls a runtime.

- [ ] **Step 1: Write the source contract document**

Document this exact table and expand each row with the implemented diagnostic codes:

| Source | Acquisition | Authority | Timeout | Signal | Explicit limitation |
|---|---|---|---:|---|---|
| Orchestra | `.orchestra/state.json` | coordination | aggregate deadline | `state.json` watcher | bounded projections, not process health |
| Herdr | `herdr api snapshot` protocol 19 | managed sessions | 3000 ms | Stage 2 polling | not supervisor authority |
| Runtime Manager | authenticated `GET /health`, `GET /services` | named services | 2000/8000 ms, capped by aggregate deadline | Stage 2 polling | foreign is not owned |
| Hooks | redacted project-local settings/file presence | configured project hooks | aggregate deadline | Stage 2 polling | global Codex coverage unknown |
| Git | strict health-command allowlist | repository health | 5000 ms total, 2000 ms/command | Stage 2 polling | not full Unmerged Work analysis; neutral shared runner can write objects for existing merge-tree use |

State plainly that the Stage 1 GET request has a 7000 ms aggregate deadline; Stage 2 adds the polling/query consumer and joins this snapshot with the existing Beads React Query cache. The only Stage 1 invalidation stream is the orchestra watcher; the existing Beads stream remains separate. No source grants dispatch authority.

Document continuity separately as a derived diagnostic, not a sixth authority source. Its inputs are every present versioned checkpoint on current orchestra `active_work` plus surface-qualified liveness. Stage 1 conclusively resolves only exact Herdr bindings from an available complete Herdr snapshot; missing required bindings, exact Herdr `unknown`, unavailable/degraded Herdr, Codex collaboration, Desktop, external, and other undeclared observation sources produce `supervisor_continuity_unproven`, never a fabricated idle verdict. One live lane cannot suppress an unrelated checkpointed lane. Legacy integration history is outside this evaluator. Define all three diagnostic codes, the state/count/deadline invariants, terminal suppression, exact plain-language message template, handoff generation/binding behavior, safe project-relative path rule, and non-secret/control-character-free writer contract. The checkpoint's `nextAction` is supervisor-declared coordination state preserved verbatim, not a Scotty-created task or automatic dispatch authorization.

- [ ] **Step 2: Run the complete unit and lint gates**

```powershell
npm run test:unit
npm run lint
```

Expected: all PASS.

- [ ] **Step 3: Run the resource preflight before the single build**

Inspect browser, Node, Python, ports 1701/3000/8782/1735, and available memory. Reuse or leave user-owned runtimes untouched. If memory pressure is visible, record the blocked build on the Bead instead of launching another heavy process.

- [ ] **Step 4: Run the full production build alone**

```powershell
npm run build
```

Expected: Next.js build and type checks PASS. Do not start a development server for this API-only stage.

- [ ] **Step 5: Perform the mandatory final reuse and authority audit**

Verify behavior, not only tests:

- `snapshot.ts` has no import or call path into `bd.ts`, `store.ts`, or `.beads` files.
- `types.ts` is the only client-imported contract boundary; client code imports no server-only adapter/aggregator;
- the Git health adapter rejects every command outside its exact read allowlist, while Unmerged Work retains behavior through the honestly named neutral runner;
- Git runner tests cover numeric nonzero exits, spawn errors, aborts, and existing Unmerged merge-tree behavior;
- there is one global SSE shutdown registry and one Beads watcher registry;
- every SSE cancellation/failure/shutdown path clears its heartbeat, watcher subscription, abort listener, and global registration exactly once; no stream test leaves a timer or open reader;
- valid orchestra records survive malformed history and unknown versions fail explicitly;
- orchestra history is bounded/projected and serialized output contains no raw validation/details/file blobs;
- Runtime Manager token and raw bodies never reach the wire;
- hook observations contain no raw command, secret, environment value, or absolute external path;
- Herdr requires protocol 19 plus a `session_snapshot` envelope, rejects sibling-path prefix matches, and keeps sessions separate even when display/provider labels match;
- unknown projects retain the existing 404 envelope, Demo calls no adapters and creates no stream, and a never-settling adapter cannot exceed the 7000 ms snapshot deadline;
- no Board/List, workbench query, visible component, or Beads status changed;
- all code commits postdate the approved audit/design and supervisor Gate 0 resolution.
- every approved incomplete plan used for supervision has a valid version-1 checkpoint with coherent incomplete counts, current stage, exact next action, surface-qualified binding for the active phase, canonical transition and owner-update deadlines, and explicit pause/blocker when applicable;
- the incident fixture (Task 5 complete, plan 5/9, no live worker/reviewer, no pause/blocker, overdue transition/update) emits `supervisor_continuity_stalled` with the exact plain-language message and declared next action; external/Collaboration bindings, exact Herdr `unknown`, missing phase bindings, invalid checkpoints, and unavailable/degraded Herdr are unproven rather than stalled; paused, blocked, and complete suppress all three continuity codes;
- the post-handoff/compaction fixture projects and serializes the incremented generation plus new exact supervisor binding, then proves liveness without actor/provider/display-name matching;
- all current checkpointed `active_work` records are evaluated independently: the live Stage 1 implementation fixture does not hide the overdue AgentChattr awaiting-spec-review checkpoint or its exact next action, while terminal/legacy integration history remains outside the evaluator;
- both Better Palia Maps `supervisor-check` skill entrypoints invoke the executable fresh-snapshot exit gate before final status; fixture-backed process tests prove stalled/overdue/unproven exit nonzero with exact `nextAction`, safe live/paused/blocked/complete exit zero, endpoint failure/staleness fail closed, and a second invocation refetches after remediation;
- the Stage 1 Bead and `better-palia-maps-82d3z` remain open until the Better Palia gate is committed, pushed, merged to `master`, and verified against a fresh Scotty snapshot.

- [ ] **Step 6: Commit documentation and any validation-only correction**

```powershell
git add -- docs/control-plane-sources.md
git commit --only -m "docs: define control-plane source authority" -- docs/control-plane-sources.md
git show --stat --oneline HEAD
```

- [ ] **Step 7: Submit and integrate the Scotty observation branch without closing Stage 1**

Post the branch, commit range, changed files, validation commands/results, source limitations, and review package to Bead `better-palia-maps-l4cq3.1`. Obtain task-by-task spec and quality review plus one independent whole-branch review. After all Scotty checks pass, push `codex/scotty-control-plane-foundation`, merge it into `main`, push `main`, and return the Scotty checkout to clean `main`. Keep Bead `better-palia-maps-l4cq3.1`, Bead `better-palia-maps-82d3z`, and the supervision checkpoint open; do not release their final coordination ownership because the required Better Palia executable gate has not landed yet.

- [ ] **Step 8: Acquire the explicit Better Palia checkout lease and locks**

The registered supervisor must grant a checkout lease after inspecting `C:\Better Palia Maps`. Require all of the following before any Better Palia edit or branch switch:

```powershell
git -C "C:\Better Palia Maps" status --short --branch
git -C "C:\Better Palia Maps" branch --show-current
git -C "C:\Better Palia Maps" rev-parse master
git -C "C:\Better Palia Maps" rev-parse origin/master
```

Expected: the checkout is clean on `master`, local and remote master match, and no other active owner holds the checkout. The presently observed unrelated dirty feature branch is a hard wait condition. Do not stash, restore, clean, switch it, create a worktree, or edit Better Palia files while it remains active.

After the lease is granted, register a Better Palia `active_work` entry for Bead `better-palia-maps-82d3z`, create `codex/supervisor-continuity-exit-gate` from current `master`, and lock exactly:

```text
scripts/orchestration/supervisor-continuity-exit-check.cjs
tests/supervisor-continuity-exit-check.test.cjs
.claude/skills/supervisor-check/skill.md
.agents/skills/supervisor-check/skill.md
```

Stop and record a conflict if any path or the shared checkout is owned by another active agent.

- [ ] **Step 9: Write failing process-level exit-gate tests in Better Palia Maps**

Create `tests/supervisor-continuity-exit-check.test.cjs`. Use `node:test`, an ephemeral loopback `node:http` server, and asynchronous `spawn(process.execPath, [CHECKER, "--endpoint", endpoint])`; each fixture supplies a fresh `generatedAt`. Pin these behaviors before the checker exists:

```js
test("stalled continuity exits 2 and prints nextAction verbatim", async () => {
  const nextAction = "review Task 5 commit 0285f01, then dispatch Task 6";
  await withSnapshotServer([
    () => snapshotWithDiagnostics([{
      code: "supervisor_continuity_stalled",
      severity: "warning",
      workKey: "codex-scotty-control-plane-foundation-20260809",
      beadId: "better-palia-maps-l4cq3.1",
      stage: "Task 5 complete",
      message: `Approved plan better-palia-maps-l4cq3.1 is unfinished after Task 5 complete; no active worker or reviewer was proven before the transition deadline. Next action: ${nextAction}`,
      nextAction,
    }]),
  ], async ({ endpoint }) => {
    const result = await runChecker(endpoint);
    assert.equal(result.status, 2);
    assert.match(result.stdout, /SUPERVISOR CONTINUITY BLOCKED/);
    assert.ok(result.stdout.includes(`Next action: ${nextAction}`));
  });
});

for (const [code, expectedStatus] of [
  ["supervisor_owner_update_overdue", 2],
  ["supervisor_continuity_unproven", 3],
]) {
  test(`${code} fails closed with its declared next action`, async () => {
    const nextAction = `resolve ${code} before supervisor exit`;
    await withSnapshotServer([
      () => snapshotWithDiagnostics([continuityDiagnostic(code, nextAction)]),
    ], async ({ endpoint }) => {
      const result = await runChecker(endpoint);
      assert.equal(result.status, expectedStatus);
      assert.ok(result.stdout.includes(`Next action: ${nextAction}`));
    });
  });
}

test("any unproven continuity item makes a mixed blocking result exit 3", async () => {
  await withSnapshotServer([
    () => snapshotWithDiagnostics([
      continuityDiagnostic("supervisor_continuity_stalled", "dispatch the next worker"),
      continuityDiagnostic("supervisor_continuity_unproven", "restore exact reviewer liveness"),
    ]),
  ], async ({ endpoint }) => {
    const result = await runChecker(endpoint);
    assert.equal(result.status, 3);
    assert.ok(result.stdout.includes("Next action: dispatch the next worker"));
    assert.ok(result.stdout.includes("Next action: restore exact reviewer liveness"));
  });
});

for (const mode of ["live-reviewer", "paused", "blocked", "complete"]) {
  test(`${mode} fresh snapshot exits zero`, async () => {
    await withSnapshotServer([
      () => snapshotWithDiagnostics([], { mode }),
    ], async ({ endpoint }) => {
      const result = await runChecker(endpoint);
      assert.equal(result.status, 0);
      assert.match(result.stdout, /Supervisor continuity check passed at /);
    });
  });
}

test("refetches after remediation instead of reusing the stalled response", async () => {
  await withSnapshotServer([
    () => snapshotWithDiagnostics([
      continuityDiagnostic(
        "supervisor_continuity_stalled",
        "record a truthful blocker checkpoint",
      ),
    ]),
    () => snapshotWithDiagnostics([], { mode: "blocked" }),
  ], async ({ endpoint, requestCount }) => {
    assert.equal((await runChecker(endpoint)).status, 2);
    assert.equal((await runChecker(endpoint)).status, 0);
    assert.equal(requestCount(), 2);
  });
});

test("malformed and stale snapshot sources exit 3", async () => {
  await withSnapshotServer([
    () => "{not-json",
    () => ({
      generatedAt: new Date(Date.now() - 31_000).toISOString(),
      diagnostics: [],
    }),
  ], async ({ endpoint }) => {
    assert.equal((await runChecker(endpoint)).status, 3);
    assert.equal((await runChecker(endpoint)).status, 3);
  });
});

test("a blocking diagnostic without an exact nextAction exits 3 as unproven", async () => {
  await withSnapshotServer([
    () => snapshotWithDiagnostics([{
      code: "supervisor_continuity_stalled",
      message: "Missing declared action",
      nextAction: null,
    }]),
  ], async ({ endpoint }) => {
    const result = await runChecker(endpoint);
    assert.equal(result.status, 3);
    assert.match(result.stderr, /SUPERVISOR CONTINUITY UNPROVEN/);
  });
});

test("unreachable snapshot source exits 3", async () => {
  const result = await runChecker("http://127.0.0.1:1/control-plane");
  assert.equal(result.status, 3);
});

test("both normal supervisor-check skills invoke the executable gate", () => {
  const command = "node scripts/orchestration/supervisor-continuity-exit-check.cjs --endpoint http://127.0.0.1:1701/api/p/better-palia-maps/control-plane";
  assert.match(read(".claude/skills/supervisor-check/skill.md"), new RegExp(escapeRegExp(command)));
  assert.match(read(".agents/skills/supervisor-check/skill.md"), new RegExp(escapeRegExp(command)));
});
```

Define the process/server helpers in the same test file with these concrete contracts:

```js
const http = require("node:http");
const { spawn } = require("node:child_process");

function snapshotWithDiagnostics(diagnostics, extra = {}) {
  return { generatedAt: new Date().toISOString(), diagnostics, ...extra };
}

function continuityDiagnostic(code, nextAction) {
  return {
    code,
    severity: code === "supervisor_continuity_unproven" ? "info" : "warning",
    workKey: "fixture-work",
    beadId: "better-palia-maps-82d3z",
    stage: "fixture stage",
    message: `Fixture diagnostic. Next action: ${nextAction}`,
    nextAction,
  };
}

function runChecker(endpoint) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [CHECKER, "--endpoint", endpoint], {
      cwd: ROOT,
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8").on("data", (chunk) => { stdout += chunk; });
    child.stderr.setEncoding("utf8").on("data", (chunk) => { stderr += chunk; });
    child.once("error", reject);
    child.once("close", (status) => resolve({ status, stdout, stderr }));
  });
}

async function withSnapshotServer(responseFactories, body) {
  let requests = 0;
  const server = http.createServer((_request, response) => {
    const factory = responseFactories[Math.min(requests, responseFactories.length - 1)];
    requests += 1;
    const payload = factory();
    response.writeHead(200, { "Content-Type": "application/json", "Cache-Control": "no-store" });
    response.end(typeof payload === "string" ? payload : JSON.stringify(payload));
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();
  try {
    await body({
      endpoint: `http://127.0.0.1:${port}/api/p/better-palia-maps/control-plane`,
      requestCount: () => requests,
    });
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
}
```

Also define `read(relativePath)` with `fs.readFileSync(path.join(ROOT, relativePath), "utf8")` and a standard regex-escaping helper in this test file. The server binds `127.0.0.1` on port `0`, closes in `finally`, and never contacts or starts the real Scotty runtime.

Run:

```powershell
node --test tests/supervisor-continuity-exit-check.test.cjs
```

Expected RED: the checker does not exist and both skill command assertions fail.

- [ ] **Step 10: Implement the read-only executable exit check**

Create `scripts/orchestration/supervisor-continuity-exit-check.cjs` with these exported interfaces:

```js
const BLOCK_EXIT_CODES = new Set([
  "supervisor_continuity_stalled",
  "supervisor_owner_update_overdue",
  "supervisor_continuity_unproven",
]);

function assessSupervisorContinuity(snapshot) {
  if (snapshot == null || typeof snapshot !== "object" || !Array.isArray(snapshot.diagnostics)) {
    throw new Error("Scotty snapshot has no diagnostics array.");
  }
  return snapshot.diagnostics.filter((item) => {
    if (item == null || typeof item !== "object" || typeof item.code !== "string") {
      throw new Error("Scotty snapshot contains a malformed diagnostic.");
    }
    if (!BLOCK_EXIT_CODES.has(item.code)) return false;
    if (typeof item.message !== "string" || item.message.trim() === "") {
      throw new Error("Scotty continuity diagnostic has no message.");
    }
    if (typeof item.nextAction !== "string" || item.nextAction.trim() === "") {
      throw new Error("Scotty continuity diagnostic has no exact nextAction.");
    }
    return true;
  });
}

function parseEndpoint(value) {
  const endpoint = new URL(value);
  if (
    endpoint.protocol !== "http:" ||
    endpoint.hostname !== "127.0.0.1" ||
    endpoint.username !== "" ||
    endpoint.password !== "" ||
    endpoint.hash !== ""
  ) {
    throw new Error("Endpoint must be an unauthenticated loopback HTTP URL.");
  }
  return endpoint.href;
}

async function fetchFreshSnapshot(endpoint, {
  fetchImpl = globalThis.fetch,
  now = () => Date.now(),
  timeoutMs = 10_000,
  maxAgeMs = 30_000,
} = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(parseEndpoint(endpoint), {
      method: "GET",
      cache: "no-store",
      headers: { Accept: "application/json", "Cache-Control": "no-cache" },
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`Scotty returned HTTP ${response.status}.`);
    const snapshot = await response.json();
    if (snapshot == null || typeof snapshot !== "object") {
      throw new Error("Scotty returned a malformed snapshot.");
    }
    const generatedAt = Date.parse(snapshot.generatedAt);
    const observedNow = now();
    if (!Number.isFinite(generatedAt)) throw new Error("Snapshot generatedAt is invalid.");
    if (observedNow - generatedAt > maxAgeMs) throw new Error("Scotty snapshot is stale.");
    if (generatedAt - observedNow > 5_000) throw new Error("Scotty snapshot is from the future.");
    return snapshot;
  } finally {
    clearTimeout(timer);
  }
}

async function runSupervisorContinuityExitCheck({
  endpoint,
  fetchImpl,
  now,
  stdout = process.stdout,
  stderr = process.stderr,
} = {}) {
  let snapshot;
  let diagnostics;
  try {
    snapshot = await fetchFreshSnapshot(endpoint, { fetchImpl, now });
    diagnostics = assessSupervisorContinuity(snapshot);
  } catch (error) {
    stderr.write(`SUPERVISOR CONTINUITY UNPROVEN: ${error.message}\n`);
    return 3;
  }
  if (diagnostics.length === 0) {
    stdout.write(`Supervisor continuity check passed at ${snapshot.generatedAt}.\n`);
    return 0;
  }
  stdout.write("SUPERVISOR CONTINUITY BLOCKED\n");
  for (const diagnostic of diagnostics) {
    stdout.write(`${diagnostic.message}\n`);
    if (diagnostic.nextAction != null) {
      stdout.write(`Next action: ${diagnostic.nextAction}\n`);
    }
  }
  return diagnostics.some(({ code }) => code === "supervisor_continuity_unproven") ? 3 : 2;
}

module.exports = {
  BLOCK_EXIT_CODES,
  assessSupervisorContinuity,
  fetchFreshSnapshot,
  parseEndpoint,
  runSupervisorContinuityExitCheck,
};
```

Parse `process.argv.slice(2)` as exactly `--endpoint <value>`; all other forms print `SUPERVISOR CONTINUITY UNPROVEN: expected --endpoint <loopback-url>` and exit `3`. The `require.main === module` wrapper awaits `runSupervisorContinuityExitCheck({ endpoint })` and assigns the returned integer to `process.exitCode`. It performs no retry cache, state write, Beads command, prompt, dispatch, or runtime control. Each invocation makes one new GET; remediation requires a second invocation and therefore a fresh snapshot.

- [ ] **Step 11: Wire both normal Better Palia supervisor-check paths**

Update `.claude/skills/supervisor-check/skill.md` and the stale `.agents/skills/supervisor-check/skill.md` to use the current Beads/schema-v2 workflow. In both files add the exact executable command as the first continuity health check and again as the final exit gate:

```powershell
node scripts/orchestration/supervisor-continuity-exit-check.cjs --endpoint http://127.0.0.1:1701/api/p/better-palia-maps/control-plane
```

State the executable semantics, not merely a reminder: exit `2` requires the supervisor to perform the printed `nextAction` (dispatch/review/owner update) or record a truthful explicit pause/blocker checkpoint and matching Bead comment; exit `3` means continuity is unproven and must be repaired or reported as the concrete blocker. Before returning final status, invoke the command again. Do not finish the supervisor turn unless the fresh rerun exits `0`; never make the script dispatch or mutate state itself.

- [ ] **Step 12: Validate, commit, push, and merge the Better Palia gate**

Run only lightweight checks:

```powershell
node --check scripts/orchestration/supervisor-continuity-exit-check.cjs
node --test tests/supervisor-continuity-exit-check.test.cjs
node --test tests/orchestration-protocol-freshness.test.cjs
git diff --check -- scripts/orchestration/supervisor-continuity-exit-check.cjs tests/supervisor-continuity-exit-check.test.cjs .claude/skills/supervisor-check/skill.md .agents/skills/supervisor-check/skill.md
```

Expected: all PASS. Review the full diff for task-database duplication, mutations, non-loopback access, secret output, and unrelated stale-skill changes. Commit only the four locked files with an explicit pathspec:

```powershell
git add -- scripts/orchestration/supervisor-continuity-exit-check.cjs tests/supervisor-continuity-exit-check.test.cjs .claude/skills/supervisor-check/skill.md .agents/skills/supervisor-check/skill.md
git commit --only -m "feat: enforce supervisor continuity on exit" -- scripts/orchestration/supervisor-continuity-exit-check.cjs tests/supervisor-continuity-exit-check.test.cjs .claude/skills/supervisor-check/skill.md .agents/skills/supervisor-check/skill.md
git show --stat --oneline HEAD
git push -u origin codex/supervisor-continuity-exit-gate
```

Obtain independent review, merge the validated branch to Better Palia `master`, push `master`, verify local/remote parity, release only these locks, and return the shared checkout to clean `master`. If the checkout lease disappears or unrelated dirt appears, stop without stashing or switching.

- [ ] **Step 13: Prove the live fresh-snapshot exit path, then close both Beads**

After Scotty `main` contains Task 7 and the Runtime Manager confirms the existing :1701 service is serving that merged revision, run the Better Palia command once. Do not start or restart a runtime without the repository's resource preflight and current authorization. A nonzero result is expected to block closure and print the exact action; it is not a reason to weaken the test.

The registered supervisor then performs the printed action or records a truthful explicit pause/blocker checkpoint plus matching `SUPERVISION-CHECKPOINT/v1` Bead comment. Run the same command again; the API must be fetched again and exit `0` on the fresh state. Post both invocation results, Scotty merge, Better Palia merge, and exact checkpoint transition to `better-palia-maps-82d3z` and `better-palia-maps-l4cq3.1`. Only then close both Beads, mark both integrations merged, release the remaining Stage 1 ownership, and leave both repositories clean on their canonical branches.

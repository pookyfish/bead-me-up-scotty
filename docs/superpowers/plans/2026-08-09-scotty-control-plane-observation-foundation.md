# Scotty Control-Plane Observation Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a read-only, failure-isolated control-plane observation API for orchestra coordination, Herdr sessions, Runtime Manager services, project hook coverage, and lightweight Git health without creating new task/runtime authority or touching the Mission Control UI.

**Architecture:** Client-safe Zod wire contracts live in `lib/control-plane/types.ts`, separately from server-only source adapters. Each adapter returns a provenance-bearing `Observation<T>` and degrades independently; deadline-wrapped observation promises prevent one source from hanging the snapshot, which never calls `bd`, `getStore()`, or the Beads API. A shared signal-only SSE lifecycle serves the existing Beads stream and an orchestra invalidation stream while retaining the existing global shutdown registry. Stage 2 will add the client query and polling fallback.

**Tech Stack:** Next.js 16.2 route handlers, TypeScript 5, Zod 4, Node `execFile`, Web `fetch`/`ReadableStream`, Vitest 4.1.10.

## Global Constraints

- Beads remains the sole task/work/dependency/comment authority; this plan must not read `.beads` files, call `bd`, call `getStore()`, or add a second task schema.
- Herdr remains the sole controller of Herdr-managed CLI sessions. Stage 1 observes `herdr api snapshot`; it does not prompt, focus, stop, launch, or infer authorization.
- Runtime Manager remains the service authority. Stage 1 uses only authenticated `GET /health` and `GET /services`; it never calls a lifecycle endpoint.
- Git health uses only read-only commands and must not fetch, mutate refs, write the index/object database, create/remove worktrees, or recursively watch `.git`.
- `.orchestra/state.json` is coordination truth for this fork, but its large real schema is parsed section-by-section; malformed history records do not erase valid current records.
- Preserve `actor identity != session != execution surface != orchestration role != Bead/task` in every type and fixture.
- Every source reports stable provenance, observation time, freshness, capabilities, and stable diagnostic codes. Unknown and unavailable are not rendered as down, idle, or uncontrolled facts.
- One failed source never fails the complete snapshot. Unknown project IDs still return the existing `ConfigError`/404 envelope.
- Stage 1 has no UI, Board/List semantics, new Beads statuses, dispatch, lease writes, review writes, local persistence, or source configuration fields.
- The Stage 1 signal stream carries only invalidation source IDs, never domain state. It reuses `lib/sse-registry.ts`; no second Beads watcher or shutdown registry is allowed.
- The supervisor ruling on Beads `better-palia-maps-l4cq3.1` assigns the reusable SSE lifecycle to Stage 1. Focused Workbench consumes it later and retains ownership of client reconnect UX and Board/List behavior.
- This repository forbids worktrees. All work uses the root checkout on `codex/scotty-control-plane-foundation`, and the checkout must return to clean `main` after integration.
- Tests are behavioral, not source-shape pins. Stage 1 adds a Node-20-compatible Vitest command before implementation code.
- No browser or pixel gate is required while Stage 1 remains API-only. Any visible UI change is out of scope and triggers desktop plus 390x844 rendered verification.
- Before the single final `npm run build`, inspect browser/Node/Python/listening-process memory and run no other resource-heavy job concurrently.

## Execution Gate Before Task 1

- [ ] Re-read `.orchestra/state.json`, verify `codex-supervisor` still holds supervision, and confirm no unresolved owner/lock conflict covers this work.
- [ ] Verify the root Scotty checkout is `codex/scotty-control-plane-foundation`, the branch tracks its pushed remote, and the only uncommitted path is this registered plan.
- [ ] Expand `active_work.files_touching` and acquire locks before dispatch for every implementation path named by Tasks 1-9: `package.json`, `package-lock.json`, `lib/control-plane/**`, `lib/git-read.ts`, `lib/git-read.test.ts`, `lib/git-unmerged.ts`, `lib/git-unmerged.test.ts`, `lib/signal-sse.ts`, `lib/signal-sse.test.ts`, `lib/orchestra-watch.ts`, `lib/orchestra-watch.test.ts`, `lib/api-client.ts`, `app/api/p/[projectId]/control-plane/route.ts`, `app/api/p/[projectId]/control-plane/stream/route.ts`, `app/api/p/[projectId]/beads/stream/route.ts`, `next.config.ts`, and `docs/control-plane-sources.md`.
- [ ] Stop and record a conflict if any listed path is locked by another active owner. Do not switch branches, stash, use a worktree, or absorb unrelated dirty files.
- [ ] Read the installed Next 16 route-handler and streaming references before editing routes: `node_modules/next/dist/docs/01-app/01-getting-started/15-route-handlers.md`, `node_modules/next/dist/docs/01-app/02-guides/streaming.md`, `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/route.md`, and the route-runtime reference.
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
      { observedAt: "2026-08-09T22:00:00.000Z" },
    );
    expect(observationSchema.parse(result).error?.code).toBe("timeout");
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
- Create: `lib/control-plane/orchestra.ts`
- Test: `lib/control-plane/orchestra.test.ts`

**Interfaces:**
- Consumes: `Observation<T>` helpers from Task 1.
- Produces: `OrchestraSnapshot`, `orchestraSnapshotSchema`, and `observeOrchestra(projectPath, deps?)`.
- Guarantee: cache identity is resolved state path plus `mtimeMs` plus size; the adapter performs no write.

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
  expect(result.data?.rejectedRecords.decisions).toBe(1);
});

it("reuses a path/mtime/size cache hit", async () => {
  const deps = fakeFs({ json: orchestraMixedFixture, mtimeMs: 10, size: 100 });
  await observeOrchestra("C:/repo", deps);
  await observeOrchestra("C:/repo", deps);
  expect(deps.readCount()).toBe(1);
});
```

- [ ] **Step 2: Run the tests and verify they fail**

```powershell
npm run test:unit -- lib/control-plane/orchestra.test.ts
```

Expected: FAIL because the adapter is missing.

- [ ] **Step 3: Implement passthrough section schemas and independent record parsing**

Implement these exact public shapes in `orchestra.ts`:

```ts
export interface OrchestraSnapshot {
  schemaVersion: 2;
  supervisor: {
    actor: string;
    holder?: string;
    sessionId?: string;
    paneId?: string;
    channelOfRecord?: string;
  } | null;
  activeWork: Record<string, {
    beadId?: string;
    status?: string;
    repo?: string;
    branch?: string;
    filesTouching: string[];
  }>;
  fileLocks: Record<string, {
    lockedBy: string;
    beadId?: string;
    lockedAt?: string;
    reason?: string;
  }>;
  integrationQueue: unknown[];
  conflicts: unknown[];
  decisions: unknown[];
  impacts: unknown[];
  rejectedRecords: Record<"activeWork" | "fileLocks" | "integrationQueue" | "conflicts" | "decisions" | "impacts", number>;
}

export const orchestraSnapshotSchema: z.ZodType<OrchestraSnapshot>;

export async function observeOrchestra(
  projectPath: string,
  deps: OrchestraDeps = defaultOrchestraDeps,
): Promise<Observation<OrchestraSnapshot>>;
```

Use `.passthrough()` on each Zod record schema. Parse top-level `schema_version` first, then parse every map/array item with `safeParse`, preserving valid records and incrementing `rejectedRecords`. Report `capability: "degraded"` plus `incomplete_observation` when rejected counts are nonzero. Report file mtime as `sourceUpdatedAt`.

- [ ] **Step 4: Run adapter tests**

```powershell
npm run test:unit -- lib/control-plane/orchestra.test.ts
```

Expected: PASS for missing, malformed-record, version, cache, and valid cases.

- [ ] **Step 5: Commit the orchestra adapter**

```powershell
git add lib/control-plane/orchestra.ts lib/control-plane/orchestra.test.ts
git commit -m "feat: observe orchestra coordination state"
```

---

### Task 3: Add the Herdr managed-session adapter

**Files:**
- Create: `lib/control-plane/herdr.ts`
- Test: `lib/control-plane/herdr.test.ts`

**Interfaces:**
- Consumes: Task 1 observation helpers.
- Produces: `HerdrSessionObservation`, `HerdrSnapshot`, `herdrSnapshotSchema`, and `observeHerdr(projectPath, deps?)`.
- Acquisition: `herdr api snapshot`, timeout 3000 ms, maximum output 4 MiB.

- [ ] **Step 1: Write failing session-identity and failure tests**

```ts
it("keeps two sessions for one actor distinct", async () => {
  const result = await observeHerdr("C:/repo", fakeExec(herdrTwoSessionFixture));
  expect(result.data?.sessions.map((s) => s.sessionId)).toEqual(["session-a", "session-b"]);
});

it("filters by path containment rather than matching a name", async () => {
  const result = await observeHerdr("C:/repo", fakeExec(herdrMixedProjectFixture));
  expect(result.data?.sessions.every((s) => s.cwd?.startsWith("C:\\repo"))).toBe(true);
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

Expose this normalized shape without merging identity dimensions:

```ts
export interface HerdrSessionObservation {
  actorKind: string | null;
  actorLabel: string | null;
  sessionId: string | null;
  sessionRefKind: "id" | "path" | null;
  sessionSource: string | null;
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

Parse the `session_snapshot` envelope with a passthrough Zod schema. Use `path.relative()` containment after resolving both paths. Do not infer role or supervisor from `name`, title, or actor kind. Set capabilities to `observe-managed-sessions`; later stages separately authorize controls.

- [ ] **Step 4: Run Herdr tests**

```powershell
npm run test:unit -- lib/control-plane/herdr.test.ts
```

- [ ] **Step 5: Commit the Herdr adapter**

```powershell
git add lib/control-plane/herdr.ts lib/control-plane/herdr.test.ts
git commit -m "feat: observe Herdr managed sessions"
```

---

### Task 4: Add the Runtime Manager health and service adapter

**Files:**
- Create: `lib/control-plane/runtime-manager.ts`
- Test: `lib/control-plane/runtime-manager.test.ts`

**Interfaces:**
- Consumes: Task 1 observation helpers.
- Produces: `RuntimeManagerSnapshot`, `runtimeManagerSnapshotSchema`, and `observeRuntimeManager(projectPath, deps?)`.
- Acquisition: project-local `tools/runtime-manager/state/manager-token`, authenticated read-only HTTP on `127.0.0.1:1735`.

- [ ] **Step 1: Write failing behavior tests**

Cover these exact outcomes:

```ts
it("returns not_configured without the project-local manager token", async () => {
  const result = await observeRuntimeManager("C:/repo", fakeRuntime({ tokenMissing: true }));
  expect(result.error?.code).toBe("not_configured");
});

it("returns degraded health when services exceed eight seconds", async () => {
  const result = await observeRuntimeManager("C:/repo", fakeRuntime({ health: { ok: true, epoch: 13, pid: 7 }, servicesTimeout: true }));
  expect(result.capability).toBe("degraded");
  expect(result.data?.epoch).toBe(13);
  expect(result.error?.code).toBe("timeout");
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

Use these public types:

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

Use separate AbortControllers: 2000 ms for `/health`, 8000 ms for `/services`. A healthy manager plus failed inventory is degraded with retained health data shaped as `{ epoch, managerPid, services: null }`. Never return the token, response headers, or raw body. `foreign` is a first-class verdict, not an error and not an adopted service.

- [ ] **Step 4: Run Runtime Manager tests**

```powershell
npm run test:unit -- lib/control-plane/runtime-manager.test.ts
```

- [ ] **Step 5: Commit the Runtime Manager adapter**

```powershell
git add lib/control-plane/runtime-manager.ts lib/control-plane/runtime-manager.test.ts
git commit -m "feat: observe Runtime Manager health"
```

---

### Task 5: Add truthful project hook coverage observation

**Files:**
- Create: `lib/control-plane/hooks.ts`
- Test: `lib/control-plane/hooks.test.ts`

**Interfaces:**
- Consumes: Task 1 observation helpers.
- Produces: `HookCoverageSnapshot`, `hookCoverageSnapshotSchema`, and `observeHookCoverage(projectPath, deps?)`.
- This adapter reports project-local files and configured commands only; it does not claim global Codex interception or execute a hook.

- [ ] **Step 1: Write failing coverage tests**

```ts
it("reports project-only scope and unknown global Codex coverage", async () => {
  const result = await observeHookCoverage("C:/repo", fakeFiles(completeClaudeFixture));
  expect(result.data?.scope).toBe("project-only");
  expect(result.data?.codexGlobalCoverage).toBe("unknown");
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
```

- [ ] **Step 2: Verify tests fail**

```powershell
npm run test:unit -- lib/control-plane/hooks.test.ts
```

- [ ] **Step 3: Implement presence/configuration-only inspection**

Expose:

```ts
export interface HookCoverageSnapshot {
  scope: "project-only";
  claudeSettingsPresent: boolean;
  configuredCommands: string[];
  existingConfiguredFiles: string[];
  missingConfiguredFiles: string[];
  codexRepoHookConfigPresent: boolean;
  codexGlobalCoverage: "unknown";
}

export const hookCoverageSnapshotSchema: z.ZodType<HookCoverageSnapshot>;
```

Read `.claude/settings.json` as JSON, extract command paths as strings, normalize paths inside the project, and check existence. Do not parse shell commands into authorization and do not execute JavaScript/PowerShell. Unknown formats return `parse_error`; missing settings returns `not_configured`.

- [ ] **Step 4: Run hook tests**

```powershell
npm run test:unit -- lib/control-plane/hooks.test.ts
```

- [ ] **Step 5: Commit hook observation**

```powershell
git add lib/control-plane/hooks.ts lib/control-plane/hooks.test.ts
git commit -m "feat: observe project hook coverage"
```

---

### Task 6: Extract the shared read-only Git runner and add lightweight health

**Files:**
- Create: `lib/git-read.ts`
- Modify: `lib/git-unmerged.ts:1-73`
- Create: `lib/control-plane/git-health.ts`
- Test: `lib/control-plane/git-health.test.ts`

**Interfaces:**
- Produces: `runGitRead(repoPath, args, options?)`, `GitHealthSnapshot`, `gitHealthSnapshotSchema`, and `observeGitHealth(projectPath, deps?)`.
- Consumes: Task 1 observation helpers.
- Existing `analyzeUnmerged()` behavior and its 60-second route cache remain unchanged.

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
```

- [ ] **Step 2: Verify tests fail**

```powershell
npm run test:unit -- lib/control-plane/git-health.test.ts
```

- [ ] **Step 3: Move the existing `runGit` implementation without changing semantics**

Create `lib/git-read.ts` with the current `execFile("git", ["-C", repo, ...args])`, 15-second timeout, 16 MiB buffer, `windowsHide: true`, and numeric nonzero-exit handling from `lib/git-unmerged.ts:49-65`. Export the helper and import it from `git-unmerged.ts`.

- [ ] **Step 4: Implement lightweight Git health**

Expose:

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

- [ ] **Step 5: Run Git and existing checks**

```powershell
npm run test:unit -- lib/control-plane/git-health.test.ts
npm run lint
```

Expected: tests and lint PASS; Unmerged Work imports the shared runner without behavior changes.

- [ ] **Step 6: Commit shared Git reads and health**

```powershell
git add lib/git-read.ts lib/git-unmerged.ts lib/control-plane/git-health.ts lib/control-plane/git-health.test.ts
git commit -m "feat: expose lightweight Git health"
```

---

### Task 7: Build the failure-isolated project snapshot and GET contract

**Files:**
- Create: `lib/control-plane/snapshot.ts`
- Test: `lib/control-plane/snapshot.test.ts`
- Create: `app/api/p/[projectId]/control-plane/route.ts`
- Modify: `lib/api-client.ts`

**Interfaces:**
- Consumes: all five adapters from Tasks 2-6 plus `getProject()`.
- Produces: `ControlPlaneSnapshot`, `buildControlPlaneSnapshot(projectId, deps?)`, `GET /api/p/:projectId/control-plane`, `api.controlPlane.get(projectId)`.
- Explicit non-interface: no Beads collection or task summary appears in this snapshot; Stage 2 joins it with the existing Beads React Query cache.

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
```

- [ ] **Step 2: Verify tests fail**

```powershell
npm run test:unit -- lib/control-plane/snapshot.test.ts
```

- [ ] **Step 3: Implement the snapshot using `Promise.allSettled`**

```ts
export interface ControlPlaneSnapshot {
  generatedAt: string;
  project: { id: string; name: string; path: string };
  sources: {
    orchestra: Observation<OrchestraSnapshot>;
    herdr: Observation<HerdrSnapshot>;
    runtimeManager: Observation<RuntimeManagerSnapshot>;
    hooks: Observation<HookCoverageSnapshot>;
    git: Observation<GitHealthSnapshot>;
  };
}
```

Resolve the registered project with `getProject()` only. Start the five adapter promises together, use `Promise.allSettled`, and convert a rejected adapter to an `unavailable` observation with a source-specific stable message. Parse the final response with a Zod snapshot schema assembled with `observationOf(orchestraSnapshotSchema)`, `observationOf(herdrSnapshotSchema)`, `observationOf(runtimeManagerSnapshotSchema)`, `observationOf(hookCoverageSnapshotSchema)`, and `observationOf(gitHealthSnapshotSchema)`. Never import `store.ts`, `bd.ts`, `schema.ts`, `interactions.ts`, or `git-unmerged.ts` here.

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

Add `ControlPlaneSnapshot` as a type import and:

```ts
controlPlane: {
  get: (projectId: string) =>
    request<ControlPlaneSnapshot>(`${base(projectId)}/control-plane`),
},
```

- [ ] **Step 5: Run contract tests, lint, and a type/build-free route check**

```powershell
npm run test:unit -- lib/control-plane/snapshot.test.ts
npm run lint
```

Expected: all PASS. The resource-heavy full build remains reserved for Task 9.

- [ ] **Step 6: Commit the snapshot API**

```powershell
git add lib/control-plane/snapshot.ts lib/control-plane/snapshot.test.ts app/api/p/[projectId]/control-plane/route.ts lib/api-client.ts
git commit -m "feat: expose control-plane observations"
```

---

### Task 8: Share the signal-only SSE lifecycle and observe coordination changes

**Files:**
- Create: `lib/signal-sse.ts`
- Test: `lib/signal-sse.test.ts`
- Create: `lib/orchestra-watch.ts`
- Test: `lib/orchestra-watch.test.ts`
- Create: `lib/control-plane-watch.ts`
- Modify: `app/api/p/[projectId]/beads/stream/route.ts`
- Create: `app/api/p/[projectId]/control-plane/stream/route.ts`
- Modify: `next.config.ts`

**Interfaces:**
- Consumes: existing `subscribeBeadsChange()` and `registerSseStream()`.
- Produces: `createSignalSseResponse()`, `subscribeOrchestraChange()`, and `subscribeControlPlaneChange()`.
- Signal contract: `event: change` and a source ID (`beads` or `orchestra`) only; Herdr, Runtime Manager, hooks, and Git rely on the existing polling fallback until their authorities expose a safe subscription adapter.

- [ ] **Step 1: Write failing lifecycle tests**

```ts
it("emits source ids without domain state", async () => {
  const harness = signalHarness();
  createSignalSseResponse(harness.request, harness.subscribe);
  harness.emit("orchestra");
  const chunk = await harness.readUntil("orchestra");
  expect(chunk).toContain("event: change\ndata: orchestra\n\n");
  expect(chunk).not.toContain("active_work");
  harness.abort();
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
```

- [ ] **Step 2: Verify the tests fail**

```powershell
npm run test:unit -- lib/signal-sse.test.ts lib/orchestra-watch.test.ts
```

- [ ] **Step 3: Extract the existing route lifecycle into `createSignalSseResponse`**

Move, rather than duplicate, the current encoder, heartbeat, abort, idempotent close, controller close, and `registerSseStream` behavior from `beads/stream/route.ts`. Preserve `HEARTBEAT_MS = 25_000`, response headers, `dynamic = "force-dynamic"`, and `runtime = "nodejs"`.

The helper signature is:

```ts
export type SignalSource = "beads" | "orchestra";
export type SubscribeSignal = (emit: (payload: string) => void) => () => void;

export function createSignalSseResponse(
  request: Request,
  subscribe: SubscribeSignal,
  deps: SignalSseDeps = defaultSignalSseDeps,
): Response;
```

- [ ] **Step 4: Add a non-recursive, ref-counted orchestra watcher**

Watch only the project `.orchestra` directory and filter for `state.json`; never watch the entire project recursively. Coalesce bursts for 200 ms, share one watcher per project, and tear it down at zero subscribers. Missing directory is a no-op so the query's polling fallback remains authoritative.

- [ ] **Step 5: Compose control-plane signals and route both streams through the helper**

`subscribeControlPlaneChange(projectId, onChange)` composes:

```ts
const stopBeads = subscribeBeadsChange(projectId, () => onChange("beads"));
const stopOrchestra = subscribeOrchestraChange(projectId, () => onChange("orchestra"));
return () => { stopBeads(); stopOrchestra(); };
```

The transport helper treats payloads as opaque strings and never receives domain state. The existing Beads stream adapts its watcher to `emit("1")` so its legacy `data: 1` wire contract does not change. The new control-plane stream emits `SignalSource` IDs. Add `/control-plane(/stream)?` to the existing high-frequency request-log ignore pattern.

- [ ] **Step 6: Run lifecycle tests and lint**

```powershell
npm run test:unit -- lib/signal-sse.test.ts lib/orchestra-watch.test.ts
npm run lint
```

Expected: all PASS; no second Beads watcher or SSE shutdown registry exists.

- [ ] **Step 7: Commit the shared stream lifecycle**

```powershell
git add lib/signal-sse.ts lib/signal-sse.test.ts lib/orchestra-watch.ts lib/orchestra-watch.test.ts lib/control-plane-watch.ts app/api/p/[projectId]/beads/stream/route.ts app/api/p/[projectId]/control-plane/stream/route.ts next.config.ts
git commit -m "feat: stream control-plane invalidations"
```

---

### Task 9: Document authority boundaries and complete integrated validation

**Files:**
- Create: `docs/control-plane-sources.md`
- Modify only if needed for an actual discovered command mismatch: files from Tasks 1-8

**Interfaces:**
- Consumes: every Stage 1 adapter and route.
- Produces: the durable source/timeout/freshness/capability contract used by Stage 2.

- [ ] **Step 1: Write the source contract document**

Document this exact table and expand each row with the implemented diagnostic codes:

| Source | Acquisition | Authority | Timeout | Signal | Explicit limitation |
|---|---|---|---:|---|---|
| Orchestra | `.orchestra/state.json` | coordination | filesystem read | `state.json` watcher | not process health |
| Herdr | `herdr api snapshot` | managed sessions | 3000 ms | polling fallback | not supervisor authority |
| Runtime Manager | authenticated `GET /health`, `GET /services` | named services | 2000/8000 ms | polling fallback | foreign is not owned |
| Hooks | project-local settings/file presence | configured project hooks | filesystem read | polling fallback | global Codex coverage unknown |
| Git | lightweight read-only CLI | repository health | 15000 ms/command | polling fallback | not full Unmerged Work analysis |

State plainly that Stage 2 joins this snapshot with the existing Beads React Query cache and that no source grants dispatch authority.

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
- the Git adapter contains no mutating command and Unmerged Work still uses the shared read runner;
- there is one global SSE shutdown registry and one Beads watcher registry;
- valid orchestra records survive malformed history and unknown versions fail explicitly;
- Runtime Manager token and raw bodies never reach the wire;
- Herdr sessions remain separate records even when actor labels match;
- no Board/List, workbench query, visible component, or Beads status changed;
- all code commits postdate the approved audit/design and supervisor Gate 0 resolution.

- [ ] **Step 6: Commit documentation and any validation-only correction**

```powershell
git add docs/control-plane-sources.md
git commit -m "docs: define control-plane source authority"
```

- [ ] **Step 7: Submit, review, and integrate under the repository protocol**

Post the branch, commit range, changed files, validation commands/results, source limitations, and review package to Bead `better-palia-maps-l4cq3.1`. Obtain task-by-task spec and quality review plus one independent whole-branch review. After all required checks pass, push the feature branch, merge it into `master`, push `master`, record `merged`, release owned locks, remove the active-work entry, and return the shared checkout to clean `master`.

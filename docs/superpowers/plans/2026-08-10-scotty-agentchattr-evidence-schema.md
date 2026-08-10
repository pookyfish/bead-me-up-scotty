# Scotty AgentChattr Evidence Schema V2 Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the spike's heuristic version-1 evidence validator with the owner-approved strict, provider-neutral version-2 evidence contract while keeping AgentChattr, Herdr Telemetry Bridge, and herdr-mesh uninstalled and unconfigured.

**Architecture:** `evidence-schema.ts` owns strict Zod structure and inferred types. `spike-contract.ts` accepts only parsed version-2 records and enforces typed cross-record invariants. Runtime observation and runtime control use provider-neutral outer kinds with a closed Herdr-only inner contract in version 2. Beads remains durable authority, Herdr remains pane/runtime authority, AgentChattr remains conversation transport, and Runtime Manager remains disposable-service lifecycle authority.

**Tech Stack:** TypeScript 5, Zod 4.4, Vitest 4.1, JSON fixtures, npm scripts already present in Scotty.

**Approved design:** `docs/superpowers/specs/2026-08-10-scotty-agentchattr-evidence-schema-design.md`

---

## Global constraints

- This plan is schema/validator work only. Do not install, clone, start, register, or configure AgentChattr, `CodyBontecou/herdr-telemetry-bridge`, `runchr-works/herdr-mesh`, Desktop MCP clients, Runtime Manager services, or Herdr sessions.
- Do not call MCP tools, pane-control commands, provider APIs, Desktop automation, builds, browsers, or dev servers.
- Do not add a production route, provider, store, component, service manifest, runtime configuration, or migration fallback.
- Version 1 must fail with `unsupported_schema_version`; do not auto-migrate it and do not retain the old heuristic parser as a fallback.
- The only public manifest entry point remains `validateEvidenceManifest(value: unknown): ContractResult`.
- `runtime_observation` and `runtime_control_action` are provider-neutral outer kinds. In schema version 2, `runtimeProvider` is exactly `herdr`; adding another provider requires a later schema version.
- Direct Herdr observation remains foundational. `herdr_telemetry_bridge` is an optional observation adapter; `herdr_mesh` is an optional control adapter. Neither becomes authoritative or required.
- Every test starts RED for the intended missing schema or invariant, then turns GREEN with the smallest typed implementation. Do not weaken an assertion to obtain GREEN.
- Preserve unrelated work. Commit only the paths named in each task and push the existing branch `codex/scotty-agentchattr-compatibility-spike`; do not merge during this redesign.
- Existing Node `devEngines` warnings are reportable but not a reason to change package versions.

## File map

| Path | Change | Responsibility |
| --- | --- | --- |
| `tools/agentchattr-compatibility-spike/evidence-schema.ts` | Create | Strict Zod primitives, version-2 record schemas, inferred types, fixture schemas, manifest parser, and structural issue conversion. |
| `tools/agentchattr-compatibility-spike/evidence-schema.test.ts` | Create | Per-boundary structural tests, strict-object mutation tables, extension limits, version gate, and one valid sample per evidence kind. |
| `tools/agentchattr-compatibility-spike/spike-contract.ts` | Modify | Public contract result, typed cross-record invariants, aggregation, loop helper compatibility, and removal of every arbitrary-key heuristic. |
| `tools/agentchattr-compatibility-spike/spike-contract.test.ts` | Modify | Version-2 behavioral/adversarial contract tests, including retry safety and source disagreement. |
| `tools/agentchattr-compatibility-spike/fixtures/identity-bindings.json` | Modify | Strict version-2 many-to-many identity fixture. |
| `tools/agentchattr-compatibility-spike/fixtures/message-contract.json` | Modify | Strict version-2 message, cursor, overlap, replay, restart, and tombstone fixture. |
| `docs/superpowers/evidence/2026-08-09-scotty-agentchattr-compatibility-spike/manifest.json` | Modify | Strict version-2 `not_run` evidence template. |
| `tools/agentchattr-compatibility-spike/README.md` | Modify | Operator-facing schema, redaction, runtime-provider, action identity, retry, and stop rules. |

Do not create or modify `run-spike.ps1`, `report.md`, a production adapter, or a provider configuration in this task.

## Stable interfaces

`spike-contract.ts` must finish with these public result types:

```ts
export const EVIDENCE_CLASSIFICATIONS = ["pass", "fail", "unsupported", "unknown"] as const;

export type Classification = (typeof EVIDENCE_CLASSIFICATIONS)[number];

export type ContractIssue = {
  code: string;
  classification: Exclude<Classification, "pass">;
  path: string;
};

export type ContractResult = {
  classification: Classification;
  issues: ContractIssue[];
};

export function validateEvidenceManifest(value: unknown): ContractResult;
```

The existing loop-guard helper exports remain available until `run-spike.ps1` is implemented later:

```ts
export type LoopGuardState = { channelId: string; phase: "active" | "paused"; autonomousCount: number };
export type AutonomousSendDecision = {
  allowed: boolean;
  rejectedBeforeMcp: boolean;
  mcpInvocationAllowed: boolean;
  recordedBeforeMcp: true;
  state: LoopGuardState;
};
export function createLoopGuardState(channelId: string): LoopGuardState;
export function requestAutonomousSend(state: LoopGuardState): AutonomousSendDecision;
export function recordAuthenticatedHumanOrigin(
  state: LoopGuardState,
  evidence: unknown,
): { reset: boolean; state: LoopGuardState };
```

The old standalone `validateMessageContract`, `validateMessagePages`, `validateIdentityFixture`, `validatePromotionResult`, and `validateDesktopResults` exports are test-only version-1 seams. Replace their behavioral coverage with version-2 manifest records, then remove the exports rather than maintaining a second parser.

---

### Task 1: Establish strict primitives and the common evidence record

**Files:**

- Create: `tools/agentchattr-compatibility-spike/evidence-schema.ts`
- Create: `tools/agentchattr-compatibility-spike/evidence-schema.test.ts`

**Interfaces:**

- Consumes: unknown JSON-compatible values only.
- Produces: strict scalar schemas, `EvidenceBase`, provenance/artifact schemas, and safe extensions.
- Does not produce: a complete manifest parser or any cross-record authority decision.

- [ ] **Step 1: Write RED tests for primitives and strict boundaries**

Add tests importing the not-yet-created module and asserting:

1. lowercase `sha256:<64 hex>` succeeds; uppercase, short, or free text fails;
2. IDs reject control characters, whitespace-only values, separators not admitted by the field, and overlength values;
3. `extensions` accepts at most 16 flat namespaced keys and only the approved primitive values;
4. arrays, nested objects, URLs, paths, command fragments, configuration fragments, and arbitrary strings fail in `extensions`;
5. an unknown field at the common record, provenance, or artifact boundary fails;
6. `startedAt <= observedAt` is required; and
7. `caseId` matches `^[a-z][a-z0-9-]{2,63}$`.

Use this exact extension mutation table in the test:

```ts
const invalidExtensions = [
  { "x-team-path": "C:/Users/example" },
  { "x-team-url": "https://example.invalid" },
  { "x-team-command": "node server.js" },
  { "x-team-config": "token=secret" },
  { "x-team-array": ["present"] },
  { "x-team-object": { state: "present" } },
  { "team-state": "present" },
  { "x-Team-state": "present" },
];
```

- [ ] **Step 2: Run the focused test and confirm RED**

Run:

```powershell
npm run test:unit -- tools/agentchattr-compatibility-spike/evidence-schema.test.ts
```

Expected: exit 1 because `./evidence-schema` does not exist. Record the missing-module failure before creating production code.

- [ ] **Step 3: Implement the exact primitive vocabulary**

Create `evidence-schema.ts` with these constants and strict shapes:

```ts
import { z } from "zod";

export const APPROVED_UPSTREAM_PIN = {
  repository: "https://github.com/bcurts/agentchattr.git",
  commit: "c24f605c9b24fb7a98003f7930e2d5e7a7f7d297",
  tag: "v0.5.0",
  version: "0.5.0",
  licenseSha256: "a1abc583f6725867ed3564f1bcd201d78603612330665433a733a640721f40f3",
} as const;

export const classificationSchema = z.enum(["pass", "fail", "unsupported", "unknown"]);
export const sha256Schema = z.string().regex(/^sha256:[0-9a-f]{64}$/);
export const uuidSchema = z.uuid();
export const caseIdSchema = z.string().regex(/^[a-z][a-z0-9-]{2,63}$/);
export const safeRefSchema = z.string().min(1).max(128).regex(/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/);
export const utcTimestampSchema = z.iso.datetime({ offset: false });
```

Define the only extension value vocabulary as `null`, boolean, bounded integer, the nine approved status literals, or `sha256Schema`. Implement `safeExtensionsSchema` with `z.record(extensionKeySchema, extensionValueSchema)` plus a maximum-key refinement of 16. Do not add a string catch-all.

Use closed provenance and artifact vocabularies:

```ts
export const provenanceSourceKindSchema = z.enum([
  "synthetic_fixture",
  "runtime_manager",
  "agentchattr_mcp",
  "agentchattr_store",
  "herdr_direct",
  "herdr_telemetry_bridge",
  "herdr_mesh",
  "beads",
  "desktop_client",
  "operator_observation",
]);

export const artifactKindSchema = z.enum([
  "source_snapshot",
  "request",
  "response",
  "configuration",
  "monitor",
  "message",
  "identity",
  "authorization",
  "execution_result",
  "verification",
  "acknowledgement",
  "beads_artifact",
  "desktop_capability",
  "teardown",
  "synthetic_fixture",
]);
```

Build every normal object with `z.strictObject`. `EvidenceBase` has exactly the approved common fields. Keep `kind` outside a permissive string schema by exposing a `withEvidenceBase(kind, shape)` factory that injects `z.literal(kind)` and performs the timestamp monotonicity refinement.

- [ ] **Step 4: Run focused GREEN and type-check**

Run:

```powershell
npm run test:unit -- tools/agentchattr-compatibility-spike/evidence-schema.test.ts
npx tsc --noEmit --pretty false
```

Expected: the focused test and TypeScript pass. The existing version-1 contract remains untouched in this task.

- [ ] **Step 5: Commit Task 1 only**

```powershell
git add -- tools/agentchattr-compatibility-spike/evidence-schema.ts tools/agentchattr-compatibility-spike/evidence-schema.test.ts
git diff --cached --check
git commit -m "test: establish strict spike evidence primitives"
```

Verify `git show --name-only --format= HEAD` lists exactly the two Task 1 files.

---

### Task 2: Add typed conversation, identity, loop, promotion, MCP, and Desktop records

**Files:**

- Modify: `tools/agentchattr-compatibility-spike/evidence-schema.ts`
- Modify: `tools/agentchattr-compatibility-spike/evidence-schema.test.ts`

**Interfaces:**

- Consumes: the Task 1 strict base factory and scalar schemas.
- Produces: closed schemas for `message_observation`, `identity_binding`, `loop_guard_transition`, `beads_promotion`, `mcp_exchange`, and `desktop_capability` plus versioned fixture-envelope schemas.
- Authority: these records observe conversation or prove promotion; none changes Beads, runtime, lease, assignment, review, or human-gate state.

- [ ] **Step 1: Write RED tests for all six record kinds**

For each kind, add one complete valid record and nested unknown-field mutations. Include tests that:

- separate `transportState`, `receiverAcknowledgementState`, and `readState`;
- reject the old combined `delivery` field;
- accept only collaboration intents `task_proposal`, `review_request`, `question`, `ready`, `peer_acceptance`, `blocked`, `stalemate`, and `handoff_notice`;
- require collaboration session ID and sequence together or omit both;
- require an exact complete verified identity interval and reject display-name, channel, mention, reply, role, or Bead-derived binding fields;
- require `herdrSessionRef` only when `executionSurface` is `herdr` and forbid it for both Desktop surfaces;
- express the sixth-send transition, seventh-send rejection, and authenticated-human reset structurally;
- keep AgentChattr transport acceptance, peer acceptance, and Beads durability distinct;
- keep collaboration-session sequences isolated so identical local sequence numbers in two sessions do not collide;
- require source runtime correlation/action IDs only when a promotion satisfies runtime control durability; and
- verify Claude Code Desktop and Codex Desktop independently.

Run the focused test and expect missing export/schema failures:

```powershell
npm run test:unit -- tools/agentchattr-compatibility-spike/evidence-schema.test.ts
```

- [ ] **Step 2: Implement the message and identity schemas**

Use these exact closed state vocabularies:

```ts
export const collaborationIntentSchema = z.enum([
  "task_proposal", "review_request", "question", "ready",
  "peer_acceptance", "blocked", "stalemate", "handoff_notice",
]);
export const transportStateSchema = z.enum([
  "server_accepted", "queued", "submitted", "failed", "timed_out", "unknown", "unsupported",
]);
export const acknowledgementStateSchema = z.enum([
  "not_applicable", "pending", "acknowledged", "timed_out", "unknown", "unsupported",
]);
export const readStateSchema = z.enum([
  "not_observed", "read", "unread", "unknown", "unsupported",
]);
```

`message_observation` has the approved fields plus these closed replay fields required by the existing spike cases:

```ts
observationContext: "initial_page" | "overlap_page" | "retry_replay" | "post_restart" | "tombstone";
messageState: "present" | "deleted" | "unknown";
```

The durable identity remains `providerInstanceId + channelId + stableMessageUid`; `cursorId` is a nonnegative pagination integer and may not replace the UID. `contentChecksum` and `directEvidenceArtifactHash` are SHA-256 values.

Use the closed execution surfaces `herdr`, `claude_code_desktop`, `codex_desktop`, `claude_cli`, `codex_cli`, and `external_mcp`; roles `supervisor`, `co_supervisor`, `worker`, `reviewer`, `direct`, `human`, and `observer`; and binding states `verified`, `unverified`, `revoked`, and `stale`. A model/provider field is descriptive only and must be a safe reference, not an authority discriminator.

- [ ] **Step 3: Implement loop, promotion, MCP, and Desktop schemas**

Make `loop_guard_transition` a strict event whose fields can represent only these four transition classes during cross-record validation:

| Origin | From | To | MCP | UID | Proof |
| --- | --- | --- | --- | --- | --- |
| agent | `active(0..4)` | `active(1..5)` | true | required | null |
| agent | `active(5)` | `paused(6)` | true | required | null |
| agent | `paused(6)` | `paused(6)` | false | null | null |
| human | `paused(6)` | `active(0)` | false | null | authenticated-human SHA-256 |

`beads_promotion` must include Bead ID, Scotty decision ID, artifact type, selected-value/capsule checksum, canonical AgentChattr idempotency key, optional source runtime correlation ID and action-ID list, Beads artifact/comment ID, acknowledged/verified timestamps, and state `durable`, `promotion_pending`, or `reconciliation_conflict`.

`mcp_exchange` admits only `initialize`, `tools/list`, `chat_send`, and `chat_read`; it records client kind/version, authentication result, sanitized request/response artifact hashes, and a resulting stable UID only for successful chat send/read.

`desktop_capability` admits exactly one client (`claude_code_desktop` or `codex_desktop`) with separate read/send classifications and direct authentication/stored-message evidence.

- [ ] **Step 4: Add strict version-2 fixture envelope schemas**

Export:

```ts
export const identityFixtureSchema = z.strictObject({
  schemaVersion: z.literal(2),
  fixture: z.literal("identity_bindings"),
  records: z.array(identityBindingSchema).min(1),
  sessionBeadLinks: z.array(z.strictObject({ logicalSessionId: safeRefSchema, beadId: safeRefSchema })),
});

export const messageFixtureSchema = z.strictObject({
  schemaVersion: z.literal(2),
  fixture: z.literal("message_contract"),
  records: z.array(messageObservationSchema).min(1),
});
```

Fixture-only `sessionBeadLinks` prove many-to-many cardinality but never create a binding.

- [ ] **Step 5: Run GREEN and commit**

```powershell
npm run test:unit -- tools/agentchattr-compatibility-spike/evidence-schema.test.ts
npx tsc --noEmit --pretty false
npx eslint tools/agentchattr-compatibility-spike/evidence-schema.ts tools/agentchattr-compatibility-spike/evidence-schema.test.ts
git diff --check
git add -- tools/agentchattr-compatibility-spike/evidence-schema.ts tools/agentchattr-compatibility-spike/evidence-schema.test.ts
git commit -m "feat: type conversation evidence records"
```

Expected: all commands pass and the commit contains only the two schema files.

---

### Task 3: Add operational boundaries and Herdr observation records

**Files:**

- Modify: `tools/agentchattr-compatibility-spike/evidence-schema.ts`
- Modify: `tools/agentchattr-compatibility-spike/evidence-schema.test.ts`

**Interfaces:**

- Consumes: sanitized Runtime Manager, monitor, direct-Herdr, or optional telemetry-adapter evidence.
- Produces: `configuration_boundary`, `monitor_interval`, `runtime_observation`, and `teardown` records.
- Privacy: no raw transcript, pane output, thinking, command line, tool input/output, absolute CWD/repository/session path, queue content, credential, or raw Herdr host event can be represented.

- [ ] **Step 1: Write RED tests for every boundary and observation subtype**

Add valid cases for configuration, each monitor kind, direct-Herdr agent snapshot, telemetry lifecycle event, direct-Herdr trace summary, and teardown. Add table-driven rejection for raw fields at every nested level:

```ts
const forbiddenRuntimeFields = [
  "transcript", "paneOutput", "thinking", "commandLine", "toolInput",
  "toolOutput", "cwd", "repositoryPath", "sessionPath", "rawHostEvent",
  "queueContent", "token", "credential",
] as const;
```

Also reject `runtimeProvider: "desktop"`, unknown adapters, provider-specific fields outside the Herdr payload, raw repository paths, and a telemetry payload that claims task/control authority.

Run the focused test; expect missing schema/export failures.

- [ ] **Step 2: Implement configuration, monitoring, and teardown**

`configuration_boundary` records:

- lifecycle owner literal `runtime-manager`;
- invocation `direct_server`;
- bind host literal `127.0.0.1`;
- authentication `enabled`;
- relative disposable-root label matching `^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$`;
- sanitized argv template hash and a reviewed template containing only executable basename plus `<data-dir>`, `<port>`, and `<secret>` placeholders; and
- explicit `not_run | disabled | enabled | unknown` states for launchers, wrappers, trigger consumers, terminal injection, auto-wake, Jobs, and persistent Rules.

`monitor_interval` admits monitor kinds `process`, `child_process`, `trigger_queue`, `herdr_pane`, `input_control`, and `runtime_manager_inventory`; sample interval is integer 1..2000 ms; event count is nonnegative; baseline/final evidence is hash-only; gap and final-capture states are explicit.

`teardown` records named service deregistration, exact baseline-inventory restoration, disposable Desktop profile/config restoration, credential removal, listener removal, final monitor capture, and disposable-root `deleted | retained | unknown` with ownership classification. No uncertain result may be represented as pass.

- [ ] **Step 3: Implement strict runtime observation payloads**

Use:

```ts
runtimeProvider: z.literal("herdr");
adapter: z.enum(["direct_herdr", "herdr_telemetry_bridge"]);
measurementQuality: z.enum(["direct", "derived", "estimated", "unknown"]);
freshness: z.enum(["live", "cached", "stale", "unknown"]);
```

Every observation also carries `nativeContract`, a strict union of either
`{ versionKind: "named"; name: safeRef; version: safeRef }` or
`{ versionKind: "herdr_protocol"; protocol: positive integer }`, plus
`nativeEventId: safeRef | null`. The adapter's native name/version or Herdr
protocol is evidence, not the manifest schema version.

Put provider-specific data under one `observation` discriminated union:

1. `agent_snapshot`: exact workspace, tab, pane, terminal, and agent-session references; runtime state `working | waiting | idle | blocked | stopped | disconnected | unknown`; directly reported model/provider metadata or explicit unknown; and a project reference.
2. `lifecycle_event`: event `session_started | session_updated | session_stopped | pane_created | pane_closed | tab_created | tab_closed | workspace_created | workspace_closed | agent_state_changed`, exact Herdr target, optional native sequence, and event UTC.
3. `trace_summary`: exact agent-session reference, bounded message/tool counts, token count plus `reported | estimated | unknown`, and summary artifact hash.

The Herdr target union is exact and closed:

```ts
type HerdrTarget =
  | { targetKind: "workspace"; workspaceId: string }
  | { targetKind: "tab"; workspaceId: string; tabId: string }
  | { targetKind: "pane"; workspaceId: string; tabId: string; paneId: string }
  | { targetKind: "terminal"; workspaceId: string; tabId: string; paneId: string; terminalId: string }
  | { targetKind: "agent_session"; agentSessionId: string };
```

Project identity is either a configured project ID or a salted project-scoped SHA-256, with relation `root | descendant | outside | unknown`; it never stores a path.

- [ ] **Step 4: Run GREEN and commit**

```powershell
npm run test:unit -- tools/agentchattr-compatibility-spike/evidence-schema.test.ts
npx tsc --noEmit --pretty false
npx eslint tools/agentchattr-compatibility-spike/evidence-schema.ts tools/agentchattr-compatibility-spike/evidence-schema.test.ts
git diff --check
git add -- tools/agentchattr-compatibility-spike/evidence-schema.ts tools/agentchattr-compatibility-spike/evidence-schema.test.ts
git commit -m "feat: type runtime observation evidence"
```

Expected: valid direct and telemetry records parse; every raw/private or provider-generalization mutation fails structurally.

---

### Task 4: Add append-only runtime control action records

**Files:**

- Modify: `tools/agentchattr-compatibility-spike/evidence-schema.ts`
- Modify: `tools/agentchattr-compatibility-spike/evidence-schema.test.ts`

**Interfaces:**

- Consumes: sanitized evidence of a Herdr control request lifecycle.
- Produces: one strict `runtime_control_action` record per append-only event.
- Does not execute: a control action, retry, mesh call, direct Herdr command, pane mutation, or lifecycle operation.

- [ ] **Step 1: Write RED structural tests for every phase**

Add one valid record for `request`, `authorization`, `execution`, `verification`, `acknowledgement`, and `reconciliation`. Add mutations proving:

- `eventId`, `actionId`, `correlationId`, and `attemptId` are UUIDs;
- `idempotencyKey` is a lowercase SHA-256;
- execution adapter is only `direct_herdr | herdr_mesh`;
- another runtime provider fails;
- every action accepts only its exact target class;
- a display name, focused pane, CWD, or pane number alone cannot target an action;
- composite `handoff` is not an action;
- unknown fields fail within every phase payload; and
- request, authorization, execution, verification, acknowledgement, and reconciliation states are independent.

- [ ] **Step 2: Implement stable common identity and the phase union**

Every record has exactly:

```ts
eventId: UUID;
actionId: UUID;
correlationId: UUID;
idempotencyKey: sha256;
sequence: nonnegative integer;
runtimeProvider: "herdr";
event: RuntimeControlPhaseEvent;
```

Make `event` a strict `z.discriminatedUnion("phase", ...)`. This keeps the top-level evidence union uniquely discriminated by `kind: "runtime_control_action"`.

Use the exact request vocabulary from the approved design:

```ts
export const runtimeActionSchema = z.enum([
  "list_agents", "get_agent", "read_pane", "wait_for_agent", "wait_for_output",
  "relay_message", "send_text", "submit_input", "spawn_agent", "focus_agent",
  "rename_agent", "run_command", "send_keys", "split_pane", "close_pane",
  "stop_session", "delete_session", "create_tab", "close_tab",
  "create_workspace", "close_workspace",
]);
```

Implement the action/target mapping as a discriminated request union, not a permissive action plus arbitrary target:

| Action | Exact target |
| --- | --- |
| `list_agents`, `create_tab` | workspace |
| `get_agent`, `wait_for_agent`, `wait_for_output`, `stop_session`, `delete_session` | agent session |
| `read_pane`, `relay_message`, `send_text`, `submit_input`, `focus_agent`, `rename_agent`, `run_command`, `send_keys`, `split_pane`, `close_pane` | pane |
| `close_tab` | tab |
| `spawn_agent` | tab |
| `create_workspace` | Runtime Manager project reference |
| `close_workspace` | workspace |

`request` also carries effect class, parameter hash, request state, retry policy, optional reviewed-provider-idempotency artifact hash, and `durablePromotion: required | not_required`.

It also carries a strict human-intent snapshot:

```ts
type HumanIntent =
  | { state: "none" }
  | { state: "exact_assignment"; assignedActorId: string; targetHash: string; evidenceHash: string }
  | { state: "denied"; evidenceHash: string };
```

The hash fields above use `sha256Schema`. This evidence is required to prove
that an automatic authorization did not override an explicit human assignment,
denial, or target choice.

`runtimeProvider`, adapter, Herdr target, and provider operation ID are runtime
coordinates only. Add structural controls proving none can stand in for actor,
model provider, role, supervisor, Bead, task assignment, lease, or durable
communication identity.

- [ ] **Step 3: Implement the exact phase payloads**

- `authorization`: authorization UUID; decision; authorizing actor/source; exact action/target/parameter scope; valid-from/until UTC; evidence hash.
- `execution`: attempt UUID; positive attempt number; adapter; state; optional safe provider operation ID; provider idempotency state; sanitized result artifact hash.
- `verification`: attempt UUID; state; and strict evidence reference to a runtime-observation case ID or artifact hash.
- `acknowledgement`: attempt UUID; state; direct acknowledgement evidence hash only when `acknowledged`.
- `reconciliation`: attempt UUID; observed disposition; retry decision; deciding actor/source; evidence hash.

Use only the state vocabularies approved in the design. Do not map provider success to verification or acknowledgement.

- [ ] **Step 4: Run GREEN and commit**

```powershell
npm run test:unit -- tools/agentchattr-compatibility-spike/evidence-schema.test.ts
npx tsc --noEmit --pretty false
npx eslint tools/agentchattr-compatibility-spike/evidence-schema.ts tools/agentchattr-compatibility-spike/evidence-schema.test.ts
git diff --check
git add -- tools/agentchattr-compatibility-spike/evidence-schema.ts tools/agentchattr-compatibility-spike/evidence-schema.test.ts
git commit -m "feat: type runtime control evidence"
```

Expected: all phase records parse only in their exact shapes; no operation is performed.

---

### Task 5: Compose the strict version-2 manifest and structural error model

**Files:**

- Modify: `tools/agentchattr-compatibility-spike/evidence-schema.ts`
- Modify: `tools/agentchattr-compatibility-spike/evidence-schema.test.ts`

**Interfaces:**

- Consumes: every per-kind schema from Tasks 1-4.
- Produces: `evidenceRecordSchema`, `evidenceManifestV2Schema`, `parseEvidenceManifestV2`, inferred TypeScript types, and sanitized structural issues.
- Does not yet replace: the public `validateEvidenceManifest` implementation in `spike-contract.ts`.

- [ ] **Step 1: Write RED envelope, version, and mutation tests**

Add tests for:

- one valid record of every evidence kind in a structurally valid completed manifest;
- the exact `not_run` empty template invariant;
- version 1, missing version, and version 3 returning `unsupported_schema_version`;
- unknown fields at the envelope, record, phase-event, nested target, provenance, artifact, and extension boundaries;
- JSON Pointer paths with `~` and `/` escaping;
- unknown-key issues pointing to the containing object without echoing the unknown key;
- `running`, `completed`, or `aborted` with unmeasured admission or `not_run` safety failing;
- `completed` without teardown failing;
- `aborted` without a fail/unknown stop-condition record failing; and
- result issues never containing the rejected value.

Generate the unknown-field mutation table programmatically from one valid sample per strict boundary. The test must insert camel-case, compact, prefixed, nested, and array-shaped unknown values and assert the same structural `unknown_field` result; do not enumerate semantic aliases.

- [ ] **Step 2: Build the closed union and envelope**

Compose:

```ts
export const evidenceRecordSchema = z.discriminatedUnion("kind", [
  configurationBoundarySchema,
  monitorIntervalSchema,
  runtimeObservationSchema,
  runtimeControlActionSchema,
  mcpExchangeSchema,
  messageObservationSchema,
  identityBindingSchema,
  loopGuardTransitionSchema,
  beadsPromotionSchema,
  desktopCapabilitySchema,
  teardownSchema,
]);
```

The top-level strict manifest has exactly `schemaVersion`, `spike`, `stage`, `manifestId`, `runId`, `executionState`, `upstream`, `endpoint`, `resourceAdmission`, `safety`, `evidence`, and optional `extensions`.

Use the exact approved pin as literals. Endpoint host is literal `127.0.0.1`; state is `candidate_only_not_bound | bound | stopped`. Resource measurement and admission states are explicit. Every prohibited safety path is `not_run | disabled | enabled | unknown`.

Use this exact resource-admission shape:

```ts
type ResourceAdmission = {
  measurementState: "not_run" | "measured";
  availablePhysicalMemoryGiB: number | null;
  aggregateWorkingSetPercent: number | null;
  otherResourceHeavyJobActive: boolean | null;
  runtimeManagerCorrelationId: string | null;
  admissionResult: "not_run" | "admitted" | "denied" | "unknown";
};
```

When measurement state is `not_run`, all measured fields and correlation ID
are null and admission result is `not_run`. When it is `measured`, numeric and
boolean fields are present and every result except `not_run` requires a
non-secret safe correlation ID. `executionState` is exactly `not_run | running
| completed | aborted`.

- [ ] **Step 3: Implement sanitized issue conversion**

Export:

```ts
export type StructuralIssue = {
  code: "unknown_field" | "invalid_field" | "invalid_invariant" | "unsupported_schema_version";
  classification: "fail";
  path: string;
};

export type ManifestParseResult =
  | { ok: true; manifest: EvidenceManifestV2 }
  | { ok: false; issues: StructuralIssue[] };
```

Check `schemaVersion` before normal Zod parsing so any non-2 version returns one issue at `/schemaVersion`. Convert Zod paths to JSON Pointer. For `unrecognized_keys`, use only the containing-object path; never copy the rejected key or value into an issue. Use stable code mapping rather than Zod message text.

- [ ] **Step 4: Run focused GREEN and commit**

```powershell
npm run test:unit -- tools/agentchattr-compatibility-spike/evidence-schema.test.ts
npx tsc --noEmit --pretty false
npx eslint tools/agentchattr-compatibility-spike/evidence-schema.ts tools/agentchattr-compatibility-spike/evidence-schema.test.ts
git diff --check
git add -- tools/agentchattr-compatibility-spike/evidence-schema.ts tools/agentchattr-compatibility-spike/evidence-schema.test.ts
git commit -m "feat: compose evidence manifest v2"
```

Expected: the structural suite passes without touching the old public validator.

---

### Task 6: Replace heuristic validation with typed cross-record invariants

**Files:**

- Modify: `tools/agentchattr-compatibility-spike/spike-contract.ts`
- Modify: `tools/agentchattr-compatibility-spike/spike-contract.test.ts`

**Interfaces:**

- Consumes: `parseEvidenceManifestV2(value)` and typed `EvidenceRecord` values only.
- Produces: the stable public `ContractResult`, typed cross-record diagnostics, and classification aggregation.
- Deletes: arbitrary-key normalization, semantic substring matching, compact authority stems, recursive sensitive-value guessing, version-1 manifest parsing, and the five standalone version-1 validator exports.

- [ ] **Step 1: Rewrite behavioral tests to version-2 manifests and observe RED**

Create a local `validManifestV2()` factory in `spike-contract.test.ts` using the strict `not_run` envelope for empty tests and a measured completed envelope for record tests. Replace direct calls to the five old validator helpers with manifests containing the relevant typed records.

Add RED tests for all approved cross-record rules:

1. record classification precedence `fail > unsupported > unknown > pass`;
2. message identity, cursor order, overlap/replay tuple equality, restart stability, tombstone linkage, and divergent duplicate rejection;
3. exact time-bounded verified identity binding and ambiguous/missing binding rejection;
4. collaboration-session sequence isolation and explicit `blocked -> stalemate -> peer_acceptance` conversation evidence without any implied Beads acceptance;
5. transport, receiver acknowledgement, read, peer acceptance, and Beads durability remaining independent;
6. direct-Herdr and telemetry observations remaining separate; conflicting current snapshots produce `runtime_observation_disagreement` with `unknown`, never merged state;
7. loop transitions through sixth allowed send, seventh pre-MCP rejection, and authenticated-human-only reset;
8. exact Beads acknowledgement/reconciliation match and retry convergence;
9. independent Desktop results;
10. monitor coverage beginning before service start and ending after deregistration/final capture; and
11. teardown/envelope consistency.

Run:

```powershell
npm run test:unit -- tools/agentchattr-compatibility-spike/spike-contract.test.ts
```

Expected: failures because the public validator still accepts version 1 and does not implement typed version-2 cross-record rules.

- [ ] **Step 2: Replace the public entry point structurally**

Re-export `APPROVED_UPSTREAM_PIN` from `evidence-schema.ts`. Implement:

```ts
export function validateEvidenceManifest(value: unknown): ContractResult {
  const parsed = parseEvidenceManifestV2(value);
  if (!parsed.ok) {
    return aggregateIssues(parsed.issues);
  }

  const issues = validateCrossRecordInvariants(parsed.manifest);
  return aggregateManifestClassification(parsed.manifest, issues);
}
```

Cross-record validators receive typed records selected by `record.kind`. They may iterate arrays and maps of declared fields; they must not recurse unknown objects or inspect arbitrary field names.

- [ ] **Step 3: Implement message, identity, loop, promotion, monitor, and Desktop invariants**

Use stable issue codes and JSON Pointer paths. Build indexes by case ID, stable message tuple, external identity tuple, channel, Beads idempotency key, and runtime correlation ID. Positive message states must have direct evidence already required structurally; never infer one state from another.

Allow overlap/replay/post-restart observations with the same durable message tuple only when UID, provider instance, channel, sender, checksum, parent/thread, and message state agree. Reject a divergent reuse. A tombstone must reuse the durable UID and link to a previously observed present message.

Attribute a message only when exactly one `verified` identity record covers `observedAt` and matches AgentChattr provider instance and external sender identity; the complete binding then supplies the independently bound actor, logical session, surface, role, model/provider, AgentChattr session, and Beads actor dimensions. `unverified`, `stale`, revoked, out-of-window, incomplete, or ambiguous evidence yields `identity_unproven` with classification `unknown`; contradictory verified bindings yield `identity_conflict` with classification `fail`.

Validate loop transitions per channel in record order and prove that a seventh rejected transition has no message UID and `mcpInvoked: false`.

Promotion `durable` requires exact Bead, decision, checksum, idempotency, artifact, acknowledged/verified time, and source runtime correlation/action match. Retries converge on one Beads artifact.

- [ ] **Step 4: Implement runtime observation disagreement without authority merging**

Index observations by exact Herdr target and observation subtype. If direct and telemetry records cover the same current target/window and disagree on normalized state or exact identity, retain both records and add:

```ts
{ code: "runtime_observation_disagreement", classification: "unknown", path: "/evidence" }
```

Do not choose a winner, average timestamps, combine provider/model values, infer control authority, or suppress the direct adapter. Stale evidence does not override live evidence but remains recorded.

- [ ] **Step 5: Implement runtime control action state-machine invariants**

Group records by `actionId`, then enforce:

- globally unique `eventId`;
- one request at sequence 0;
- strictly increasing sequence;
- one immutable `correlationId` and `idempotencyKey` per action;
- immutable request tuple `(runtimeProvider, actionId, action, target, parameterHash, effectClass, durablePromotion, idempotencyKey)`;
- authorization before execution, current at execution time, exact scope match, and no execution after pending/denied/expired/cancelled/unknown authorization;
- authorization cannot override `denied` human intent and must match an `exact_assignment` actor and target hash; any conflict is denied or unknown and forbids execution;
- rejected/cancelled requests have no later authorization or execution;
- unique attempt IDs and strictly increasing positive attempt numbers;
- adapter fallback remains the same action/correlation with a new attempt;
- provider success is not verification or acknowledgement;
- mutating success, applied verification, pending/unknown acknowledgement, or execution/verification timeout/unknown locks automatic retry;
- a new mutating attempt requires prior `not_applied + retry_authorized` reconciliation, or a separately referenced reviewed provider-idempotency artifact with the same idempotency key;
- unsupported/unknown provider idempotency plus unknown outcome requires human reconciliation; and
- read-only retries follow only the bounded retry policy declared in the immutable request and still require a fresh current authorization;
- `durablePromotion: required` is incomplete until a matching `beads_promotion` references the correlation and every required action ID.

Test at least these retry timelines:

| Timeline | Expected |
| --- | --- |
| request → authorized → succeeded → retry | fail duplicate |
| request → authorized → timed_out → retry | fail until reconciliation |
| request → authorized → unknown → ack unknown → retry | fail duplicate risk |
| request → authorized → failed → verified_not_applied → reconciliation retry_authorized → new authorization → retry | pass |
| request → authorized → timed_out with reviewed provider idempotency and same key → new authorization → retry | pass |
| mesh attempt unknown → direct-Herdr fallback without reconciliation | fail |
| composite handoff represented as primitive relay + durable Beads promotion under one correlation | pass |
| opaque `handoff` action | structural fail |

- [ ] **Step 6: Remove the heuristic implementation completely**

Delete all functions/constants used to normalize arbitrary keys, infer semantic authority families, inspect raw values recursively, parse headerless configuration, or preserve the version-1 manifest. Confirm no source occurrence remains for:

```text
AUTHORITY_FAMILY_ROOTS
AUTHORITY_COMPACT_TERMS
AUTHORITY_STATE_SUFFIXES
normalizedKey
semanticTokens
inferredAuthority
validateMessageContract
validateMessagePages
validateIdentityFixture
validatePromotionResult
validateDesktopResults
```

Keep only the pure loop-guard helpers and the new typed manifest validator.

- [ ] **Step 7: Run focused and full GREEN, then commit**

```powershell
npm run test:unit -- tools/agentchattr-compatibility-spike/evidence-schema.test.ts tools/agentchattr-compatibility-spike/spike-contract.test.ts
npm run test:unit
npx tsc --noEmit --pretty false
npx eslint tools/agentchattr-compatibility-spike/evidence-schema.ts tools/agentchattr-compatibility-spike/evidence-schema.test.ts tools/agentchattr-compatibility-spike/spike-contract.ts tools/agentchattr-compatibility-spike/spike-contract.test.ts
git diff --check
git add -- tools/agentchattr-compatibility-spike/spike-contract.ts tools/agentchattr-compatibility-spike/spike-contract.test.ts
git commit -m "fix: replace heuristic evidence validation"
```

Expected: focused and full tests, TypeScript, scoped ESLint, and diff check pass.

---

### Task 7: Migrate committed fixtures, manifest, and runbook to version 2

**Files:**

- Modify: `tools/agentchattr-compatibility-spike/fixtures/identity-bindings.json`
- Modify: `tools/agentchattr-compatibility-spike/fixtures/message-contract.json`
- Modify: `docs/superpowers/evidence/2026-08-09-scotty-agentchattr-compatibility-spike/manifest.json`
- Modify: `tools/agentchattr-compatibility-spike/README.md`
- Modify: `tools/agentchattr-compatibility-spike/evidence-schema.test.ts`
- Modify: `tools/agentchattr-compatibility-spike/spike-contract.test.ts`

**Interfaces:**

- Consumes: the completed version-2 schemas and public validator.
- Produces: committed synthetic fixtures and an executable-free `not_run` manifest template that parse without fallback.
- Keeps blocked: old compatibility-spike Task 2 until fresh independent review and the existing resource/provenance/execution gates run.

- [ ] **Step 1: Add RED tests importing the current committed JSON**

Parse `identity-bindings.json` with `identityFixtureSchema`, `message-contract.json` with `messageFixtureSchema`, and `manifest.json` with `parseEvidenceManifestV2`. Run the focused tests before editing JSON.

Expected: RED because all three committed artifacts still declare `schemaVersion: 1` and use legacy shapes.

- [ ] **Step 2: Rewrite the identity fixture explicitly as version 2**

Preserve synthetic-only values and cover:

- one actor across Herdr and Desktop sessions;
- one logical session across role changes without minting a new actor;
- multiple actors participating in one Bead/session relation;
- zero, one, and multiple Bead links without making Bead/channel a binding key;
- multiple actors sharing the same descriptive provider/model values without merging identities; unknown `displayName` fields remain structurally rejected;
- verified, unverified, stale, and revoked intervals; and
- no real identity, pane content, path, token, or provider credential.

Do not include `displayName` in a strict binding record.

- [ ] **Step 3: Rewrite the message fixture explicitly as version 2**

Include records for initial page, overlap page, retry replay, post-restart observation, tombstone, equal timestamps, queue-only observation, peer acceptance, and unknown transport/read/acknowledgement. Replays reuse the same durable tuple; divergent duplicates are test-only negative mutations, not committed fixtures.

- [ ] **Step 4: Rewrite `manifest.json` as the exact not-run envelope**

Set:

```json
{
  "schemaVersion": 2,
  "spike": "agentchattr-compatibility",
  "stage": "1.5",
  "manifestId": "agentchattr-spike-manifest-template",
  "runId": "not-run",
  "executionState": "not_run",
  "upstream": {
    "repository": "https://github.com/bcurts/agentchattr.git",
    "commit": "c24f605c9b24fb7a98003f7930e2d5e7a7f7d297",
    "tag": "v0.5.0",
    "version": "0.5.0",
    "licenseSha256": "a1abc583f6725867ed3564f1bcd201d78603612330665433a733a640721f40f3"
  },
  "endpoint": { "host": "127.0.0.1", "port": 43123, "state": "candidate_only_not_bound" },
  "resourceAdmission": {
    "measurementState": "not_run",
    "availablePhysicalMemoryGiB": null,
    "aggregateWorkingSetPercent": null,
    "otherResourceHeavyJobActive": null,
    "runtimeManagerCorrelationId": null,
    "admissionResult": "not_run"
  },
  "safety": {
    "lifecycleOwner": "runtime-manager",
    "launcher": "not_run",
    "wrapper": "not_run",
    "triggerQueueConsumer": "not_run",
    "terminalInjection": "not_run",
    "autoWake": "not_run",
    "jobsAuthority": "not_run",
    "persistentRules": "not_run"
  },
  "evidence": []
}
```

- [ ] **Step 5: Replace README heuristic language with the approved typed model**

Document:

- strict schema version 2 and no version-1 fallback;
- safe extensions as the only extension point;
- provider-neutral runtime kinds with Herdr-only version-2 payloads;
- direct Herdr foundational observation, optional telemetry observation, and optional mesh control;
- stable action/correlation/idempotency/attempt identity;
- authorization, execution, verification, acknowledgement, and reconciliation as separate states;
- retry lockout after success, timeout, unknown, pending/unknown acknowledgement, or unverified outcome;
- meaningful mesh/direct-Herdr delivery promotion into Beads/Crosstalk;
- no raw transcripts, pane output, paths, commands, tokens, config, or host events; and
- Task 2 remains blocked pending independent review and existing execution gates.

Delete claims that validation recursively scans arbitrary keys or values.

- [ ] **Step 6: Run JSON, focused, and full verification**

```powershell
Get-Content -Raw tools/agentchattr-compatibility-spike/fixtures/identity-bindings.json | ConvertFrom-Json | Out-Null
Get-Content -Raw tools/agentchattr-compatibility-spike/fixtures/message-contract.json | ConvertFrom-Json | Out-Null
Get-Content -Raw docs/superpowers/evidence/2026-08-09-scotty-agentchattr-compatibility-spike/manifest.json | ConvertFrom-Json | Out-Null
npm run test:unit -- tools/agentchattr-compatibility-spike/evidence-schema.test.ts tools/agentchattr-compatibility-spike/spike-contract.test.ts
npm run test:unit
npx tsc --noEmit --pretty false
npx eslint tools/agentchattr-compatibility-spike/evidence-schema.ts tools/agentchattr-compatibility-spike/evidence-schema.test.ts tools/agentchattr-compatibility-spike/spike-contract.ts tools/agentchattr-compatibility-spike/spike-contract.test.ts
git diff --check
```

Expected: all commands pass. Do not run a build, browser, runtime, MCP client, Desktop configuration, provider installation, or Herdr control command.

- [ ] **Step 7: Commit the migration and push the branch**

```powershell
git add -- tools/agentchattr-compatibility-spike/fixtures/identity-bindings.json tools/agentchattr-compatibility-spike/fixtures/message-contract.json docs/superpowers/evidence/2026-08-09-scotty-agentchattr-compatibility-spike/manifest.json tools/agentchattr-compatibility-spike/README.md tools/agentchattr-compatibility-spike/evidence-schema.test.ts tools/agentchattr-compatibility-spike/spike-contract.test.ts
git diff --cached --check
git commit -m "docs: migrate spike evidence to schema v2"
git push origin codex/scotty-agentchattr-compatibility-spike
git rev-parse HEAD
git rev-parse origin/codex/scotty-agentchattr-compatibility-spike
```

Expected: local and remote hashes match; the branch contains only the eight approved redesign paths across the task sequence.

---

### Task 8: Independent adversarial review and Task 2 transition gate

**Files:**

- Modify only if review finds a defect: one or more of the eight approved redesign paths.
- Do not modify: `run-spike.ps1`, `report.md`, production code, runtime configuration, Desktop configuration, or provider installations.

**Interfaces:**

- Consumes: the pushed version-2 branch and approved schema design.
- Produces: independent PASS/NEEDS CHANGES evidence on the Bead and a transition decision; no executable spike activity.

- [ ] **Step 1: Request a fresh independent review**

The reviewer must inspect implementation, not only rerun tests. Require explicit verdicts on:

1. strict unknown-field behavior at every object boundary;
2. false-negative and false-positive mutation tables;
3. no heuristic/arbitrary-key fallback;
4. no raw privacy-sensitive payload surface;
5. provider-neutral outer kinds with a closed Herdr-only v2 inner union;
6. direct Herdr remaining foundational and telemetry/mesh remaining optional;
7. stable event/action/correlation/idempotency/attempt identities;
8. authorization/execution/verification/acknowledgement/reconciliation separation;
9. duplicate retry prevention after success, timeout, unknown, or pending/unknown acknowledgement;
10. Beads promotion for meaningful control outcomes;
11. version-1 rejection; and
12. exact eight-file scope with no production authority or runtime ownership expansion.

- [ ] **Step 2: If NEEDS CHANGES, use a new RED/GREEN correction round**

For each confirmed finding, add the smallest behavioral test first, run focused RED, implement the structural root fix, then rerun focused/full/type/lint/JSON/diff gates. Do not add semantic key scanning as a shortcut.

- [ ] **Step 3: Run final fresh gates after review PASS**

Run the same JSON, focused, full-unit, TypeScript, scoped-ESLint, and diff commands from Task 7 on the exact reviewed commit. Also run:

```powershell
git grep -n -E "AUTHORITY_FAMILY_ROOTS|AUTHORITY_COMPACT_TERMS|AUTHORITY_STATE_SUFFIXES|normalizedKey|semanticTokens|inferredAuthority" -- tools/agentchattr-compatibility-spike
git status --short --branch
git diff --exit-code HEAD origin/codex/scotty-agentchattr-compatibility-spike
```

Expected: grep has no matches, the worktree is clean, and local/remote parity passes.

- [ ] **Step 4: Record the transition without executing Task 2**

Post the implementation commit(s), RED/GREEN evidence, final gates, review verdict, privacy conclusion, provider-boundary conclusion, and no-runtime-activity statement to `better-palia-maps-b3e4t`.

Only after PASS may orchestration advance from `Task 1R schema v2 redesign` to `Task 2 configuration-boundary preparation`. That transition still requires the pre-existing provenance, resource admission, Runtime Manager, loopback-port, and no-wrapper/no-injection gates. Do not install or start telemetry-bridge or herdr-mesh as part of the transition.

## Plan self-review checklist

- [ ] Every approved evidence kind has a structural task and a valid fixture test.
- [ ] Runtime outer kinds are provider-neutral; schema v2 admits only Herdr provider payloads.
- [ ] Direct Herdr observation is foundational; telemetry and mesh are optional adapters only.
- [ ] Runtime control has stable event, action, correlation, idempotency, attempt, and sequence identity.
- [ ] Request, authorization, execution, verification, acknowledgement, and reconciliation are separate.
- [ ] Retry rules fail closed after success, timeout, unknown, or pending/unknown acknowledgement.
- [ ] Meaningful runtime control outcomes require exact Beads promotion when declared.
- [ ] Every strict object boundary has unknown-field mutation coverage.
- [ ] Values and unknown key names never leak through issue output.
- [ ] The old heuristic parser and standalone v1 helper validators are removed.
- [ ] Version 1 is rejected without migration.
- [ ] The manifest and both fixtures are committed as explicit version 2.
- [ ] No runtime, Desktop, MCP, provider, service, production adapter, build, or browser action is included.
- [ ] Final independent review precedes any transition into old Task 2.

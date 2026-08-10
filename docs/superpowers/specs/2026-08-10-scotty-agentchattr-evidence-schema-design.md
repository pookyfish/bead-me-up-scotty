# AgentChattr Evidence Schema Redesign

## Status and scope

This design replaces the failed Task 1 evidence validator in the bounded
AgentChattr compatibility spike. The previous implementation attempted to
infer forbidden authority and sensitive data from arbitrary object keys. Five
reviewed correction rounds proved that approach structurally unsafe: it both
missed compact, nested, and array-shaped authority claims and rejected neutral
provider metadata.

The redesign is a new task, not a sixth correction round. It changes only the
spike-local evidence schema, validator, fixtures, manifest template, tests, and
runbook. It does not install or start AgentChattr, configure MCP or Desktop
clients, register a service, change Scotty production code, add a control-plane
source, or alter Beads, Herdr, Git, Runtime Manager, or identity authority.

## Decision

Use strict Zod schemas already present in Scotty. The committed manifest uses
`schemaVersion: 2`. Its `evidence` array is a closed discriminated union of
explicit record kinds. Unknown fields fail structurally at every normal schema
level; the validator never derives meaning from camel case, separators,
prefixes, substrings, or recursively discovered arbitrary keys.

An optional `extensions` object is the only extension point. It is flat,
namespaced, limited to 16 entries, restricted to the primitive vocabulary in
this design, and excluded from authority, durability, and classification
decisions.

The public entry point remains:

```ts
validateEvidenceManifest(value: unknown): ContractResult
```

This preserves the spike harness boundary while replacing its implementation.

## Authority boundaries

- AgentChattr may provide only live conversation evidence: messages,
  channels, replies, mentions, presence, unread/queued observations, and its
  stable message UID.
- Beads remains the only durable task, dependency, assignment, decision,
  approval, review-verdict, directive, handoff, and human-gate authority.
- Herdr remains the only controller of Herdr panes and already-running CLI
  agents.
- Runtime Manager remains the only lifecycle owner for a disposable
  AgentChattr server.
- Git remains the source for branch, worktree, merge, and integration state.
- Identity, logical session, surface, orchestration role, and Bead remain
  independent many-to-many dimensions.
- No schema classification may imply delivery, read, work, lease, task,
  approval, handoff, identity binding, or durability without the exact typed
  record and direct evidence required below.

## File boundaries

The redesign creates or modifies only these spike-local files:

| Path | Responsibility |
| --- | --- |
| `tools/agentchattr-compatibility-spike/evidence-schema.ts` | Strict Zod schemas, inferred types, safe scalar helpers, and structural issue conversion. |
| `tools/agentchattr-compatibility-spike/evidence-schema.test.ts` | Structural, unknown-field, extension, version, and per-kind schema tests. |
| `tools/agentchattr-compatibility-spike/spike-contract.ts` | Cross-record invariants and overall classification aggregation. |
| `tools/agentchattr-compatibility-spike/spike-contract.test.ts` | Behavioral and adversarial cross-record tests. |
| `tools/agentchattr-compatibility-spike/fixtures/identity-bindings.json` | Version-2 synthetic identity evidence. |
| `tools/agentchattr-compatibility-spike/fixtures/message-contract.json` | Version-2 synthetic message/cursor/replay evidence. |
| `docs/superpowers/evidence/2026-08-09-scotty-agentchattr-compatibility-spike/manifest.json` | Strict version-2, not-run evidence template. |
| `tools/agentchattr-compatibility-spike/README.md` | Operator-facing schema, redaction, and stop rules. |

No production route, store, component, adapter, service manifest, or global
configuration belongs in this task.

## Manifest envelope

The top-level object is strict and contains:

```ts
type EvidenceManifestV2 = {
  schemaVersion: 2;
  spike: "agentchattr-compatibility";
  stage: "1.5";
  manifestId: string;
  runId: string;
  executionState: "not_run" | "running" | "completed" | "aborted";
  upstream: ApprovedUpstreamPin;
  endpoint: EndpointBoundary;
  resourceAdmission: ResourceAdmission;
  safety: SafetyBoundary;
  evidence: EvidenceRecord[];
  extensions?: SafeExtensions;
};
```

`ApprovedUpstreamPin` retains the exact repository, commit, tag, version, and
MIT license SHA-256 already approved in provenance. `EndpointBoundary` accepts
only host `127.0.0.1`, a valid port, and
`candidate_only_not_bound`, `bound`, or `stopped`.

`ResourceAdmission` has an explicit `measurementState` of `not_run` or
`measured`; measured memory fields are null only while `not_run`. Its admission
result is `not_run`, `admitted`, `denied`, or `unknown`. A non-secret Runtime
Manager correlation ID is required for every result except `not_run`.
`SafetyBoundary` fixes lifecycle owner to `runtime-manager` and records each
prohibited path as `not_run`, `disabled`, `enabled`, or `unknown`, rather than
using ambiguous nullable booleans.

When `executionState` is `not_run`, the endpoint must be
`candidate_only_not_bound`, resource admission and all prohibited-path states
must be `not_run`, and `evidence` must be empty. `running`, `completed`, and
`aborted` require measured admission and non-`not_run` safety observations.
`completed` additionally requires a teardown record. An abort may retain
partial evidence but must identify its failed or unknown stop condition.

Version 1 or any other version returns `unsupported_schema_version`. There is
no implicit migration, compatibility parser, or heuristic fallback.

## Common evidence record

Every evidence record is strict and shares:

```ts
type EvidenceBase = {
  caseId: string;
  kind: EvidenceKind;
  expectedResult: "pass" | "fail" | "unsupported" | "unknown";
  observedResult: "pass" | "fail" | "unsupported" | "unknown";
  classification: "pass" | "fail" | "unsupported" | "unknown";
  startedAt: string;
  observedAt: string;
  provenance: EvidenceProvenance;
  artifacts: EvidenceArtifact[];
  extensions?: SafeExtensions;
};
```

Case IDs match `^[a-z][a-z0-9-]{2,63}$`. Timestamps are UTC ISO strings and
must be monotonic within a record. Provenance contains a closed source kind, a
source reference matching `^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$`, and an
artifact hash. Artifacts contain only an explicit artifact kind and
`sha256:<64 lowercase hex>` digest; raw payloads are not stored in the
manifest.

## Closed evidence kinds

`EvidenceRecord` is a strict discriminated union with these kinds:

### `configuration_boundary`

Records Runtime Manager lifecycle ownership, direct-server invocation,
loopback bind, authentication enabled, relative disposable-root label, a
reviewed sanitized argv template/hash, and explicit disabled/unused states for
launchers, wrappers, trigger consumers, terminal injection, auto-wake, Jobs,
and persistent Rules. It has no raw token, raw command, absolute path, or raw
configuration field.

### `monitor_interval`

Records one process, child-process, trigger-queue, Herdr pane, input-control,
or Runtime Manager inventory monitor. It contains monitor kind, monotonic start
and end times, an integer sample interval from 1 through 2,000 milliseconds,
a nonnegative integer event count, baseline/final hashes, gap status, and
final-capture status. It stores no raw process command line, queue content,
terminal content, or credential.

### `mcp_exchange`

Records one authenticated MCP initialize, tools/list, chat_send, or chat_read
exchange. It contains the client kind, client version, tool name, authenticated
result, sanitized request/response artifact hashes, and a resulting stable
message UID only for a successful `chat_send` or `chat_read` observation that
returned one. It cannot express delivery, read, work, lease, approval, handoff,
binding, or Beads durability.

### `message_observation`

Contains provider instance ID, channel ID, stable message UID, integer cursor
ID, parent UID or null, thread/reply ID or null, sender external ID, content
checksum, delivery vocabulary, and direct-evidence artifact hash. Delivery
vocabulary is limited to `accepted`, `queued`, `delivered`, `read`, `failed`,
`unknown`, and `unsupported`. Accepted, queued, delivered, and read require a
direct evidence hash. Cursor IDs remain pagination-only and cannot equal or
replace the durable UID.

### `identity_binding`

Contains actor ID, logical session ID, execution surface, orchestration role,
provider/model, a required Herdr session reference when surface is `herdr`, no
Herdr session reference for either Desktop surface, AgentChattr
instance/session/external identity, Beads actor ID, validity interval, and
binding state `verified`, `unverified`, `revoked`, or `stale`. Only a complete
`verified` record covering the observation time may attribute a message. No
display name, channel, reply, mention, role, or Bead ID creates a binding.

### `loop_guard_transition`

Contains channel ID, origin `agent` or `human`, authenticated-human proof
required only for a human reset, exact from/to state, whether MCP was invoked,
and a stable message UID exactly when MCP produced or observed a message. The
only autonomous sequence is active zero through five, then
the allowed sixth request transitions to paused six before MCP. Paused six
rejects a seventh before MCP. Only directly evidenced authenticated human
activity returns paused six to active zero.

### `beads_promotion`

Contains Bead ID, Scotty decision ID, artifact type, selected-value or capsule
checksum, canonical AgentChattr idempotency key, Beads artifact/comment ID,
acknowledged and verified timestamps, and state `durable`,
`promotion_pending`, or `reconciliation_conflict`. Durable requires exact
agreement across Bead, decision, idempotency key, checksum, artifact, and
timestamps. Retries must converge on the same Beads artifact.

### `desktop_capability`

Contains exactly one client, `claude_code_desktop` or `codex_desktop`, its
version, independent read/send classifications, authentication evidence hash,
and stored-message evidence when supported. It never implies wake, launch,
injection, pane control, or capability of the other Desktop client.

### `teardown`

Contains the named Runtime Manager service deregistration result, exact
baseline-inventory restoration, disposable Desktop profile/config restoration,
credential removal, listener removal, final monitor capture, and disposable
root deletion/retention decision. Any uncertain ownership or missing final
proof is `unknown` or `fail`, never pass.

## Safe extensions

`extensions` is optional at the manifest and record levels. It follows all of
these rules:

- At most 16 entries.
- Keys match `^x-[a-z0-9]+(?:-[a-z0-9]+)*$` and are at most 64 characters.
- Values are only `null`, booleans, integers from -1,000,000,000 through
  1,000,000,000, one of
  `present`, `absent`, `enabled`, `disabled`, `unknown`, `unsupported`,
  `redacted`, `matched`, or `mismatched`, or an exact
  `sha256:<64 lowercase hex>` digest.
- Arrays, nested objects, arbitrary strings, whitespace, slashes, backslashes,
  `=`, raw URLs, command fragments, configuration fragments, and
  credential-like free text are impossible by schema.
- Extensions are never traversed for semantic meaning and never affect
  authority, attribution, workflow, durability, or classification.

Adding an authoritative or structured field requires a schema-version change;
it cannot be smuggled through `extensions`.

## Cross-record validation

Zod validates structure first. `spike-contract.ts` then performs only
cross-record rules over typed records:

- message UID uniqueness, cursor ordering, replay overlap, retry convergence,
  restart stability, and tombstone/deletion linkage;
- exact verified identity binding at the message observation time;
- loop-guard sequence and absence of an upstream seventh message;
- exact Beads acknowledgement and reconciliation matching;
- independent Desktop results;
- monitor coverage from before service start through post-deregistration final
  capture;
- endpoint, resource admission, safety, and teardown consistency.

Cross-record code switches on `kind`. It does not recursively scan unknown
objects, tokenize field names, or infer semantics from labels.

## Error and classification model

Structural failures return stable issues containing:

```ts
type ContractIssue = {
  code: string;
  classification: "fail" | "unsupported" | "unknown";
  path: string;
};
```

Paths use JSON Pointer syntax. Values are never echoed into errors. For an
unknown key, the issue path points to the containing object and the unknown key
name is not copied into the issue. Unknown fields, malformed fields, forbidden
extension values, and cross-record contradictions classify `fail`. Missing or
unverifiable observations classify `unknown`. A capability the inspected
source explicitly lacks classifies `unsupported`. Overall precedence is
`fail`, then `unsupported`, then `unknown`, then `pass`.

`unsupported_schema_version` is `fail` for this spike gate because downstream
tasks are authorized only against schema version 2.

## Migration and compatibility

- The committed manifest and synthetic fixtures are rewritten explicitly as
  version 2.
- Version 1 remains in Git history as failed evidence; it is never accepted or
  silently converted.
- `validateEvidenceManifest` keeps its current call signature and result shape,
  adding only the non-secret issue `path` field.
- The heuristic helpers for normalized arbitrary keys, compact authority
  stems, recursive inferred authority, and headerless configuration guessing
  are deleted, not retained as fallback.
- Task 2 remains blocked until version-2 implementation and independent
  adversarial review pass.

## Verification strategy

Implementation must begin with failing tests and include:

- one valid fixture for every evidence kind;
- rejection of unknown fields at the envelope, record, and nested payload
  levels;
- version 1 and unknown-version rejection;
- all extension key, count, depth, length, and value restrictions;
- sanitized argv acceptance and absence of raw command/path/token/config
  fields by construction;
- message UID/cursor/direct-observation invariants;
- complete, time-bounded identity attribution and many-to-many cardinality;
- exact loop-guard transitions and seventh-send absence;
- exact Beads acknowledgement, conflict, and retry convergence;
- independent Desktop capability results;
- monitor and teardown boundary coverage;
- generated mutation tables placing camel-case, compact, prefixed, nested,
  and array-shaped unknown fields at every strict object boundary, all failing
  as unknown fields without semantic interpretation;
- controls proving neutral provider metadata is accepted only in declared
  typed fields or safe extensions.

Required final gates are focused schema/contract tests, full unit tests,
TypeScript, scoped ESLint, JSON parsing, diff checks, and a fresh independent
adversarial review. No build, browser, AgentChattr process, MCP call, Desktop
configuration, or Runtime Manager mutation belongs in the redesign task.

## Exit criteria

The redesign is complete only when:

1. all version-2 structural and cross-record tests pass;
2. every heuristic arbitrary-key inference path is removed;
3. the committed manifest and fixtures parse as version 2;
4. independent review finds no under-match, over-match, legacy fallback, or
   production-authority expansion;
5. the branch is pushed with exact path scope and remote parity; and
6. Task 2 remains a separate transition after the redesign review, resource
   admission, and existing provenance/execution gates.

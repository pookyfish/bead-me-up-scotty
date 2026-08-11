# Scotty AgentChattr Safe-Boundary Remediation Design

**Status:** Owner-approved design for planning only

**Bead:** `better-palia-maps-b3e4t`

**Purpose:** Remove the two pre-execution blockers found by compatibility-spike Task 2 without changing Scotty's source-of-truth boundaries or authorizing AgentChattr installation or runtime execution.

## Decision

The compatibility spike may proceed only after two separately reviewed seams exist:

1. Runtime Manager owns AgentChattr through one fixed, allowlisted recipe. It does not gain arbitrary dynamic service registration.
2. AgentChattr runs in a transport-only safe mode. Unmodified upstream is preferred. If upstream cannot disable the prohibited authority surfaces, a minimal audited and version-pinned compatibility fork may do only that disabling work.

This design does not authorize implementation, installation, dependency resolution, service launch, MCP calls, Desktop configuration, or runtime configuration changes. A later plan may describe those activities, but installation and execution still require explicit owner approval after implementation and review.

## Preserved authority boundaries

| Concern | Authority |
| --- | --- |
| Tasks, dependencies, status, assignments, decisions, approvals, directives, review verdicts, and handoffs | Beads |
| Live conversation, channels, replies, mentions, presence, and conversational unread state | AgentChattr |
| Herdr panes and already-running Herdr CLI agents | Herdr |
| Disposable service admission, process lifecycle, health, inventory, and cleanup | Runtime Manager |
| Supervisor appointments, dispatch policy, leases, identity bindings, and orchestration state | Scotty/Beads according to the approved control-plane design |
| Branches, commits, worktrees, merges, index, and integration state | Git |

AgentChattr observation never implies authority. AgentChattr delivery never becomes durable work or a durable decision without the existing Beads/Crosstalk promotion boundary.

## Runtime Manager fixed recipe

### Service identity

Runtime Manager gains one fixed recipe named `agentchattr-spike`. It remains declared in the reviewed fixed manifest and selected by name. The API does not accept a new executable, shell command, arbitrary argument list, environment block, host, working directory, or service definition.

This is not a general `/register` endpoint. Unknown service names and attempts to change recipe definitions fail before admission.

### Allowed run inputs

The recipe accepts only a strict request containing:

- a safe run identifier;
- the reviewed source mode (`upstream` or `compatibility_shim`);
- the approved upstream commit and tag;
- the exact runtime commit when a shim is used;
- the reviewed patch digest when a shim is used;
- the expected execution-bundle or executable digest when one is available;
- ports selected from the recipe's bounded loopback-only range;
- an idempotency key; and
- the requesting actor and reason as audit metadata, not authority.

Runtime Manager creates the disposable root and data directory itself. Callers never supply an absolute path. The recipe supplies the fixed entrypoint and safe argv; callers cannot append flags or enable network mode.

### Artifact binding

Where a stable built artifact exists, the recipe verifies its digest immediately before process creation and records the digest in the operation evidence. A mismatch fails before launch.

Pinned AgentChattr is currently Python source rather than a pre-existing signed executable. The implementation plan must choose the strongest reproducible binding available, in this order:

1. a reproducible reviewed wheel, zipapp, or equivalent immutable execution bundle;
2. a reviewed fixed source-bundle digest plus the entrypoint and configuration-loader digests; or
3. the exact Git tree/commit plus a reviewed file-digest manifest when a single bundle is not practical.

The recipe must never silently degrade to commit-only verification. Any unavailable or non-reproducible artifact binding is reported as `unknown` and blocks runtime approval until independently accepted.

### Operation identity and lifecycle

Every prepare, start, verify, stop, and deregister request uses stable action, correlation, operation, and idempotency identities. The lifecycle remains append-only:

`requested -> authorized -> admitted -> started -> verified -> acknowledged`

Timeout and unknown are explicit states. A retry reuses the same idempotency identity and queries the existing operation before attempting anything new. No request may silently duplicate process creation.

Runtime Manager remains the only component allowed to start or stop the process. Scotty observes Runtime Manager through its existing authenticated read-only interface; it does not call lifecycle endpoints.

### Resource and isolation rules

- Bind only to `127.0.0.1`.
- Admit only one AgentChattr spike instance at a time.
- Use the existing load-admission and heavy-job serialization policy.
- Recheck every selected port immediately before bind.
- Use a manager-created disposable working/data root.
- Provide no repository credentials, Git credentials, Beads database paths, supervisor state paths, Runtime Manager definition paths, or user Desktop configuration paths to the process.
- Stop and deregister through Runtime Manager before considering disposable-root deletion.
- On uncertain ownership or failed teardown, retain the root and report its sanitized label; do not delete it.

## AgentChattr transport-only safe mode

### Upstream-first capability gate

Before carrying a patch, a read-only audit checks the current upstream release and pinned source for supported controls that disable every prohibited surface. Upstream qualifies only if the negative suite proves the controls are effective, persistent across restart, and cannot be reversed through configuration, API, MCP, callback, plugin, or extension input.

Safe mode retains only the live transport capabilities needed by Scotty:

- channels and messages;
- replies, parents, threads, and mentions;
- conversational presence and unread/queue observation;
- stable message identity and cursor behavior;
- authenticated loopback browser UI; and
- authenticated MCP chat read/send if independently verified.

Safe mode must disable or omit:

- agent subprocess launching;
- mention-triggered wake or dispatch;
- trigger-queue consumption;
- terminal or pane injection;
- auto-wake;
- Jobs and every Jobs mutation surface;
- persistent Rules and every rule-injection surface; and
- any callback, plugin, extension, or command hook that could invoke external authority.

### Minimal compatibility shim fallback

If upstream cannot satisfy the gate, a minimal fork is permitted as a deletable compatibility shim. It may change only the code necessary to disable or remove the prohibited surfaces. It may not add Scotty-specific orchestration, task, supervisor, lease, dispatch, identity, review, Git, Beads, Runtime Manager, or Herdr behavior.

The fork record contains:

- exact upstream repository, commit, tag, version, and license hash;
- exact fork repository and runtime commit;
- the exact carried patch and patch digest;
- a line-item reason for every changed hunk;
- preserved MIT copyright and permission notice;
- tests proving the prohibited surfaces cannot activate; and
- an upstream-exit procedure.

No unrelated cleanup, refactor, UI restyling, feature addition, or dependency upgrade belongs in the fork.

### Fork retirement

For every relevant upstream release:

1. perform a read-only capability comparison;
2. run the same transport-only negative suite against unmodified upstream;
3. compare the upstream behavior with each carried patch purpose;
4. remove patches whose purpose upstream now satisfies;
5. if every purpose is satisfied, repin to upstream and delete the fork path; and
6. re-run provenance, MIT, schema, Runtime Manager, and compatibility reviews before execution.

The shim is not an independently evolving product dependency.

## Authority-mutation firewall

Safe mode must not mutate or invoke any of the following through callbacks, plugins, extensions, configuration, MCP, HTTP, message content, or mention routing:

- Beads tasks, comments, decisions, or durable acknowledgements;
- supervisor appointment state;
- dispatch configuration;
- execution leases or claims;
- Runtime Manager definitions or recipes; or
- Git refs, index, configuration, worktree, commits, or merges.

The process receives none of those authority endpoints, credentials, filesystem paths, or command hooks. Durable promotion remains a separate Scotty-controlled operation after conversational evidence is observed and validated.

The negative integration test snapshots the authoritative surfaces before and after adversarial callback/plugin/extension inputs. It attempts every exposed extension path with payloads requesting each prohibited mutation. Passing requires:

- the request is rejected or treated as inert conversation data;
- no external process or shell command is created;
- no authority API is called;
- no Beads, orchestra, Runtime Manager definition, or Git state changes;
- no lease, supervisor, or dispatch event appears; and
- all before/after hashes and inventories remain identical except explicitly excluded unrelated user activity.

If upstream exposes an extension mechanism that cannot be isolated or proven inert, safe mode is unsupported and the service does not start.

## Evidence schema impact

No new evidence record kind is required. Existing schema-version-2 configuration-boundary, runtime-control, monitor, provider, promotion, and teardown records cover the remediation.

If unmodified upstream is used, the existing upstream pin remains authoritative. If the compatibility shim is required, execution is blocked until a separately reviewed typed manifest amendment records:

- implementation source mode;
- upstream base commit;
- runtime/fork commit;
- patch digest;
- execution-bundle or file-manifest digest;
- fork repository; and
- license digest.

Opaque `x-*` extensions cannot carry these semantics. They remain non-authoritative.

## Failure handling

| Failure | Required behavior |
| --- | --- |
| Upstream lacks a complete safe mode | Evaluate the minimal shim; do not launch upstream as-is |
| Shim contains unrelated behavior | Reject the shim |
| Pin, patch, license, tree, or artifact digest mismatch | Fail before process creation |
| Runtime Manager receives an unknown service or unsafe field | Reject before admission |
| Admission denied or evidence missing | Do not start |
| Start/verification timeout or unknown | Query the same operation; do not create a new attempt blindly |
| Prohibited feature becomes reachable | Stop, classify fail, and retain evidence |
| Monitor gap | Classify unknown and stop |
| Stop/deregistration uncertain | Retain the disposable root; do not delete |
| Authority surface changes during adversarial test | Classify fail and require reconciliation before any further run |

## Verification design

### Runtime Manager tests

- Accept the one fixed `agentchattr-spike` recipe.
- Reject unknown service names and arbitrary executable, argv, env, host, and path fields.
- Reject non-loopback and out-of-range ports.
- Verify source, patch, license, and artifact digests before process creation.
- Prove a digest mismatch creates no child process.
- Prove same-key retries converge on one operation and mismatched-key reuse fails.
- Prove only one instance can hold the recipe lease.
- Prove stop, deregistration, inventory removal, and safe retained-root failure behavior.

### Safe-mode tests

- Mentions never wake, dispatch, or start an agent.
- No agent subprocess or injection path can run.
- Trigger-queue consumers remain absent.
- Jobs and Rules APIs, MCP tools, callbacks, and stores are absent or fail closed.
- Restart does not restore prohibited features.
- Configuration, API, MCP, callback, plugin, and extension inputs cannot re-enable them.
- Normal channel/message/reply/mention transport remains functional.
- The authority-mutation firewall leaves Beads, supervisor, dispatch, leases, Runtime Manager definitions, and Git unchanged.

### Review gates

- Runtime Manager safety review confirms fixed-manifest semantics were not weakened.
- Fork review compares the complete diff against the pinned upstream commit and rejects unrelated hunks.
- MIT/provenance review confirms attribution and hashes.
- Evidence-schema review approves any typed shim-provenance amendment.
- Compatibility review verifies source evidence and behavioral negative tests rather than source-shape assertions.
- Explicit owner approval is required after all reviews and before dependency installation or runtime execution.

## Implementation sequence

1. Perform a fresh read-only upstream safe-mode capability audit.
2. Design and implement the fixed Runtime Manager recipe behind tests; do not start it.
3. If upstream qualifies, pin and test upstream directly.
4. If upstream does not qualify, prepare the minimal shim and its patch inventory in a separate reviewed change.
5. If the shim is used, amend strict typed provenance and repeat schema review.
6. Run static/unit/integration tests that require no AgentChattr process.
7. Independently review Runtime Manager, safe mode or shim, provenance, and authority-mutation tests.
8. Return to the owner for explicit installation/runtime-execution approval.
9. Only after that approval may the disposable compatibility spike resume.

## Explicit non-goals

- No arbitrary dynamic Runtime Manager service registry.
- No production AgentChattr provider or Scotty UI in this remediation.
- No AgentChattr task, lease, supervisor, dispatch, identity, Git, or review authority.
- No replacement for Beads, Herdr, Runtime Manager, Crosstalk, or Git.
- No direct Desktop configuration or automatic wake.
- No telemetry-bridge or herdr-mesh installation.
- No AgentChattr installation or service launch before the final explicit approval gate.

## Acceptance criteria

The remediation is ready for an execution-approval decision only when:

1. Runtime Manager owns the fixed recipe without accepting arbitrary service definitions.
2. The exact code/artifact to execute is pinned and digest-bound.
3. Upstream safe mode or the minimal shim passes every prohibited-surface test.
4. The authority-mutation firewall passes for callbacks, plugins, extensions, configuration, MCP, HTTP, and message inputs.
5. Source-of-truth boundaries remain unchanged.
6. Independent reviews pass with no unresolved safety or provenance finding.
7. The owner explicitly approves installation and runtime execution.

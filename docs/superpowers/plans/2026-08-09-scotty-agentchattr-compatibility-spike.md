# Scotty AgentChattr Compatibility Spike Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Produce a reviewed, disposable Windows compatibility-evidence package that determines whether pinned AgentChattr can serve only as Scotty's optional live communication transport, without starting production integration.

**Architecture:** The spike is an isolated, loopback-only service exercise plus a small, repository-local evidence harness. It observes and drives only the pinned upstream MCP surface through an authenticated manually configured client; it does not add an AgentChattr source to Scotty's control-plane snapshot or ship a provider. Beads remains the sole work and durable-decision authority, Herdr remains the sole pane controller, and Runtime Manager is the only lifecycle owner for the disposable server.

**Tech Stack:** Windows PowerShell, Git, an isolated upstream AgentChattr checkout at `c24f605c9b24fb7a98003f7930e2d5e7a7f7d297` (`v0.5.0`), the upstream documented Windows server/MCP interface, Runtime Manager, Herdr, Beads, existing Vitest, and manually configured Claude Code Desktop/Codex Desktop MCP clients.

## Global Constraints

- This is Stage 1.5 compatibility evidence only. It must not add a sixth control-plane source, a production communication provider, a UI, an automatic dispatcher, or a production dependency/install.
- The upstream pin to re-verify before any executable work is `https://github.com/bcurts/agentchattr.git`, commit `c24f605c9b24fb7a98003f7930e2d5e7a7f7d297`, tag `v0.5.0`, root `VERSION` value `0.5.0`, and MIT root `LICENSE`. A changed, absent, or unreviewed pin blocks the spike.
- `docs/superpowers/evidence/2026-08-09-scotty-agentchattr-compatibility-spike/provenance.md` is acquired and independently approved **before** any dependency, server, process-monitor, Desktop-profile, Runtime Manager, or MCP work. The gate is one-way: later tasks may consume its approval but may not create, repair, or retroactively approve it.
- No upstream source, UI asset, launcher, wrapper, or copied code enters Scotty. If future reuse is proposed, stop this spike and obtain a new provenance/MIT-attribution review.
- AgentChattr owns only live messages, channels, replies, mentions, chat presence, unread/queued state, its stable message UID, and its optional browser UI. It has no task, decision, lease, session, pane, process, dispatch, Git, or identity authority.
- Beads is the only task/dependency/status/assignment authority and the only durable authority for decisions, approvals, review verdicts, directives, human gates, and handoffs. AgentChattr Jobs are disabled or ignored; persistent Rules are not policy and must not be created or used.
- Herdr alone controls a Herdr pane. The spike must not invoke AgentChattr CLI launchers, Windows wrappers, trigger-queue consumers, terminal injection, auto-wake, pane focus, pane prompt, agent launch, or a permission-bypass launcher. A mention never creates a lease or work claim.
- Runtime Manager alone registers, starts, stops, and inventories the disposable service. Scotty must not call lifecycle endpoints directly. Its load-admission decision applies to start and restart.
- Bind every test service endpoint to `127.0.0.1` only, use non-conflicting ports recorded in the evidence manifest, and retain its data directory under the disposable spike root. Network mode is prohibited.
- Keep credentials, raw configuration, queue files, absolute user paths, raw command lines, and raw tokens out of source control, browser payloads, screenshots, and reports. Evidence may retain only a reviewed sanitized argv template (executable basename plus literal safe flags, with `<data-dir>`, `<port>`, and `<secret>` placeholders) and a stable argv hash; tests must reject raw command lines while accepting that sanitized template/hash.
- Identity, logical session, execution surface, orchestration role, and Bead/task remain independent many-to-many dimensions. No display/provider-name matching, channel membership, reply, mention, role, or Bead ID may imply an identity binding, lease, or exclusive assignment.
- A message enters an attributed federated projection only after an explicit verified binding to the exact external instance/session/surface evidence. Renamed, reclaimed, or restart-mismatched identities become unbound; never remap them by display name.
- Desktop read/send is tested independently for Claude Code Desktop and Codex Desktop. Unsupported or unavailable is recorded per client; neither result implies desktop wake, launch, injection, or the other client's capability.
- The live interval has continuous bounded evidence: process/child creation monitoring, trigger-queue event/hash monitoring, and monotonic Herdr pane revision/input-control auditing start before the service and end after deregistration. Any monitor start failure, event-stream loss, sample gap beyond its bound, or missing final record is `unknown` and therefore a required no-go.
- The spike owns a pure per-channel loop-guard state machine and an operator-invoked autonomous-send gate. Every autonomous test `chat_send` must receive an allow decision from that gate before an MCP request is made; a seventh attempt is locally rejected and must have no upstream request/message evidence. Only directly evidenced authenticated human-origin activity resets the guard; `/continue`, agent-origin text, and unauthenticated events never reset it.
- Live admission is quantitative and recorded: available physical memory must be at least 4 GiB; aggregate working set of browser, Node, Python, Claude, Codex, and Herdr processes must not exceed 70% of physical memory; and no other resource-heavy job may be active. The manifest records each field, the selected-port preflight and immediate pre-bind recheck, and Runtime Manager's nonempty admission correlation token plus explicit `admitted` result. Missing or denied evidence blocks the start.
- No merge, production deployment, production install, production configuration, or later-stage planning occurs in this spike. The future branch remains a separately reviewable spike branch until the go/no-go decision is accepted.

## Boundaries and non-goals

The branch is allowed to create only the fixture, harness, redacted evidence, and report named below. It must not modify these existing production seams: `lib/control-plane/types.ts`, `lib/control-plane/snapshot.ts`, `app/api/p/[projectId]/control-plane/route.ts`, `app/api/p/[projectId]/control-plane/stream/route.ts`, `lib/control-plane/herdr.ts`, `lib/control-plane/runtime-manager.ts`, `lib/store.ts`, `lib/schema.ts`, or any production UI route/component. The current five-source snapshot remains unchanged; the existing Runtime Manager observer is read-only (`GET /health`, `GET /services`) and is useful only for evidence collection.

The spike answers compatibility questions. It does **not** design the production provider, decide an MCP client configuration format, create identity-registry persistence, implement a Herdr wake adapter, alter Beads semantics, promote normal chat, add decision cards to Scotty, enable Structured Sessions, or create a channel per Bead. If any evidence requires one of those changes merely to run, record `fail`/`unsupported` and stop at the boundary.

## Future spike branch file map

The provenance artifact below is created on this plan-review branch solely to establish the one-way pre-execution gate. After it has been independently approved, create the remaining files on a new, clean spike branch. The artifact directory may contain redacted JSON/text fixtures and report material, never credentials or raw upstream data.

| Path | Responsibility |
| --- | --- |
| `tools/agentchattr-compatibility-spike/README.md` | Repeatable operator runbook, exact stop conditions, redaction rules, teardown owner, and authoritative list of upstream interfaces actually discovered. |
| `tools/agentchattr-compatibility-spike/spike-contract.ts` | Pure, spike-only validation of the evidence manifest, identity fixture, delivery vocabulary, cursor/UID fixtures, loop count, and promotion-result records; no application import and no lifecycle call. |
| `tools/agentchattr-compatibility-spike/spike-contract.test.ts` | TDD tests for the pure contract and all required negative/unknown classifications. |
| `tools/agentchattr-compatibility-spike/run-spike.ps1` | Explicit operator-invoked harness and autonomous-send gate. It captures sanitized process/inventory/message evidence; runs event-driven process/child, trigger-queue hash, and monotonic Herdr revision/input-control monitors for the whole live interval; and refuses network bind, unknown upstream revision, missing Runtime Manager ownership/admission token, enabled prohibited paths, monitor gaps, missing test Bead, or missing manual MCP client confirmation. |
| `tools/agentchattr-compatibility-spike/fixtures/identity-bindings.json` | Synthetic many-to-many bindings: one actor on multiple sessions/surfaces, one session across roles and zero/multiple Beads, one Bead involving multiple bound actors, and stale/revoked/unverified bindings. Never use a real name or token. |
| `tools/agentchattr-compatibility-spike/fixtures/message-contract.json` | Expected stable UID/channel/thread/parent/cursor/idempotency cases, including overlap, replay, restart, deletion/tombstone, retry, equal/near-equal timestamps, queue state, and unknown vocabulary. |
| `docs/superpowers/evidence/2026-08-09-scotty-agentchattr-compatibility-spike/provenance.md` | Already-created, independently reviewed pre-execution pin, Windows compatibility, license/hash, upstream server/API/MCP version or explicit absence, and copy/attribution conclusion. It is read-only to the spike branch. |
| `docs/superpowers/evidence/2026-08-09-scotty-agentchattr-compatibility-spike/manifest.json` | Sanitized run metadata, approved port numbers, relative disposable root identifier, tool inventory, test-Bead ID, result classifications, and artifact hashes. |
| `docs/superpowers/evidence/2026-08-09-scotty-agentchattr-compatibility-spike/report.md` | Case-by-case expected/observed result, evidence links/hashes, failures, unsupported/unknown findings, teardown confirmation, and signed go/no-go recommendation. |

The external, disposable root is `%TEMP%\\scotty-agentchattr-spike-<UTC-run-id>`. It is never a Scotty worktree, never a production data directory, and is deleted only after the report captures its redacted hashes and the operator has confirmed it contains only spike-owned state. The pinned upstream checkout lives below that root at `upstream`; an isolated dependency/runtime environment, if the upstream documentation requires one, lives below `runtime`. Do not install into the Scotty checkout, user-global location, an existing AgentChattr installation, or a Desktop client's configuration.

## Exact interfaces to inspect before exercising them

The upstream interface must be discovered from the pinned source rather than guessed. Record the file path, line reference, version, and observed request/response shape in `provenance.md`; never copy its source into the report.

| Interface | Required inspection and compatibility assertion |
| --- | --- |
| Upstream release/provenance | `git remote get-url origin`, `git rev-parse HEAD`, `git tag --points-at HEAD`, root `VERSION`, root `LICENSE`, and `Get-FileHash LICENSE -Algorithm SHA256` must match the approved pin or halt before a server starts. |
| Server configuration/start surface | Inspect the upstream README, package/build manifest, server entrypoint, Windows wrapper/launcher files, trigger queue, terminal injection, auto-wake code, data-directory setting, bind-host setting, port settings, and auth/token setting. The report must name the documented direct server invocation actually used; a wrapper-only startup path is a failure. |
| Runtime Manager | Inspect the project-local Runtime Manager service-registration interface and its `GET /health`/`GET /services` response. Record one named service with a fixed per-project disposable data directory, loopback health endpoint, PID/executable ownership, and a load-admitted start/stop audit trail. |
| MCP | From a manually configured client, capture protocol initialization, `tools/list`, authentication challenge/success or authenticated request evidence, and the actual `chat_send` and `chat_read` schemas. Missing tools, unauthenticated mutation, or a non-loopback transport is a required failure. |
| Message API/event stream | Inspect and capture the actual channel, message, reply/thread/parent, mention, delivery/read/queue, deletion, pagination/cursor, reconnect, and restart semantics. An integer database ID may paginate only; a stable UID is required for deduplication and durable references. |
| Herdr | Inspect `herdr api snapshot` for the exact already-running pane/session used. The spike does not call a prompt/control command. Any process/pane action attributed to AgentChattr is a failure. |
| Beads | Inspect the current test Bead/comment write/read interface and its acknowledgement fields. Determine whether a write can be verified against Bead ID, stable Scotty decision ID, choice, and idempotency key without inventing a second durable store. Absence of an atomic acknowledged mechanism is a no-go for production planning, not a reason to extend Beads in this spike. |
| Desktop clients | Use each actual Desktop MCP client separately; capture client/version, server registration scope, authenticated `chat_read`, authenticated `chat_send`, and resulting stored message. A client that cannot safely participate is `unsupported` or `unknown`, not assumed compatible. |

## One-way provenance gate before any execution preparation

- [ ] Re-fetch only the GitHub REST/raw endpoints listed in `provenance.md`; compare the repository URL, default branch/current commit, latest tag/release, root `VERSION`, license hash, and identified source paths/lines to the committed artifact. Do not clone or inspect a local upstream checkout during this step. Record a mismatch as `fail` in the proposed spike report and stop.
- [ ] Have an independent reviewer append their identity, UTC decision, repeated pin/current comparison, MIT-obligation conclusion, and Windows direct-server/no-wrapper conclusion to `provenance.md`. An explicit `approved` result is the only transition into the execution gate. `hold`, `fail`, `unknown`, absent review, or a changed revision stops the spike before any dependency, service, monitoring, Runtime Manager, Desktop, process, or MCP action.

## Execution gate before Task 1 (only after provenance approval)

- [ ] Confirm the future branch is a new spike branch from the reviewed Scotty baseline, is clean, and has an isolated branch owner. Do not use a worktree, alter another agent's work, or begin with a pre-existing AgentChattr checkout.
- [ ] Register the spike Bead/work ownership using the repository's Beads workflow. Create one disposable test Bead clearly marked as a compatibility fixture; do not touch an active work Bead or a human gate.
- [ ] Verify the independent `approved` row in `provenance.md` is earlier than this gate's UTC start. Copy its artifact hash and review timestamp into the manifest; do not edit the provenance artifact from this point onward.
- [ ] Run a read-only resource/process preflight. Record total/available physical memory, the 4-GiB availability threshold, the aggregate working set and 70%-of-physical threshold for browser/Node/Python/Claude/Codex/Herdr, each selected process's sanitized PID/name/working set, and a declaration that no other resource-heavy job is active. Capture `Get-NetTCPConnection -State Listen` for candidate ports and Runtime Manager's authenticated inventory. If a threshold fails, a conflicting listener/AgentChattr service exists, or evidence is incomplete, stop and classify the admission `fail`/`unknown`.
- [ ] Reserve non-conflicting loopback ports in the manifest after the preflight. Immediately before Runtime Manager bind/start, repeat the listener check and record the second result plus the actual `127.0.0.1` bind. Do not use `0.0.0.0`, LAN addresses, port forwarding, or a public tunnel.
- [ ] Obtain and record Runtime Manager's service-admission correlation token and explicit terminal `admitted` result before it starts the named service. A missing/empty token, denied/unknown result, or an inventory that cannot identify the named service blocks the start; Scotty does not substitute a direct start.
- [ ] Create the disposable root and verify it is outside the Scotty checkout. Use this exact pattern, replacing only `<UTC-run-id>`: `New-Item -ItemType Directory -Path "$env:TEMP\\scotty-agentchattr-spike-<UTC-run-id>"`. Record only the relative root label in committed evidence.
- [ ] Fetch the reviewed upstream source without switching the Scotty branch: `git clone --filter=blob:none --no-checkout https://github.com/bcurts/agentchattr.git "$env:TEMP\\scotty-agentchattr-spike-<UTC-run-id>\\upstream"`; `git -C "<root>\\upstream" fetch --depth=1 origin c24f605c9b24fb7a98003f7930e2d5e7a7f7d297`; `git -C "<root>\\upstream" checkout --detach c24f605c9b24fb7a98003f7930e2d5e7a7f7d297`. Re-run the provenance commands in the table, compare them to the approved artifact, and stop on any mismatch.
- [ ] Do not start the service until the source inspection has identified a direct documented server invocation and a documented way to disable or avoid every prohibited launcher, wrapper, trigger-queue, injection, and auto-wake path. If upstream cannot provide that separation, classify the spike `fail` and proceed directly to teardown/reporting.

---

### Task 1: Define the disposable evidence contract before service work

**Files:**
- Create: `tools/agentchattr-compatibility-spike/README.md`
- Create: `tools/agentchattr-compatibility-spike/spike-contract.ts`
- Create: `tools/agentchattr-compatibility-spike/spike-contract.test.ts`
- Create: `tools/agentchattr-compatibility-spike/fixtures/identity-bindings.json`
- Create: `tools/agentchattr-compatibility-spike/fixtures/message-contract.json`
- Create: `docs/superpowers/evidence/2026-08-09-scotty-agentchattr-compatibility-spike/manifest.json`

**Interfaces:**
- Consumes: only redacted fixture/evidence JSON, not production stores/routes.
- Produces: a validator and manifest vocabulary with `pass`, `fail`, `unsupported`, and `unknown`; no status maps to inferred delivery, read, work, lease, acceptance, approval, handoff, or identity binding.
- Required evidence record fields: case ID; upstream pin; host/tool versions; source and result artifact hashes; expected result; observed result; classification; provenance; UTC timestamps; sanitized PID/executable/start-time records; and explicit teardown state.
- Required message fields: provider instance ID, channel ID, stable message UID, integer cursor ID, parent UID or `null`, thread/reply identifier or `null`, sender external ID, explicit delivery vocabulary or `unknown`, and content checksum. The validator rejects an integer cursor ID as a durable key.
- Required promotion fields: related Bead ID, stable Scotty decision ID, artifact type, selected value/capsule checksum, `agentchattr:<instance>:<message-uid>:<choice>` idempotency key, Beads artifact/comment ID, acknowledged/verified timestamps, and `promotion_pending` or `reconciliation_conflict` when incomplete.

- [ ] **Step 1: Write the failing contract tests first**

  Add tests that reject: a non-loopback endpoint; a missing/changed upstream pin; an attributed message without a `verified` explicit binding; display-name-only binding; a one-to-one actor/session/Bead fixture; a cursor ID used as a UID; an unobserved delivery/read state; duplicate UIDs across overlapping pages; a seventh autonomous agent message; any queued mention marked as work/lease; a promotion reported durable before a matching acknowledged Beads artifact; a retry that creates a second artifact; and a Desktop result inferred from the other Desktop client.

- [ ] **Step 2: Run the focused tests and confirm they fail for the missing contract**

  Run: `npm run test:unit -- tools/agentchattr-compatibility-spike/spike-contract.test.ts`

  Expected: failure because the spike-only validator and fixtures do not exist.

- [ ] **Step 3: Implement only the pure evidence validator and fixtures**

  Keep the implementation isolated from `app/`, `components/`, `lib/control-plane/`, `lib/store.ts`, and `lib/schema.ts`. Encode the full many-to-many identity fixture and the only permitted delivery terms: `accepted`, `queued`, `delivered`, `read`, `failed`, `unknown`, and `unsupported`. `accepted`, `queued`, `delivered`, and `read` must require direct upstream evidence; no field may imply that work started.

- [ ] **Step 4: Run focused and full unit tests**

  Run: `npm run test:unit -- tools/agentchattr-compatibility-spike/spike-contract.test.ts` and `npm run test:unit`.

  Expected: all tests pass, including negative classifications and redaction checks. Do not run a build or a browser.

- [ ] **Step 5: Commit the isolated fixture/harness**

  Use an explicit pathspec containing only the six files listed in this task. Run `git show --stat --oneline HEAD` and stop if a production or unrelated file appears.

---

### Task 2: Validate the already-approved direct-server configuration boundary

**Files:**
- Modify: `docs/superpowers/evidence/2026-08-09-scotty-agentchattr-compatibility-spike/manifest.json`
- Modify: `tools/agentchattr-compatibility-spike/README.md`

**Interfaces:**
- Consumes: the immutable, independently approved provenance artifact and the execution-gate checkout.
- Produces: a sanitized configuration matrix that maps each prohibited path to observed disabled/absent evidence.
- Never produces: copied upstream source/assets, an application configuration field, a production service registration, or a Desktop configuration change.

- [ ] **Step 1: Verify the provenance gate without editing it**

  Before creating the disposable checkout, compare the approved reviewer row and artifact hash against the manifest copy made in the execution gate. After checkout, verify the checked-out commit, tag, root `VERSION`, and license hash against that immutable artifact. A mismatch stops the spike; do not amend, replace, or approve `provenance.md` during Task 2.

- [ ] **Step 2: Write failing configuration-boundary and redaction tests**

  Add fixture-driven cases requiring a named Runtime Manager service, fixed disposable per-project data directory, `127.0.0.1` bind, auth enabled, direct server invocation, a nonempty admission correlation token and `admitted` result, and explicit disabled/unused evidence for launchers, wrappers, trigger-queue consumer, terminal injection, auto-wake, Jobs, and persistent Rules. Include tests that refuse raw tokens, raw config, queue contents, absolute paths, and raw command lines while accepting a sanitized argv template and argv hash.

- [ ] **Step 3: Run the focused tests before writing the runbook/configuration matrix**

  Run: `npm run test:unit -- tools/agentchattr-compatibility-spike/spike-contract.test.ts`.

  Expected: failure until the manifest and runbook make each required boundary explicit.

- [ ] **Step 4: Complete the redacted runbook and matrix, then re-run tests**

  The runbook must use the actual direct invocation found in pinned upstream documentation, not a guessed command. It must state that Runtime Manager receives the named registration and is the only starter/stopper; Scotty never calls lifecycle endpoints. Capture a before/after Runtime Manager `GET /health`/`GET /services` inventory using the existing authenticated observer semantics, with tokens redacted. Re-run the focused and full unit suite; expected result is pass.

- [ ] **Step 5: Commit runbook/configuration evidence only**

  Use an explicit pathspec containing the two listed files. The provenance artifact is a prior one-way gate and is not part of this task's commit.

---

### Task 3: Prove authenticated MCP read/send while preserving process and pane ownership

**Files:**
- Create: `tools/agentchattr-compatibility-spike/run-spike.ps1`
- Modify: `tools/agentchattr-compatibility-spike/spike-contract.test.ts`
- Modify: `tools/agentchattr-compatibility-spike/README.md`
- Modify: `docs/superpowers/evidence/2026-08-09-scotty-agentchattr-compatibility-spike/manifest.json`

**Interfaces:**
- Consumes: independently approved provenance, named Runtime Manager registration, a manually configured MCP client, and one operator-confirmed already-running Herdr pane.
- Produces: sanitized tool-list/request/result/stored-message evidence for authenticated `chat_send` and `chat_read`, plus continuous process/child, trigger-queue, Herdr pane, and Runtime Manager evidence with monotonic timestamps and a final exact-inventory comparison.
- Does not produce: a new agent, a prompted pane, an auto-wake, a lease, a Bead assignment, a Jobs record, a Rule, or a production MCP configuration.

- [ ] **Step 1: Add failing no-autonomous-ownership tests**

  Add cases that require: the service is loopback/authenticated before a tool call; `tools/list` exposes both exact required tool names; an unauthenticated request is rejected; a successful send and read produce an upstream stored-message record; and continuous evidence contains no new Claude/Codex/AgentChattr wrapper/terminal-injection process, no unallowed child process, no unexplained Herdr pane revision/state-change/control event, no trigger-queue create/change/delete/hash event, and no Runtime Manager inventory change other than the one named server. Add a failing case for a missing process event subscription, a sample interval exceeding two seconds, a nonmonotonic timestamp/revision sequence, a missing final capture, or an unverifiable input-control audit; each must classify no-spawn evidence `unknown`/`fail`.

- [ ] **Step 2: Run focused tests and confirm the safety harness is absent**

  Run: `npm run test:unit -- tools/agentchattr-compatibility-spike/spike-contract.test.ts`.

  Expected: failure until the harness refuses unsafe preconditions and records each negative check.

- [ ] **Step 3: Implement the operator-invoked harness with refusal-first behavior**

  The harness may read process/listener state, obtain the existing read-only Herdr snapshot, and capture Runtime Manager inventory. Before the Runtime Manager start, it starts a `Win32_ProcessStartTrace` event subscription and a one-second process-tree snapshot sampler, both timestamped from one `System.Diagnostics.Stopwatch`; it runs them until after Runtime Manager deregistration and final inventory capture. Records contain only PID, parent PID, creation time, executable basename, expected-service flag, and a sanitized argv template/hash where available. A subscription failure, event-consumer loss, sampler interval over two seconds, or gap in monotonic sequence is `unknown`/`fail`.

  It also snapshots the exact Herdr `paneId`, `revision`, and `stateChangeSeq` before the live interval and once per second through the final capture. It records the harness's input-control invocation count as zero and requires an operator-supplied, sanitized Herdr control audit covering the same interval; if the platform cannot prove that AgentChattr made no input-control operation, the result is `unsupported`/`NO-GO`, not inferred from a quiet pane. It watches every identified trigger-queue file/directory from the pinned source configuration using creation/change/delete events plus a SHA-256 value before/after and after each event; an unknown queue location, watcher loss, or hash gap is `unknown`/`fail`.

  The harness must require the operator to supply sanitized evidence files for actual MCP initialization, `tools/list`, `chat_send`, and `chat_read`; it must not invent an MCP client, type into a Herdr pane, execute an AgentChattr launcher, or make a lifecycle request itself. It stops if the discovered tool schemas differ materially from the approved names/capabilities.

- [ ] **Step 4: Perform the one-service MCP exercise, one resource-heavy job at a time**

  Start the isolated named service through Runtime Manager only after its recorded admission correlation token/result and immediate pre-bind port recheck. From a manually configured MCP client, capture authentication and invoke one human/operator `chat_send` in a disposable channel, then `chat_read` to retrieve the resulting stored message. Verify direct evidence for every reported state. REST/WebSocket/browser observations may be supplementary but cannot replace this MCP gate.

  Separately have the already-running Herdr-managed CLI participant manually perform the same MCP read/send. It must be a human/operator action in that pane; capture its pre/post `herdr api snapshot` and prove AgentChattr neither owns nor types into the pane.

- [ ] **Step 5: Exercise the offline/unbound mention negative case**

  Mention an offline or deliberately unbound disposable participant. Capture continuous process/inventory/queue/Herdr evidence through the whole interval. Report `queued` only if upstream directly acknowledges it; otherwise `unknown`. In all cases prove no CLI launch, process spawn, console injection, trigger-queue consumption, pane action, Runtime Manager inventory mutation, lease, or work claim.

- [ ] **Step 6: Re-run contract tests and commit only harness changes**

  Run the focused and full unit suite. Commit with an explicit pathspec containing only the four files listed in this task. Live secrets and unredacted captures remain in the disposable root and must not be committed.

---

### Task 4: Exercise message, identity, pause/resume, failure, and durability semantics

**Files:**
- Modify: `tools/agentchattr-compatibility-spike/spike-contract.ts`
- Modify: `tools/agentchattr-compatibility-spike/spike-contract.test.ts`
- Modify: `tools/agentchattr-compatibility-spike/fixtures/identity-bindings.json`
- Modify: `tools/agentchattr-compatibility-spike/fixtures/message-contract.json`
- Modify: `tools/agentchattr-compatibility-spike/run-spike.ps1`
- Modify: `docs/superpowers/evidence/2026-08-09-scotty-agentchattr-compatibility-spike/manifest.json`

**Interfaces:**
- Consumes: actual captured upstream records and the synthetic identity/promotion fixture.
- Produces: pass/fail/unsupported/unknown evidence, never inferred semantics; a `promotion_pending` or `reconciliation_conflict` record whenever Beads-first acknowledgement/verification is incomplete; and a spike-only, text-safe decision outcome mirror that labels its AgentChattr provenance and provisional/durable state.
- Prohibits: production identity storage, a production federated Crosstalk projection, task/lease writes, automatic sending/waking, or a fallback second durable store.

- [ ] **Step 1: Write failing tests for the full message contract**

  Test stable UID uniqueness/stability through pagination, overlapping pages, reconnect, server restart, retry/replay, and deletion/tombstone. Test stable channel identity plus reply/thread/parent linkage with no cross-channel collision. Test deterministic cursor ordering at page boundaries with equal/near-equal timestamps; cursor is pagination only and UID deduplicates. Test that absent upstream delivery/queue/read semantics remain `unknown`/`unsupported`, never fabricated.

- [ ] **Step 2: Write failing identity and loop-guard tests**

  Use the synthetic fixture to prove an attributed message requires an exact verified binding that includes logical session, actor, provider/model, execution surface, role, runtime session ref, Herdr pane ref where applicable, upstream instance/display name, Beads actor, bound-at/by, and validity. Prove rename/reclaim/restart mismatch marks it unbound; a role change updates time-bounded role history without minting an identity; a channel membership, mention, or reply creates neither binding nor lease; a provider binding cannot be keyed by Bead/channel; stale/revoked bindings cannot attribute; and same-display-name/provider actors never merge.

  Define pure per-channel states `active(0)` through `active(6)` and `paused(6)`. `requestAutonomousSend(channel, evidence)` may transition only `active(0..5)` to the next count and returns an allow record before MCP; `active(6)` returns a rejected-before-MCP record and remains paused. `recordAuthenticatedHumanOrigin(channel, evidence)` resets only when it carries direct upstream UID, channel, timestamp, authenticated human-origin proof, and a verified human identity; agent text, an unauthenticated event, `/continue`, and an upstream control never reset. Test six consecutive agent-originated disposable send requests, a seventh rejection with no MCP invocation/upstream UID, the human-only reset, and every invalid reset source.

- [ ] **Step 3: Write failing promotion/reconciliation tests**

  For a disposable decision, review verdict, approval, and handoff capsule, require one Beads-first write that includes the artifact type, related Bead/review iteration, binding snapshot, concise content/capsule, upstream instance/channel/UID/timestamp, promoter/timestamp, content checksum, stable decision ID, choice, and idempotency key. Require a matching acknowledged Beads artifact ID verified against the Bead, decision ID, key, and value before any accepted/delivered/approved/complete claim. Test retry convergence without a second artifact; Beads success/chat acknowledgement failure retains the durable result and retries only chat acknowledgement; write/ack verification failure remains `promotion_pending`/`reconciliation_conflict`.

  Also require the spike-only decision outcome mirror to treat card/message content as text, retain source and authority labels, show `conversational`, `promotion_pending`, `reconciliation_conflict`, or verified durable state explicitly, and refuse an accepted/approved/handoff-complete rendering without the matching Beads acknowledgement. This is a safe-rendering compatibility check, not a Scotty UI component.

- [ ] **Step 4: Run tests and implement only spike-contract validation**

  Run `npm run test:unit -- tools/agentchattr-compatibility-spike/spike-contract.test.ts`, confirm failure, then implement validation without adding a Scotty provider or calling a production route. Implement the operator-invoked `Invoke-GuardedAutonomousSend` wrapper in `run-spike.ps1` around every autonomous test MCP send; it must persist its pre-send decision and refuse to issue the MCP request when paused. If any autonomous send can bypass interception, do not run autonomous live cases: record `unsupported` and `NO-GO`. Re-run focused and full tests; expected result is pass for the harness logic, not a claim that upstream supplies every semantic.

- [ ] **Step 5: Capture bounded live evidence and fault injection**

  Run each case separately, saving source/result records and hashes: server unavailable then reconnect from a verified cursor; token loss/rotation; rejected/failed send; event-stream gap/replay deduplication; offline queue then target reconnect; Herdr-unavailable wake refusal with no wake attempted; deletion/tombstone; service restart; and Beads write or acknowledgement failure using only the disposable test Bead. No case may advance delivery, lease, acceptance, approval, or handoff without direct evidence and verified durable acknowledgement.

  If the present Beads interface cannot atomically acknowledge/verify the required idempotency record, record `fail` for the durability gate and do not invent a helper database or modify `lib/store.ts`/`lib/schema.ts`. The result blocks production planning.

- [ ] **Step 6: Capture decision-card observation safely**

  Observe one disposable upstream decision card only if upstream supplies one. A card's upstream atomic resolution is conversational evidence only. Record it as accepted in Scotty evidence only after the Beads-first invariant in Step 3 is independently demonstrated; otherwise record conflict/pending. Do not implement a Scotty card renderer or workflow state change.

- [ ] **Step 7: Commit only spike contract/fixture/harness paths**

  Use the exact six pathspecs listed in this task. Verify `git show --stat --oneline HEAD`; an app, production lib, or unrelated path is a stop condition.

---

### Task 5: Verify Desktop clients independently and classify capability honestly

**Files:**
- Modify: `tools/agentchattr-compatibility-spike/README.md`
- Modify: `tools/agentchattr-compatibility-spike/spike-contract.test.ts`
- Modify: `tools/agentchattr-compatibility-spike/fixtures/message-contract.json`
- Modify: `docs/superpowers/evidence/2026-08-09-scotty-agentchattr-compatibility-spike/manifest.json`
- Create: `docs/superpowers/evidence/2026-08-09-scotty-agentchattr-compatibility-spike/report.md`

**Interfaces:**
- Consumes: the already proven loopback/authenticated MCP service and actual Desktop clients.
- Produces: separate `claude-desktop` and `codex-desktop` capability records with client version, read/send evidence, and explicit limitation.
- Does not produce: Desktop wake, launcher/wrapper installation, a Desktop task binding, injection, an inference from one client to another, or any production Desktop setup.

- [ ] **Step 1: Add failing classification tests**

  Add fixture tests requiring two independent records. Each record must name the execution surface, actual client/version, auth result, `chat_read` result, `chat_send` result, stored-message result, and one of `pass`, `fail`, `unsupported`, or `unknown`. A missing client must produce `unsupported`/`unknown`, never a copied result.

- [ ] **Step 2: Run the focused test and implement the report/manifest fields**

  Run `npm run test:unit -- tools/agentchattr-compatibility-spike/spike-contract.test.ts`; expected initial failure until the two independent records are represented. Add only the evidence/report fields, then rerun focused and full tests.

- [ ] **Step 3: Manually verify each actual MCP client**

  With no new launchers or automatic wake enabled, separately configure the already-running isolated loopback server only in a disposable profile/configuration root for Claude Code Desktop and then Codex Desktop. The operator must first prove that the client supports a profile/config-directory override that neither reads nor writes the normal client configuration; otherwise classify that client `unsupported` and do not add a temporary MCP entry. For each supported disposable profile, capture authenticated `chat_read`, authenticated `chat_send`, and the stored message. If configuration or operation cannot be performed safely, record why and use `unsupported` or `unknown`.

- [ ] **Step 4: Verify negative boundaries after each client attempt**

  Compare the continuous process/child, Herdr revision/input-control, trigger-queue hash, and Runtime Manager evidence with the Task 3 baseline. Any launcher, wrapper, auto-wake, spawn, injection, pane control, monitor gap, or client-profile leakage into normal configuration is a required failure even if read/send works.

- [ ] **Step 5: Commit the redacted capability evidence only**

  Use an explicit pathspec containing exactly the five listed files. Do not commit client configuration files, tokens, screenshots containing secrets, or raw server logs.

---

### Task 6: Review the gate artifact, decide go/no-go, and tear down safely

**Files:**
- Modify: `docs/superpowers/evidence/2026-08-09-scotty-agentchattr-compatibility-spike/report.md`
- Modify: `docs/superpowers/evidence/2026-08-09-scotty-agentchattr-compatibility-spike/manifest.json`
- Modify: `tools/agentchattr-compatibility-spike/README.md`

**Interfaces:**
- Consumes: all redacted evidence, result hashes, independent provenance review, and disposable-test-Bead verification.
- Produces: a reviewer-readable gate artifact and one explicit `GO` or `NO-GO` for **production planning only**, not production implementation.

- [ ] **Step 1: Write the report case matrix before assigning the result**

  Include host context; upstream URL/commit/tag/VERSION/license hash; discovered server/API/MCP version or absence; exact redacted direct-server/Runtime-Manager/MCP commands; ports and auth posture; all expected/observed results; artifact locations/hashes; process/pane/inventory comparisons; no-spawn evidence; and teardown results. For every required case classify exactly `pass`, `fail`, `unsupported`, or `unknown`.

  Required rows are: provenance/license/Windows; Runtime Manager ownership/load admission token/result; quantitative resource admission and pre-bind port recheck; loopback/auth/no-secret/sanitized-argv boundary; manual MCP `chat_send`/`chat_read`; whole-interval process/child/trigger-queue/Herdr monitor continuity; Herdr managed-pane manual participation; offline/unbound mention no-spawn; UID/pagination/reply/order/dedupe/retry/restart/deletion; queue/delivery/read vocabulary; failure/reconnect/token/event gap/Herdr-unavailable; six-message pre-MCP guard and authenticated-human-only resume; explicit binding/many-to-many/rename/role/no-implicit-binding handling; each required Beads promotion/reconciliation case; Claude Desktop disposable profile; Codex Desktop disposable profile; Jobs/Rules disabled; and teardown/deregistration/profile restoration.

- [ ] **Step 2: Perform the independent review against the approved design**

  The reviewer must verify reuse/authority boundaries, behavioral tests rather than source-shape pins, evidence artifacts rather than assertions, and timestamps proving the upstream provenance review predates executable work. They must specifically reject any branch that claims a message delivered/read, task claimed, decision accepted, approval granted, or handoff complete without the direct upstream and acknowledged Beads evidence required by the design.

- [ ] **Step 3: Apply the go/no-go rule**

  `GO` for a separately reviewed **production-planning** proposal requires `pass` for the required provenance, quantitative admission/RM token/result/port bind, Windows loopback/authenticated MCP read/send, uninterrupted no-spawn/no-injection monitoring, pre-MCP six-message guard with authenticated-human-only resume, explicit identity/many-to-many, UID/order/dedupe/retry/reconnect, and acknowledged Beads durability/reconciliation cases. Any required `fail`, `unknown`, or `unsupported` is `NO-GO`. Desktop capability may remain independently `unsupported`/`unknown`; it must be displayed honestly and cannot enable wake/launch/injection, but it must be called out as an unresolved production limitation.

- [ ] **Step 4: List production-planning blockers without solving them here**

  The report must state whether the following remain unanswered: direct Windows server invocation with every prohibited path disabled; stable UID and cursor/event semantics; explicit queue/delivery/read semantics; deterministic pagination/replay behavior; auth/token rotation behavior; a safe Runtime Manager registration lifecycle; exact durable Beads idempotency/acknowledgement/verification capability; identity binding storage/expiry/revocation; source-safe deleted-message/tombstone behavior; observability/provenance payload limits; each Desktop client's supported MCP configuration; and a separately reviewed audited Herdr wake adapter. Any unanswered required item blocks production planning.

- [ ] **Step 5: Stop, deregister, restore, and remove only verified spike-owned resources**

  Stop **and deregister** the named service through Runtime Manager, then verify with the authenticated inventory that its registration and service-owned record are absent. Remove each temporary Desktop MCP entry and credential only from the verified disposable profile roots, then verify the normal client configuration hashes and the complete process/listener/Runtime Manager inventory exactly match the preflight baseline except for documented unrelated external changes. Verify with `Get-Process` and `Get-NetTCPConnection` that processes/listeners the spike launched have exited while pre-existing user processes remain untouched.

  Inspect every proposed deletion target. Only when the service registration, Desktop profile/config root, credentials, and disposable root are proven spike-owned may the operator delete them. If any ownership, restoration, deregistration, or inventory comparison is uncertain, classify teardown `fail`, perform no deletion for the uncertain target, and report its sanitized relative identifier to the operator. Mark teardown `pass` only after all required restoration and exact-inventory verification succeeds.

- [ ] **Step 6: Final validation and constrained handoff**

  Run `npm run test:unit -- tools/agentchattr-compatibility-spike/spike-contract.test.ts`, then `npm run test:unit`, then `git diff --check`, and inspect `git status --short`. Do not run a production build or start the Scotty app. Commit only the three listed report/manifest/runbook paths with an explicit pathspec; push the spike branch for independent review, but do not merge it.

## Design self-review checklist

| Approved design requirement | Plan coverage |
| --- | --- |
| v0.5.0/c24f605/MIT pin and one-way independent review before any execution preparation | Global constraints; one-way provenance gate; immutable Task 2 check; Task 6 provenance row |
| Optional transport only; no production provider/control-plane source | Goal/architecture; boundaries; all task file limits |
| Beads-only work/durable authority; Jobs/Rules excluded | Global constraints; Tasks 2, 4, and 6 |
| Herdr pane controller only; no launcher/wrapper/injection/auto-wake/spawn | Global constraints; continuous Task 3 audit; Task 5; Task 6 |
| Runtime Manager owns registration and lifecycle/load admission | Global constraints; interfaces table; Tasks 2, 3, and 6 |
| Explicit many-to-many identity prerequisite and no implicit/reused identity | Global constraints; Task 1 fixture; Task 4 negative tests/live evidence |
| Authenticated loopback Windows MCP `chat_send`/`chat_read` | Global constraints; Task 3 MCP gate |
| Messages/channels/replies/order/dedupe/retry/reconnect/deletion | Task 1 contract; Task 4 live matrix |
| Queue/delivery/read vocabulary, pre-MCP loop pause, authenticated-human-only resume | Task 1; Task 3 offline mention; Task 4 |
| Acknowledged idempotent Beads promotion and decision outcome mirroring | Task 1 promotion record; Task 4 safe mirror; Task 6 go/no-go |
| Failure behavior and no false delivery/lease/acceptance | Global constraints; Tasks 3-4; Task 6 review |
| Independent Desktop capability honesty | Global constraints; Task 5; Task 6 blockers |
| Quantitative resource/RM/port admission, continuous monitoring, teardown/deregistration, no merge/install | Execution gate; Tasks 3 and 6 |

## Execution handoff

Plan complete and saved to `docs/superpowers/plans/2026-08-09-scotty-agentchattr-compatibility-spike.md`. This plan must receive independent review before any compatibility execution. It deliberately offers no production implementation path: a `GO` only authorizes a separately reviewed production-planning proposal.

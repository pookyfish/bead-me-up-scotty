# Scotty AgentChattr Communication Provider Design

**Date:** 2026-08-09

**Status:** Owner-approved design boundary; implementation requires a separately reviewed compatibility spike and plan

**Bead:** `better-palia-maps-b3e4t`

**Upstream evidence pin (reviewed 2026-08-09):** [bcurts/agentchattr](https://github.com/bcurts/agentchattr) at commit [`c24f605c9b24fb7a98003f7930e2d5e7a7f7d297`](https://github.com/bcurts/agentchattr/tree/c24f605c9b24fb7a98003f7930e2d5e7a7f7d297), tag `v0.5.0`, with root [`VERSION`](https://github.com/bcurts/agentchattr/blob/c24f605c9b24fb7a98003f7930e2d5e7a7f7d297/VERSION) reporting `0.5.0`. The root [`LICENSE`](https://github.com/bcurts/agentchattr/blob/c24f605c9b24fb7a98003f7930e2d5e7a7f7d297/LICENSE) at that commit contains the MIT License and a 2026 Ben Curtis copyright notice.

This pin records the upstream material assessed by this design; it is not compatibility approval. Before approving the Stage 1.5 implementation plan, running executable integration work, or reusing any upstream code or asset, the plan must record the then-current repository commit and tag, observed `VERSION` value, server/API/MCP version evidence or explicit absence, and license file/hash. A reviewer must compare that artifact with this pin, re-verify Windows compatibility and licensing obligations, and explicitly approve the result. No later stage or code/asset reuse may proceed on an unreviewed upstream revision.

## Purpose

Add AgentChattr as an optional live communication provider without turning it into a task database, terminal runtime, identity authority, or replacement UI for Scotty.

The intended relationship is:

```text
                         SCOTTY
              Mission Control / primary UI
                            │
       ┌──────────────┬─────┴─────┬───────────────┐
       │              │           │               │
     BEADS       AGENTCHATTR    HERDR            GIT
 durable work     live chat    CLI runtime   integration truth
 decisions        channels     pane control  branches/merges
 review state     mentions     wake/prompt   conflicts
```

AgentChattr's browser UI remains available as an optional side-by-side chat room and diagnostic/backup surface. Scotty remains the primary operational interface and the only place expected to combine work, communication, runtime, review, and Git state.

## Non-negotiable authority boundaries

| Concept | Authority | AgentChattr role |
|---|---|---|
| Task, dependency, status, priority, explicit assignment | Beads | Conversation may link to a Bead; never owns work state |
| Durable decision, review verdict, acceptance, human gate | Beads | Negotiation and choice presentation only |
| Handoff capsule | Beads/Crosstalk durable record | Live delivery plus source-message link |
| Live message, channel, reply, mention, chat presence | AgentChattr | Native authority for live conversation state |
| CLI process, pane, prompt, interrupt, lifecycle | Herdr | No pane or process authority |
| Desktop/CLI execution surface | Herdr, hooks, and Scotty session registry | MCP participant where supported |
| Canonical actor/session/surface binding | Scotty-local identity registry | One external identity binding |
| Supervisor appointment | `.orchestra` now; Scotty-local orchestration state later | Its role is advisory specialty only |
| Lease and task claim | Scotty-local orchestration state | May carry requests and acknowledgements only |
| Dispatch policy | Scotty-local orchestration state | Delivery transport after Scotty selects an agent |
| Git integration state | Git and Unmerged Work | No authority |

AgentChattr Jobs are disabled or ignored. A Job must never exist as an independent counterpart to a Bead. AgentChattr persistent Rules are not repository policy; `AGENTS.md`, `CLAUDE.md`, supervisor policy, and approved Scotty dispatch policy remain authoritative.

## Adoption map

### Adopt

- Channels, replies, mentions, presence, unread state, and queued-delivery state.
- A bounded per-channel agent loop guard.
- Atomic interaction inside a chat decision card.
- Stable message UIDs as external references.
- The optional AgentChattr browser UI for direct human chat.

### Adapt

- Multi-instance identities become external bindings to Scotty sessions; mutable names such as `claude-2` are never canonical.
- Decision cards become a presentation/transport mechanism whose durable result is recorded in Beads.
- Channel summaries can seed a handoff capsule but never replace the capsule.
- Structured Sessions may be trialed only for bounded conversation choreography such as debate or design critique. They do not become Scotty plans, waves, dispatch, review, or task state.

### Already covered elsewhere

- Work graph, durable decisions, review, human gates: Beads.
- Terminal and CLI session control: Herdr.
- Runtime service ownership and load admission: Runtime Manager and load guards.
- Git truth: Git and Unmerged Work.
- Cross-source session reconstruction: Scotty.

### Skip

- Jobs/task board.
- AgentChattr-owned Claude/Codex launchers and terminal injection.
- Permission-bypass launchers.
- Roles as authority or permanent orchestration identity.
- Persistent Rules as engineering policy.
- Automatically creating a channel for every Bead.
- Treating the AgentChattr UI as a replacement for Crosstalk or Mission Control.

## Runtime and wake-up design

AgentChattr's shipped Windows wrapper starts a direct CLI subprocess and injects keystrokes into its own console. That conflicts with Herdr and bypasses this workstation's load-guarded runtime policy. It is prohibited for Scotty-managed integration.

The integration must obey these rules:

1. Register the AgentChattr server as a named Runtime Manager service with a fixed per-project data directory and loopback-only ports.
2. Do not use AgentChattr launchers to start Claude or Codex.
3. Do not let AgentChattr touch a Herdr pane directly.
4. Route a mention wake request through a narrow Scotty adapter to `herdr agent prompt` for an already-running, explicitly bound pane.
5. Never spawn a new agent in response to a mention. If the target has no eligible live pane, leave the message queued and show the limitation.
6. A delivered or queued mention does not mean work started and must not create a lease.
7. Keep Desktop wake-up unsupported until separately proven. Desktop agents may still read or send through MCP if their clients support it.

The loop guard pauses after six consecutive agent-originated messages without a human message. This represents three back-and-forth rounds for two agents and gives multiparty channels the same bounded six-message budget. A human message resets the counter. Scotty surfaces a paused guard as communication attention, not task failure.

## Identity reconciliation precondition

No AgentChattr message may enter federated Crosstalk as an attributed agent message until Scotty has an explicit binding. Display-name or provider-name matching is forbidden.

```ts
interface CommunicationIdentityBinding {
  id: string;
  logicalSessionId: string;
  actorId: string;
  provider: "claude" | "codex" | string;
  model: string | null;
  executionSurface: "herdr" | "claude-desktop" | "codex-desktop" | "direct-cli" | string;
  orchestrationRole: "supervisor" | "worker" | "reviewer" | "direct" | string;
  runtimeSessionRef: string | null;
  herdrPaneId: string | null;
  agentChattrInstanceId: string;
  agentChattrDisplayName: string;
  beadsActor: string;
  bindingStatus: "verified" | "unverified" | "stale" | "revoked";
  boundAt: string;
  boundBy: string;
  validUntil: string | null;
}
```

AgentChattr presence means chat-connected. Herdr state means runtime-observed. A lease means work is claimed. These states remain separate in storage and UI.

Identity, session, execution surface, orchestration role, and Bead/task are independent, many-to-many dimensions across time; no pair is modeled as a permanent one-to-one key. In particular:

- one actor identity may use multiple logical sessions and execution surfaces;
- one long-lived logical session may handle zero, one, or many Beads, concurrently where policy permits, and may change orchestration role over its lifetime;
- one Bead may involve multiple actors, logical sessions, execution surfaces, and roles under explicit, independently tracked leases;
- role changes create time-bounded role history and do not mint or replace actor identity;
- channel membership, a reply, or a mention never implies exclusive task assignment, lease ownership, or a one-task binding; and
- provider bindings are keyed to explicit identity/session/surface evidence, never to a Bead ID or channel alone.

Renames, slot reclamation, or server restart invalidate any binding whose stable instance identity no longer matches. Scotty shows such messages as unbound until a human or verified runtime association repairs the binding.

## Crosstalk and persistence

Crosstalk becomes a federated projection with explicit provenance:

- **AgentChattr live:** messages, replies, mentions, delivery, channels, and chat presence.
- **Beads durable:** handoffs, decisions, directives, approvals, and review verdicts.
- **Herdr direct:** explicit prompt/control events when operationally relevant.

Do not copy every AgentChattr message into Beads. AgentChattr messages are persistent but mutable and deletable. Ordinary conversation and non-workflow conclusions may use a manual `Promote to Bead` action, but decision-card outcomes, review verdicts, approvals, and handoff capsules require promotion; that requirement cannot be disabled or left to operator memory.

For each required promotion, Scotty must issue one idempotent Beads write containing the outcome and promotion metadata, receive a durable artifact/comment identifier, and verify the acknowledgement against the related Bead and idempotency key before changing workflow state. Scotty must not describe a required outcome as delivered, accepted, approved, handed off, complete, or durable before that acknowledged write succeeds. Retry uses the same idempotency key and must converge on the original durable artifact rather than append a duplicate. A write, acknowledgement, or verification failure remains visibly `promotion_pending` or `reconciliation_conflict`; the mutable chat item stays linked for retry and cannot satisfy a human gate or handoff requirement.

Every required or manual `Promote to Bead` write stores one concise durable artifact containing:

- artifact type: handoff, decision, directive, review verdict, or conclusion;
- related Bead and iteration/review identifiers;
- canonical actor and session bindings at promotion time;
- concise content or capsule;
- AgentChattr instance, channel, stable message UID, and timestamp;
- promoter and promotion timestamp;
- checksum of the referenced message content for later drift detection.

Activity receives selected operational milestones such as handoff promoted, review requested, decision reconciled, mention delivery failed, or loop guard paused. Timeline receives durable workflow milestones only. Full chat remains in Crosstalk.

## Decision-card reconciliation

AgentChattr card resolution is atomic only inside AgentChattr. Workflow-affecting decisions require a Scotty-coordinated durable write:

1. Assign a stable Scotty decision ID and related Bead ID before showing the linked card.
2. On selection, atomically write the authoritative result and its promotion metadata to the Bead first using an idempotency key:
   `agentchattr:<instance>:<message-uid>:<choice>`.
3. Require an acknowledged Beads artifact identifier and verify it against the Bead, decision ID, idempotency key, and chosen value.
4. Resolve or acknowledge the AgentChattr card second.
5. Record the cross-system reconciliation result in Scotty-local orchestration state.
6. If the Beads write or acknowledgement verification fails, the card remains pending or conflicted and Scotty must not show accepted.
7. If the Beads write succeeds but AgentChattr acknowledgement fails, the durable decision stands and chat acknowledgement is retried.

Review verdicts, approvals, and handoff capsules use the same Beads-first, idempotent, acknowledged promotion invariant. A chat delivery receipt alone never constitutes delivery or acceptance of those artifacts.

Needs You displays the source and authority of each item:

- Beads human gate: durable and workflow-affecting.
- AgentChattr choice: conversational until reconciled.
- Loop guard paused: operational attention.
- Unanswered mention: communication attention.

## Provider interfaces

The first provider is read-only and optional:

```ts
interface AgentChattrObservation {
  configured: boolean;
  reachable: boolean;
  version: string | null;
  instanceId: string | null;
  channels: Array<{ id: string; name: string; unreadCount: number }>;
  participants: Array<{
    externalId: string;
    displayName: string;
    chatState: "online" | "offline" | "unknown";
    activityState: "active" | "idle" | "unknown";
    bindingId: string | null;
  }>;
  pausedChannels: string[];
  queuedMentionCount: number | null;
  unboundIdentityCount: number;
  observedAt: string;
  sourceUpdatedAt: string | null;
}
```

Messages use a separate paginated endpoint and are never embedded in the control-plane snapshot. The message cursor uses AgentChattr's integer ID only for pagination; deduplication and durable references use the message UID.

Outbound send, decision resolution, promotion, and wake-up are explicit capabilities added after read-only observation proves reliable. Automatic dispatch cannot send or wake when a human explicitly selected a different agent.

## Failure behavior

| Condition | Scotty behavior |
|---|---|
| AgentChattr not configured | `not_configured`; no health alarm |
| Server unavailable or token changed | Disconnected diagnostic; never imply delivery; reconnect only from a verified cursor |
| Event-stream gap | Re-read from REST cursor and deduplicate by message UID |
| Identity renamed/reclaimed | Mark binding unresolved; never remap by display name |
| Message deleted | Show tombstone; promoted Beads artifact remains durable |
| Offline target mentioned | Show queued only when upstream explicitly acknowledges queued state; do not show working or claimed |
| Send rejected, timed out, or exhausts retry | Show failed or unknown according to observed evidence; never synthesize delivered/read state |
| Loop guard paused | Needs You communication item; no task failure |
| Herdr unavailable | Chat may queue; no wake, process action, or lease |
| Beads result written but chat acknowledgement failed | Durable result stands; retry acknowledgement |
| Chat card resolved but Beads write failed outside Scotty | Show reconciliation conflict; do not show accepted |
| AgentChattr wrapper detected beside Herdr | Diagnostic error: duplicate runtime ownership configuration |

## Security and operational constraints

- Bind AgentChattr only to `127.0.0.1`; network mode is prohibited.
- Keep credentials and the AgentChattr data directory server-side and outside browser payloads.
- Do not expose raw tokens, configuration bodies, queue files, or absolute user paths in Scotty.
- Do not use permission-bypass launchers.
- Treat AgentChattr as a localhost convenience service, not a multi-user authorization boundary.
- Register lifecycle with Runtime Manager; Scotty does not start or stop the service directly.
- Runtime Manager load admission applies to service start/restart.
- No upstream source or UI assets are copied by this design. Any future code or asset reuse requires the reviewed provenance gate above, explicit MIT attribution, and preservation of the upstream copyright and permission notice in copies or substantial portions.

## Delivery stages

### Current Stage 1: unchanged observation foundation

Complete the existing orchestra, Herdr, Runtime Manager, hook, and Git observation foundation. AgentChattr does not become a sixth source in this milestone.

### Stage 1.5: compatibility spike

Under a separately approved implementation plan:

1. Complete and independently review the upstream provenance artifact required by the pin above. The artifact must include repository URL, exact commit and tag, `VERSION`, observed server/API/MCP version or explicit absence, root license path/hash, compatibility evidence, and the obligations for any proposed copied code or assets. A changed or unverified upstream revision blocks the spike and all later implementation until that revision is re-verified and explicitly approved.
2. On Windows, run one isolated, loopback-only AgentChattr server as a registered Runtime Manager service on non-conflicting ports. Disable AgentChattr's CLI launchers, wrapper processes, trigger-queue consumer, terminal injection, and auto-wake path before the first message test. Capture sanitized configuration and process evidence showing those paths remain disabled for the whole spike.
3. From a manually configured MCP client, prove authenticated `chat_send` and `chat_read` against the Windows AgentChattr MCP transport while the launcher, wrapper, injection, and auto-wake paths remain disabled. Capture the MCP tool requests/results and resulting stored messages. REST, WebSocket, browser, or other supported-API success may supplement this evidence but cannot satisfy the MCP gate.
4. Verify one Herdr-managed, already-running CLI participant manually reads and sends over MCP without AgentChattr owning or typing into the pane. Send a mention to an offline or unbound participant and verify that AgentChattr starts no CLI, spawns no process, injects no console input, consumes no trigger queue, and leaves Runtime Manager inventory unchanged.
5. Exercise the message contract with captured source and result records:
   - prove message UID uniqueness and stability through pagination, reconnect, server restart, retry/replay, and deletion/tombstone handling;
   - prove channel identity, reply/thread identity, and parent linkage remain stable and cannot collide across channels;
   - prove deterministic pagination/cursor ordering at boundaries, including equal or near-equal timestamps, and deduplicate overlapping pages, replayed events, and retried sends by message UID/idempotency evidence;
   - exercise offline queued delivery through target reconnect and distinguish `accepted`, `queued`, `delivered`, `read`, and `failed` only where upstream emits direct evidence for each state; and
   - mark any identity, ordering, retry, queue, delivery, or read semantic that upstream does not expose as `unsupported` or `unknown`, never inferred.
6. Perform bounded failure injection and retain pass/fail evidence for each case: server unavailable then reconnect/cursor recovery; token loss or rotation; rejected or failed send; event-stream gap and replay deduplication; offline target queue and later delivery; Herdr-unavailable wake refusal; and a reconciliation write or acknowledgement failure. No case may silently advance delivery, lease, acceptance, approval, or handoff state.
7. Generate six consecutive agent-originated messages without a human message and verify the channel pauses without a seventh autonomous message, process spawn, or terminal injection. Then send an explicit human resume message and verify the guard resets and permits the next bounded exchange. `/continue` or another upstream control may be tested, but Scotty must recognize only an authenticated human action as the resume authority.
8. Verify decision-card observation and safe Scotty rendering. Using disposable test Beads artifacts only, exercise decision outcome, review verdict, approval, and handoff-capsule promotion: each must remain pending until one idempotent atomic Beads write is acknowledged and verified; retry must not duplicate the artifact; forced write/acknowledgement failure must remain visibly pending or conflicted.
9. Verify Claude Code Desktop and Codex Desktop read/send participation independently through their actual MCP clients; record unsupported results honestly and do not infer one client from another. Desktop verification does not weaken the no-wake, no-launch, and no-injection constraints.
10. Stop the isolated service through Runtime Manager and remove only spike-owned disposable state. Do not enable production wake-up, automatic mirroring, Jobs, persistent Rules, or Structured Sessions.

The spike report is a reviewed gate artifact, not an informal note. It must identify the Windows host context, exact upstream pin, commands/configuration with secrets redacted, expected and observed results for every case above, retained evidence locations, and explicit `pass`, `fail`, `unsupported`, or `unknown` outcomes. Any failed or unknown required MCP, identity, ordering/deduplication, durability, loop-guard, reconnect, or no-autonomous-spawn case blocks later stages.

### Later stages

1. Read-only provider and Diagnostics.
2. Federated Crosstalk with explicit bindings and provenance.
3. Promotion to Beads and decision reconciliation.
4. Dispatch delivery plus audited Herdr wake bridge.
5. Session reconstruction and communication analytics.
6. Optional bounded Structured Session experiments.

## Acceptance criteria

The design is successfully implemented only when all of these remain true:

- AgentChattr can be absent without degrading core Scotty behavior.
- The user can use AgentChattr's browser UI to converse with connected agents.
- Scotty remains the primary combined control-plane UI.
- Beads remains the only task and durable workflow authority.
- Herdr remains the only component that controls or prompts Herdr panes.
- No mention launches an agent or bypasses load admission.
- No attributed message appears without an explicit canonical identity binding.
- Actor identity, session, execution surface, orchestration role, and Bead/task retain many-to-many cardinality; no chat event creates exclusive assignment or a permanent one-task binding.
- Decision-card outcomes, review verdicts, approvals, and handoff capsules are not accepted, delivered, approved, or complete until mandatory idempotent Beads promotion is atomically written, acknowledged, and verified.
- Required promoted artifacts survive AgentChattr deletion or outage; failed promotion remains visibly pending or conflicted.
- Desktop capabilities are displayed honestly and independently.
- Every cross-source state is labeled with provenance and failure/reconciliation status.

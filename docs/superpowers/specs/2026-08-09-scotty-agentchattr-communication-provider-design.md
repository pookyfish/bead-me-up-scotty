# Scotty AgentChattr Communication Provider Design

**Date:** 2026-08-09

**Status:** Owner-approved design boundary; implementation requires a separately reviewed compatibility spike and plan

**Bead:** `better-palia-maps-b3e4t`

**Upstream reference:** [bcurts/agentchattr](https://github.com/bcurts/agentchattr), currently MIT-licensed

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

Renames, slot reclamation, or server restart invalidate any binding whose stable instance identity no longer matches. Scotty shows such messages as unbound until a human or verified runtime association repairs the binding.

## Crosstalk and persistence

Crosstalk becomes a federated projection with explicit provenance:

- **AgentChattr live:** messages, replies, mentions, delivery, channels, and chat presence.
- **Beads durable:** handoffs, decisions, directives, approvals, and review verdicts.
- **Herdr direct:** explicit prompt/control events when operationally relevant.

Do not copy every AgentChattr message into Beads. AgentChattr messages are persistent but mutable and deletable, so important outcomes require an explicit promotion workflow.

`Promote to Bead` stores a concise durable artifact containing:

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
2. On selection, write the authoritative result to the Bead first using an idempotency key:
   `agentchattr:<instance>:<message-uid>:<choice>`.
3. Resolve or acknowledge the AgentChattr card second.
4. Record the cross-system reconciliation result in Scotty-local orchestration state.
5. If the Beads write fails, the card remains pending and Scotty must not show accepted.
6. If the Beads write succeeds but AgentChattr acknowledgement fails, the durable decision stands and acknowledgement is retried.

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
| Server unavailable or token changed | Disconnected diagnostic; never imply delivery |
| Event-stream gap | Re-read from REST cursor and deduplicate by message UID |
| Identity renamed/reclaimed | Mark binding unresolved; never remap by display name |
| Message deleted | Show tombstone; promoted Beads artifact remains durable |
| Offline target mentioned | Show queued; do not show working or claimed |
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
- No upstream source or UI assets are copied by this design. Any future code reuse requires explicit MIT attribution and license preservation.

## Delivery stages

### Current Stage 1: unchanged observation foundation

Complete the existing orchestra, Herdr, Runtime Manager, hook, and Git observation foundation. AgentChattr does not become a sixth source in this milestone.

### Stage 1.5: compatibility spike

Under a separately approved implementation plan:

1. Run one isolated, loopback-only AgentChattr server under Runtime Manager on non-conflicting ports.
2. Disable its CLI launchers and terminal injection.
3. Verify authenticated read/send through MCP or supported APIs without a wrapper.
4. Verify one Herdr-managed CLI participant manually reads and sends without AgentChattr owning the pane.
5. Verify Claude Code Desktop and Codex Desktop participation independently; do not infer support.
6. Verify decision-card observation and safe Scotty rendering.
7. Determine whether upstream needs a stable scoped observer credential or version endpoint.
8. Stop the spike without enabling production wake-up or mirroring.

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
- Important decisions, verdicts, and handoffs survive AgentChattr deletion or outage through Beads promotion.
- Desktop capabilities are displayed honestly and independently.
- Every cross-source state is labeled with provenance and failure/reconciliation status.

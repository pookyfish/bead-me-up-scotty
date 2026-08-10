# AgentChattr compatibility spike evidence contract

This directory contains only the disposable Stage 1.5 evidence contract. It is
not an AgentChattr installation, launcher, service registration, Desktop/MCP
configuration, or production transport.

The contract accepts only redacted, loopback-only evidence. It records `pass`,
`fail`, `unsupported`, and `unknown`; none of those classifications implies a
delivery, read, work start, lease, acceptance, approval, handoff, or identity
binding without direct evidence.

## Safety boundary

- AgentChattr owns only conversational message evidence. Beads remains the
  durable task and decision authority; Herdr remains the sole pane controller.
- A service, if later approved, must be registered, started, stopped, and
  inventoried only by Runtime Manager. This contract makes no lifecycle call.
- Every endpoint must bind to `127.0.0.1`. Network mode, wrappers, trigger
  queue consumers, terminal injection, auto-wake, Jobs authority, persistent
  Rules, and raw command lines are prohibited.
- Evidence retains only executable basenames, PID/start time, a sanitized argv
  template with `<data-dir>`, `<port>`, and `<secret>` placeholders, and its
  stable hash. Tokens, raw configuration, queue contents, absolute user paths,
  and raw command lines must not be committed. Validation is recursive and
  checks both normalized key names and embedded values; alternate labels do not
  bypass the boundary.

## Contract vocabulary

Messages require provider instance, channel, stable UID, integer cursor,
parent/thread linkage, external sender ID, content checksum, and one of:
`accepted`, `queued`, `delivered`, `read`, `failed`, `unknown`, or
`unsupported`. A cursor is pagination-only and cannot be a durable UID.
`accepted`, `queued`, `delivered`, and `read` each require direct upstream
evidence. A mention or queued message never indicates work or a lease.

Identity is explicit and many-to-many: actor, logical session, execution
surface, role, runtime session, upstream instance/session/external identity,
provider/model, Beads actor, and explicit Bead cardinality remain separate.
Display names, channel membership, replies, mentions, roles, and Bead IDs never
create a binding. Only a complete verified exact binding may attribute a
message; a missing or mismatched dimension remains unbound.

The per-channel loop guard begins at `active(0)`. The first five autonomous
requests remain active; the sixth is allowed only after its pre-MCP decision
records `active(5) -> paused(6)`. A seventh request is rejected before MCP and
remains paused. Only directly evidenced, authenticated, verified human-origin
activity for that channel resets to `active(0)`; agent text, `/continue`, and
unauthenticated events do not reset it.

Promotions require a Bead ID, Scotty decision ID, artifact type, selected value
checksum, canonical `agentchattr:<instance>:<message-uid>:<choice>` idempotency
key, Beads artifact ID, and acknowledged/verified timestamps. Until that
matching Beads evidence exists, the result is `promotion_pending` or
`reconciliation_conflict`, never durable. Both acknowledgement and
reconciliation must repeat the exact Beads artifact, Bead, decision,
idempotency key, checksum, and corresponding timestamp; retries converge on
that same artifact.

Evidence-record classification is limited to `pass`, `fail`, `unsupported`,
and `unknown`. Delivery/read observations belong only to the message contract
and require direct evidence. Evidence fields that claim inferred delivery,
read, work, lease, task, approval, handoff, or identity authority are rejected.

## Operator stop conditions

Stop and record `fail`, `unsupported`, or `unknown` if the upstream pin differs
from the approved provenance, a required monitor/evidence record is missing,
the service is not loopback-only, raw secrets are present, Runtime Manager is
not the lifecycle owner, or any prohibited pane/process/queue path is observed.
No file in this Task 1 directory starts a process or contacts an external
service.

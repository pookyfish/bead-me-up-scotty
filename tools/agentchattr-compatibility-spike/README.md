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
  and raw command lines must not be committed.

## Contract vocabulary

Messages require provider instance, channel, stable UID, integer cursor,
parent/thread linkage, external sender ID, content checksum, and one of:
`accepted`, `queued`, `delivered`, `read`, `failed`, `unknown`, or
`unsupported`. A cursor is pagination-only and cannot be a durable UID.
`accepted`, `queued`, `delivered`, and `read` each require direct upstream
evidence. A mention or queued message never indicates work or a lease.

Identity is explicit and many-to-many: actor, logical session, execution
surface, role, runtime session, upstream instance/external identity, and Beads
actor remain separate. Display names, channel membership, replies, mentions,
roles, and Bead IDs never create a binding. Only a verified exact binding may
attribute a message.

Promotions require a Bead ID, Scotty decision ID, artifact type, selected value
checksum, canonical `agentchattr:<instance>:<message-uid>:<choice>` idempotency
key, Beads artifact ID, and acknowledged/verified timestamps. Until that
matching Beads evidence exists, the result is `promotion_pending` or
`reconciliation_conflict`, never durable.

## Operator stop conditions

Stop and record `fail`, `unsupported`, or `unknown` if the upstream pin differs
from the approved provenance, a required monitor/evidence record is missing,
the service is not loopback-only, raw secrets are present, Runtime Manager is
not the lifecycle owner, or any prohibited pane/process/queue path is observed.
No file in this Task 1 directory starts a process or contacts an external
service.

# AgentChattr compatibility spike evidence contract

This directory contains only the disposable Stage 1.5 evidence contract. It is
not an AgentChattr installation, launcher, service registration, Desktop/MCP
configuration, production transport, or control-plane integration.

## Version and authority boundary

The contract accepts only strict schema version 2. Version 1 and every unknown
version fail as `unsupported_schema_version`; there is no migration,
compatibility parser, recursive heuristic scan, or fallback. Normal objects are
closed typed structures. The optional flat, bounded `extensions` object is the
only extension point. Extension keys and scalar values are structurally
restricted, then treated as opaque and nonsemantic: they never affect
authority, attribution, durability, workflow, classification, or identity.

AgentChattr may supply live conversation evidence only. Beads remains the only
durable authority for tasks, dependencies, assignments, decisions, approvals,
review verdicts, directives, handoffs, and human gates. Herdr remains the only
controller of Herdr panes and already-running CLI agents. Runtime Manager
remains the only lifecycle owner for a disposable AgentChattr server, and Git
remains authoritative for branch and integration state.

The manifest records `pass`, `fail`, `unsupported`, and `unknown`. A
classification never implies delivery, read state, work, a lease, acceptance,
approval, handoff, identity binding, or durable state without the corresponding
typed direct evidence.

## Typed evidence model

Evidence is a closed union of configuration boundaries, monitor intervals,
runtime observations, runtime control actions, MCP exchanges, message
observations, identity bindings, loop-guard transitions, Beads promotions,
Desktop capabilities, and teardown records. Unknown fields fail structurally.

Message observations keep the stable message UID independent from the integer
pagination cursor. Their transport, receiver acknowledgement, and read axes are
separate. Server acceptance, submission, queueing, explicit receiver
acknowledgement, read state, peer acceptance, and durable Beads promotion are
never inferred from one another. Replay, overlap, restart, and tombstone
evidence reuse the exact durable tuple: provider instance, channel, stable UID,
sender, content checksum, parent UID, and thread ID.

Identity is explicit and many-to-many. Actor, logical session, execution
surface, orchestration role, provider/model metadata, Herdr session,
AgentChattr instance/session/external identity, Beads actor, validity interval,
and Bead relation remain independent dimensions. Display names, channels,
replies, mentions, roles, and Bead IDs do not create a binding. Only one exact,
complete `verified` binding covering the observation time may attribute a
message.

The per-channel loop guard starts at `active(0)`. The first five autonomous
requests remain active; the sixth records `active(5) -> paused(6)` before MCP.
A seventh request is rejected before MCP. Only directly evidenced,
authenticated, verified human activity for that channel resets the guard.

## Runtime provider boundary

The outer evidence kinds `runtime_observation` and
`runtime_control_action` are provider-neutral. Schema version 2 nevertheless
admits only strict Herdr payloads with `runtimeProvider: "herdr"`. Adding a
runtime provider or payload requires a reviewed schema-version change; it
cannot be done with `extensions`.

Direct Herdr observation is the foundational runtime evidence path. The Herdr
Telemetry Bridge is an optional observation adapter and never replaces direct
observation. Herdr Mesh is an optional control adapter. Direct and telemetry
observations remain independent; disagreement is retained as `unknown` rather
than merged into invented state. Neither telemetry nor mesh becomes task,
identity, or lifecycle authority.

Every control operation has a stable action UUID, correlation UUID,
idempotency-key digest, and immutable request tuple across retries and adapter
fallback. Each execution has its own attempt UUID and increasing attempt
number. Request, authorization, execution, verification, acknowledgement, and
reconciliation are distinct append-only states:

- provider success means only that the provider reported acceptance or
  application;
- verification requires later matching observation or reviewed artifact;
- acknowledgement requires direct target acknowledgement when applicable; and
- reconciliation separately decides whether a new attempt is safe.

Automatic retry is locked after execution succeeds, application is verified,
execution or verification times out or remains unknown, acknowledgement is
pending or unknown, or the outcome remains unverified. A new mutating attempt
requires proof that the prior attempt was not applied plus explicit retry
authorization, or a separately reviewed provider-idempotency contract. Unknown
mutating outcomes with unsupported or unknown provider idempotency require
human reconciliation. An acknowledgement is reconciled separately and never
causes the control operation to be resent.

Meaningful mesh or direct-Herdr delivery cannot remain only in a pane or mesh
response. Tasks, review requests/results, decisions, directives, and handoffs
marked for durable promotion require an exact `beads_promotion` record linking
the same correlation/action set to one durable Beads artifact. Crosstalk
delivery uses the same durable promotion boundary; conversational delivery is
not durable authority by itself, and retries must converge on the same Beads
artifact.

## Redaction and execution boundary

Committed evidence stores only declared safe references, bounded metadata, and
artifact digests. It stores no raw transcript, pane output, thinking text,
command line, command, tool input/output, queue content, absolute path,
repository/session path, token, credential, configuration, or raw Herdr host
event. The schema enforces this by admitting only the declared typed fields and
safe extension scalars; extensions are never interpreted for hidden meaning.

Any future execution must remain loopback-only, use Runtime Manager lifecycle
ownership, pass the approved provenance and resource-admission gates, observe
all prohibited paths explicitly, monitor the full interval, and complete exact
teardown evidence. This repository template is deliberately `not_run` and
executable-free.

## Task 2 configuration-boundary audit

Task 2 began after the independent schema-version-2 review passed. The audit
used a disposable source checkout of the approved pin only. It performed no
dependency installation, server start, MCP request, Desktop configuration,
Herdr control, or Runtime Manager mutation. The committed manifest therefore
correctly remains the strict `not_run` envelope; measured admission or safety
evidence would be false before an actual managed run.

The pinned source exposes this sanitized direct-server argv shape:

```yaml
executable: python
argv:
  - run.py
  - --data-dir
  - <data-dir>
  - --port
  - <port>
  - --mcp-http-port
  - <port>
  - --mcp-sse-port
  - <port>
  - --upload-dir
  - <data-dir>
```

The token is generated in memory by `run.py`; it is not a command-line value
and must never be copied into evidence. `--allow-network` is deliberately
absent. Reproducible Windows pin verification must disable checkout line-ending
conversion before materializing the pinned files so the working-tree license
bytes retain the independently approved upstream hash.

| Required boundary | Source/audit result | Task 2 decision |
| --- | --- | --- |
| Approved commit, tag, version, and MIT license hash | Exact match after line-ending-safe checkout | satisfied |
| Quantitative resource and candidate-port preflight | Thresholds passed; candidate loopback port was free | satisfied for preparation only |
| Named Runtime Manager lifecycle | The installed Runtime Manager uses a deliberately fixed service manifest and exposes no dynamic register/deregister API | unsupported; do not modify production Runtime Manager in this spike |
| Runtime Manager admission correlation | Starts return a stable operation ID and run load admission, but only for fixed registered services | unavailable for a disposable AgentChattr service |
| Direct server invocation | `run.py` accepts isolated data, web, MCP, and upload locations | source-supported, not executed |
| Loopback-only bind | The pinned default is `127.0.0.1`; non-loopback requires the omitted network override and confirmation | source-supported, not executed |
| Authentication | The pinned server generates an in-memory session token | source-supported, not executed |
| Launcher and wrapper bypass | Direct `run.py` avoids launcher/wrapper entry points | source-supported, not executed |
| Trigger consumer, terminal injection, and auto-wake disabled | `run.py` initializes configured agents/router behavior and announces automatic mention triggering; no direct-server disable flag was found | unsupported |
| Jobs and persistent Rules disabled | `run.py` initializes both stores and exposes them to the app/MCP surface; no disable flag was found | unsupported |

The result is **NO-GO before service execution** under the approved spike
boundary. Starting the pinned server would require either pretending the fixed
Runtime Manager owns an unregistered process or accepting auto-trigger and
Jobs/Rules behavior that the design explicitly prohibits. Neither is allowed.
The next action is a separately reviewed boundary decision—such as a disposable
Runtime Manager recipe plus an upstream-supported safe-mode configuration—not
an installation or launch hidden inside this spike.

Nothing here authorizes AgentChattr, a production provider, MCP, Desktop,
Herdr Telemetry Bridge, Herdr Mesh, or Runtime Manager execution.

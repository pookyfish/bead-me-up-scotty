# Control-plane observation sources

The control plane is a read-only observation boundary. It reports evidence about five independently acquired sources; it does not become the authority for work, dispatch, runtime lifecycle, or session control. Beads remains the task, dependency, comment, and status authority.

| Source | Acquisition | Authority | Timeout | Signal | Explicit limitation |
| --- | --- | --- | ---: | --- | --- |
| Orchestra | Project `.orchestra/state.json` | Coordination | 7000 ms aggregate GET deadline | `state.json` watcher | Bounded projections, not process health |
| Herdr | `herdr api snapshot`, protocol 19 | Managed sessions | 3000 ms | Stage 2 polling | Not supervisor authority |
| Runtime Manager | Authenticated `GET /health` and `GET /services` | Named services | 2000 / 8000 ms, also capped by aggregate deadline | Stage 2 polling | A foreign service is not owned |
| Hooks | Redacted project-local settings and referenced-file presence | Configured project hooks | 7000 ms aggregate GET deadline | Stage 2 polling | Global Codex coverage is unknown |
| Git | Strict health-command allowlist | Repository health | 5000 ms total; 2000 ms per command | Stage 2 polling | Not full Unmerged Work analysis; the existing merge-tree use is an honestly named neutral runner that can write objects |

## Snapshot, freshness, and invalidation

The Stage 1 `GET /api/p/:projectId/control-plane` has a **7000 ms aggregate deadline**. Source failures are isolated: a timed-out or rejected adapter is represented as that source's unavailable observation while the other sources remain observable. A source acquired successfully in the request is `live`; a validated unchanged orchestra file cache hit is `cached`; retained data after a failed acquisition is `stale`; and no trustworthy data is `unknown`.

The snapshot contains no Beads collection, task summary, or Beads API call. Stage 2 is the polling/query consumer: it joins this snapshot with the existing Beads React Query cache rather than creating a second task store or status model.

The only Stage 1 control-plane invalidation stream is the orchestra watcher. It watches the project `.orchestra` directory non-recursively, filters to `state.json`, coalesces changes for 200 ms, and emits the signal-only payload `orchestra`. The pre-existing Beads stream remains separate and continues to emit its own signal; both streams use the one global SSE shutdown registry. Signals carry no source state. No source grants dispatch authority.

## Source contracts and diagnostic codes

Every source reports provenance (`source`, `authority`, observation time, freshness, capability, and declared observation capabilities). Stable observation error codes are `not_configured`, `unavailable`, `unauthorized`, `timeout`, `parse_error`, `unsupported_version`, `incomplete_observation`, and `dependency_unavailable`. The following lists the codes each implemented adapter can produce directly; the snapshot wrapper can additionally represent an adapter that exceeds the aggregate deadline as `timeout`, or a rejected adapter as `unavailable`.

### Orchestra — coordination

The Orchestra adapter reads only the resolved `.orchestra/state.json` path. It accepts schema version 2, parses current sections independently, and exposes bounded, client-safe projections. Valid current records survive malformed history; integration history is bounded and projected, rather than treated as current work.

- `not_configured`: the state file is absent.
- `unavailable`: the file cannot be inspected.
- `parse_error`: the file is invalid JSON or its root is malformed.
- `unsupported_version`: the top-level schema version is unsupported.
- `incomplete_observation`: a valid projection contains rejected records or an invalid supervision checkpoint.

The orchestra watcher is an invalidation hint only. It does not prove that an agent process is healthy, running, idle, or supervised.

### Herdr — managed sessions

Herdr is observed with `herdr api snapshot`, a 3000 ms `execFile` budget and a 4 MiB output limit. The response must be a `session_snapshot` envelope at protocol 19. Sessions are kept distinct even when their actor, provider, or display labels match, and only sessions whose current working directory is inside the project are projected.

- `not_configured`: Herdr is absent from `PATH`.
- `timeout`: the command times out or is aborted.
- `unavailable`: execution fails or its output exceeds the read budget.
- `parse_error`: JSON, envelope, or protocol-19 snapshot shape is invalid.
- `unsupported_version`: the snapshot protocol is not 19.

Herdr reports managed-session evidence. It is not supervisor authority and does not prompt, focus, stop, launch, or otherwise control a session.

### Runtime Manager — named services

Runtime Manager is queried only on authenticated loopback HTTP using the project-local token. It performs `GET /health` with a 2000 ms budget and `GET /services` with an 8000 ms budget. Both requests are also cut short by the Stage 1 aggregate deadline. The token and raw response bodies never cross the wire.

- `not_configured`: the token is absent or empty.
- `unauthorized`: the token is rejected.
- `timeout`: either bounded request is aborted or exceeds its read budget.
- `unavailable`: the manager cannot be reached or returns an unsuccessful response.
- `parse_error`: either response is malformed or invalid JSON.

The adapter can retain a successfully read health identity with a degraded, null service inventory. A reported `foreign` service is deliberately not claimed, adopted, or controlled by Scotty.

### Hooks — configured project hooks

Hook coverage reads only project-local `.claude/settings.json` and `.codex/hooks.json`, then reports redacted executable basenames and safe project-relative file references when applicable. It never exposes a raw command, secret, environment value, or absolute external path. Global Codex hook coverage remains explicitly `unknown`.

- `not_configured`: neither project configuration file exists.
- `parse_error`: a configuration file or hook structure is malformed.
- `unavailable`: configuration or a referenced file cannot be inspected.
- `incomplete_observation`: a configured project-local file is missing.

This source observes configuration only. It does not execute hooks or infer their global coverage.

### Git — repository health

Git health is limited to an exact allowlist: work-tree detection, symbolic HEAD, short HEAD, porcelain status, base-ref verification, ahead/behind comparison, and unmerged local-branch enumeration. Its per-command timeout is 2000 ms and its aggregate timeout is 5000 ms. Any command outside that allowlist is rejected before execution.

- `timeout`: the aggregate or a child read is aborted.
- `unavailable`: the path is not a work tree or a required allowed read fails.
- `incomplete_observation`: repository basics are known but no main/master base reference is available for comparisons.

This is intentionally not the Unmerged Work feature. That existing feature retains its separately named neutral Git runner for `merge-tree --write-tree`, which may write Git objects and is therefore not presented as read-only.

## Derived supervisor continuity

Continuity is a derived diagnostic over current Orchestra `active_work`; it is not a sixth authority source and is not task state. It examines every present, versioned `supervision` checkpoint independently. A live implementation lane cannot suppress an unrelated checkpointed planning, transition, correction, or review lane. Legacy or terminal integration history is outside this evaluator.

The evaluator produces only these diagnostic codes:

- `supervisor_continuity_stalled` — an `approved_incomplete` checkpoint has passed its transition deadline and the exact required Herdr binding was conclusively observed as not working.
- `supervisor_owner_update_overdue` — an `approved_incomplete` checkpoint has passed its owner-update deadline. This can coexist with live worker evidence.
- `supervisor_continuity_unproven` — continuity cannot be established from available, exact evidence. This includes unavailable coordination data, invalid checkpoints, missing phase bindings, unavailable or degraded Herdr, an exact Herdr `unknown` status, and every declared non-Herdr surface (Codex collaboration, Desktop, external, or another undeclared source).

Stage 1 can conclusively resolve only an exact `{ source: "herdr", surface: "herdr", session_id }` binding against a complete available Herdr snapshot. Actor identity, provider, display name, pane title, role, or an old session are never substitutes for that exact binding. For `planning` and `handoff` the supervisor binding is required; for `implementation` and `correction` the worker binding is required; for `review` the reviewer binding is required; and `transition` declares no active execution owner. `working` is the sole live Herdr status; `idle`, `blocked`, `done`, and a missing exact session are not-working; `unknown` is unproven.

Valid `paused`, `blocked`, and `complete` checkpoints suppress all three continuity codes, even if they retain old deadlines. A missing usable Orchestra projection emits one unproven coordination diagnostic instead of an empty passing result. The evaluator does not invent diagnostics for active work that has no checkpoint.

Every continuity message uses the stable plain-language form below, with the checkpoint's declared `nextAction` inserted verbatim:

```text
Approved plan <bead-id-or-work-key> is unfinished after <stage>; no active worker or reviewer was proven before the transition deadline. Next action: <nextAction>
Approved plan <bead-id-or-work-key> has not received its required owner update. Next action: <nextAction>
Supervisor continuity for <bead-id-or-work-key> cannot be proven. Next action: <nextAction>
Supervision checkpoint for <bead-id-or-work-key> is invalid, so approved-plan continuity cannot be proven. Next action: replace the invalid SUPERVISION-CHECKPOINT/v1 record before supervisor exit
Coordination observation is unavailable, so supervisor continuity cannot be proven. Next action: restore a valid orchestra observation before supervisor exit
```

## Checkpoint contract

The on-disk checkpoint is the nested snake_case `active_work.<work-key>.supervision` object at `schema_version: 1`; client projection is camelCase. Flat experimental session keys (`supervisor_session_id`, `worker_session_id`, `reviewer_session_id` and their camelCase variants) make the checkpoint invalid rather than being migrated or inferred. Unknown non-legacy fields are ignored and invalid raw values are never serialized.

Writers, not Scotty, own checkpoint creation and handoff. They must write only non-secret, control-character-free text; use a normalized project-relative `plan_path` (no drive/UNC/absolute path, backslash, empty/dot/parent segment); and retain the supervisor-declared `next_action` exactly. The action is coordination state, not a Scotty-created task and never automatic dispatch authorization.

All text is bounded and rejects ASCII control characters. Bindings are either null or the exact source/surface pair plus a nonempty exact `session_id`. The checkpoint validates a nonnegative `handoff_generation`, nonnegative counts, and ISO timestamps. `approved_incomplete` requires `total_stages > 0`, `completed_stages < total_stages`, and canonical non-null transition and owner-update deadlines. `complete` requires a positive total and equal counts; `paused` requires a nonempty pause reason; and `blocked` requires a nonempty blocker. A handoff increments its generation and replaces the exact supervisor binding; liveness is then tested against that new binding, never a same-named old session.

Scotty reads, projects, and diagnoses this contract only. It never writes a checkpoint, changes a Bead, dispatches an agent, or controls a runtime.

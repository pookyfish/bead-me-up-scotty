# AgentChattr Compatibility Spike — Upstream Provenance Gate

**Purpose:** Read-only provenance evidence for the Stage 1.5 compatibility-spike plan. This is not executable-spike evidence, an installation record, or compatibility approval.

## One-way approval gate

No clone, dependency installation, service registration/start, process monitoring, Desktop configuration, MCP registration/call, or message test may begin until an independent reviewer records an explicit approval below. The reviewer must re-check this artifact against the approved design pin and either approve this exact material or reject it. A changed/missing/unverifiable revision, license, or required source evidence is a blocker; it is not a reason to substitute another revision.

| Field | Value |
| --- | --- |
| Retrieval UTC | `2026-08-10T07:08:02.5497771Z` |
| Retrieval method | Public GitHub REST API and `raw.githubusercontent.com` only; no clone, download to disk, executable, local checkout, package install, service, or MCP client was used. |
| Repository URL | `https://github.com/bcurts/agentchattr` |
| Approved tested pin | Tag `v0.5.0`, commit `c24f605c9b24fb7a98003f7930e2d5e7a7f7d297`, root `VERSION` `0.5.0` |
| Current default branch | `main` at `c24f605c9b24fb7a98003f7930e2d5e7a7f7d297` (GitHub API commit date `2026-07-26T15:30:01Z`) |
| Current default-branch `VERSION` | `0.5.0` |
| Latest tag and release | `v0.5.0` at `c24f605c9b24fb7a98003f7930e2d5e7a7f7d297`; latest GitHub release tag `v0.5.0`, published `2026-07-26T15:30:44Z` |
| Pin/current relationship | **Same.** The default branch, latest tag/release, and observed root `VERSION` matched the approved pin at retrieval time. This must be re-checked immediately before any executable spike work. |
| Root license | `LICENSE`, SHA-256 `a1abc583f6725867ed3564f1bcd201d78603612330665433a733a640721f40f3` |
| License conclusion | The retrieved root file identifies the MIT License and a 2026 Ben Curtis copyright notice. No upstream code or asset is authorized for copying by this spike; any later reuse needs separate approved provenance, required attribution, and preservation of the copyright and permission notice. |

## Authoritative retrieval endpoints

- Repository metadata: `https://api.github.com/repos/bcurts/agentchattr`
- Pinned commit: `https://api.github.com/repos/bcurts/agentchattr/commits/c24f605c9b24fb7a98003f7930e2d5e7a7f7d297`
- Current default-branch commit: `https://api.github.com/repos/bcurts/agentchattr/commits/main`
- Tags: `https://api.github.com/repos/bcurts/agentchattr/tags?per_page=20`
- Latest release: `https://api.github.com/repos/bcurts/agentchattr/releases/latest`
- Pinned root version: `https://raw.githubusercontent.com/bcurts/agentchattr/c24f605c9b24fb7a98003f7930e2d5e7a7f7d297/VERSION`
- Pinned root license: `https://raw.githubusercontent.com/bcurts/agentchattr/c24f605c9b24fb7a98003f7930e2d5e7a7f7d297/LICENSE`

## Source-interface evidence at the approved pin

Line references below identify behavior discovered through pinned GitHub raw files. They are descriptions, not copied upstream source.

| Area | Pinned source path and lines | Evidence and spike implication |
| --- | --- | --- |
| Direct server and bind policy | `run.py:27-31, 125-162`; `config.toml:3` | The direct entry point accepts MCP-port and network-related flags, derives the web bind host from configuration, and starts the FastAPI/uvicorn server. The default configuration uses `127.0.0.1`; non-localhost binding requires the upstream network override. The future spike must use only the direct server path through Runtime Manager and re-check the bind immediately before start. |
| Local request/origin policy | `app.py:176-193` | The application includes localhost/loopback origin and client-address checks. This is localhost-convenience evidence only, not proof of a multi-user authorization boundary or authenticated MCP mutation. |
| MCP surface | `mcp_bridge.py:193-408` (`chat_send`); `mcp_bridge.py:559-658` (`chat_read`); `mcp_bridge.py:930-951` (tool/server wiring); `README.md:309-354` (manual client examples) | The pinned source and upstream documentation identify `chat_send` and `chat_read`, and a loopback MCP HTTP example. The plan must prove authentication and the actual tool schemas from a manually configured client; this review found no separately versioned server/API/MCP protocol declaration in the inspected root/version, README, `run.py`, `app.py`, `mcp_bridge.py`, or `config.toml`. Record that independent version evidence as **absent**, not inferred from `VERSION`. |
| Message, trigger, and loop behavior | `app.py:664-718`; `router.py:83-101`; `config.toml:99`; `README.md:116-123, 232, 283-285` | Upstream routes new messages/mentions and has its own configurable hop guard plus `/continue` behavior. Its configured default is four hops, not Scotty's required six-message guard. The future spike therefore needs a separate pure Scotty guard and pre-send interceptor; upstream control text cannot reset it. |
| Trigger queue and wrapper | `agents.py:1-78`; `wrapper.py:454-545, 574-901` | Upstream contains a trigger-queue writer and wrapper queue watcher/heartbeat path. Their presence is a compatibility risk, not permission to use them. The spike must prove those paths are disabled or unused continuously; no launcher/wrapper process is permitted. |
| Windows pane injection/direct subprocess | `wrapper_windows.py:144-191, 256-330, 411-424`; `wrapper.py:1-17` | The pinned Windows wrapper uses console-input injection and starts a direct agent subprocess. This conflicts with Scotty's Herdr-only pane-control boundary. The wrapper is prohibited, and any detected injection/subprocess child invalidates the no-spawn result. |
| Jobs and Rules | `mcp_bridge.py:23-27, 112-123`; `README.md:128-142, 295` | Upstream exposes Jobs/Rules-related state/tooling. Scotty must not create, read as authority, or use either for work state/policy. They are a negative test/monitor target only. |

## Windows compatibility conclusion and limitations

The pinned upstream documents a Windows direct-server route and a loopback default, so Windows execution is not ruled out at provenance-review time. It also documents Windows wrappers that auto-start agents and use console-input injection; those facilities are incompatible with the approved Scotty boundary and remain prohibited.

No read-only source inspection in this artifact proves all of the following: an authenticated `chat_send`/`chat_read` path that works without a wrapper, a direct-server configuration that prevents all trigger-queue consumption/auto-wake, stable UID/cursor semantics, or safe independent Claude Code Desktop and Codex Desktop participation. Those are required executable-spike questions. If a reviewer cannot approve the narrowed direct-server/no-wrapper test design from this evidence, the correct outcome is reject/hold, not a live trial.

## Independent review record

| Item | Required before executable work |
| --- | --- |
| Reviewer identity and UTC approval | **Pending — no executable work authorized.** |
| Pin/current comparison repeated | **Pending.** |
| License/MIT obligations confirmed | **Pending.** |
| Windows direct-server/no-wrapper boundary approved | **Pending.** |
| Result | **HOLD: provenance captured; independent approval has not occurred.** |

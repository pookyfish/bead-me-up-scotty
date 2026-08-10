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
| Direct server and bind policy | `run.py:22-28, 114-148, 154-162`; `config.toml:1-4` | The direct entry point accepts the data/web/MCP port overrides, derives the web bind host from configuration, and starts the FastAPI/uvicorn server. The default configuration uses `127.0.0.1`; non-localhost binding requires the upstream network override. The future spike must use only the direct server path through Runtime Manager and re-check the bind immediately before start. |
| Local request/origin policy | `app.py:170-206` | The application includes localhost/loopback origin and client-address checks. This is localhost-convenience evidence only, not proof of a multi-user authorization boundary or authenticated MCP mutation. |
| MCP surface | `mcp_bridge.py:182-220` (identity resolution and `chat_send`); `mcp_bridge.py:559-658` (`chat_read`); `mcp_bridge.py:929-962` (tool list, loopback MCP server, HTTP/SSE runners); `README.md:309-354` (manual client examples) | The pinned source and upstream documentation identify `chat_send` and `chat_read`, and a loopback MCP HTTP example. The plan must prove authentication and the actual tool schemas from a manually configured client; this review found no separately versioned server/API/MCP protocol declaration in the inspected root/version, README, `run.py`, `app.py`, `mcp_bridge.py`, or `config.toml`. Record that independent version evidence as **absent**, not inferred from `VERSION`. |
| Message, trigger, and loop behavior | `app.py:664-720`; `router.py:83-88`; `config.toml:96-102`; `README.md:116-123, 232, 283-285` | Upstream routes new messages/mentions and has its own configurable hop guard plus `/continue` behavior. Its configured default is four hops, not Scotty's required six-message guard. The future spike therefore needs a separate pure Scotty guard and pre-send interceptor; upstream control text cannot reset it. |
| Trigger queue and wrapper | `agents.py:32-54, 56-78`; `wrapper.py:1-19, 454-545, 574-901` | Upstream contains a trigger-queue writer and wrapper queue watcher/heartbeat path. Their presence is a compatibility risk, not permission to use them. The spike must prove those paths are disabled or unused continuously; no launcher/wrapper process is permitted. |
| Windows pane injection/direct subprocess | `wrapper_windows.py:140-195, 256-335, 410-429`; `wrapper.py:1-19` | The pinned Windows wrapper uses console-input injection and starts a direct agent subprocess. This conflicts with Scotty's Herdr-only pane-control boundary. The wrapper is prohibited, and any detected injection/subprocess child invalidates the no-spawn result. |
| Jobs and Rules | `mcp_bridge.py:23-27, 112-123`; `README.md:128-142, 295` | Upstream exposes Jobs/Rules-related state/tooling. Scotty must not create, read as authority, or use either for work state/policy. They are a negative test/monitor target only. |

## Citation reproducibility and range/EOF check

**Method:** The exact raw URL below was retrieved as UTF-8 text. Line numbers were calculated after normalizing CRLF/CR to LF, preserving interior blank lines, and discarding only the final empty split segment created by a terminal LF. The GitHub Contents API blob SHA binds each path to the approved commit. Every cited range above was checked as `1 <= start <= end <= total lines` under this method.

| Path | Raw URL | Blob SHA | Total lines | Verified cited ranges |
| --- | --- | --- | ---: | --- |
| `run.py` | `https://raw.githubusercontent.com/bcurts/agentchattr/c24f605c9b24fb7a98003f7930e2d5e7a7f7d297/run.py` | `b14bc75c9efbb89947bc9a5183c1c435923a24fb` | 167 | `22-28`, `114-148`, `154-162` |
| `mcp_bridge.py` | `https://raw.githubusercontent.com/bcurts/agentchattr/c24f605c9b24fb7a98003f7930e2d5e7a7f7d297/mcp_bridge.py` | `d6974dba703711790392392aa06d4e6a3f764664` | 963 | `23-27`, `112-123`, `182-220`, `559-658`, `929-962` |
| `config.toml` | `https://raw.githubusercontent.com/bcurts/agentchattr/c24f605c9b24fb7a98003f7930e2d5e7a7f7d297/config.toml` | `4788f4cdbf73dc6cb17852f519132f0a47f87187` | 149 | `1-4`, `96-102` |
| `app.py` | `https://raw.githubusercontent.com/bcurts/agentchattr/c24f605c9b24fb7a98003f7930e2d5e7a7f7d297/app.py` | `60a6434e29311fbe55eecb306d1703fb4b6206c5` | 2644 | `170-206`, `664-720` |
| `router.py` | `https://raw.githubusercontent.com/bcurts/agentchattr/c24f605c9b24fb7a98003f7930e2d5e7a7f7d297/router.py` | `814e2c9ffcdf55dfd19da411b00e66ff1f83d4c1` | 102 | `83-88` |
| `agents.py` | `https://raw.githubusercontent.com/bcurts/agentchattr/c24f605c9b24fb7a98003f7930e2d5e7a7f7d297/agents.py` | `ca7e2a83260f5ede012222eb8f9237118661f6fd` | 78 | `32-54`, `56-78` |
| `wrapper.py` | `https://raw.githubusercontent.com/bcurts/agentchattr/c24f605c9b24fb7a98003f7930e2d5e7a7f7d297/wrapper.py` | `c7fde4204fb4c976cf87fc16b79e5e4e2b091bda` | 918 | `1-19`, `454-545`, `574-901` |
| `wrapper_windows.py` | `https://raw.githubusercontent.com/bcurts/agentchattr/c24f605c9b24fb7a98003f7930e2d5e7a7f7d297/wrapper_windows.py` | `7a1065e4079c58d84000b3f4b515e67ddb1a3ba2` | 438 | `140-195`, `256-335`, `410-429` |
| `README.md` | `https://raw.githubusercontent.com/bcurts/agentchattr/c24f605c9b24fb7a98003f7930e2d5e7a7f7d297/README.md` | `3848361bed2f4660e46589b93b4b61919e9ad30a` | 624 | `116-123`, `128-142`, `232`, `283-285`, `295`, `309-354` |

## Windows compatibility conclusion and limitations

The pinned upstream documents a Windows direct-server route and a loopback default, so Windows execution is not ruled out at provenance-review time. It also documents Windows wrappers that auto-start agents and use console-input injection; those facilities are incompatible with the approved Scotty boundary and remain prohibited.

No read-only source inspection in this artifact proves all of the following: an authenticated `chat_send`/`chat_read` path that works without a wrapper, a direct-server configuration that prevents all trigger-queue consumption/auto-wake, stable UID/cursor semantics, or safe independent Claude Code Desktop and Codex Desktop participation. Those are required executable-spike questions. If a reviewer cannot approve the narrowed direct-server/no-wrapper test design from this evidence, the correct outcome is reject/hold, not a live trial.

## Independent review record

| Item | Reviewer entry required before executable work |
| --- | --- |
| Reviewer identity | `Avicenna (/root/agentchattr_compat_plan_review)` |
| Approval UTC | `2026-08-10T07:30:33Z` |
| Pin/current comparison conclusion | **APPROVED — At review time, default branch `main`, latest tag `v0.5.0`, latest release `v0.5.0`, and the approved tested pin all resolve to `c24f605c9b24fb7a98003f7930e2d5e7a7f7d297`; pinned and current root `VERSION` are `0.5.0`; no revision drift was observed.** |
| License/MIT obligations conclusion | **APPROVED — Pinned root `LICENSE` SHA-256 is `a1abc583f6725867ed3564f1bcd201d78603612330665433a733a640721f40f3` and contains the MIT License with Copyright (c) 2026 Ben Curtis. This spike authorizes no upstream code/asset copying; later reuse requires separate provenance review, attribution, and preservation of the copyright and permission notice.** |
| Windows direct-server/no-wrapper conclusion | **APPROVED — The pinned material supports only a narrowed Windows direct-server, loopback-only compatibility trial. AgentChattr launchers, wrapper processes, trigger-queue consumers, terminal/console injection, auto-wake, pane control, and direct agent subprocess launch remain prohibited; any use or detection is a required failure/NO-GO.** |
| Separate protocol version conclusion | **APPROVED — No separately versioned server/API/MCP protocol declaration was found in the inspected pinned materials. Independent protocol-version evidence is `absent` and must not be inferred from root `VERSION` `0.5.0`.** |
| Approval decision (`approved` / `hold` / `rejected`) | **approved** |
| Current status | **APPROVED: provenance independently verified. This authorizes only transition to the plan's remaining execution gates; it does not approve installation, service start, MCP calls, production integration, or authority expansion.** |

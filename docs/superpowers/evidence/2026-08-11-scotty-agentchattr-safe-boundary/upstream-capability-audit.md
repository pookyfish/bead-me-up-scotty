# AgentChattr current-upstream safe-boundary audit

## Decision

`implementation_mode = compatibility_shim`

Current upstream does not provide one documented, fail-closed configuration that disables every prohibited surface, and it does not expose a configurable closed transport-only MCP allowlist. The evidence is complete and internally consistent, so this is not `blocked`. It cannot be `upstream` under the approved classification rule.

## Audit identity and provenance gate

| Field | Result |
| --- | --- |
| Retrieval UTC | `2026-08-11T04:14:12.0768583Z` through `2026-08-11T04:16:09.7504283Z` |
| Retrieval method | Public GitHub REST metadata/raw endpoints plus a disposable `core.autocrlf=false` source checkout at the resolved commit. The checkout was used only for text search, line inspection, blob identity, and line-count validation. |
| Repository | `https://github.com/bcurts/agentchattr.git` |
| Approved base pin | `c24f605c9b24fb7a98003f7930e2d5e7a7f7d297` |
| Prior one-way provenance artifact SHA-256 | `e1bb52be279c24aa7cec7fa168d3c478a305ea189fc94373574687a0e022837c` |
| Current default branch | `main` |
| Current default-branch commit | `c24f605c9b24fb7a98003f7930e2d5e7a7f7d297` (committer date `2026-07-26T15:30:01Z`) |
| Latest tag | `v0.5.0` at `c24f605c9b24fb7a98003f7930e2d5e7a7f7d297` |
| Latest GitHub release | `v0.5.0`, published `2026-07-26T15:30:44Z` |
| Root `VERSION` | `0.5.0` (blob `8f0916f768f0487bcf8d33827ce2c8dcecb645c1`) |
| Root `LICENSE` | MIT, SHA-256 `a1abc583f6725867ed3564f1bcd201d78603612330665433a733a640721f40f3` (blob `f59aade8b14c62841948a119e48513a71111980e`) |
| Drift from approved base pin | None observed. Default branch, latest tag/release, and root version still match the approved pin. |

The prior provenance artifact was hashed byte-for-byte and was not edited. The current license is consistent with that artifact and contains the MIT grant and 2026 Ben Curtis copyright notice.

## Primary read-only sources

- Repository metadata: `https://api.github.com/repos/bcurts/agentchattr`
- Current default-branch commit: `https://api.github.com/repos/bcurts/agentchattr/commits/main`
- Tags: `https://api.github.com/repos/bcurts/agentchattr/tags?per_page=20`
- Latest release: `https://api.github.com/repos/bcurts/agentchattr/releases/latest`
- Root version: `https://raw.githubusercontent.com/bcurts/agentchattr/c24f605c9b24fb7a98003f7930e2d5e7a7f7d297/VERSION`
- Root license: `https://raw.githubusercontent.com/bcurts/agentchattr/c24f605c9b24fb7a98003f7930e2d5e7a7f7d297/LICENSE`
- Source evidence: the same raw base URL with `run.py`, `config.toml`, `app.py`, `router.py`, `agents.py`, `wrapper.py`, `wrapper_windows.py`, or `mcp_bridge.py` appended.

## Audited scope and negative-search method

The audit inspected the complete root configuration and CLI flag surfaces, the direct server entry point, application construction and message callbacks, mention router, queue writer, cross-platform wrapper path, Windows injection/launch implementation, MCP tool registration, and the matching README feature/configuration descriptions. Repository-wide text searches covered safe/transport-only modes; spawn/launch controls; mention, wake, trigger, and queue controls; injection controls; Jobs and Rules controls; callback, plugin, extension, and hook controls; and MCP allowlist controls.

No safe-mode, transport-only, no-spawn, no-trigger, no-injection, Jobs-disable, Rules-disable, callback-disable, plugin-disable, extension-disable, or MCP allowlist setting was found. `config.toml:96-99` only changes default routing when no explicit mention is present; it does not disable explicit mention routing.

## Capability matrix

| Required upstream control | Current source evidence | Result |
| --- | --- | --- |
| Transport-only or safe-mode flag | `run.py:17-32` exhaustively defines direct-server flags as data/upload locations, ports, and network binding. `app.py:232-303` still constructs stores, routing, triggers, sessions, and callbacks during direct-server configuration. | **Missing / fail.** No single safe or transport-only mode exists. |
| Agent subprocess launch disable | `wrapper.py:574-586` exposes wrapper arguments but no no-launch control; `wrapper.py:864-895` selects a platform launcher and calls it unconditionally. On Windows, `wrapper_windows.py:410-424` starts the configured agent with `subprocess.Popen`. | **Missing / fail.** Avoiding the wrapper is an architectural exclusion, not one documented fail-closed upstream configuration. |
| Mention/auto-wake disable | `config.toml:96-99` makes explicit mention the default trigger policy. `router.py:52-81` resolves explicit mentions, and `app.py:823-869` passes resolved targets to the trigger writer. | **Missing / fail.** `default = "none"` means “explicit mentions only,” not “mentions disabled.” |
| Trigger queue disable | `app.py:284-290` constructs `Router` and `AgentTrigger`; `app.py:823-869` invokes triggering for routed targets; `agents.py:32-54` and `agents.py:56-78` append trigger records to per-agent queue files. | **Missing / fail.** No fail-closed queue-off control exists. |
| Terminal injection disable | `wrapper.py:454-548` consumes queue entries and invokes the injected callback; `wrapper.py:785-815` starts and monitors that watcher. `wrapper_windows.py:158-191` performs console input injection, and `wrapper_windows.py:410-424` wires the watcher to injection. | **Missing / fail.** No wrapper flag or unified configuration disables injection. |
| Jobs disable | `app.py:262-269` always creates `JobStore`; `app.py:1940-1988` exposes job message/routing behavior; `mcp_bridge.py:354-387` implements job proposals. | **Missing / fail.** Jobs remain constructed and reachable. |
| Rules disable | `app.py:252-258` always creates `RuleStore` and registers its callback; `mcp_bridge.py:766-817` implements rule list/propose behavior. | **Missing / fail.** Rules remain constructed and reachable. |
| Callback/plugin/extension disable | `app.py:252-303` unconditionally registers Rules, Jobs, schedules, registry, session, and message callbacks. The complete Python/config/README search found no plugin or extension switch and no control that disables these callbacks. | **Missing / fail.** Internal callback-driven routing is active by construction; there is no fail-closed extension boundary setting. |
| MCP tool allowlist | `mcp_bridge.py:929-945` registers every function in fixed `_ALL_TOOLS`, including Rules and job proposal surfaces, on both servers; `mcp_bridge.py:948-962` creates/runs both transports. No configuration-derived subset is applied. | **Missing / fail.** The fixed full set is not a closed transport-only allowlist suitable for the required behavioral tests. |

## Source binding and citation validation

| Path | Git blob at audited commit | Total lines | Audited line ranges |
| --- | --- | ---: | --- |
| `run.py` | `b14bc75c9efbb89947bc9a5183c1c435923a24fb` | 167 | `17-32` |
| `config.toml` | `4788f4cdbf73dc6cb17852f519132f0a47f87187` | 149 | `96-99` |
| `app.py` | `60a6434e29311fbe55eecb306d1703fb4b6206c5` | 2644 | `232-303`, `823-869`, `1940-1988` |
| `router.py` | `814e2c9ffcdf55dfd19da411b00e66ff1f83d4c1` | 102 | `52-81` |
| `agents.py` | `ca7e2a83260f5ede012222eb8f9237118661f6fd` | 78 | `32-54`, `56-78` |
| `wrapper.py` | `c7fde4204fb4c976cf87fc16b79e5e4e2b091bda` | 918 | `454-548`, `574-586`, `785-815`, `864-895` |
| `wrapper_windows.py` | `7a1065e4079c58d84000b3f4b515e67ddb1a3ba2` | 438 | `158-191`, `410-424` |
| `mcp_bridge.py` | `d6974dba703711790392392aa06d4e6a3f764664` | 963 | `354-387`, `766-817`, `929-962` |

Every cited range was checked against the byte-preserving checkout at the audited commit and is within the recorded file length. Metadata, tag, release, `VERSION`, license content hash, Git blob identities, and commit identity were cross-checked rather than inferred from one endpoint.

## Classification rationale

The exact rule permits `upstream` only when one documented configuration disables every prohibited surface and the source exposes a closed transport-only allowlist. Current upstream fails both clauses. Because provenance, license, and current-source evidence are present and agree, the `blocked` branch does not apply. The selected path is therefore `compatibility_shim`.

The compatibility shim must enforce the boundary independently; the existence of the direct server route alone is not evidence that callback routing, queue writes, Jobs, Rules, or the full MCP tool surface are disabled.

## Validation, privacy scan, and self-review

- Confirmed the working revision in the disposable checkout exactly matched the API-resolved current commit and approved base pin.
- Confirmed the license SHA-256 from raw downloaded bytes and the prior provenance SHA-256 from the unchanged local artifact.
- Confirmed all capability citations are source-bound and line-range valid.
- Scanned this artifact for raw authentication/session tokens, private-key material, absolute user paths, copied command lines, captured queue payloads, conversation transcripts, and placeholder markers; none are present.
- No upstream source or asset was copied into the product. Only identifiers, short setting values, hashes, URLs, and source-line descriptions are recorded.
- No AgentChattr dependency was installed; no upstream Python module/application was imported; no AgentChattr server, MCP endpoint, wrapper, Desktop integration, or other AgentChattr process was launched; no runtime or MCP configuration was changed; no fork was created.
- Self-review re-applied the exact three-way classification rule and checked that negative findings were based on the complete relevant flag/config surfaces plus source-wide searches, not on the prior audit's expectation.

## Files changed and concerns

Tracked deliverable changed by this task: this audit artifact only. The ignored coordinator task report under `.superpowers/sdd/` is not part of the commit.

Concern: `README.md:287` describes ten MCP tools and `README.md:294-295` lists eleven, while `mcp_bridge.py:929-932` registers twelve functions because the backward-compatible `chat_decision` alias is also exposed. This documentation/code mismatch reinforces the need to derive the shim allowlist from pinned source and assert it behaviorally later. This audit is intentionally source-only and provides no runtime compatibility evidence.

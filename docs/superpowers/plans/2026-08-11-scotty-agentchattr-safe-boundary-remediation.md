# Scotty AgentChattr Safe-Boundary Remediation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the AgentChattr compatibility spike safely runnable by adding one fixed Runtime Manager recipe and an upstream-first transport-only mode with a minimal pinned compatibility-shim fallback.

**Architecture:** Scotty retains a strict evidence contract and never owns AgentChattr lifecycle. Better Palia's existing Runtime Manager gains one allowlisted `agentchattr-spike` recipe with fixed ports, manager-owned paths, digest binding, idempotent operation identity, and no arbitrary registration. Unmodified upstream AgentChattr is used only if it passes the safe-mode contract; otherwise a separately reviewed fork may carry only the disabling patch.

**Tech Stack:** TypeScript, Zod, Vitest, Node.js `node:test`, CommonJS, PowerShell, Python, FastAPI/MCP from pinned AgentChattr, Git, Beads, Runtime Manager, and the existing schema-version-2 evidence harness.

## Global Constraints

- Design source: `docs/superpowers/specs/2026-08-11-scotty-agentchattr-safe-boundary-remediation-design.md` at or after commit `94335d5befa899e317a5674bb622789a3f80325f`.
- No AgentChattr dependency installation or runtime execution is authorized by this plan's approval. Tasks 1-8 are source, schema, unit-test, and preflight work only.
- Task 9 requires a new explicit owner approval for dependency installation. Gate B and its fresh live-execution addendum require a second explicit owner approval for any server/process/MCP/Desktop execution.
- Prefer unmodified upstream. A compatibility fork is permitted only when the fresh audit proves upstream cannot disable auto-trigger, Jobs, and Rules.
- The compatibility fork may only disable prohibited authority surfaces. It may not add Scotty, Beads, supervisor, dispatch, lease, identity, review, Git, Runtime Manager, or Herdr behavior.
- Preserve the upstream MIT copyright and permission notice. Record the upstream pin, runtime pin, patch, patch digest, necessity for every hunk, negative tests, and fork-retirement procedure.
- Runtime Manager remains fixed-manifest. Never add an API accepting arbitrary executables, commands, argv, env, hosts, paths, working directories, or service definitions.
- The only new managed service is `agentchattr-spike`. Its web, MCP HTTP, and MCP SSE ports are fixed to `43123`, `43124`, and `43125` unless a later reviewed design changes the profile.
- Runtime Manager creates the disposable root and data directories. No caller supplies an absolute path.
- Bind only to `127.0.0.1`; never pass or expose `--allow-network`.
- Prefer a reproducible wheel/zipapp/execution bundle. Otherwise require a reviewed source-bundle/file-manifest digest plus entrypoint and interpreter digests. Never silently fall back to commit-only verification.
- AgentChattr receives no Beads, orchestra, supervisor, dispatch, lease, Runtime Manager-definition, Git, repository, or Desktop-configuration credential/path/callback.
- The authority-mutation firewall covers callbacks, plugins, extensions, configuration, HTTP, MCP, message content, and mention routing.
- Existing authority boundaries remain: Beads durable work/decisions, AgentChattr live conversation, Herdr pane control, Runtime Manager lifecycle, and Git integration state.
- No new evidence record kind. Add strict typed substructures to existing manifest/configuration evidence only where required.
- Opaque `x-*` extensions remain nonsemantic and may not carry source-mode, patch, artifact, or authority-firewall meaning.
- Do not modify the one-way approved provenance artifact from the prior spike. Create new remediation evidence files.
- Better Palia Maps uses the root checkout only and no worktrees. Before any Better Palia edit, follow `.orchestra/PROTOCOL.md`, acquire the exact file locks, and sequence the shared branch switch.
- No task may restart Runtime Manager, shared Next, bridge, AgentChattr, Herdr, Desktop, or any user process.
- No merge of the AgentChattr compatibility-spike branch. Better Palia implementation branches follow that repository's standing merge rule only after the owner separately approves implementation and all required validation passes.

## File map

### Scotty repository: `C:\Tools\bead-me-up-scotty`

| Path | Responsibility |
| --- | --- |
| `tools/agentchattr-compatibility-spike/evidence-schema.ts` | Strict implementation-source, artifact-binding, and authority-firewall fields inside schema v2. |
| `tools/agentchattr-compatibility-spike/evidence-schema.test.ts` | RED/GREEN schema and committed-manifest tests. |
| `tools/agentchattr-compatibility-spike/spike-contract.ts` | Cross-record source/digest/firewall requirements. |
| `tools/agentchattr-compatibility-spike/spike-contract.test.ts` | Behavioral mutation, alias, and false-positive tests. |
| `tools/agentchattr-compatibility-spike/authority-firewall.ts` | Pure comparison of sanitized before/after authority snapshots and invocation evidence. |
| `tools/agentchattr-compatibility-spike/authority-firewall.test.ts` | Behavioral tests for every prohibited authority surface and extension path. |
| `tools/agentchattr-compatibility-spike/fixtures/authority-firewall.json` | Synthetic hashes/inventories only; no real paths, refs, tokens, commands, or content. |
| `docs/superpowers/evidence/2026-08-11-scotty-agentchattr-safe-boundary/upstream-capability-audit.md` | Immutable read-only upstream capability result and decision whether the shim path is needed. |
| `docs/superpowers/evidence/2026-08-11-scotty-agentchattr-safe-boundary/patch-inventory.md` | Exact shim diff inventory and retirement mapping; created only if the shim path is taken. |
| `docs/superpowers/evidence/2026-08-09-scotty-agentchattr-compatibility-spike/manifest.json` | Strict not-run template updated with typed implementation source and artifact-binding placeholders. |
| `tools/agentchattr-compatibility-spike/README.md` | Updated gates and explicit install/runtime approval boundary. |

### Better Palia Maps repository: `C:\Better Palia Maps`

| Path | Responsibility |
| --- | --- |
| `tools/runtime-manager/agentchattr-recipe.cjs` | Pure request parsing, fixed recipe resolution, digest verification, and manager-owned path construction. |
| `tools/runtime-manager/manager.cjs` | Fixed-service routing, multi-port occupant gates, operation state, and lifecycle integration. |
| `tools/runtime-manager/rmctl.cjs` | Constrained CLI for the fixed recipe; no arbitrary path/command flags. |
| `tools/runtime-manager/services.json` | Allowlisted `agentchattr-spike` service and its three fixed loopback ports. |
| `tools/runtime-manager/recipes/start-agentchattr-spike.ps1` | Canonical preflight/launch entrypoint that consumes only a manager-written run manifest. |
| `tests/runtime-manager-agentchattr-recipe.test.cjs` | Pure behavioral recipe, request, digest, multi-port, and idempotency tests. |
| `tests/runtime-manager-agentchattr-launcher.test.cjs` | Preflight-only launcher tests proving no child process on invalid evidence. |
| `tests/runtime-manager-contract.test.cjs` | Existing fixed-manifest contract updated from three exact services to the reviewed four-service allowlist. |

### Conditional AgentChattr compatibility fork

The fork task executes only after Task 1 proves the then-current upstream safe mode is absent or insufficient and the owner approves the fork remote. It modifies these upstream files on a normal feature branch:

| Path | Responsibility |
| --- | --- |
| `transport_only.py` | One pure closed safe-mode policy: allowed MCP tools/routes and forbidden config namespaces. |
| `run.py` | `--transport-only` entrypoint and fail-closed policy wiring. |
| `config_loader.py` | Exact CLI/config override for transport-only mode; no generic plugin/callback loading. |
| `app.py` | Do not construct triggers, sessions, Jobs, Rules, schedules, or routing delivery in safe mode; reject their HTTP/WS surfaces. |
| `mcp_bridge.py` | Build an explicit transport-only MCP tool allowlist and reject job-scoped sends. |
| `tests/test_transport_only_policy.py` | Dependency-light pure policy tests runnable before installation. |
| `tests/test_transport_only_integration.py` | Post-install behavioral FastAPI/MCP tests; not run before Gate A. |
| `LICENSE` | Preserve upstream MIT license unchanged. |

---

### Task 1: Re-audit current upstream and select upstream or shim mode

**Files:**
- Create: `docs/superpowers/evidence/2026-08-11-scotty-agentchattr-safe-boundary/upstream-capability-audit.md`
- Do not modify: `docs/superpowers/evidence/2026-08-09-scotty-agentchattr-compatibility-spike/provenance.md`

**Interfaces:**
- Consumes: approved base pin `c24f605c9b24fb7a98003f7930e2d5e7a7f7d297`, upstream repository `https://github.com/bcurts/agentchattr.git`, and the design's safe-mode requirements.
- Produces: `implementation_mode = upstream | compatibility_shim`, exact current upstream commit/tag/version/license hash, and a line-evidenced capability matrix.
- Does not produce: a clone with installed dependencies, a fork, a runtime artifact, or any launched process.

- [ ] **Step 1: Re-read the one-way provenance gate and compute its artifact hash**

Use a byte-preserving hash operation and record only the SHA-256. Do not edit the prior artifact.

```powershell
Get-FileHash `
  'docs/superpowers/evidence/2026-08-09-scotty-agentchattr-compatibility-spike/provenance.md' `
  -Algorithm SHA256
```

- [ ] **Step 2: Perform a read-only current-upstream comparison**

Use GitHub read-only metadata/raw endpoints or a disposable `core.autocrlf=false` checkout. Record default branch, current commit, latest tag/release, root `VERSION`, root `LICENSE` SHA-256, and source-line evidence for:

```text
transport-only or safe-mode flag
agent subprocess launch disable
mention/auto-wake disable
trigger queue disable
terminal injection disable
Jobs disable
Rules disable
callback/plugin/extension disable
MCP tool allowlist
```

Do not install requirements or import the application.

- [ ] **Step 3: Classify the path with an exact rule**

```text
upstream
  only if one documented configuration disables every prohibited surface
  and the source exposes a closed transport-only allowlist suitable for behavioral testing

compatibility_shim
  if any prohibited surface lacks a fail-closed upstream control

blocked
  if provenance/license/current-source evidence is missing or contradictory
```

At the currently reviewed `v0.5.0` pin, the expected result is `compatibility_shim` because `run.py` constructs trigger/routing behavior and Jobs/Rules without transport-only controls. If current upstream changed, record the new evidence rather than carrying that expectation forward blindly.

- [ ] **Step 4: Write and self-review the audit artifact**

The artifact must include retrieval UTC, raw URLs or repository-relative paths/lines, hashes, selected mode, and explicit statements that no install/import/process occurred. Scan for raw tokens, absolute user paths, commands, queue content, transcripts, and placeholders.

- [ ] **Step 5: Commit and push only the audit artifact**

```powershell
git add -- docs/superpowers/evidence/2026-08-11-scotty-agentchattr-safe-boundary/upstream-capability-audit.md
git commit -m "docs: audit AgentChattr safe mode"
git push origin HEAD:refs/heads/codex/scotty-agentchattr-compatibility-spike
```

Post the selected mode and commit to `better-palia-maps-b3e4t`.

---

### Task 2: Add typed implementation-source and artifact binding to schema v2

**Files:**
- Modify: `tools/agentchattr-compatibility-spike/evidence-schema.ts`
- Modify: `tools/agentchattr-compatibility-spike/evidence-schema.test.ts`
- Modify: `docs/superpowers/evidence/2026-08-09-scotty-agentchattr-compatibility-spike/manifest.json`

**Interfaces:**
- Consumes: Task 1 `implementation_mode` and exact pins/digests.
- Produces: `implementationSourceSchema`, `artifactBindingSchema`, and a manifest that can distinguish unmodified upstream from the compatibility shim without opaque extensions.

- [ ] **Step 1: Write failing schema tests**

Add literal fixtures with these exact shapes:

```ts
const upstreamImplementation = {
  mode: "upstream",
  repository: "https://github.com/bcurts/agentchattr.git",
  upstreamBaseCommit: APPROVED_UPSTREAM_PIN.commit,
  runtimeCommit: APPROVED_UPSTREAM_PIN.commit,
  patchSha256: null,
  licenseSha256: APPROVED_UPSTREAM_PIN.licenseSha256,
};

const shimImplementation = {
  mode: "compatibility_shim",
  repository: "https://github.com/pookyfish/agentchattr.git",
  upstreamBaseCommit: APPROVED_UPSTREAM_PIN.commit,
  runtimeCommit: "1111111111111111111111111111111111111111",
  patchSha256: digest,
  licenseSha256: APPROVED_UPSTREAM_PIN.licenseSha256,
};

const artifactBinding = {
  kind: "source_bundle_file_manifest",
  artifactSha256: digest,
  entrypointSha256: digest,
  interpreterSha256: digest,
  fileManifestSha256: digest,
  verificationState: "not_run",
};
```

Tests must reject:

- upstream mode with a patch digest or divergent runtime commit;
- shim mode without fork repository, divergent runtime commit, or patch digest;
- non-HTTPS repositories;
- missing interpreter/entrypoint/artifact digests;
- unknown artifact kind or verification state;
- source semantics hidden under `extensions`; and
- any changed committed manifest that no longer remains `executionState: "not_run"`.

- [ ] **Step 2: Run focused RED**

```powershell
npm run test:unit -- tools/agentchattr-compatibility-spike/evidence-schema.test.ts
```

Expected: failures because the two schemas and manifest fields do not exist.

- [ ] **Step 3: Implement the strict schemas**

Add closed unions equivalent to:

```ts
const gitCommitSchema = z.string().regex(/^[0-9a-f]{40}$/);
const httpsGitHubRepositorySchema = z.string().url().regex(
  /^https:\/\/github\.com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+\.git$/,
);

export const implementationSourceSchema = z.discriminatedUnion("mode", [
  z.strictObject({
    mode: z.literal("upstream"),
    repository: z.literal(APPROVED_UPSTREAM_PIN.repository),
    upstreamBaseCommit: z.literal(APPROVED_UPSTREAM_PIN.commit),
    runtimeCommit: z.literal(APPROVED_UPSTREAM_PIN.commit),
    patchSha256: z.null(),
    licenseSha256: z.literal(APPROVED_UPSTREAM_PIN.licenseSha256),
  }),
  z.strictObject({
    mode: z.literal("compatibility_shim"),
    repository: httpsGitHubRepositorySchema,
    upstreamBaseCommit: z.literal(APPROVED_UPSTREAM_PIN.commit),
    runtimeCommit: gitCommitSchema,
    patchSha256: sha256Schema,
    licenseSha256: z.literal(APPROVED_UPSTREAM_PIN.licenseSha256),
  }).refine((value) => value.runtimeCommit !== value.upstreamBaseCommit, {
    path: ["runtimeCommit"],
    message: "A compatibility shim must identify its distinct runtime commit.",
  }),
]);

export const artifactBindingSchema = z.strictObject({
  kind: z.enum(["wheel", "zipapp", "source_bundle_file_manifest"]),
  artifactSha256: sha256Schema,
  entrypointSha256: sha256Schema,
  interpreterSha256: sha256Schema,
  fileManifestSha256: sha256Schema.nullable(),
  verificationState: z.enum(["not_run", "verified", "mismatch", "unknown"]),
});
```

Add `implementationSource` and `artifactBinding` to the strict manifest. A `not_run` template must use `verificationState: "not_run"`; any running/completed manifest must use `verified`.

- [ ] **Step 4: Update the committed not-run manifest from Task 1 evidence**

Use the selected mode and exact hashes. Never put a fake runtime/fork commit into committed evidence. If Task 1 selects `compatibility_shim` but the fork remote/commit does not yet exist, keep `mode: "upstream"` in the not-run template and add no shim claim; Task 7 updates it only after the reviewed fork commit exists.

- [ ] **Step 5: Run GREEN and static gates**

```powershell
npm run test:unit -- tools/agentchattr-compatibility-spike/evidence-schema.test.ts
npm run test:unit
npx tsc --noEmit --pretty false
npx eslint tools/agentchattr-compatibility-spike/evidence-schema.ts tools/agentchattr-compatibility-spike/evidence-schema.test.ts
git diff --check
```

- [ ] **Step 6: Commit and push the exact three-file scope**

```powershell
git add -- `
  tools/agentchattr-compatibility-spike/evidence-schema.ts `
  tools/agentchattr-compatibility-spike/evidence-schema.test.ts `
  docs/superpowers/evidence/2026-08-09-scotty-agentchattr-compatibility-spike/manifest.json
git commit -m "feat: type AgentChattr implementation provenance"
git push origin HEAD:refs/heads/codex/scotty-agentchattr-compatibility-spike
```

---

### Task 3: Add the typed authority-mutation firewall

**Files:**
- Create: `tools/agentchattr-compatibility-spike/authority-firewall.ts`
- Create: `tools/agentchattr-compatibility-spike/authority-firewall.test.ts`
- Create: `tools/agentchattr-compatibility-spike/fixtures/authority-firewall.json`
- Modify: `tools/agentchattr-compatibility-spike/evidence-schema.ts`
- Modify: `tools/agentchattr-compatibility-spike/evidence-schema.test.ts`
- Modify: `tools/agentchattr-compatibility-spike/spike-contract.ts`
- Modify: `tools/agentchattr-compatibility-spike/spike-contract.test.ts`

**Interfaces:**
- Produces: `AuthoritySurface`, `AuthoritySnapshot`, `AuthorityInvocation`, `evaluateAuthorityFirewall(input)`, and the `authorityMutationFirewall` subobject on `configuration_boundary` evidence.
- Does not read real files, run commands, call Beads/Git/Runtime Manager, or interpret `extensions`.

- [ ] **Step 1: Add synthetic fixture and failing pure tests**

Use these closed types:

```ts
export const authoritySurfaces = [
  "beads",
  "supervisor_appointments",
  "dispatch_configuration",
  "execution_leases",
  "runtime_manager_definitions",
  "git_state",
] as const;

export type AuthoritySnapshot = {
  surface: typeof authoritySurfaces[number];
  digest: string;
  inventoryCount: number;
};

export type AuthorityInvocation = {
  mechanism: "callback" | "plugin" | "extension" | "configuration" | "http" | "mcp" | "message" | "mention";
  surface: typeof authoritySurfaces[number];
  result: "rejected" | "inert" | "invoked" | "unknown";
  externalProcessCount: number;
};
```

Tests must prove:

- identical before/after snapshots plus only rejected/inert attempts pass;
- one changed digest fails with the exact surface path;
- one changed inventory count fails;
- `invoked` fails even when the snapshot happens to match;
- `unknown` returns classification `unknown`, never pass;
- any external process count above zero fails;
- every mechanism/surface Cartesian pair is required exactly once;
- duplicate or missing pairs fail;
- authority-looking `x-*` extensions do not change the verdict; and
- real paths, commands, tokens, refs, contents, or callback bodies are structurally impossible.

- [ ] **Step 2: Run focused RED**

```powershell
npm run test:unit -- `
  tools/agentchattr-compatibility-spike/authority-firewall.test.ts `
  tools/agentchattr-compatibility-spike/evidence-schema.test.ts `
  tools/agentchattr-compatibility-spike/spike-contract.test.ts
```

Expected: missing module/schema/validator failures.

- [ ] **Step 3: Implement the pure evaluator**

Implement a closed lookup rather than recursive key inference:

```ts
export function evaluateAuthorityFirewall(input: AuthorityFirewallInput): AuthorityFirewallResult {
  const issues: AuthorityFirewallIssue[] = [];
  for (const surface of authoritySurfaces) {
    const before = input.before.find((item) => item.surface === surface);
    const after = input.after.find((item) => item.surface === surface);
    if (!before || !after) issues.push({ surface, code: "snapshot_missing" });
    else if (before.digest !== after.digest || before.inventoryCount !== after.inventoryCount) {
      issues.push({ surface, code: "authority_mutated" });
    }
  }
  // Require every exact mechanism/surface pair, reject duplicates, invoked,
  // unknown, and external process creation with typed issue codes.
  return classifyAuthorityFirewall(issues);
}
```

Add a strict `authorityMutationFirewall` subobject to `configurationBoundarySchema` containing only artifact hashes, counts, the closed attempt matrix, and result classification. No raw evidence enters the manifest.

- [ ] **Step 4: Enforce the firewall cross-record boundary**

`validateSpikeContract` must require a passing firewall before any completed configuration boundary can pass. Missing/unknown is `unknown`; mutation/invocation/process creation is `fail`.

- [ ] **Step 5: Run GREEN and full gates**

```powershell
npm run test:unit -- `
  tools/agentchattr-compatibility-spike/authority-firewall.test.ts `
  tools/agentchattr-compatibility-spike/evidence-schema.test.ts `
  tools/agentchattr-compatibility-spike/spike-contract.test.ts
npm run test:unit
npx tsc --noEmit --pretty false
npx eslint `
  tools/agentchattr-compatibility-spike/authority-firewall.ts `
  tools/agentchattr-compatibility-spike/authority-firewall.test.ts `
  tools/agentchattr-compatibility-spike/evidence-schema.ts `
  tools/agentchattr-compatibility-spike/evidence-schema.test.ts `
  tools/agentchattr-compatibility-spike/spike-contract.ts `
  tools/agentchattr-compatibility-spike/spike-contract.test.ts
git diff --check
```

- [ ] **Step 6: Commit and push the exact seven-file scope**

Use the seven listed paths and subject `feat: enforce AgentChattr authority firewall`.

---

### Task 4: Implement the pure fixed Runtime Manager recipe contract

**Repository:** `C:\Better Palia Maps`

**Files:**
- Create: `tools/runtime-manager/agentchattr-recipe.cjs`
- Create: `tests/runtime-manager-agentchattr-recipe.test.cjs`

**Interfaces:**
- Produces:

```js
parseAgentChattrRequest(value)
resolveAgentChattrPaths(request, environment)
buildAgentChattrArgv(request, paths)
verifyAgentChattrArtifacts(request, paths, hashFile)
AGENTCHATTR_PORTS
```

- `parseAgentChattrRequest` returns a frozen normalized object or throws a stable `AgentChattrRecipeError { code }`.
- No function starts a process or reads outside injected fixed roots.

- [ ] **Step 1: Register Task 4 and lock both files before switching the shared checkout**

Follow `.orchestra/PROTOCOL.md`. Stop on any checkout, active-work, or file-lock conflict. Create a normal feature branch from synchronized clean `master`; never create a worktree.

- [ ] **Step 2: Write failing behavioral tests**

Use the literal valid request:

```js
const valid = {
  run_id: 'agentchattr-spike-20260811t120000z',
  source_mode: 'upstream',
  upstream_commit: 'c24f605c9b24fb7a98003f7930e2d5e7a7f7d297',
  runtime_commit: 'c24f605c9b24fb7a98003f7930e2d5e7a7f7d297',
  patch_sha256: null,
  artifact_kind: 'source_bundle_file_manifest',
  artifact_sha256: 'a'.repeat(64),
  entrypoint_sha256: 'b'.repeat(64),
  interpreter_sha256: 'c'.repeat(64),
  file_manifest_sha256: 'd'.repeat(64),
  op_key: 'e'.repeat(64),
};
```

Table-test rejection of every extra/unsafe key, including `exe`, `command`, `args`, `env`, `host`, `port`, `path`, `cwd`, `callback`, `plugin`, and `extension`. Also reject traversal/control characters, wrong pins, upstream mode with patch, shim mode without patch/distinct runtime commit, malformed hashes, and wrong op key.

Assert exact fixed ports `{ web: 43123, mcpHttp: 43124, mcpSse: 43125 }`, a disposable root derived only from a sanitized run ID, and argv that contains `--transport-only` but never `--allow-network`.

- [ ] **Step 3: Run RED**

```powershell
node --test tests/runtime-manager-agentchattr-recipe.test.cjs
```

Expected: missing module.

- [ ] **Step 4: Implement the closed parser and resolver**

Use an exact allowed-key set and fixed constants:

```js
const AGENTCHATTR_PORTS = Object.freeze({ web: 43123, mcpHttp: 43124, mcpSse: 43125 });
const ALLOWED_KEYS = new Set([
  'run_id', 'source_mode', 'upstream_commit', 'runtime_commit',
  'patch_sha256', 'artifact_kind', 'artifact_sha256',
  'entrypoint_sha256', 'interpreter_sha256', 'file_manifest_sha256', 'op_key',
]);
```

Manager-owned roots are injected by `environment` in tests and fixed to Runtime Manager state plus `%TEMP%` in production. Never resolve a caller path.

`verifyAgentChattrArtifacts` compares all required digests with constant-time equality and returns all mismatches without exposing paths or file content.

- [ ] **Step 5: Run GREEN**

```powershell
node --test tests/runtime-manager-agentchattr-recipe.test.cjs
node --test tests/runtime-manager-contract.test.cjs
git diff --check
```

- [ ] **Step 6: Commit the two-file Task 4 branch change**

Commit subject: `feat: define fixed AgentChattr recipe contract`. Push the feature branch. Do not merge until the complete Runtime Manager seam passes Task 6 review.

---

### Task 5: Wire the fixed service, multi-port gates, and deregistration

**Repository:** `C:\Better Palia Maps`

**Files:**
- Modify: `tools/runtime-manager/services.json`
- Modify: `tools/runtime-manager/manager.cjs`
- Modify: `tools/runtime-manager/rmctl.cjs`
- Modify: `tests/runtime-manager-contract.test.cjs`
- Modify: `tests/runtime-manager-agentchattr-recipe.test.cjs`

**Interfaces:**
- Consumes: Task 4 pure recipe functions.
- Produces: fixed `agentchattr-spike` service, `servicePorts(service)`, fixed-recipe request parsing, and `deregister` for the stopped fixed run record.
- Does not produce: dynamic registration or an AgentChattr process.

- [ ] **Step 1: Write RED tests for the four-service allowlist**

Replace the existing exact service expectation with:

```js
assert.deepEqual(
  Object.keys(MANIFEST).sort(),
  ['agentchattr-spike', 'bridge', 'scotty', 'web-dev'],
);
```

Assert that the new service is stateful, has primary web port `43123`, has exact three-port mapping, uses loopback health, expects only the reviewed Python interpreter identity, and maps to a fixed recipe.

- [ ] **Step 2: Add failing multi-port occupant and API tests**

Inject fake port facts and prove:

- any foreign occupant on any of the three ports blocks start;
- all three are rechecked after load admission and immediately before spawn;
- `start` for `agentchattr-spike` rejects missing/unsafe recipe fields before creating an operation;
- another service ignores AgentChattr fields rather than reading them;
- only the fixed service accepts `deregister`;
- deregister refuses while any managed/foreign occupant remains;
- deregister removes only the run record, never the fixed manifest definition; and
- API source still contains no `body.exe`, `body.args`, `body.command`, `body.port`, `body.env`, or dynamic manifest mutation.

- [ ] **Step 3: Run RED**

```powershell
node --test `
  tests/runtime-manager-contract.test.cjs `
  tests/runtime-manager-agentchattr-recipe.test.cjs
```

- [ ] **Step 4: Implement fixed service metadata**

Add this shape to `services.json`:

```json
"agentchattr-spike": {
  "kind": "agentchattr-spike",
  "port": 43123,
  "ports": { "web": 43123, "mcpHttp": 43124, "mcpSse": 43125 },
  "health": "http://127.0.0.1:43123/",
  "healthExpect": "agentchattr",
  "stateful": true,
  "expectExe": ["python.exe"],
  "description": "Disposable transport-only AgentChattr compatibility spike"
}
```

The manifest remains fixed. Do not add filesystem paths, commands, args, or env.

- [ ] **Step 5: Implement recipe-aware request parsing and multi-port gates**

Add a `servicePorts(name)` helper and make occupant, adoption, pre-start, and pre-spawn gates iterate every returned port. Existing services return their single primary port.

For the fixed AgentChattr service only, pass the body through `parseAgentChattrRequest`. Store the normalized request under the operation/run record; do not merge arbitrary body fields.

- [ ] **Step 6: Add constrained `rmctl` flags**

The CLI may accept only named scalar flags matching the Task 4 schema. It must not accept source paths, executables, arbitrary argv/env, host, or ports. It sends the same `op_key` on retries.

- [ ] **Step 7: Implement stopped-run deregistration**

`POST /services/agentchattr-spike/deregister` accepts `run_id`, `op_key`, `requested_by`, and `reason`. It refuses when running, foreign, busy, or mismatched. It removes only the recorded run and journals the action with stable identity.

- [ ] **Step 8: Run GREEN**

```powershell
node --test `
  tests/runtime-manager-contract.test.cjs `
  tests/runtime-manager-agentchattr-recipe.test.cjs
git diff --check
```

- [ ] **Step 9: Commit the five-file Task 5 change**

Commit subject: `feat: allowlist AgentChattr spike lifecycle`. Push the feature branch; do not restart Runtime Manager and do not merge yet.

---

### Task 6: Add the canonical preflight-only launcher and digest gate

**Repository:** `C:\Better Palia Maps`

**Files:**
- Create: `tools/runtime-manager/recipes/start-agentchattr-spike.ps1`
- Create: `tests/runtime-manager-agentchattr-launcher.test.cjs`
- Modify: `tools/runtime-manager/manager.cjs`
- Modify: `tools/runtime-manager/agentchattr-recipe.cjs`
- Modify: `tests/runtime-manager-agentchattr-recipe.test.cjs`

**Interfaces:**
- Produces a canonical launcher accepting only `-RunId` and `-PreflightOnly` from Runtime Manager.
- Reads the manager-owned run manifest by safe run ID.
- Does not install dependencies or start AgentChattr during this task.

- [ ] **Step 1: Write launcher RED tests**

Spawn PowerShell only in `-PreflightOnly` mode against test-owned fixture roots injected through an explicit test-only environment variable accepted only when `PALIA_RM_TEST_MODE=1`.

Assert:

- valid fixture returns a redacted `PREFLIGHT_OK` record and creates no child;
- wrong source, patch, artifact, entrypoint, interpreter, or file-manifest digest fails;
- missing `--transport-only` capability marker fails;
- any `--allow-network`, callback, plugin, extension, agent command, or external authority path fails;
- unsafe run ID fails before filesystem lookup;
- fixture output contains no absolute path, token, raw command, or file content; and
- production mode ignores/rejects the test-root override.

- [ ] **Step 2: Run RED**

```powershell
node --test tests/runtime-manager-agentchattr-launcher.test.cjs
```

Expected: missing script.

- [ ] **Step 3: Implement preflight behavior**

The script accepts:

```powershell
param(
  [Parameter(Mandatory = $true)][string]$RunId,
  [switch]$PreflightOnly
)
```

It resolves a fixed manager-owned manifest location, parses strict JSON, recomputes all digests, verifies the safe-mode capability record, checks the three fixed ports, and exits before launch when `-PreflightOnly` is present.

The non-preflight branch must remain fenced by a checked-in constant such as `$RuntimeExecutionEnabled = $false` in this task. Tests assert it refuses with `runtime_execution_not_approved`; do not create a child process.

- [ ] **Step 4: Wire Runtime Manager to require preflight before any future spawn**

Add the fixed recipe with only `-RunId <safe-id>` and a `preflightArgs` form. Runtime Manager calls `verifyAgentChattrArtifacts` again immediately before the future spawn boundary. Keep the execution fence false.

- [ ] **Step 5: Run GREEN and Better Palia gates**

```powershell
node --test `
  tests/runtime-manager-contract.test.cjs `
  tests/runtime-manager-agentchattr-recipe.test.cjs `
  tests/runtime-manager-agentchattr-launcher.test.cjs
git diff --check
```

Perform the mandatory resource preflight before the one root build. If memory pressure or another heavy job exists, report the build as blocked rather than starting it.

```powershell
npm run build
```

Do not start or restart any runtime.

- [ ] **Step 6: Commit, push, review, and integrate the static fenced seam**

Commit subject: `feat: preflight AgentChattr fixed recipe`. Obtain an independent Runtime Manager review covering fixed-manifest preservation, multi-port gates, digest TOCTOU, idempotency, fencing, and no-process tests.

If review and required gates pass and the owner has approved implementation/integration, merge the Better Palia feature branch under its standing rules, push `master`, and return the root checkout to clean `master`. Do not restart Runtime Manager; the execution fence remains false and runtime change still requires explicit approval.

---

### Task 7: Implement or adopt transport-only safe mode without installation

**Conditional repository:** unmodified upstream if Task 1 qualifies it; otherwise the owner-approved minimal fork remote.

**Files (shim path only):**
- Create: `transport_only.py`
- Modify: `run.py`
- Modify: `config_loader.py`
- Modify: `app.py`
- Modify: `mcp_bridge.py`
- Create: `tests/test_transport_only_policy.py`
- Create: `tests/test_transport_only_integration.py`
- Preserve unchanged: `LICENSE`

**Interfaces:**
- Produces: `TransportOnlyPolicy`, `validate_transport_only_config`, `transport_only_tools`, and `--transport-only`.
- Pre-install verification may run only the dependency-light pure policy test. Integration tests are written but not executed until Gate A.

- [ ] **Step 1: Gate the repository choice**

If Task 1 selected `upstream`, do not create a fork or patch. Record the upstream flag/config and proceed to Step 8 with a source-only test inventory.

If Task 1 selected `compatibility_shim`, require explicit owner approval of the fork remote before creating/pushing a branch. Verify the fork base is the exact audited upstream commit and `LICENSE` bytes/hash are unchanged.

- [ ] **Step 2: Write pure policy RED tests first**

Define the only permitted MCP tools as literals:

```py
TRANSPORT_ONLY_MCP_TOOLS = (
    "chat_send",
    "chat_read",
    "chat_resync",
    "chat_join",
    "chat_channels",
    "chat_claim",
    "chat_who",
)
```

Tests must reject config namespaces/keys for agents, commands, callbacks, plugins, extensions, wrappers, launchers, auto-wake, injection, trigger queues, Jobs, Rules, schedules, sessions, subprocesses, external URLs, authority paths, and network bind.

The policy returns a frozen allowlist and never accepts a callback or generic plugin object.

- [ ] **Step 3: Run dependency-light RED**

```powershell
python -m unittest tests.test_transport_only_policy
```

Expected: missing `transport_only` module. This command must use only the standard library and must not install/import FastAPI/MCP dependencies.

- [ ] **Step 4: Implement the pure policy module**

Use closed constants and exact config traversal:

```py
@dataclass(frozen=True)
class TransportOnlyPolicy:
    bind_host: str = "127.0.0.1"
    allowed_tools: tuple[str, ...] = TRANSPORT_ONLY_MCP_TOOLS
    allow_agent_launch: bool = False
    allow_auto_wake: bool = False
    allow_jobs: bool = False
    allow_rules: bool = False
    allow_callbacks: bool = False
    allow_plugins: bool = False
    allow_extensions: bool = False
```

`validate_transport_only_config` rejects prohibited namespaces rather than ignoring them silently.

- [ ] **Step 5: Run pure GREEN**

```powershell
python -m unittest tests.test_transport_only_policy
```

- [ ] **Step 6: Write integration tests before application changes**

Tests must use constructor spies/fail-fast sentinels and actual FastAPI/MCP boundaries after dependencies are approved:

- configuring transport-only never constructs `AgentTrigger`, `Router`, `JobStore`, `RuleStore`, `ScheduleStore`, or `SessionEngine`;
- no background recovery/trigger thread starts;
- HTTP/WS Jobs, Rules, schedules, sessions, agents, imports/exports that include Jobs/Rules, callbacks, plugins, and extensions return 404/disabled without mutation;
- MCP tool listing is the exact allowlist;
- job-scoped send/read fails closed;
- mention text is stored as conversation but creates no target/queue/process event;
- restart preserves safe mode and cannot load a persisted prohibited setting; and
- attempts to reach Beads, supervisor, dispatch, leases, Runtime Manager definitions, or Git are rejected/inert and emit no callback/process event.

Do not run this test yet if its dependencies are absent; record it as pending Gate A, not pass.

- [ ] **Step 7: Implement the minimal application patch**

- `run.py`: add `--transport-only`, require loopback, and pass the policy before app/MCP construction.
- `config_loader.py`: map only the exact flag/config field; do not introduce a generic extension loader.
- `app.py`: in safe mode construct only message/channel/presence stores required by transport; do not construct triggers, router delivery, Jobs, Rules, schedules, or sessions; install a fail-closed route guard.
- `mcp_bridge.py`: replace global unconditional `_ALL_TOOLS` registration with `build_toolset(transport_only)` and reject job-scoped paths.
- `LICENSE`: unchanged.

No Scotty/Beads/Herdr/Runtime Manager imports or callbacks may appear in the fork.

- [ ] **Step 8: Produce the exact patch inventory**

In Scotty, create `patch-inventory.md` containing base/runtime commits, patch SHA-256, license hash, each changed hunk's purpose, prohibited-token scan, test mapping, and upstream-retirement mapping. Do not copy upstream source into the document.

- [ ] **Step 9: Commit and push the source-only shim**

Commit only the seven shim paths with subject `feat: add transport-only compatibility mode`. Push the fork branch. Do not install dependencies, build an artifact, or launch it.

Update the Scotty manifest to `compatibility_shim` only after the exact fork commit and patch digest exist, then run Task 2 schema tests and push the manifest/patch inventory.

---

### Task 8: Static cross-repository review and installation gate

**Files:**
- Modify: `tools/agentchattr-compatibility-spike/README.md`
- Create: `docs/superpowers/evidence/2026-08-11-scotty-agentchattr-safe-boundary/static-review.md`

**Interfaces:**
- Consumes: Tasks 1-7 branches/commits, static tests, exact diffs, and provenance.
- Produces: `PASS` or `NEEDS CHANGES` for source-only implementation plus an explicit `INSTALLATION NOT AUTHORIZED` gate.

- [ ] **Step 1: Review Runtime Manager behavior**

The reviewer must exercise pure functions and preflight-only script behavior, not merely grep source. They must prove fixed allowlist, closed request schema, manager-owned paths, three-port gates, digest mismatch no-spawn, idempotency, deregistration, and execution fence.

- [ ] **Step 2: Review safe mode or shim**

Compare the full shim diff against the exact upstream base. Reject unrelated hunks, changed license, new orchestration behavior, generic plugin/callback support, hidden enable paths, or tool/route blocklists that default open.

- [ ] **Step 3: Review schema and firewall**

Run the focused and full Scotty gates. Mutate every authority surface/mechanism, source mode, digest, and artifact state. Confirm `x-*` values remain byte-identical nonsemantic inputs.

- [ ] **Step 4: Write the static review artifact**

It must state separately:

```text
Runtime Manager source review: PASS | NEEDS CHANGES
AgentChattr safe-mode source review: PASS | NEEDS CHANGES
MIT/provenance review: PASS | NEEDS CHANGES
Schema/firewall review: PASS | NEEDS CHANGES
Dependencies installed: NO
AgentChattr process launched: NO
Installation authorized: NO
Runtime execution authorized: NO
```

- [ ] **Step 5: Run final pre-install gates**

Scotty:

```powershell
npm run test:unit
npx tsc --noEmit --pretty false
git diff --check
```

Better Palia, after resource preflight:

```powershell
node --test `
  tests/runtime-manager-contract.test.cjs `
  tests/runtime-manager-agentchattr-recipe.test.cjs `
  tests/runtime-manager-agentchattr-launcher.test.cjs
npm run build
git diff --check
```

Shim path, dependency-light only:

```powershell
python -m unittest tests.test_transport_only_policy
git diff --check
```

- [ ] **Step 6: Commit/push the review artifact and stop**

Post the result to `better-palia-maps-b3e4t`. Begin the owner update with:

```text
I need your input before proceeding: source implementation is reviewed, but dependency installation is not authorized.
```

Do not execute Task 9 without explicit owner approval granted after this artifact.

---

## GATE A — explicit dependency-installation approval

Task 9 is outside the currently authorized execution scope. Approval of this plan or Tasks 1-8 does not authorize it.

The owner must explicitly approve:

- creation of the disposable dependency/runtime environment;
- installation of pinned AgentChattr requirements inside that environment only;
- construction of the reviewed immutable execution bundle; and
- execution of tests that import AgentChattr dependencies but do not start servers.

No approval may be inferred from `ok`, prior design approval, or approval to write this plan.

---

### Task 9: Build and verify the disposable artifact after Gate A

**Execute only after explicit Gate A approval.**

**Files/evidence:**
- Modify: `docs/superpowers/evidence/2026-08-09-scotty-agentchattr-compatibility-spike/manifest.json`
- Create: `docs/superpowers/evidence/2026-08-11-scotty-agentchattr-safe-boundary/artifact-build.md`
- External: Runtime Manager-owned artifact directory under its ignored state root

- [ ] **Step 1: Re-run resource, provenance, license, pin, and port admission**

Stop on drift, memory pressure, another heavy job, or missing manager ownership.

- [ ] **Step 2: Create one disposable isolated environment**

Install only the pinned requirements into the manager-owned artifact root. No global/user/repository installation. Record package names/versions and hashes without tokens or paths.

- [ ] **Step 3: Run upstream/shim test suites without starting servers**

Run the pure policy test, the written transport-only integration tests, and relevant upstream tests. Constructor/process sentinels must prove no launcher, wrapper, agent, child, queue consumer, or server starts.

- [ ] **Step 4: Build the strongest reproducible artifact**

Prefer wheel or zipapp. If upstream packaging cannot produce one without broad changes, create a deterministic source-bundle file manifest. Hash artifact, entrypoint, interpreter, file manifest, license, and patch.

- [ ] **Step 5: Run Runtime Manager preflight only**

Write the manager-owned strict run manifest and invoke only `-PreflightOnly`. The execution fence remains false. Record operation/correlation identity and verified digests.

- [ ] **Step 6: Update evidence and obtain independent artifact review**

No artifact mismatch, unpinned dependency, unexpected file, or prohibited feature may remain. Commit only sanitized manifest/evidence updates; never the runtime environment.

- [ ] **Step 7: Stop and request Gate B**

Do not enable the launcher fence or start a process.

---

## GATE B — explicit runtime-execution approval

Runtime execution includes enabling the launcher fence, Runtime Manager start/stop/deregister operations, AgentChattr server or MCP processes, browser/Desktop configuration, MCP calls, Herdr participation, and live authority-firewall probes.

The owner must explicitly approve the reviewed artifact and the exact disposable compatibility-spike run. Gate A does not imply Gate B.

After Gate B, write a fresh execution addendum against the then-current environment and resume the existing compatibility-spike Tasks 2-6. Do not treat this source implementation plan as the live-run procedure.

## Plan self-review checklist

| Design requirement | Plan coverage |
| --- | --- |
| Upstream first, shim only when necessary | Tasks 1 and 7 |
| Minimal deletable shim, no Scotty orchestration | Global constraints; Task 7; Task 8 diff review |
| Exact upstream/runtime/patch/license provenance | Tasks 1, 2, 7, and 9 |
| Fixed allowlisted Runtime Manager recipe | Tasks 4-6 |
| No arbitrary service registration | Global constraints; Tasks 4-5 tests |
| Manager-owned paths and loopback fixed ports | Tasks 4-6 |
| Artifact/executable/interpreter digest binding | Tasks 2, 4, 6, and 9 |
| Stable action/correlation/idempotency and retry safety | Tasks 4-6 |
| Auto-trigger, Jobs, Rules, launcher/injection disabled | Tasks 1, 7, and 8 |
| Callback/plugin/extension authority firewall | Task 3; Task 7; Task 8 |
| Beads/supervisor/dispatch/lease/RM-definition/Git unchanged | Task 3 Cartesian matrix and Task 7 integration test |
| MIT attribution and fork retirement | Tasks 1, 7, and 8 |
| No new evidence kind; typed manifest amendment | Tasks 2-3 |
| No install/runtime from plan approval | Global constraints; Gates A and B |
| Separate explicit approval before install and runtime | Gates A and B |

## Execution handoff

Tasks 1-8 form the source-only implementation phase. Their completion ends at Gate A. No agent may interpret plan approval, source review, a green test suite, or an `ok` acknowledgement as permission to install AgentChattr dependencies or execute AgentChattr.

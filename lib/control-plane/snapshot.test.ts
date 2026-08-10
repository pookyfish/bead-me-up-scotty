import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { SNAPSHOT_DEADLINE_MS, buildControlPlaneSnapshot } from "./snapshot";
import { availableObservation } from "./types";
import type { SnapshotDependencies } from "./snapshot";

const time = "2026-08-09T21:00:00.000Z";
const data = {
  orchestra: { schemaVersion: 2 as const, supervisor: null, activeWork: {}, fileLocks: {}, pendingIntegration: [], unresolvedConflicts: [], unresolvedImpacts: [], recentDecisions: [], sections: { activeWork: { total: 0, included: 0, rejected: 0, truncated: false }, fileLocks: { total: 0, included: 0, rejected: 0, truncated: false }, integrationQueue: { total: 0, included: 0, rejected: 0, truncated: false }, conflicts: { total: 0, included: 0, rejected: 0, truncated: false }, decisions: { total: 0, included: 0, rejected: 0, truncated: false }, impacts: { total: 0, included: 0, rejected: 0, truncated: false } } },
  herdr: { protocol: 19, version: "0.8", sessions: [] }, runtime: { epoch: 1, managerPid: 2, services: null }, hooks: { scope: "project-only" as const, claudeSettingsPresent: false, codexHookConfigPresent: false, references: [], missingConfiguredFiles: [], codexGlobalCoverage: "unknown" as const }, git: { repository: true as const, branch: "main", detached: false, head: "abcdef", dirty: false, changedPathCount: 0, baseRef: "main", ahead: 0, behind: 0, unmergedLocalBranchCount: 0 },
};
function deps(options: { never?: boolean; reject?: boolean } = {}) {
  const calls: string[] = [];
  const observe = (source: "orchestra" | "herdr" | "runtime-manager" | "hooks" | "git", authority: string, value: unknown) => async () => {
    calls.push(source); if (options.never && source === "herdr") return new Promise<never>(() => {}); if (options.reject && source === "herdr") throw new Error("boom");
    return availableObservation(source, authority, value, ["observe"], { observedAt: time });
  };
  return { getProject: (id: string) => id === "demo" ? { id: "demo", name: "Demo", path: null } : id === "better-palia-maps" ? { id, name: "Better Palia Maps", path: "C:/repo" } : undefined, observeOrchestra: observe("orchestra", "coordination", data.orchestra), observeHerdr: observe("herdr", "managed-session-runtime", data.herdr), observeRuntimeManager: observe("runtime-manager", "service-runtime", data.runtime), observeHookCoverage: observe("hooks", "project-hooks", data.hooks), observeGitHealth: observe("git", "repository", data.git), now: () => new Date(time), calls: () => calls } as SnapshotDependencies & { calls: () => string[] };
}
describe("control-plane snapshot", () => {
  it("preserves four sources when one rejects", async () => { const input = deps({ reject: true }); const result = await buildControlPlaneSnapshot("better-palia-maps", input); expect(result.sources.orchestra.capability).toBe("available"); expect(result.sources.herdr.error?.code).toBe("unavailable"); expect(result.sources.git.capability).toBe("available"); expect(input.calls()).toEqual(["orchestra", "herdr", "runtime-manager", "hooks", "git"]); });
  it("returns a source-empty Demo snapshot without invoking adapters", async () => { const input = deps(); const result = await buildControlPlaneSnapshot("demo", input); expect(result.project.path).toBeNull(); expect(Object.values(result.sources).every((source) => source.error?.code === "not_configured")).toBe(true); expect(input.calls()).toEqual([]); });
  it("bounds an adapter that never settles and clears every timer", async () => { vi.useFakeTimers(); const pending = buildControlPlaneSnapshot("better-palia-maps", deps({ never: true })); await vi.advanceTimersByTimeAsync(SNAPSHOT_DEADLINE_MS); const result = await pending; expect(result.sources.herdr.error?.code).toBe("timeout"); expect(vi.getTimerCount()).toBe(0); vi.useRealTimers(); });
  it("rejects unknown projects", async () => { await expect(buildControlPlaneSnapshot("missing", deps())).rejects.toMatchObject({ code: "unknown_project" }); });
});

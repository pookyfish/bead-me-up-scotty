import { ConfigError, getProject } from "../config";
import { observeGitHealth } from "./git-health";
import { observeHerdr } from "./herdr";
import { observeHookCoverage } from "./hooks";
import { observeOrchestra } from "./orchestra";
import { observeRuntimeManager } from "./runtime-manager";
import { evaluateSupervisorContinuity } from "./continuity";
import { controlPlaneSnapshotSchema, failedObservation, type ControlPlaneSnapshot, type GitHealthSnapshot, type HerdrSnapshot, type HookCoverageSnapshot, type Observation, type OrchestraSnapshot, type RuntimeManagerSnapshot, type SourceId } from "./types";

export const SNAPSHOT_DEADLINE_MS = 7_000;
type Project = { id: string; name: string; path: string | null };
type TimerHandle = ReturnType<typeof setTimeout>;
type Adapter<T> = (path: string, signal?: AbortSignal) => Promise<Observation<T>>;

export interface SnapshotDependencies {
  getProject?: (id: string) => Project | undefined;
  observeOrchestra?: Adapter<OrchestraSnapshot>;
  observeHerdr?: Adapter<HerdrSnapshot>;
  observeRuntimeManager?: Adapter<RuntimeManagerSnapshot>;
  observeHookCoverage?: Adapter<HookCoverageSnapshot>;
  observeGitHealth?: Adapter<GitHealthSnapshot>;
  now?: () => Date;
  setTimeout?: (callback: () => void, delay: number) => TimerHandle;
  clearTimeout?: (timer: TimerHandle) => void;
}

function notConfigured<T>(source: SourceId, authority: string, observedAt: string): Observation<T> {
  return failedObservation(source, authority, "unavailable", "not_configured", "This observation is not configured for the Demo project.", undefined, [], { observedAt, freshness: "unknown" });
}

function timedOut<T>(source: SourceId, authority: string, observedAt: string): Observation<T> {
  return failedObservation(source, authority, "unavailable", "timeout", "This control-plane observation exceeded the snapshot deadline.", undefined, [], { observedAt, freshness: "unknown" });
}

function rejected<T>(source: SourceId, authority: string, observedAt: string): Observation<T> {
  return failedObservation(source, authority, "unavailable", "unavailable", "This control-plane observation could not be completed.", undefined, [], { observedAt, freshness: "unknown" });
}

async function bounded<T>(source: SourceId, authority: string, adapter: Adapter<T>, path: string, signal: AbortSignal, observedAt: string, deps: SnapshotDependencies): Promise<Observation<T>> {
  const schedule = deps.setTimeout ?? ((callback, delay) => setTimeout(callback, delay));
  const clear = deps.clearTimeout ?? ((timer) => clearTimeout(timer));
  let timer: TimerHandle | undefined;
  try {
    return await Promise.race([
      Promise.resolve().then(() => adapter(path, signal)),
      new Promise<Observation<T>>((resolve) => { timer = schedule(() => resolve(timedOut<T>(source, authority, observedAt)), SNAPSHOT_DEADLINE_MS); }),
    ]);
  } finally { if (timer !== undefined) clear(timer); }
}

export async function buildControlPlaneSnapshot(projectId: string, deps: SnapshotDependencies = {}): Promise<ControlPlaneSnapshot> {
  const project = (deps.getProject ?? getProject)(projectId);
  if (!project) throw new ConfigError(`Unknown project: ${projectId}`, "unknown_project");
  const now = deps.now ?? (() => new Date());
  const generatedAt = now().toISOString();
  if (project.path === null) return controlPlaneSnapshotSchema.parse({ generatedAt, project, sources: { orchestra: notConfigured("orchestra", "coordination", generatedAt), herdr: notConfigured("herdr", "managed-session-runtime", generatedAt), runtimeManager: notConfigured("runtime-manager", "service-runtime", generatedAt), hooks: notConfigured("hooks", "project-hooks", generatedAt), git: notConfigured("git", "repository", generatedAt) }, diagnostics: [] });

  const controller = new AbortController();
  const adapters = {
    orchestra: deps.observeOrchestra ?? ((path: string) => observeOrchestra(path)),
    herdr: deps.observeHerdr ?? ((path: string, signal?: AbortSignal) => observeHerdr(path, { signal })),
    runtimeManager: deps.observeRuntimeManager ?? ((path: string, signal?: AbortSignal) => observeRuntimeManager(path, {}, signal)),
    hooks: deps.observeHookCoverage ?? ((path: string) => observeHookCoverage(path)),
    git: deps.observeGitHealth ?? ((path: string, signal?: AbortSignal) => observeGitHealth(path, {}, signal)),
  };
  const pending = [
    bounded("orchestra", "coordination", adapters.orchestra, project.path, controller.signal, generatedAt, deps),
    bounded("herdr", "managed-session-runtime", adapters.herdr, project.path, controller.signal, generatedAt, deps),
    bounded("runtime-manager", "service-runtime", adapters.runtimeManager, project.path, controller.signal, generatedAt, deps),
    bounded("hooks", "project-hooks", adapters.hooks, project.path, controller.signal, generatedAt, deps),
    bounded("git", "repository", adapters.git, project.path, controller.signal, generatedAt, deps),
  ];
  const results = await Promise.allSettled(pending);
  controller.abort();
  const value = <T,>(index: number, source: SourceId, authority: string) => results[index].status === "fulfilled" ? results[index].value as Observation<T> : rejected<T>(source, authority, generatedAt);
  const sources = { orchestra: value<OrchestraSnapshot>(0, "orchestra", "coordination"), herdr: value<HerdrSnapshot>(1, "herdr", "managed-session-runtime"), runtimeManager: value<RuntimeManagerSnapshot>(2, "runtime-manager", "service-runtime"), hooks: value<HookCoverageSnapshot>(3, "hooks", "project-hooks"), git: value<GitHealthSnapshot>(4, "git", "repository") };
  return controlPlaneSnapshotSchema.parse({ generatedAt, project, sources, diagnostics: evaluateSupervisorContinuity({ orchestra: sources.orchestra, herdr: sources.herdr, now: now() }) });
}

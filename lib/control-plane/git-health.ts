import "server-only";

import { runGitCommand, type GitCommandOptions, type GitCommandResult } from "../git-command";
import {
  availableObservation,
  failedObservation,
  gitHealthSnapshotSchema,
  type GitHealthSnapshot,
  type Observation,
  type ObservationError,
} from "./types";

const AGGREGATE_TIMEOUT_MS = 5_000;
const COMMAND_TIMEOUT_MS = 2_000;
const AUTHORITY = "repository";
const CAPABILITIES = ["observe-health"];
const BASE_REFS = ["origin/master", "origin/main", "master", "main"] as const;

export type GitHealthRunner = (
  repoPath: string,
  args: string[],
  options?: GitCommandOptions,
) => Promise<GitCommandResult>;

type TimerHandle = ReturnType<typeof setTimeout>;

export interface GitHealthDependencies {
  runGit?: GitHealthRunner;
  now?: () => Date;
  setTimeout?: (callback: () => void, delayMs: number) => TimerHandle;
  clearTimeout?: (timer: TimerHandle) => void;
}

export class ForbiddenGitHealthCommandError extends Error {
  readonly code = "forbidden_git_command";

  constructor() {
    super("Git health may run only its approved lightweight read commands.");
    this.name = "ForbiddenGitHealthCommandError";
  }
}

const ALLOWED_COMMANDS = new Set([
  "rev-parse\u0000--is-inside-work-tree",
  "symbolic-ref\u0000--quiet\u0000--short\u0000HEAD",
  "rev-parse\u0000--short=12\u0000HEAD",
  "status\u0000--porcelain=v1\u0000--untracked-files=normal",
  ...BASE_REFS.map((ref) => `rev-parse\u0000--verify\u0000--quiet\u0000${ref}^{commit}`),
  ...BASE_REFS.map((ref) => `rev-list\u0000--left-right\u0000--count\u0000${ref}...HEAD`),
  ...BASE_REFS.map((ref) => `for-each-ref\u0000refs/heads\u0000--no-merged\u0000${ref}\u0000--format=%(refname:short)`),
]);

export function runGitHealthCommand(
  repoPath: string,
  args: string[],
  deps: Pick<GitHealthDependencies, "runGit"> = {},
  signal?: AbortSignal,
): Promise<GitCommandResult> {
  if (!ALLOWED_COMMANDS.has(args.join("\u0000"))) {
    return Promise.reject(new ForbiddenGitHealthCommandError());
  }
  return (deps.runGit ?? runGitCommand)(repoPath, args, {
    timeoutMs: COMMAND_TIMEOUT_MS,
    signal,
  });
}

function failureCode(error: unknown, signal: AbortSignal): ObservationError["code"] {
  if (
    signal.aborted ||
    (error instanceof Error && error.name === "AbortError") ||
    (typeof error === "object" && error !== null && "code" in error && (error as { code?: unknown }).code === "ABORT_ERR")
  ) return "timeout";
  return "unavailable";
}

function countPaths(status: string): number {
  return status.split("\n").filter((line) => line.length > 0).length;
}

function parseComparison(stdout: string): { behind: number; ahead: number } | null {
  const [behind, ahead] = stdout.trim().split(/\s+/).map(Number);
  return Number.isSafeInteger(behind) && behind >= 0 && Number.isSafeInteger(ahead) && ahead >= 0
    ? { behind, ahead }
    : null;
}

export async function observeGitHealth(
  projectPath: string,
  deps: GitHealthDependencies = {},
  parentSignal?: AbortSignal,
): Promise<Observation<GitHealthSnapshot>> {
  const observedAt = (deps.now ?? (() => new Date()))().toISOString();
  const controller = new AbortController();
  const schedule = deps.setTimeout ?? ((callback, delay) => setTimeout(callback, delay));
  const clear = deps.clearTimeout ?? ((timer) => clearTimeout(timer));
  const onParentAbort = () => controller.abort();
  if (parentSignal?.aborted) controller.abort();
  else parentSignal?.addEventListener("abort", onParentAbort, { once: true });
  const timer = schedule(() => controller.abort(), AGGREGATE_TIMEOUT_MS);
  const run = (args: string[]) => runGitHealthCommand(projectPath, args, deps, controller.signal);
  let snapshot: GitHealthSnapshot | undefined;

  try {
    const inside = await run(["rev-parse", "--is-inside-work-tree"]);
    if (inside.code !== 0 || inside.stdout.trim() !== "true") {
      return failedObservation(
        "git", AUTHORITY, "unavailable", "unavailable", "The project folder is not a Git work tree.",
        undefined, CAPABILITIES, { observedAt, freshness: "unknown" },
      );
    }

    const branchResult = await run(["symbolic-ref", "--quiet", "--short", "HEAD"]);
    if (branchResult.code !== 0 && branchResult.code !== 1) throw new Error("Git could not identify HEAD.");
    const head = await run(["rev-parse", "--short=12", "HEAD"]);
    if (head.code !== 0 || !head.stdout.trim()) throw new Error("Git could not resolve HEAD.");
    const status = await run(["status", "--porcelain=v1", "--untracked-files=normal"]);
    if (status.code !== 0) throw new Error("Git could not read status.");

    snapshot = {
      repository: true,
      branch: branchResult.code === 0 ? branchResult.stdout.trim() || null : null,
      detached: branchResult.code !== 0,
      head: head.stdout.trim(),
      dirty: status.stdout.length > 0,
      changedPathCount: countPaths(status.stdout),
      baseRef: null,
      ahead: null,
      behind: null,
      unmergedLocalBranchCount: null,
    };

    let baseRef: string | null = null;
    for (const candidate of BASE_REFS) {
      const result = await run(["rev-parse", "--verify", "--quiet", `${candidate}^{commit}`]);
      if (result.code === 0) {
        baseRef = candidate;
        break;
      }
    }
    if (!baseRef) {
      return failedObservation(
        "git", AUTHORITY, "degraded", "incomplete_observation",
        "No master/main base ref is available for Git health comparisons.",
        gitHealthSnapshotSchema.parse(snapshot), CAPABILITIES, { observedAt, freshness: "live" },
      );
    }

    snapshot.baseRef = baseRef;
    const comparison = await run(["rev-list", "--left-right", "--count", `${baseRef}...HEAD`]);
    const counts = comparison.code === 0 ? parseComparison(comparison.stdout) : null;
    if (!counts) throw new Error("Git could not compare HEAD to the base ref.");
    snapshot.behind = counts.behind;
    snapshot.ahead = counts.ahead;

    const unmerged = await run([
      "for-each-ref", "refs/heads", "--no-merged", baseRef, "--format=%(refname:short)",
    ]);
    if (unmerged.code !== 0) throw new Error("Git could not list unmerged local branches.");
    snapshot.unmergedLocalBranchCount = unmerged.stdout.split("\n").filter(Boolean).length;

    return availableObservation(
      "git", AUTHORITY, gitHealthSnapshotSchema.parse(snapshot), CAPABILITIES,
      { observedAt, freshness: "live" },
    );
  } catch (error) {
    const code = failureCode(error, controller.signal);
    return failedObservation(
      "git", AUTHORITY, snapshot ? "degraded" : "unavailable", code,
      code === "timeout"
        ? "Git health observation exceeded its read budget."
        : "Git health could not complete a lightweight repository read.",
      snapshot, CAPABILITIES, { observedAt, freshness: snapshot ? "live" : "unknown" },
    );
  } finally {
    clear(timer);
    parentSignal?.removeEventListener("abort", onParentAbort);
  }
}

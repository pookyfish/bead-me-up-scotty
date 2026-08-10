import { describe, expect, it, vi } from "vitest";
import {
  observeGitHealth,
  runGitHealthCommand,
  type GitHealthDependencies,
} from "./git-health";

vi.mock("server-only", () => ({}));

interface FakeGitOptions {
  branch?: string | null;
  head?: string;
  dirty?: boolean;
  ahead?: number;
  behind?: number;
  unmergedBranches?: number;
  base?: string | null;
}

function fakeGit(options: FakeGitOptions): GitHealthDependencies & { commands(): string[][] } {
  const calls: string[][] = [];
  const base = options.base === undefined ? "origin/master" : options.base;
  const runGit: NonNullable<GitHealthDependencies["runGit"]> = async (_repo, args) => {
    calls.push(args);
    const text = args.join(" ");
    if (text === "rev-parse --is-inside-work-tree") return { code: 0, stdout: "true\n" };
    if (text === "symbolic-ref --quiet --short HEAD") {
      return options.branch === null ? { code: 1, stdout: "" } : { code: 0, stdout: `${options.branch ?? "feature/x"}\n` };
    }
    if (text === "rev-parse --short=12 HEAD") return { code: 0, stdout: `${options.head ?? "abcdef1"}\n` };
    if (text === "status --porcelain=v1 --untracked-files=normal") {
      return { code: 0, stdout: options.dirty === false ? "" : " M lib/example.ts\n" };
    }
    if (args[0] === "rev-parse" && args[1] === "--verify") {
      return { code: args[3].replace("^{commit}", "") === base ? 0 : 128, stdout: "" };
    }
    if (args[0] === "rev-list") return { code: 0, stdout: `${options.behind ?? 1}\t${options.ahead ?? 2}\n` };
    if (args[0] === "for-each-ref") {
      return { code: 0, stdout: Array.from({ length: options.unmergedBranches ?? 3 }, (_, i) => `feature/${i}`).join("\n") };
    }
    throw new Error(`Unexpected command: ${text}`);
  };
  return { runGit, commands: () => calls };
}

describe("observeGitHealth", () => {
  it("uses only the approved lightweight read commands", async () => {
    const git = fakeGit({ branch: "feature/x", head: "abcdef1", dirty: true, ahead: 2, behind: 1, unmergedBranches: 3 });

    await observeGitHealth("C:/repo", { runGit: git.runGit });

    expect(git.commands()).toEqual([
      ["rev-parse", "--is-inside-work-tree"],
      ["symbolic-ref", "--quiet", "--short", "HEAD"],
      ["rev-parse", "--short=12", "HEAD"],
      ["status", "--porcelain=v1", "--untracked-files=normal"],
      ["rev-parse", "--verify", "--quiet", "origin/master^{commit}"],
      ["rev-list", "--left-right", "--count", "origin/master...HEAD"],
      ["for-each-ref", "refs/heads", "--no-merged", "origin/master", "--format=%(refname:short)"],
    ]);
  });

  it("does not call full unmerged analysis", async () => {
    const git = fakeGit({ branch: "main", head: "abcdef1", dirty: false, ahead: 0, behind: 0, unmergedBranches: 0 });

    const result = await observeGitHealth("C:/repo", { runGit: git.runGit });

    expect(result.data?.branch).toBe("main");
    expect(git.commands().some((args) => args.includes("merge-tree"))).toBe(false);
  });

  it("rejects a command outside the health allowlist before spawning Git", async () => {
    const git = fakeGit({});

    await expect(runGitHealthCommand("C:/repo", ["fetch"], { runGit: git.runGit })).rejects.toMatchObject({ code: "forbidden_git_command" });
    expect(git.commands()).toEqual([]);
  });

  it("returns degraded identity data when no base comparison ref exists", async () => {
    const git = fakeGit({ base: null, branch: "topic", head: "0123456789ab", dirty: true });

    const result = await observeGitHealth("C:/repo", { runGit: git.runGit });

    expect(result).toMatchObject({
      capability: "degraded",
      error: { code: "incomplete_observation" },
      data: {
        repository: true,
        branch: "topic",
        detached: false,
        head: "0123456789ab",
        dirty: true,
        changedPathCount: 1,
        baseRef: null,
        ahead: null,
        behind: null,
        unmergedLocalBranchCount: null,
      },
    });
  });

  it("reports Node's killed SIGTERM timeout as degraded while retaining identity", async () => {
    const git = fakeGit({ branch: "topic", head: "0123456789ab", dirty: true });
    const originalRunGit = git.runGit!;
    git.runGit = async (repo, args, options) => {
      if (args[0] === "rev-list") {
        throw Object.assign(new Error("Command failed: git"), {
          code: null,
          killed: true,
          signal: "SIGTERM",
        });
      }
      return originalRunGit(repo, args, options);
    };

    const result = await observeGitHealth("C:/repo", { runGit: git.runGit });

    expect(result).toMatchObject({
      capability: "degraded",
      error: { code: "timeout" },
      data: {
        repository: true,
        branch: "topic",
        head: "0123456789ab",
        dirty: true,
        baseRef: "origin/master",
        ahead: null,
        behind: null,
        unmergedLocalBranchCount: null,
      },
    });
  });
});

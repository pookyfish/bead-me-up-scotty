import { describe, expect, it, vi } from "vitest";

const execFile = vi.hoisted(() => vi.fn());
vi.mock("server-only", () => ({}));
vi.mock("node:child_process", () => ({ execFile }));

import { analyzeUnmerged } from "./git-unmerged";

type ExecCallback = (error: Error | null, stdout: string) => void;

function installGitFixture(options: { base?: "origin/master" | "origin/main"; mergeCode: number }) {
  execFile.mockImplementation((_file: string, args: string[], _options: object, callback: ExecCallback) => {
    const command = args.slice(2);
    const text = command.join(" ");
    if (text === "rev-parse --verify --quiet origin/master^{commit}") {
      callback(options.base === "origin/main" ? Object.assign(new Error("missing"), { code: 128 }) : null, "");
      return;
    }
    if (text === "rev-parse --verify --quiet origin/main^{commit}") {
      callback(options.base === "origin/main" ? null : Object.assign(new Error("missing"), { code: 128 }), "");
      return;
    }
    if (command[0] === "for-each-ref") {
      callback(null, "feature/one\tabcdef1\t2026-08-09T20:00:00Z\tFeature work\n");
      return;
    }
    if (command[0] === "rev-list") return callback(null, "3\n");
    if (command[0] === "log") return callback(null, "Feature work\n");
    if (command[0] === "diff") return callback(null, "M\tlib/changed.ts\n");
    if (command[0] === "merge-tree") {
      callback(
        options.mergeCode === 0 ? null : Object.assign(new Error("conflict"), { code: options.mergeCode }),
        options.mergeCode === 1 ? "tree-id\nlib/changed.ts\n" : "",
      );
      return;
    }
    callback(Object.assign(new Error(`Unexpected command: ${text}`), { code: 2 }), "");
  });
}

describe("analyzeUnmerged behavior", () => {
  it("uses the next base candidate when origin/master is absent", async () => {
    installGitFixture({ base: "origin/main", mergeCode: 0 });

    const result = await analyzeUnmerged("C:/Tools/bead-me-up-scotty", []);

    expect(result.available).toBe(true);
    expect(result.branches).toHaveLength(1);
    expect(result.branches[0]).toMatchObject({ name: "feature/one", aheadCount: 3 });
  });

  it("reports a clean trial merge without modifying the working result", async () => {
    installGitFixture({ mergeCode: 0 });

    const result = await analyzeUnmerged("C:/Tools/bead-me-up-scotty", []);

    expect(result.branches[0]?.conflict).toEqual({ state: "clean", files: [] });
  });

  it("reports conflicted trial-merge paths when Git exits one", async () => {
    installGitFixture({ mergeCode: 1 });

    const result = await analyzeUnmerged("C:/Tools/bead-me-up-scotty", []);

    expect(result.branches[0]?.conflict).toEqual({
      state: "conflicts",
      files: ["lib/changed.ts"],
    });
  });

  it("keeps unexpected nonzero trial merges as unknown", async () => {
    installGitFixture({ mergeCode: 128 });

    const result = await analyzeUnmerged("C:/Tools/bead-me-up-scotty", []);

    expect(result.branches[0]?.conflict).toEqual({ state: "unknown", files: [] });
  });
});

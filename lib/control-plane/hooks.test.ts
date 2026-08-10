import { describe, expect, it, vi } from "vitest";
import { observeHookCoverage, type HookCoverageDependencies } from "./hooks";

vi.mock("server-only", () => ({}));

const completeClaudeFixture = {
  ".claude/settings.json": JSON.stringify({
    hooks: {
      SessionStart: [{
        hooks: [{ type: "command", command: "node .claude/hooks/actor-stamp.cjs" }],
      }],
    },
  }),
  ".claude/hooks/actor-stamp.cjs": "process.exit(0)",
};

const missingActorStampFixture = {
  ".claude/settings.json": JSON.stringify({
    hooks: {
      SessionStart: [{
        hooks: [{ type: "command", command: "node .claude/hooks/actor-stamp.cjs" }],
      }],
    },
  }),
};

const codexOnlyFixture = {
  ".codex/hooks.json": JSON.stringify({
    hooks: {
      UserPromptSubmit: [{
        hooks: [{ type: "command", command: "node .codex/hooks/refresh.cjs" }],
      }],
    },
  }),
  ".codex/hooks/refresh.cjs": "process.exit(0)",
};

const secretBearingExternalFixture = {
  ".claude/settings.json": JSON.stringify({
    hooks: {
      SessionStart: [{
        hooks: [{
          type: "command",
          command: "powershell -File C:\\outside\\private-hook.ps1 -Token TOP_SECRET",
          env: { TOKEN: "TOP_SECRET" },
        }],
      }],
    },
  }),
};

function fakeFiles(files: Record<string, string>): HookCoverageDependencies & {
  reads(): string[];
} {
  const reads: string[] = [];
  const normalize = (value: string) => value.replace(/\\/g, "/");
  const relative = (value: string) => normalize(value).replace(/^C:\/repo\/?/, "");

  return {
    readFile: async (file) => {
      const relativeFile = relative(file);
      reads.push(relativeFile);
      const content = files[relativeFile];
      if (content === undefined) {
        throw Object.assign(new Error("Missing fixture file"), { code: "ENOENT" });
      }
      return content;
    },
    now: () => new Date("2026-08-10T01:00:00.000Z"),
    reads: () => [...reads],
  };
}

describe("observeHookCoverage", () => {
  it("reports project-only scope and unknown global Codex coverage", async () => {
    const result = await observeHookCoverage("C:/repo", fakeFiles(completeClaudeFixture));
    expect(result.data?.scope).toBe("project-only");
    expect(result.data?.codexGlobalCoverage).toBe("unknown");
    expect(result.data?.claudeSettingsPresent).toBe(true);
    expect(result.data?.codexHookConfigPresent).toBe(false);
  });

  it("degrades when configured hook commands point at missing files", async () => {
    const result = await observeHookCoverage("C:/repo", fakeFiles(missingActorStampFixture));
    expect(result.capability).toBe("degraded");
    expect(result.data?.missingConfiguredFiles).toContain(".claude/hooks/actor-stamp.cjs");
  });

  it("only reads hook configuration and referenced files", async () => {
    const files = fakeFiles(completeClaudeFixture);
    await observeHookCoverage("C:/repo", files);
    expect(files.reads()).toEqual([
      ".claude/settings.json",
      ".codex/hooks.json",
      ".claude/hooks/actor-stamp.cjs",
    ]);
  });

  it("inspects Claude and Codex independently", async () => {
    const result = await observeHookCoverage("C:/repo", fakeFiles(codexOnlyFixture));
    expect(result.capability).toBe("available");
    expect(result.data?.claudeSettingsPresent).toBe(false);
    expect(result.data?.codexHookConfigPresent).toBe(true);
  });

  it("never serializes raw commands, secrets, or absolute external paths", async () => {
    const result = await observeHookCoverage(
      "C:/repo",
      fakeFiles(secretBearingExternalFixture),
    );
    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain("TOP_SECRET");
    expect(serialized).not.toContain("C:\\outside\\private-hook.ps1");
    expect(result.data?.references[0]).toMatchObject({ fileRef: null, fileScope: "external" });
  });

  it("keeps valid provider evidence when the other project config is malformed", async () => {
    const result = await observeHookCoverage("C:/repo", fakeFiles({
      ...completeClaudeFixture,
      ".codex/hooks.json": "{not json",
    }));

    expect(result.capability).toBe("degraded");
    expect(result.error?.code).toBe("parse_error");
    expect(result.data?.references).toHaveLength(1);
  });

  it("checks a project-local hook used directly as the executable", async () => {
    const result = await observeHookCoverage("C:/repo", fakeFiles({
      ".claude/settings.json": JSON.stringify({
        hooks: {
          Stop: [{ hooks: [{ type: "command", command: ".claude/hooks/actor-stamp.cjs" }] }],
        },
      }),
      ".claude/hooks/actor-stamp.cjs": "process.exit(0)",
    }));

    expect(result.data?.references[0]).toMatchObject({
      executableBasename: "actor-stamp.cjs",
      fileRef: ".claude/hooks/actor-stamp.cjs",
      fileScope: "project",
      exists: true,
    });
  });

  it("does not treat inline command code as a hook file reference", async () => {
    const result = await observeHookCoverage("C:/repo", fakeFiles({
      ".claude/settings.json": JSON.stringify({
        hooks: {
          SessionStart: [{
            hooks: [{ type: "command", command: "node -e fake(C:\\outside\\TOP_SECRET.js)" }],
          }],
        },
      }),
    }));

    expect(result.data?.references[0]).toMatchObject({
      executableBasename: "node",
      fileRef: null,
      fileScope: "unknown",
      exists: null,
    });
    expect(JSON.stringify(result)).not.toContain("TOP_SECRET");
  });

  it("degrades malformed hook groups without erasing valid peer evidence", async () => {
    const result = await observeHookCoverage("C:/repo", fakeFiles({
      ...completeClaudeFixture,
      ".codex/hooks.json": JSON.stringify({
        hooks: { SessionStart: "not-a-hook-group-list" },
      }),
    }));

    expect(result.capability).toBe("degraded");
    expect(result.error?.code).toBe("parse_error");
    expect(result.data?.references).toEqual([expect.objectContaining({
      provider: "claude",
      fileRef: ".claude/hooks/actor-stamp.cjs",
    })]);
  });

  it.each([
    ["claude", ".claude/settings.json", ".claude/hooks/valid.cjs"],
    ["codex", ".codex/hooks.json", ".codex/hooks/valid.cjs"],
  ])("degrades malformed %s command entries while retaining valid peers", async (
    provider,
    configPath,
    hookPath,
  ) => {
    const result = await observeHookCoverage("C:/repo", fakeFiles({
      [configPath]: JSON.stringify({
        hooks: {
          SessionStart: [{
            hooks: [
              { type: "command", command: `node ${hookPath}` },
              provider === "claude"
                ? { type: "command" }
                : { type: "command", command: ["node", hookPath] },
            ],
          }],
        },
      }),
      [hookPath]: "process.exit(0)",
    }));

    expect(result.capability).toBe("degraded");
    expect(result.error?.code).toBe("parse_error");
    expect(result.data?.references).toEqual([expect.objectContaining({
      provider,
      fileRef: hookPath,
      fileScope: "project",
      exists: true,
    })]);
  });
});

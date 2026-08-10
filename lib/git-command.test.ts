import { describe, expect, it, vi } from "vitest";

const execFile = vi.hoisted(() => vi.fn());
vi.mock("node:child_process", () => ({ execFile }));

import { runGitCommand } from "./git-command";

type ExecCallback = (error: Error | null, stdout: string) => void;

describe("runGitCommand", () => {
  it("preserves a numeric Git exit as a result", async () => {
    execFile.mockImplementation((_file: string, _args: string[], _options: object, callback: ExecCallback) => {
      callback(Object.assign(new Error("missing ref"), { code: 128 }), "");
    });

    await expect(runGitCommand("C:/repo", ["rev-parse", "missing"])).resolves.toEqual({
      code: 128,
      stdout: "",
    });
  });

  it("rejects spawn failures instead of converting them into Git exits", async () => {
    execFile.mockImplementation((_file: string, _args: string[], _options: object, callback: ExecCallback) => {
      callback(Object.assign(new Error("git missing"), { code: "ENOENT" }), "");
    });

    await expect(runGitCommand("C:/repo", ["status"])).rejects.toThrow("git missing");
  });

  it("rejects with Node's timeout failure instead of inventing a Git exit", async () => {
    const timeout = Object.assign(new Error("Command failed: git"), {
      code: null,
      killed: true,
      signal: "SIGTERM",
    });
    execFile.mockImplementation((_file: string, _args: string[], _options: object, callback: ExecCallback) => {
      callback(timeout, "partial output");
    });

    await expect(runGitCommand("C:/repo", ["status"])).rejects.toMatchObject({
      code: null,
      killed: true,
      signal: "SIGTERM",
    });
  });

  it("rejects when its caller aborts the running command", async () => {
    const controller = new AbortController();
    execFile.mockImplementation((_file: string, _args: string[], options: { signal?: AbortSignal }, callback: ExecCallback) => {
      options.signal?.addEventListener("abort", () => {
        callback(Object.assign(new Error("The operation was aborted"), {
          code: "ABORT_ERR",
          name: "AbortError",
        }), "");
      }, { once: true });
    });

    const pending = runGitCommand("C:/repo", ["status"], { signal: controller.signal });
    controller.abort();

    await expect(pending).rejects.toMatchObject({ code: "ABORT_ERR", name: "AbortError" });
  });

  it("passes the neutral command, default bounds, and caller abort signal to Git", async () => {
    const controller = new AbortController();
    execFile.mockImplementation((_file: string, _args: string[], _options: object, callback: ExecCallback) => {
      callback(null, "ok\n");
    });

    await expect(runGitCommand("C:/repo", ["status", "--porcelain=v1"], {
      signal: controller.signal,
    })).resolves.toEqual({ code: 0, stdout: "ok\n" });

    expect(execFile).toHaveBeenCalledWith(
      "git",
      ["-C", "C:/repo", "status", "--porcelain=v1"],
      expect.objectContaining({
        timeout: 15_000,
        maxBuffer: 16 * 1024 * 1024,
        windowsHide: true,
        signal: controller.signal,
      }),
      expect.any(Function),
    );
  });

  it("lets callers narrow the command timeout without changing arguments", async () => {
    execFile.mockImplementation((_file: string, _args: string[], _options: object, callback: ExecCallback) => {
      callback(null, "");
    });

    await runGitCommand("C:/repo", ["rev-parse", "HEAD"], { timeoutMs: 750 });

    expect(execFile).toHaveBeenLastCalledWith(
      "git",
      ["-C", "C:/repo", "rev-parse", "HEAD"],
      expect.objectContaining({ timeout: 750 }),
      expect.any(Function),
    );
  });
});

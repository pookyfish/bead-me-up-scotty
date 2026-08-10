import { execFile } from "node:child_process";

export interface GitCommandResult {
  code: number;
  stdout: string;
}

export interface GitCommandOptions {
  timeoutMs?: number;
  signal?: AbortSignal;
}

const DEFAULT_GIT_TIMEOUT_MS = 15_000;
const GIT_MAX_BUFFER = 16 * 1024 * 1024;

/**
 * Runs an arbitrary Git command for an existing server-side consumer.
 *
 * This is deliberately neutral: callers such as Unmerged Work use
 * `merge-tree --write-tree`, which can write Git object-database entries even
 * though it leaves refs, the index, and the working tree alone.
 */
export function runGitCommand(
  repoPath: string,
  args: string[],
  options: GitCommandOptions = {},
): Promise<GitCommandResult> {
  return new Promise((resolve, reject) => {
    execFile(
      "git",
      ["-C", repoPath, ...args],
      {
        timeout: options.timeoutMs ?? DEFAULT_GIT_TIMEOUT_MS,
        maxBuffer: GIT_MAX_BUFFER,
        windowsHide: true,
        signal: options.signal,
      },
      (err, stdout) => {
        if (err && typeof (err as NodeJS.ErrnoException & { code?: unknown }).code !== "number") {
          reject(err instanceof Error ? err : new Error(String(err)));
          return;
        }
        const code = err ? ((err as unknown as { code: number }).code ?? 1) : 0;
        resolve({ code, stdout: String(stdout) });
      },
    );
  });
}

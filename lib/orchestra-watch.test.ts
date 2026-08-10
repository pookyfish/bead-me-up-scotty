import { describe, expect, it } from "vitest";
import { vi } from "vitest";
import path from "node:path";
vi.mock("server-only", () => ({}));
import { subscribeOrchestraChange, type OrchestraWatchDeps } from "./orchestra-watch";

function watchHarness(options: { exists?: boolean } = {}) {
  let watchCount = 0;
  let closeCount = 0;
  let listener: ((event: string, filename: string | Buffer | null) => void) | undefined;
  let watchedPath: string | undefined;
  let watchedOptions: { recursive?: boolean; persistent?: boolean } | undefined;
  const timers = new Map<number, () => void>();
  let nextTimer = 0;
  const deps: OrchestraWatchDeps = {
    getProject: () => ({
      id: "project",
      name: "Project",
      path: "C:/repo",
      addedAt: "2026-08-09T22:00:00.000Z",
      lastOpened: "2026-08-09T22:00:00.000Z",
    }),
    existsSync: () => options.exists ?? true,
    watch: (_path, _options, nextListener) => {
      watchCount += 1;
      watchedPath = _path;
      watchedOptions = _options;
      listener = nextListener;
      return { close: () => { closeCount += 1; }, on: () => undefined } as never;
    },
    setTimeout: (callback) => {
      nextTimer += 1;
      timers.set(nextTimer, callback);
      return nextTimer as never;
    },
    clearTimeout: (timer) => { timers.delete(timer as never as number); },
  };
  return {
    deps,
    change(filename: string) { listener?.("change", filename); },
    flush() { for (const callback of [...timers.values()]) callback(); timers.clear(); },
    watchCount: () => watchCount,
    closeCount: () => closeCount,
    watchedPath: () => watchedPath,
    watchedOptions: () => watchedOptions,
    openTimerCount: () => timers.size,
  };
}

describe("orchestra watcher", () => {
  it("shares one orchestra watcher across subscribers and tears it down at zero", () => {
    const fs = watchHarness();
    const a = subscribeOrchestraChange("project", () => {}, fs.deps);
    const b = subscribeOrchestraChange("project", () => {}, fs.deps);
    try {
      expect(fs.watchCount()).toBe(1);
      expect(fs.watchedPath()).toBe(path.join("C:/repo", ".orchestra"));
      expect(fs.watchedOptions()).toEqual({ recursive: false, persistent: false });
      a();
      expect(fs.closeCount()).toBe(0);
      b();
      expect(fs.closeCount()).toBe(1);
    } finally {
      a();
      b();
    }
  });

  it("filters unrelated files and coalesces state changes", () => {
    const fs = watchHarness();
    let changes = 0;
    const unsubscribe = subscribeOrchestraChange("project", () => { changes += 1; }, fs.deps);
    try {
      fs.change("history.json");
      fs.change("state.json");
      fs.change("state.json");
      fs.flush();
      expect(changes).toBe(1);
    } finally {
      unsubscribe();
    }
  });

  it("is a no-op when the orchestra directory is absent", () => {
    const fs = watchHarness({ exists: false });
    const unsubscribe = subscribeOrchestraChange("project", () => {}, fs.deps);
    unsubscribe();
    expect(fs.watchCount()).toBe(0);
  });

  it("clears a pending debounce when the final subscriber leaves", () => {
    const fs = watchHarness();
    const unsubscribe = subscribeOrchestraChange("project", () => {}, fs.deps);
    fs.change("state.json");
    expect(fs.openTimerCount()).toBe(1);
    unsubscribe();
    expect(fs.openTimerCount()).toBe(0);
  });
});

import { describe, expect, it } from "vitest";
import { vi } from "vitest";
vi.mock("server-only", () => ({}));
import { subscribeOrchestraChange, type OrchestraWatchDeps } from "./orchestra-watch";

function watchHarness(options: { exists?: boolean } = {}) {
  let watchCount = 0;
  let closeCount = 0;
  let listener: ((event: string, filename: string | Buffer | null) => void) | undefined;
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
  };
}

describe("orchestra watcher", () => {
  it("shares one orchestra watcher across subscribers and tears it down at zero", () => {
    const fs = watchHarness();
    const a = subscribeOrchestraChange("project", () => {}, fs.deps);
    const b = subscribeOrchestraChange("project", () => {}, fs.deps);
    expect(fs.watchCount()).toBe(1);
    a();
    expect(fs.closeCount()).toBe(0);
    b();
    expect(fs.closeCount()).toBe(1);
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
});

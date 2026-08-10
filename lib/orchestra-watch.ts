import "server-only";
import { EventEmitter } from "node:events";
import fs from "node:fs";
import path from "node:path";
import { getProject } from "./config";

const CHANGE = "change";
export const ORCHESTRA_WATCH_DEBOUNCE_MS = 200;

type Watcher = Pick<fs.FSWatcher, "close" | "on">;
type Timer = ReturnType<typeof setTimeout>;

export interface OrchestraWatchDeps {
  getProject?: typeof getProject;
  existsSync?: (path: string) => boolean;
  watch?: (
    path: string,
    options: fs.WatchOptions,
    listener: (eventType: string, filename: string | Buffer | null) => void,
  ) => Watcher;
  setTimeout?: (callback: () => void, delay: number) => Timer;
  clearTimeout?: (timer: Timer) => void;
}

interface Entry {
  emitter: EventEmitter;
  watcher: Watcher | null;
  orchestraDir: string;
  refs: number;
  debounce: Timer | null;
}

const registry = new Map<string, Entry>();

function orchestraDirFor(projectId: string, deps: OrchestraWatchDeps): string | null {
  const project = (deps.getProject ?? getProject)(projectId);
  if (!project || project.path === null) return null;
  const orchestraDir = path.join(project.path, ".orchestra");
  return (deps.existsSync ?? fs.existsSync)(orchestraDir) ? orchestraDir : null;
}

function startWatcher(entry: Entry, deps: OrchestraWatchDeps): void {
  if (entry.watcher) return;
  const watch = deps.watch ?? fs.watch;
  const schedule = deps.setTimeout ?? ((callback, delay) => setTimeout(callback, delay));
  const clear = deps.clearTimeout ?? ((timer) => clearTimeout(timer));
  try {
    const watcher = watch(entry.orchestraDir, { recursive: false, persistent: false }, (_event, filename) => {
      if (filename === null || path.basename(filename.toString()) !== "state.json") return;
      if (entry.debounce !== null) clear(entry.debounce);
      entry.debounce = schedule(() => {
        entry.debounce = null;
        entry.emitter.emit(CHANGE);
      }, ORCHESTRA_WATCH_DEBOUNCE_MS);
    });
    watcher.on("error", () => {
      watcher.close();
      if (entry.watcher === watcher) entry.watcher = null;
    });
    entry.watcher = watcher;
  } catch {
    entry.watcher = null;
  }
}

export function subscribeOrchestraChange(
  projectId: string,
  onChange: () => void,
  deps: OrchestraWatchDeps = {},
): () => void {
  const orchestraDir = orchestraDirFor(projectId, deps);
  if (!orchestraDir) return () => {};

  let entry = registry.get(projectId);
  if (!entry) {
    const emitter = new EventEmitter();
    emitter.setMaxListeners(0);
    entry = { emitter, watcher: null, orchestraDir, refs: 0, debounce: null };
    registry.set(projectId, entry);
  }

  entry.refs += 1;
  entry.emitter.on(CHANGE, onChange);
  startWatcher(entry, deps);
  let subscribed = true;

  return () => {
    if (!subscribed) return;
    subscribed = false;
    entry.emitter.off(CHANGE, onChange);
    entry.refs -= 1;
    if (entry.refs > 0) return;
    if (entry.debounce !== null) {
      const clear = deps.clearTimeout ?? ((timer) => clearTimeout(timer));
      clear(entry.debounce);
      entry.debounce = null;
    }
    entry.watcher?.close();
    registry.delete(projectId);
  };
}

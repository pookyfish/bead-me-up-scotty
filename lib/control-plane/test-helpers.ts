export interface FakeFileStat {
  mtimeMs: number;
  size: number;
}

export interface FakeFsOptions {
  json?: unknown;
  text?: string;
  missing?: boolean;
  mtimeMs?: number;
  size?: number;
  now?: string;
}

export interface FakeFs {
  resolveStatePath(projectPath: string): string;
  stat(path: string): Promise<FakeFileStat>;
  readFile(path: string): Promise<string>;
  writeFile(path: string, contents: string): Promise<void>;
  now(): Date;
  readCount(): number;
  statCount(): number;
  writeCount(): number;
  setFile(options: Omit<FakeFsOptions, "now">): void;
}

const DEFAULT_NOW = "2026-08-09T22:00:00.000Z";
const DEFAULT_MTIME_MS = Date.parse("2026-08-09T21:59:00.000Z");

function missingFileError(path: string): NodeJS.ErrnoException {
  return Object.assign(new Error(`ENOENT: no such file or directory, stat '${path}'`), {
    code: "ENOENT",
  });
}

export function fakeFs(options: FakeFsOptions = {}): FakeFs {
  let current = { ...options };
  let reads = 0;
  let stats = 0;
  let writes = 0;

  const contents = () => current.text ?? JSON.stringify(current.json ?? {});
  const resolvedPath = (projectPath: string) =>
    `${projectPath.replace(/[\\/]+$/, "")}/.orchestra/state.json`;

  return {
    resolveStatePath: resolvedPath,
    async stat(path) {
      stats += 1;
      if (current.missing) {
        throw missingFileError(path);
      }
      return {
        mtimeMs: current.mtimeMs ?? DEFAULT_MTIME_MS,
        size: current.size ?? Buffer.byteLength(contents(), "utf8"),
      };
    },
    async readFile(path) {
      reads += 1;
      if (current.missing) {
        throw missingFileError(path);
      }
      return contents();
    },
    async writeFile() {
      writes += 1;
    },
    now: () => new Date(options.now ?? DEFAULT_NOW),
    readCount: () => reads,
    statCount: () => stats,
    writeCount: () => writes,
    setFile(next) {
      current = { ...current, ...next };
    },
  };
}

export function fakeClock(initial = DEFAULT_NOW) {
  let currentMs = Date.parse(initial);
  if (!Number.isFinite(currentMs)) {
    throw new Error(`Invalid fake-clock instant: ${initial}`);
  }

  return {
    now: () => new Date(currentMs),
    set(instant: string | number | Date) {
      const nextMs = new Date(instant).getTime();
      if (!Number.isFinite(nextMs)) {
        throw new Error(`Invalid fake-clock instant: ${String(instant)}`);
      }
      currentMs = nextMs;
    },
    advance(ms: number) {
      currentMs += ms;
    },
  };
}

export function abortAwareDeferred<T>(signal?: AbortSignal) {
  let resolvePromise!: (value: T | PromiseLike<T>) => void;
  let rejectPromise!: (reason?: unknown) => void;
  let settled = false;
  let aborts = 0;

  const cleanup = () => signal?.removeEventListener("abort", onAbort);
  const onAbort = () => {
    if (settled) return;
    settled = true;
    aborts += 1;
    cleanup();
    rejectPromise(signal?.reason ?? new DOMException("Aborted", "AbortError"));
  };

  const promise = new Promise<T>((resolve, reject) => {
    resolvePromise = resolve;
    rejectPromise = reject;
  });

  if (signal?.aborted) {
    onAbort();
  } else {
    signal?.addEventListener("abort", onAbort, { once: true });
  }

  return {
    promise,
    resolve(value: T | PromiseLike<T>) {
      if (settled) return;
      settled = true;
      cleanup();
      resolvePromise(value);
    },
    reject(reason?: unknown) {
      if (settled) return;
      settled = true;
      cleanup();
      rejectPromise(reason);
    },
    abortCount: () => aborts,
  };
}

const MAX_LARGE_FIXTURE_ITEMS = 500;

function assertFixtureCount(count: number) {
  if (!Number.isInteger(count) || count < 0 || count > MAX_LARGE_FIXTURE_ITEMS) {
    throw new RangeError(
      `Fixture count must be an integer between 0 and ${MAX_LARGE_FIXTURE_ITEMS}.`,
    );
  }
}

export function buildFixtureArray<T>(
  count: number,
  build: (index: number) => T,
): T[] {
  assertFixtureCount(count);
  return Array.from({ length: count }, (_, index) => build(index));
}

export function buildFixtureRecord<T>(
  count: number,
  build: (index: number) => T,
  key = (index: number) => `entry-${index}`,
): Record<string, T> {
  assertFixtureCount(count);
  return Object.fromEntries(
    Array.from({ length: count }, (_, index) => [key(index), build(index)]),
  );
}

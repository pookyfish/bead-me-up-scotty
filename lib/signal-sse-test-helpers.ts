import type { SignalSseDeps, SubscribeSignal } from "./signal-sse";

type Mode = "request-abort" | "reader-cancel" | "shutdown" | "enqueue-failure";
type ThrowingCleanup = "heartbeat" | "unsubscribe" | "unregister";

class BoundedResponseReader {
  private readonly reader: ReadableStreamDefaultReader<Uint8Array>;
  private readonly decoder = new TextDecoder();

  constructor(response: Response) {
    if (!response.body) throw new Error("Expected an SSE response body.");
    this.reader = response.body.getReader();
  }

  async readUntil(text: string, timeoutMs: number): Promise<string> {
    let output = "";
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([
        (async () => {
          while (!output.includes(text)) {
            const { done, value } = await this.reader.read();
            if (done) throw new Error(`Stream closed before ${text} arrived.`);
            output += this.decoder.decode(value, { stream: true });
          }
        })(),
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => reject(new Error(`Timed out waiting for ${text}.`)), timeoutMs);
        }),
      ]);
      return output;
    } finally {
      if (timer !== undefined) clearTimeout(timer);
    }
  }

  cancel(): Promise<void> {
    return this.reader.cancel();
  }
}

export function signalHarness(options: {
  mode?: Mode;
  subscribeThrows?: boolean;
  cleanupThrows?: ThrowingCleanup;
} = {}) {
  const controller = new AbortController();
  let emit: ((payload: string) => void) | undefined;
  let unsubscribe = 0;
  let unregister = 0;
  let heartbeat = 0;
  let clearedHeartbeat = 0;
  let shutdown: (() => void) | undefined;
  const timers = new Map<number, () => void>();

  const subscribe: SubscribeSignal = (nextEmit) => {
    if (options.subscribeThrows) throw new Error("subscribe failed");
    emit = nextEmit;
    return () => {
      unsubscribe += 1;
      if (options.cleanupThrows === "unsubscribe") throw new Error("unsubscribe failed");
    };
  };

  const deps: SignalSseDeps = {
    setInterval: (callback) => {
      heartbeat += 1;
      timers.set(heartbeat, callback);
      return heartbeat as unknown as ReturnType<typeof setInterval>;
    },
    clearInterval: (timer) => {
      if (timers.delete(timer as unknown as number)) clearedHeartbeat += 1;
      if (options.cleanupThrows === "heartbeat") throw new Error("clear heartbeat failed");
    },
    registerSseStream: (close) => {
      shutdown = close;
      return () => {
        unregister += 1;
        if (options.cleanupThrows === "unregister") throw new Error("unregister failed");
      };
    },
  };

  let activeReader: BoundedResponseReader | undefined;
  return {
    request: new Request("http://localhost/stream", { signal: controller.signal }),
    subscribe,
    deps,
    emit(payload: string) { emit?.(payload); },
    abort() { controller.abort(); },
    readerFor(response: Response) {
      activeReader = new BoundedResponseReader(response);
      return activeReader;
    },
    async trigger(mode: Mode) {
      if (mode === "request-abort") controller.abort();
      if (mode === "reader-cancel") await activeReader?.cancel();
      if (mode === "shutdown") shutdown?.();
      if (mode === "enqueue-failure") {
        await activeReader?.cancel();
        emit?.("orchestra");
      }
    },
    async dispose() {
      controller.abort();
      await activeReader?.cancel();
      shutdown?.();
    },
    unsubscribeCount: () => unsubscribe,
    unregisterCount: () => unregister,
    clearedHeartbeatCount: () => clearedHeartbeat,
    openTimerCount: () => timers.size,
    cleanupCounts: () => ({ unsubscribe, unregister, heartbeat: clearedHeartbeat }),
  };
}

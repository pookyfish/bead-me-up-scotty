import { registerSseStream } from "./sse-registry";

export type SubscribeSignal = (emit: (payload: string) => void) => () => void;

type IntervalHandle = ReturnType<typeof setInterval>;

export interface SignalSseDeps {
  setInterval?: (callback: () => void, delay: number) => IntervalHandle;
  clearInterval?: (handle: IntervalHandle) => void;
  registerSseStream?: (close: () => void) => () => void;
}

export const HEARTBEAT_MS = 25_000;

export const defaultSignalSseDeps: Required<SignalSseDeps> = {
  setInterval: (callback, delay) => setInterval(callback, delay),
  clearInterval: (handle) => clearInterval(handle),
  registerSseStream,
};

function suppressCleanupError(cleanup: () => void): void {
  try {
    cleanup();
  } catch {
    // A stream must finish every cleanup step even if an external cleanup callback fails.
  }
}

export function createSignalSseResponse(
  request: Request,
  subscribe: SubscribeSignal,
  deps: SignalSseDeps = defaultSignalSseDeps,
): Response {
  const setHeartbeat = deps.setInterval ?? defaultSignalSseDeps.setInterval;
  const clearHeartbeat = deps.clearInterval ?? defaultSignalSseDeps.clearInterval;
  const register = deps.registerSseStream ?? defaultSignalSseDeps.registerSseStream;
  const encoder = new TextEncoder();
  let close = () => {};

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let closed = false;
      let unsubscribe: (() => void) | undefined;
      let unregister: (() => void) | undefined;
      let heartbeat: IntervalHandle | undefined;
      let listening = false;

      close = () => {
        if (closed) return;
        closed = true;
        if (heartbeat !== undefined) {
          const currentHeartbeat = heartbeat;
          heartbeat = undefined;
          suppressCleanupError(() => clearHeartbeat(currentHeartbeat));
        }
        if (listening) {
          listening = false;
          suppressCleanupError(() => request.signal.removeEventListener("abort", close));
        }
        const currentUnsubscribe = unsubscribe;
        unsubscribe = undefined;
        if (currentUnsubscribe) suppressCleanupError(currentUnsubscribe);
        const currentUnregister = unregister;
        unregister = undefined;
        if (currentUnregister) suppressCleanupError(currentUnregister);
        suppressCleanupError(() => controller.close());
      };

      const send = (chunk: string) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(chunk));
        } catch {
          close();
        }
      };

      try {
        unregister = register(close);
        request.signal.addEventListener("abort", close);
        listening = true;
        if (request.signal.aborted) {
          close();
          return;
        }
        send(": connected\n\n");
        unsubscribe = subscribe((payload) => send(`event: change\ndata: ${payload}\n\n`));
        heartbeat = setHeartbeat(() => send(": ping\n\n"), HEARTBEAT_MS);
      } catch (error) {
        close();
        throw error;
      }
    },
    cancel() {
      close();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}

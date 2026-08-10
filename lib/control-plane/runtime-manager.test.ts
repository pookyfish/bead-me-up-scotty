import { afterEach, describe, expect, it, vi } from "vitest";
import {
  observeRuntimeManager,
  type RuntimeManagerDependencies,
} from "./runtime-manager";

vi.mock("server-only", () => ({}));

const OBSERVED_AT = "2026-08-10T02:30:00.000Z";

interface FakeRuntimeOptions {
  tokenMissing?: boolean;
  health?: { ok: true; epoch: number; pid: number };
  healthTimeout?: boolean;
  servicesTimeout?: boolean;
  servicesBodyTimeout?: boolean;
  neverResolves?: boolean;
  status?: number;
  serviceVerdict?: "adopted" | "foreign" | "down" | "unknown";
  malformedHealth?: boolean;
  malformedServices?: boolean;
}

interface RuntimeManagerFetchRequest {
  url: string;
  method: string;
  token: string | null;
  signal?: AbortSignal | null;
}

interface FakeRuntime extends RuntimeManagerDependencies {
  activeRequests(): number;
  requests(): RuntimeManagerFetchRequest[];
  tokenPaths(): string[];
}

function serviceFixture(
  verdict: "adopted" | "foreign" | "down" | "unknown" = "adopted",
) {
  const running = verdict !== "down";
  return {
    kind: "scotty",
    health: "http://localhost:1701/",
    healthExpect: "Bead Me Up",
    expectExe: ["node.exe"],
    description: "Beads dashboard on :1701",
    port: 1701,
    stateful: false,
    running,
    verdict,
    occupant: running
      ? {
          pid: 101,
          exe: "node.exe",
          startTime: "20260810010000.000000-420",
          commandLine: "must not cross the wire boundary",
        }
      : null,
    record: running
      ? {
          pid: 101,
          exe: "node.exe",
          startTime: "20260810010000.000000-420",
          startedBy: "rmctl",
          reason: "verification",
          since: "2026-08-10T01:00:00.000Z",
          log: "must not cross the wire boundary",
        }
      : null,
    inflightOp: null,
    token: "test-token",
    raw_body: "raw-body-marker",
    headers: { authorization: "must not cross the wire boundary" },
  };
}

function fakeRuntime(options: FakeRuntimeOptions = {}): FakeRuntime {
  const requests: RuntimeManagerFetchRequest[] = [];
  const tokenPaths: string[] = [];
  let active = 0;
  const health = options.health ?? { ok: true as const, epoch: 13, pid: 7 };

  const pendingResponse = (signal?: AbortSignal | null): Promise<Response> => {
    active += 1;
    return new Promise((_, reject) => {
      let settled = false;
      const onAbort = () => {
        if (settled) return;
        settled = true;
        active -= 1;
        signal?.removeEventListener("abort", onAbort);
        reject(signal?.reason ?? new DOMException("Aborted", "AbortError"));
      };
      if (signal?.aborted) onAbort();
      else signal?.addEventListener("abort", onAbort, { once: true });
    });
  };

  return {
    readFile: async (tokenPath) => {
      tokenPaths.push(tokenPath);
      if (options.tokenMissing) {
        throw Object.assign(new Error("Token missing"), { code: "ENOENT" });
      }
      return "  test-token\r\n";
    },
    fetch: async (url, init) => {
      requests.push({
        url,
        method: init.method ?? "GET",
        token: new Headers(init.headers).get("X-RM-Token"),
        signal: init.signal,
      });
      const isHealth = url.endsWith("/health");
      if (
        options.neverResolves ||
        (isHealth && options.healthTimeout) ||
        (!isHealth && options.servicesTimeout)
      ) {
        return pendingResponse(init.signal);
      }

      active += 1;
      active -= 1;
      if (options.status) {
        return new Response(JSON.stringify({ error: "request rejected", token: "test-token" }), {
          status: options.status,
          headers: { "X-Raw-Header": "must not cross the wire boundary" },
        });
      }
      if (isHealth) {
        return Response.json(options.malformedHealth ? { ok: "yes" } : health);
      }
      if (options.servicesBodyTimeout) {
        const response = new Response(null, { status: 200 });
        Object.defineProperty(response, "json", {
          value: () => new Promise<never>(() => {}),
        });
        return response;
      }
      return Response.json(
        options.malformedServices
          ? { epoch: health.epoch, services: "not-an-object", raw_body: "raw-body-marker" }
          : {
              epoch: health.epoch,
              services: { scotty: serviceFixture(options.serviceVerdict) },
              raw_body: "raw-body-marker",
            },
      );
    },
    now: () => new Date(OBSERVED_AT),
    activeRequests: () => active,
    requests: () => requests,
    tokenPaths: () => tokenPaths,
  };
}

afterEach(() => {
  vi.useRealTimers();
});

describe("observeRuntimeManager", () => {
  it("returns not_configured without the project-local manager token", async () => {
    const deps = fakeRuntime({ tokenMissing: true });

    const result = await observeRuntimeManager("C:/repo", deps);

    expect(result.error?.code).toBe("not_configured");
    expect(result.data).toBeUndefined();
    expect(deps.requests()).toEqual([]);
  });

  it("uses the project-local token on fixed read-only loopback endpoints", async () => {
    const deps = fakeRuntime();

    const result = await observeRuntimeManager("C:/repo", deps);

    expect(result.capability).toBe("available");
    expect(result.data).toMatchObject({ epoch: 13, managerPid: 7 });
    expect(deps.tokenPaths()).toEqual([
      "C:\\repo\\tools\\runtime-manager\\state\\manager-token",
    ]);
    expect(deps.requests().map(({ url, method, token }) => ({ url, method, token }))).toEqual([
      {
        url: "http://127.0.0.1:1735/health",
        method: "GET",
        token: "test-token",
      },
      {
        url: "http://127.0.0.1:1735/services",
        method: "GET",
        token: "test-token",
      },
    ]);
  });

  it("returns degraded health when services exceed eight seconds", async () => {
    vi.useFakeTimers();
    const deps = fakeRuntime({
      health: { ok: true, epoch: 13, pid: 7 },
      servicesTimeout: true,
    });

    const pending = observeRuntimeManager("C:/repo", deps);
    await vi.advanceTimersByTimeAsync(8_000);
    const result = await pending;

    expect(result.capability).toBe("degraded");
    expect(result.data?.epoch).toBe(13);
    expect(result.data?.managerPid).toBe(7);
    expect(result.data?.services).toBeNull();
    expect(result.error?.code).toBe("timeout");
    expect(deps.activeRequests()).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("keeps the eight-second deadline active while reading the services body", async () => {
    vi.useFakeTimers();
    const pending = observeRuntimeManager(
      "C:/repo",
      fakeRuntime({ servicesBodyTimeout: true }),
    );
    let settled = false;
    void pending.then(
      () => { settled = true; },
      () => { settled = true; },
    );

    await vi.advanceTimersByTimeAsync(8_000);

    expect(settled).toBe(true);
    const result = await pending;
    expect(result.capability).toBe("degraded");
    expect(result.data).toEqual({ epoch: 13, managerPid: 7, services: null });
    expect(result.error?.code).toBe("timeout");
    expect(vi.getTimerCount()).toBe(0);
  });

  it("bounds health reads at two seconds", async () => {
    vi.useFakeTimers();
    const deps = fakeRuntime({ healthTimeout: true });

    const pending = observeRuntimeManager("C:/repo", deps);
    await vi.advanceTimersByTimeAsync(2_000);
    const result = await pending;

    expect(result.capability).toBe("unavailable");
    expect(result.error?.code).toBe("timeout");
    expect(result.data).toBeUndefined();
    expect(deps.activeRequests()).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("aborts both reads when the aggregate snapshot deadline fires", async () => {
    vi.useFakeTimers();
    const parent = new AbortController();
    const deps = fakeRuntime({ neverResolves: true });

    const pending = observeRuntimeManager("C:/repo", deps, parent.signal);
    await vi.advanceTimersByTimeAsync(0);
    expect(deps.activeRequests()).toBe(2);
    parent.abort();
    const result = await pending;

    expect(result.error?.code).toBe("timeout");
    expect(result.data).toBeUndefined();
    expect(deps.activeRequests()).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("preserves foreign ownership and never emits token, raw body, or headers", async () => {
    const result = await observeRuntimeManager(
      "C:/repo",
      fakeRuntime({ serviceVerdict: "foreign" }),
    );

    expect(result.data?.services?.scotty.verdict).toBe("foreign");
    expect(result.data?.services?.scotty.occupant?.pid).toBe(101);
    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain("test-token");
    expect(serialized).not.toContain("raw-body-marker");
    expect(serialized).not.toContain("authorization");
    expect(serialized).not.toContain("commandLine");
    expect(serialized).not.toContain("\"log\"");
  });

  it("maps HTTP 401 to unauthorized", async () => {
    const result = await observeRuntimeManager(
      "C:/repo",
      fakeRuntime({ status: 401 }),
    );

    expect(result.error?.code).toBe("unauthorized");
    expect(result.data).toBeUndefined();
    expect(JSON.stringify(result)).not.toContain("test-token");
  });

  it("retains health when the service inventory is malformed", async () => {
    const result = await observeRuntimeManager(
      "C:/repo",
      fakeRuntime({ malformedServices: true }),
    );

    expect(result.capability).toBe("degraded");
    expect(result.error?.code).toBe("parse_error");
    expect(result.data).toEqual({ epoch: 13, managerPid: 7, services: null });
  });
});

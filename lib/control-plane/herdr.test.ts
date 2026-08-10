import { describe, expect, it, vi } from "vitest";
import {
  observeHerdr,
  type HerdrDependencies,
  type HerdrExecOptions,
} from "./herdr";

vi.mock("server-only", () => ({}));

const OBSERVED_AT = "2026-08-10T01:00:00.000Z";

function herdrAgent(overrides: Record<string, unknown> = {}) {
  return {
    agent: "codex",
    agent_session: {
      source: "herdr:codex",
      agent: "codex",
      kind: "id",
      value: "session-a",
    },
    agent_status: "working",
    cwd: "C:\\repo",
    focused: false,
    pane_id: "w1:p1",
    revision: 7,
    state_change_seq: 11,
    tab_id: "w1:t1",
    terminal_id: "term-a",
    workspace_id: "w1",
    ...overrides,
  };
}

function herdrSnapshot(agents: unknown[], protocol = 19) {
  return {
    id: "request-1",
    result: {
      type: "session_snapshot",
      snapshot: {
        protocol,
        version: "0.8.0-preview",
        agents,
      },
    },
  };
}

function fakeExec(
  payload: unknown,
  onExec?: (file: string, args: readonly string[], options: HerdrExecOptions) => void,
): HerdrDependencies {
  return {
    execFile: async (file, args, options) => {
      onExec?.(file, args, options);
      return { stdout: JSON.stringify(payload), stderr: "" };
    },
    now: () => new Date(OBSERVED_AT),
  };
}

function failingExec(code: string): HerdrDependencies {
  return {
    execFile: async () => {
      throw Object.assign(new Error(`Herdr failed with ${code}`), { code });
    },
    now: () => new Date(OBSERVED_AT),
  };
}

describe("observeHerdr", () => {
  it("keeps two sessions for one provider distinct", async () => {
    const fixture = herdrSnapshot([
      herdrAgent({
        name: "same display",
        agent_session: {
          source: "herdr:codex",
          agent: "codex",
          kind: "id",
          value: "session-a",
        },
      }),
      herdrAgent({
        name: "same display",
        agent_session: {
          source: "herdr:codex",
          agent: "codex",
          kind: "id",
          value: "session-b",
        },
        pane_id: "w1:p2",
        terminal_id: "term-b",
      }),
    ]);

    const result = await observeHerdr("C:/repo", fakeExec(fixture));

    expect(result.data?.sessions.map((session) => session.provider)).toEqual([
      "codex",
      "codex",
    ]);
    expect(result.data?.sessions.map((session) => session.sessionId)).toEqual([
      "session-a",
      "session-b",
    ]);
  });

  it("maps the official agent session without inventing identity", async () => {
    const fixture = herdrSnapshot([
      herdrAgent({
        agent: "claude",
        name: "codex-supervisor",
        agent_session: {
          source: "herdr:claude",
          agent: "claude",
          kind: "path",
          value: "C:\\sessions\\conversation.jsonl",
        },
        agent_status: "paused",
      }),
    ]);

    const result = await observeHerdr("C:/repo", fakeExec(fixture));
    const session = result.data?.sessions[0];

    expect(session).toMatchObject({
      provider: "claude",
      displayName: "codex-supervisor",
      sessionId: null,
      agentSession: {
        source: "herdr:claude",
        agent: "claude",
        kind: "path",
        value: "C:\\sessions\\conversation.jsonl",
      },
      surface: "herdr",
      status: "unknown",
      workspaceId: "w1",
      tabId: "w1:t1",
      paneId: "w1:p1",
      terminalId: "term-a",
      cwd: "C:\\repo",
      focused: false,
      revision: 7,
      stateChangeSeq: 11,
    });
    expect(session).not.toHaveProperty("actor");
    expect(session).not.toHaveProperty("role");
    expect(session).not.toHaveProperty("task");
    expect(session).not.toHaveProperty("supervisor");
  });

  it("filters by path containment rather than a lexical name prefix", async () => {
    const fixture = herdrSnapshot([
      herdrAgent({ cwd: "C:\\repo" }),
      herdrAgent({ cwd: "C:\\repo\\packages\\ui", pane_id: "w1:p2" }),
      herdrAgent({ cwd: "C:\\repo2", pane_id: "w1:p3" }),
      herdrAgent({ cwd: "C:\\repo-old", pane_id: "w1:p4" }),
      herdrAgent({ cwd: null, pane_id: "w1:p5" }),
    ]);

    const result = await observeHerdr("C:/repo", fakeExec(fixture));

    expect(result.data?.sessions.map((session) => session.cwd)).toEqual([
      "C:\\repo",
      "C:\\repo\\packages\\ui",
    ]);
  });

  it("rejects unsupported protocol versions and wrong envelope types", async () => {
    const unsupported = await observeHerdr(
      "C:/repo",
      fakeExec(herdrSnapshot([herdrAgent()], 20)),
    );
    const wrongType = await observeHerdr(
      "C:/repo",
      fakeExec({ id: "request-2", result: { type: "event" } }),
    );

    expect(unsupported.error?.code).toBe("unsupported_version");
    expect(unsupported.data).toBeUndefined();
    expect(wrongType.error?.code).toBe("parse_error");
    expect(wrongType.data).toBeUndefined();
  });

  it.each([
    ["ENOENT", "not_configured"],
    ["ETIMEDOUT", "timeout"],
  ])("maps %s without claiming agents are idle", async (code, expected) => {
    const result = await observeHerdr("C:/repo", failingExec(code));

    expect(result.error?.code).toBe(expected);
    expect(result.data).toBeUndefined();
  });

  it("uses a fixed argv, bounded output, timeout, and aggregate abort signal", async () => {
    const controller = new AbortController();
    let invocation:
      | { file: string; args: readonly string[]; options: HerdrExecOptions }
      | undefined;
    const deps = fakeExec(herdrSnapshot([herdrAgent()]), (file, args, options) => {
      invocation = { file, args, options };
    });
    deps.signal = controller.signal;

    await observeHerdr("C:/repo", deps);

    expect(invocation).toEqual({
      file: "herdr",
      args: ["api", "snapshot"],
      options: {
        encoding: "utf8",
        maxBuffer: 4 * 1024 * 1024,
        timeout: 3_000,
        signal: controller.signal,
        windowsHide: true,
      },
    });
  });

  it("returns parse_error for malformed JSON without fabricated session data", async () => {
    const deps = fakeExec({});
    deps.execFile = async () => ({ stdout: "{not-json", stderr: "" });

    const result = await observeHerdr("C:/repo", deps);

    expect(result.error?.code).toBe("parse_error");
    expect(result.data).toBeUndefined();
  });
});

import { describe, expect, it } from "vitest";
import {
  availableObservation,
  failedObservation,
  herdrSnapshotSchema,
  hookCoverageSnapshotSchema,
  observationSchema,
  orchestraSnapshotSchema,
  runtimeManagerSnapshotSchema,
} from "./types";

describe("control-plane observation contract", () => {
  it("requires data for an available observation", () => {
    expect(
      observationSchema.safeParse({
        source: "herdr",
        authority: "managed-session-runtime",
        observedAt: "2026-08-09T22:00:00.000Z",
        freshness: "live",
        capability: "available",
        capabilities: ["observe"],
      }).success,
    ).toBe(false);
  });

  it("allows degraded data only with a stable diagnostic", () => {
    const result = failedObservation(
      "runtime-manager",
      "service-runtime",
      "degraded",
      "timeout",
      "Service inventory exceeded the read budget.",
      { epoch: 13 },
      ["observe-health"],
      { observedAt: "2026-08-09T22:00:00.000Z", freshness: "live" },
    );
    expect(observationSchema.parse(result).error?.code).toBe("timeout");
    expect(result.freshness).toBe("live");
  });

  it("preserves explicit live, cached, stale, and unknown freshness", () => {
    expect(availableObservation("git", "repository", {}, ["observe"], { freshness: "live" }).freshness).toBe("live");
    expect(availableObservation("orchestra", "coordination", {}, ["observe"], { freshness: "cached" }).freshness).toBe("cached");
    expect(failedObservation("git", "repository", "degraded", "timeout", "Timed out.", {}, ["observe"], { freshness: "stale" }).freshness).toBe("stale");
    expect(failedObservation("herdr", "runtime", "unavailable", "unavailable", "Unavailable.", undefined, [], { freshness: "unknown" }).freshness).toBe("unknown");
  });

  it("does not merge actor, session, surface, role, or task identity", () => {
    const result = availableObservation(
      "herdr",
      "managed-session-runtime",
      { sessions: [{ actor: "codex-supervisor", sessionId: "s1" }, { actor: "codex-supervisor", sessionId: "s2" }] },
      ["observe"],
      { observedAt: "2026-08-09T22:00:00.000Z" },
    );
    expect(result.data.sessions).toHaveLength(2);
  });

  it("keeps orchestra wire validation closed to raw coordination fields", () => {
    const sections = {
      activeWork: { total: 0, included: 0, rejected: 0, truncated: false },
      fileLocks: { total: 0, included: 0, rejected: 0, truncated: false },
      integrationQueue: { total: 0, included: 0, rejected: 0, truncated: false },
      conflicts: { total: 0, included: 0, rejected: 0, truncated: false },
      decisions: { total: 0, included: 0, rejected: 0, truncated: false },
      impacts: { total: 0, included: 0, rejected: 0, truncated: false },
    };
    const parsed = orchestraSnapshotSchema.parse({
      schemaVersion: 2,
      supervisor: null,
      activeWork: {},
      fileLocks: {},
      pendingIntegration: [],
      unresolvedConflicts: [],
      unresolvedImpacts: [],
      recentDecisions: [],
      sections,
      raw_details_blob: "must not cross the wire boundary",
    });

    expect(parsed).not.toHaveProperty("raw_details_blob");
  });

  it("keeps the Herdr wire contract closed to inferred identity fields", () => {
    const parsed = herdrSnapshotSchema.parse({
      protocol: 19,
      version: "0.8.0-preview",
      sessions: [{
        provider: "codex",
        displayName: "codex-supervisor",
        sessionId: "session-a",
        agentSession: {
          source: "herdr:codex",
          agent: "codex",
          kind: "id",
          value: "session-a",
        },
        surface: "herdr",
        status: "working",
        workspaceId: "w1",
        tabId: "w1:t1",
        paneId: "w1:p1",
        terminalId: "term-a",
        cwd: "C:\\repo",
        focused: true,
        revision: 3,
        stateChangeSeq: 5,
        actor: "must not cross the wire boundary",
        role: "supervisor",
        task: "Task 3",
      }],
    });

    expect(parsed.sessions[0]).not.toHaveProperty("actor");
    expect(parsed.sessions[0]).not.toHaveProperty("role");
    expect(parsed.sessions[0]).not.toHaveProperty("task");
  });

  it("keeps Runtime Manager service observations closed to transport details", () => {
    const parsed = runtimeManagerSnapshotSchema.parse({
      epoch: 13,
      managerPid: 7,
      services: {
        scotty: {
          description: "Beads dashboard on :1701",
          port: 1701,
          stateful: false,
          running: true,
          verdict: "foreign",
          occupant: {
            pid: 101,
            exe: "node.exe",
            startTime: "20260810010000.000000-420",
            commandLine: "must not cross the wire boundary",
          },
          record: {
            startedBy: "rmctl",
            reason: "verification",
            since: "2026-08-10T01:00:00.000Z",
            token: "must not cross the wire boundary",
          },
          inflightOp: null,
          raw_body: "must not cross the wire boundary",
          headers: { authorization: "must not cross the wire boundary" },
        },
      },
      token: "must not cross the wire boundary",
      raw_body: "must not cross the wire boundary",
    });

    expect(parsed.services?.scotty.verdict).toBe("foreign");
    expect(parsed).not.toHaveProperty("token");
    expect(parsed).not.toHaveProperty("raw_body");
    expect(parsed.services?.scotty).not.toHaveProperty("headers");
    expect(parsed.services?.scotty.occupant).not.toHaveProperty("commandLine");
    expect(parsed.services?.scotty.record).not.toHaveProperty("token");
  });

  it("keeps hook coverage wire data redacted to configuration evidence", () => {
    const parsed = hookCoverageSnapshotSchema.parse({
      scope: "project-only",
      claudeSettingsPresent: true,
      codexHookConfigPresent: false,
      references: [{
        provider: "claude",
        event: "SessionStart",
        executableBasename: "node",
        fileRef: ".claude/hooks/actor-stamp.cjs",
        fileScope: "project",
        exists: true,
        command: "must not cross the wire boundary",
        env: { token: "must not cross the wire boundary" },
      }],
      missingConfiguredFiles: [],
      codexGlobalCoverage: "unknown",
      rawConfig: "must not cross the wire boundary",
    });

    expect(parsed).not.toHaveProperty("rawConfig");
    expect(parsed.references[0]).not.toHaveProperty("command");
    expect(parsed.references[0]).not.toHaveProperty("env");
  });
});

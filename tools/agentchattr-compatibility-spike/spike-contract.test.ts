import { describe, expect, it } from "vitest";

import {
  APPROVED_UPSTREAM_PIN,
  createLoopGuardState,
  recordAuthenticatedHumanOrigin,
  requestAutonomousSend,
  validateEvidenceManifest,
} from "./spike-contract";

const hashes = {
  a: `sha256:${"a".repeat(64)}`,
  b: `sha256:${"b".repeat(64)}`,
  c: `sha256:${"c".repeat(64)}`,
  d: `sha256:${"d".repeat(64)}`,
  e: `sha256:${"e".repeat(64)}`,
  f: `sha256:${"f".repeat(64)}`,
};

const times = {
  before: "2026-08-10T07:59:59.000Z",
  start: "2026-08-10T08:00:00.000Z",
  one: "2026-08-10T08:00:01.000Z",
  two: "2026-08-10T08:00:02.000Z",
  three: "2026-08-10T08:00:03.000Z",
  four: "2026-08-10T08:00:04.000Z",
  five: "2026-08-10T08:00:05.000Z",
  six: "2026-08-10T08:00:06.000Z",
  seven: "2026-08-10T08:00:07.000Z",
  eight: "2026-08-10T08:00:08.000Z",
  after: "2026-08-10T08:00:09.000Z",
  later: "2026-08-10T09:00:00.000Z",
};

type JsonRecord = Record<string, unknown>;

function evidenceBase(kind: string, caseId: string, observedAt = times.four) {
  return {
    caseId,
    kind,
    expectedResult: "pass",
    observedResult: "pass",
    classification: "pass",
    startedAt: times.start,
    observedAt,
    provenance: {
      sourceKind: "synthetic_fixture",
      sourceRef: `${caseId}-source`,
      digest: hashes.a,
    },
    artifacts: [{ kind: "synthetic_fixture", digest: hashes.a }],
  };
}

function configurationBoundary() {
  return {
    ...evidenceBase("configuration_boundary", "configuration-boundary", times.one),
    lifecycleOwner: "runtime-manager",
    invocation: "direct_server",
    bindHost: "127.0.0.1",
    authentication: "enabled",
    disposableRootLabel: "agentchattr-spike",
    argvTemplateHash: hashes.a,
    reviewedArgvTemplate: ["agentchattr-server", "<data-dir>", "<port>", "<secret>"],
    launcherState: "disabled",
    wrapperState: "disabled",
    triggerConsumerState: "disabled",
    terminalInjectionState: "disabled",
    autoWakeState: "disabled",
    jobsState: "disabled",
    persistentRulesState: "disabled",
  };
}

const monitorKinds = [
  "process",
  "child_process",
  "trigger_queue",
  "herdr_pane",
  "input_control",
  "runtime_manager_inventory",
] as const;

function monitorInterval(monitorKind: (typeof monitorKinds)[number]) {
  return {
    ...evidenceBase("monitor_interval", `monitor-${monitorKind.replaceAll("_", "-")}`, times.after),
    startedAt: times.before,
    intervalMs: 250,
    eventCount: 0,
    baselineEvidenceHash: hashes.b,
    finalEvidenceHash: hashes.c,
    gapState: "no_gap",
    finalCaptureState: "captured",
    monitorKind,
  };
}

function teardown() {
  return {
    ...evidenceBase("teardown", "teardown-complete", times.eight),
    startedAt: times.seven,
    serviceDeregistration: {
      serviceName: "agentchattr-spike",
      state: "deregistered",
      evidenceHash: hashes.d,
    },
    baselineInventoryRestoration: {
      state: "restored_exact",
      baselineEvidenceHash: hashes.b,
      finalEvidenceHash: hashes.c,
    },
    desktopProfileConfigRestoration: { state: "restored", evidenceHash: hashes.d },
    credentialRemoval: { state: "removed", evidenceHash: hashes.d },
    listenerRemoval: { state: "removed", evidenceHash: hashes.d },
    finalMonitorCapture: { state: "captured", evidenceHash: hashes.c },
    disposableRoot: { state: "deleted", ownership: "owned" },
  };
}

function validManifestV2(records: JsonRecord[] = []) {
  return {
    schemaVersion: 2,
    spike: "agentchattr-compatibility",
    stage: "1.5",
    manifestId: "agentchattr-contract-manifest",
    runId: "contract-run",
    executionState: "completed",
    upstream: { ...APPROVED_UPSTREAM_PIN },
    endpoint: { host: "127.0.0.1", port: 43123, state: "stopped" },
    resourceAdmission: {
      measurementState: "measured",
      availablePhysicalMemoryGiB: 16,
      aggregateWorkingSetPercent: 35,
      otherResourceHeavyJobActive: false,
      runtimeManagerCorrelationId: "runtime-manager-correlation",
      admissionResult: "admitted",
    },
    safety: {
      lifecycleOwner: "runtime-manager",
      launcher: "disabled",
      wrapper: "disabled",
      triggerQueueConsumer: "disabled",
      terminalInjection: "disabled",
      autoWake: "disabled",
      jobsAuthority: "disabled",
      persistentRules: "disabled",
    },
    evidence: [
      configurationBoundary(),
      ...monitorKinds.map(monitorInterval),
      ...records,
      teardown(),
    ],
  };
}

function validNotRunManifestV2() {
  return {
    schemaVersion: 2,
    spike: "agentchattr-compatibility",
    stage: "1.5",
    manifestId: "agentchattr-not-run-manifest",
    runId: "not-run",
    executionState: "not_run",
    upstream: { ...APPROVED_UPSTREAM_PIN },
    endpoint: { host: "127.0.0.1", port: 43123, state: "candidate_only_not_bound" },
    resourceAdmission: {
      measurementState: "not_run",
      availablePhysicalMemoryGiB: null,
      aggregateWorkingSetPercent: null,
      otherResourceHeavyJobActive: null,
      runtimeManagerCorrelationId: null,
      admissionResult: "not_run",
    },
    safety: {
      lifecycleOwner: "runtime-manager",
      launcher: "not_run",
      wrapper: "not_run",
      triggerQueueConsumer: "not_run",
      terminalInjection: "not_run",
      autoWake: "not_run",
      jobsAuthority: "not_run",
      persistentRules: "not_run",
    },
    evidence: [],
  };
}

function expectIssue(value: unknown, code: string, classification: "fail" | "unsupported" | "unknown") {
  expect(validateEvidenceManifest(value).issues).toContainEqual({
    code,
    classification,
    path: expect.any(String),
  });
}

function identityBinding(suffix = "one", overrides: JsonRecord = {}) {
  return {
    ...evidenceBase("identity_binding", `identity-${suffix}`, times.three),
    actorId: "actor-one",
    logicalSessionId: "logical-session-one",
    executionSurface: "herdr",
    orchestrationRole: "worker",
    modelProvider: "anthropic",
    modelId: "claude-sonnet",
    herdrSessionRef: "herdr-session-one",
    agentChattrInstanceId: "agentchattr-instance",
    agentChattrSessionId: "agentchattr-session-one",
    agentChattrExternalId: "external-agent-one",
    beadsActorId: "beads-actor-one",
    validFrom: times.start,
    validUntil: times.later,
    bindingState: "verified",
    ...overrides,
  };
}

function messageObservation(suffix: string, overrides: JsonRecord = {}) {
  return {
    ...evidenceBase("message_observation", `message-${suffix}`, times.four),
    providerInstanceId: "agentchattr-instance",
    channelId: "channel-one",
    stableMessageUid: `message-${suffix}`,
    cursorId: 10,
    parentUid: null,
    threadId: null,
    senderExternalId: "external-agent-one",
    contentChecksum: hashes.a,
    directEvidenceArtifactHash: hashes.b,
    transportState: "server_accepted",
    receiverAcknowledgementState: "pending",
    readState: "unread",
    observationContext: "initial_page",
    messageState: "present",
    ...overrides,
  };
}

function loopTransition(
  suffix: string,
  fromState: string,
  toState: string,
  overrides: JsonRecord = {},
) {
  const isHuman = overrides.origin === "human";
  const rejected = fromState === "paused(6)" && toState === "paused(6)";
  return {
    ...evidenceBase("loop_guard_transition", `loop-${suffix}`, times.four),
    channelId: "channel-one",
    origin: isHuman ? "human" : "agent",
    fromState,
    toState,
    mcpInvoked: !isHuman && !rejected,
    stableMessageUid: !isHuman && !rejected ? `loop-message-${suffix}` : null,
    authenticatedHumanProofHash: isHuman ? hashes.a : null,
    ...overrides,
  };
}

function beadsPromotion(suffix = "one", overrides: JsonRecord = {}) {
  return {
    ...evidenceBase("beads_promotion", `promotion-${suffix}`, times.six),
    beadId: "bead-one",
    scottyDecisionId: "decision-one",
    artifactType: "decision",
    selectedValueChecksum: hashes.a,
    agentChattrIdempotencyKey: "agentchattr:agentchattr-instance:message-one:selected",
    promotionSource: { kind: "agentchattr_message" },
    beadsArtifactId: "beads-comment-one",
    acknowledgedAt: times.five,
    verifiedAt: times.six,
    state: "durable",
    ...overrides,
  };
}

function desktopCapability(client: "claude_code_desktop" | "codex_desktop", overrides: JsonRecord = {}) {
  const suffix = client === "claude_code_desktop" ? "claude" : "codex";
  return {
    ...evidenceBase("desktop_capability", `desktop-${suffix}`, times.four),
    client,
    clientVersion: "v1",
    readClassification: "pass",
    sendClassification: "pass",
    authenticationEvidenceHash: hashes.a,
    storedMessageUid: `desktop-message-${suffix}`,
    storedMessageEvidenceHash: hashes.b,
    ...overrides,
  };
}

function runtimeSnapshot(adapter: "direct_herdr" | "herdr_telemetry_bridge", suffix: string, overrides: JsonRecord = {}) {
  return {
    ...evidenceBase("runtime_observation", `runtime-snapshot-${suffix}`, times.four),
    runtimeProvider: "herdr",
    adapter,
    measurementQuality: adapter === "direct_herdr" ? "direct" : "derived",
    freshness: "live",
    nativeContract: adapter === "direct_herdr"
      ? { versionKind: "herdr_protocol", protocol: 2 }
      : { versionKind: "named", name: "herdr-telemetry", version: "v1" },
    nativeEventId: `${suffix}-event`,
    observation: {
      observationKind: "agent_snapshot",
      workspaceId: "workspace-1",
      tabId: "tab-1",
      paneId: "pane-1",
      terminalId: "terminal-1",
      agentSessionId: "agent-session-1",
      runtimeState: "working",
      modelMetadata: {
        reportingState: "reported",
        provider: "anthropic",
        model: "claude-sonnet",
      },
      project: { projectKind: "configured_id", projectId: "scotty", relation: "root" },
    },
    ...overrides,
  };
}

describe("typed manifest aggregation and opaque extensions", () => {
  it("accepts the strict empty not-run envelope", () => {
    expect(validateEvidenceManifest(validNotRunManifestV2())).toEqual({ classification: "pass", issues: [] });
  });

  it("aggregates record classifications in fail, unsupported, unknown, pass order", () => {
    for (const [classifications, expected] of [
      [["pass"], "pass"],
      [["pass", "unknown"], "unknown"],
      [["unknown", "unsupported"], "unsupported"],
      [["unsupported", "fail"], "fail"],
    ] as const) {
      const records = classifications.map((classification, index) => ({
        ...desktopCapability(index % 2 === 0 ? "claude_code_desktop" : "codex_desktop"),
        caseId: `classification-${index}`,
        clientVersion: `v${index + 1}`,
        expectedResult: classification,
        observedResult: classification,
        classification,
        readClassification: classification,
        sendClassification: classification,
        storedMessageUid: classification === "pass" ? `classification-message-${index}` : null,
        storedMessageEvidenceHash: classification === "pass" ? hashes.a : null,
      }));
      expect(validateEvidenceManifest(validManifestV2(records)).classification).toBe(expected);
    }
  });

  it("does not inspect authority-looking safe extensions or let them alter any verdict", () => {
    const records = [
      identityBinding(),
      messageObservation("one", { collaborationIntent: "peer_acceptance", collaborationSessionId: "session-a", collaborationSequence: 0 }),
      beadsPromotion(),
    ];
    const passing = validManifestV2(records);
    const extended = structuredClone(passing);
    Reflect.set(extended, "extensions", {
      "x-supervisor-authority": "enabled",
      "x-beads-durable": "mismatched",
      "x-identity-binding": "unknown",
    });
    for (const record of extended.evidence) {
      Reflect.set(record, "extensions", {
        "x-task-assignment": "present",
        "x-approval-state": "enabled",
        "x-runtime-control": hashes.f,
      });
    }

    expect(validateEvidenceManifest(extended)).toEqual(validateEvidenceManifest(passing));

    const failing = validManifestV2([messageObservation("unbound")]);
    const failingExtended = structuredClone(failing);
    Reflect.set(failingExtended, "extensions", {
      "x-verified-identity": "present",
      "x-actor-authority": "enabled",
    });
    expect(validateEvidenceManifest(failingExtended)).toEqual(validateEvidenceManifest(failing));
  });
});

describe("typed message, identity, collaboration, and promotion invariants", () => {
  it("accepts exact overlap, replay, and post-restart observations of one durable message tuple", () => {
    const initial = messageObservation("stable");
    const overlap = { ...initial, caseId: "message-stable-overlap", observationContext: "overlap_page" };
    const replay = { ...initial, caseId: "message-stable-replay", observationContext: "retry_replay" };
    const restart = { ...initial, caseId: "message-stable-restart", observationContext: "post_restart" };

    expect(validateEvidenceManifest(validManifestV2([identityBinding(), initial, overlap, replay, restart]))).toEqual({
      classification: "pass",
      issues: [],
    });
  });

  it("allows mutable message observations to progress without changing the approved durable replay tuple", () => {
    const initial = messageObservation("progressive", {
      transportState: "queued",
      receiverAcknowledgementState: "pending",
      readState: "unread",
    });
    const progressed = {
      ...initial,
      caseId: "message-progressive-replay",
      observationContext: "retry_replay",
      transportState: "server_accepted",
      receiverAcknowledgementState: "acknowledged",
      readState: "read",
      collaborationIntent: "peer_acceptance",
      collaborationSessionId: "progressive-session",
      collaborationSequence: 0,
      directEvidenceArtifactHash: hashes.c,
    };

    expect(validateEvidenceManifest(validManifestV2([identityBinding(), initial, progressed]))).toEqual({
      classification: "pass",
      issues: [],
    });

    const divergent = { ...progressed, caseId: "message-progressive-divergent", contentChecksum: hashes.d };
    expect(validateEvidenceManifest(validManifestV2([identityBinding(), initial, divergent])).issues).toContainEqual({
      code: "message_uid_divergence",
      classification: "fail",
      path: "/evidence/9/stableMessageUid",
    });
  });

  it("rejects cursor identity, descending cursors, and divergent reuse of a stable UID", () => {
    const cursorResult = validateEvidenceManifest(
      validManifestV2([identityBinding(), messageObservation("cursor", { stableMessageUid: "10" })]),
    );
    expect(cursorResult.issues).toContainEqual({
      code: "message_cursor_used_as_uid",
      classification: "fail",
      path: "/evidence/8/stableMessageUid",
    });
    expectIssue(
      validManifestV2([
        identityBinding(),
        messageObservation("first", { cursorId: 11 }),
        messageObservation("second", { cursorId: 10 }),
      ]),
      "message_cursor_order",
      "fail",
    );
    const original = messageObservation("divergent");
    expectIssue(
      validManifestV2([
        identityBinding(),
        original,
        { ...original, caseId: "message-divergent-replay", observationContext: "retry_replay", contentChecksum: hashes.c },
      ]),
      "message_uid_divergence",
      "fail",
    );
  });

  it("requires a tombstone to link to an earlier present observation with the same durable tuple", () => {
    const present = messageObservation("deleted");
    const tombstone = {
      ...present,
      caseId: "message-deleted-tombstone",
      observedAt: times.five,
      observationContext: "tombstone",
      messageState: "deleted",
    };
    expect(validateEvidenceManifest(validManifestV2([identityBinding(), present, tombstone])).issues).toEqual([]);
    expectIssue(validManifestV2([identityBinding(), tombstone]), "message_tombstone_unlinked", "fail");
    expectIssue(
      validManifestV2([identityBinding(), present, { ...tombstone, senderExternalId: "another-sender" }]),
      "message_uid_divergence",
      "fail",
    );
  });

  it("attributes a message only through exactly one current complete verified binding", () => {
    expect(validateEvidenceManifest(validManifestV2([identityBinding(), messageObservation("bound")])).issues).toEqual([]);

    for (const binding of [
      identityBinding("unverified", { bindingState: "unverified", validUntil: null }),
      identityBinding("stale", { bindingState: "stale" }),
      identityBinding("revoked", { bindingState: "revoked" }),
      identityBinding("expired", { validUntil: times.three }),
    ]) {
      expectIssue(validManifestV2([binding, messageObservation("unproven")]), "identity_unproven", "unknown");
    }

    expectIssue(validManifestV2([messageObservation("missing")]), "identity_unproven", "unknown");
    expectIssue(
      validManifestV2([identityBinding("a"), identityBinding("b"), messageObservation("ambiguous")]),
      "identity_unproven",
      "unknown",
    );
    expectIssue(
      validManifestV2([
        identityBinding("a"),
        identityBinding("b", { actorId: "actor-two", logicalSessionId: "logical-session-two" }),
        messageObservation("conflict"),
      ]),
      "identity_conflict",
      "fail",
    );
  });

  it("isolates collaboration sequence by session and requires explicit blocked, stalemate, peer-acceptance order", () => {
    const records = [
      identityBinding(),
      messageObservation("a-blocked", { cursorId: 10, collaborationIntent: "blocked", collaborationSessionId: "session-a", collaborationSequence: 0 }),
      messageObservation("b-question", { cursorId: 11, collaborationIntent: "question", collaborationSessionId: "session-b", collaborationSequence: 0 }),
      messageObservation("a-stalemate", { cursorId: 12, collaborationIntent: "stalemate", collaborationSessionId: "session-a", collaborationSequence: 1 }),
      messageObservation("a-accepted", { cursorId: 13, collaborationIntent: "peer_acceptance", collaborationSessionId: "session-a", collaborationSequence: 2 }),
    ];
    const result = validateEvidenceManifest(validManifestV2(records));
    expect(result).toEqual({ classification: "pass", issues: [] });
    expect(records.some((record) => record.kind === "beads_promotion")).toBe(false);

    expectIssue(
      validManifestV2([
        identityBinding(),
        messageObservation("blocked", { collaborationIntent: "blocked", collaborationSessionId: "session-a", collaborationSequence: 0 }),
        messageObservation("accepted", { cursorId: 11, collaborationIntent: "peer_acceptance", collaborationSessionId: "session-a", collaborationSequence: 1 }),
      ]),
      "collaboration_transition_invalid",
      "fail",
    );
    expectIssue(
      validManifestV2([
        identityBinding(),
        messageObservation("blocked", { collaborationIntent: "blocked", collaborationSessionId: "session-a", collaborationSequence: 0 }),
        messageObservation("question", { cursorId: 11, collaborationIntent: "question", collaborationSessionId: "session-a", collaborationSequence: 1 }),
        messageObservation("accepted", { cursorId: 12, collaborationIntent: "peer_acceptance", collaborationSessionId: "session-a", collaborationSequence: 2 }),
      ]),
      "collaboration_transition_invalid",
      "fail",
    );
    expectIssue(
      validManifestV2([
        identityBinding(),
        messageObservation("sequence-gap", { collaborationIntent: "question", collaborationSessionId: "session-a", collaborationSequence: 2 }),
      ]),
      "collaboration_sequence_invalid",
      "fail",
    );
  });

  it("classifies a collaboration session ending after blocked or stalemate as incomplete", () => {
    const blockedOnly = validManifestV2([
      identityBinding(),
      messageObservation("blocked-tail", {
        collaborationIntent: "blocked",
        collaborationSessionId: "blocked-tail-session",
        collaborationSequence: 0,
      }),
    ]);
    expect(validateEvidenceManifest(blockedOnly).issues).toContainEqual({
      code: "collaboration_transition_incomplete",
      classification: "unknown",
      path: "/evidence/8/collaborationIntent",
    });

    const stalemateTail = validManifestV2([
      identityBinding(),
      messageObservation("blocked-before-stalemate", {
        collaborationIntent: "blocked",
        collaborationSessionId: "stalemate-tail-session",
        collaborationSequence: 0,
      }),
      messageObservation("stalemate-tail", {
        cursorId: 11,
        collaborationIntent: "stalemate",
        collaborationSessionId: "stalemate-tail-session",
        collaborationSequence: 1,
      }),
    ]);
    expect(validateEvidenceManifest(stalemateTail).issues).toContainEqual({
      code: "collaboration_transition_incomplete",
      classification: "unknown",
      path: "/evidence/9/collaborationIntent",
    });
  });

  it("keeps transport, acknowledgement, read, peer acceptance, and Beads durability independent", () => {
    const peerAccepted = messageObservation("peer-accepted", {
      collaborationIntent: "peer_acceptance",
      collaborationSessionId: "session-a",
      collaborationSequence: 0,
      transportState: "queued",
      receiverAcknowledgementState: "pending",
      readState: "unread",
    });
    expect(validateEvidenceManifest(validManifestV2([identityBinding(), peerAccepted]))).toEqual({
      classification: "pass",
      issues: [],
    });
  });

  it("requires promotion retries to converge on one exact durable Beads artifact", () => {
    const first = beadsPromotion("first");
    const retry = beadsPromotion("retry");
    expect(validateEvidenceManifest(validManifestV2([first, retry])).issues).toEqual([]);

    expectIssue(
      validManifestV2([first, { ...retry, beadsArtifactId: "beads-comment-two" }]),
      "promotion_retry_divergence",
      "fail",
    );
    expectIssue(
      validManifestV2([first, { ...retry, verifiedAt: times.seven }]),
      "promotion_reconciliation_conflict",
      "fail",
    );
  });

  it("derives pending and conflict promotion diagnostics from typed promotion state", () => {
    const pending = beadsPromotion("pending-state", {
      state: "promotion_pending",
      beadsArtifactId: null,
      acknowledgedAt: null,
      verifiedAt: null,
    });
    const pendingResult = validateEvidenceManifest(validManifestV2([pending]));
    expect(pendingResult.classification).toBe("unknown");
    expect(pendingResult.issues).toContainEqual({
      code: "promotion_pending",
      classification: "unknown",
      path: "/evidence/7/state",
    });

    const conflict = beadsPromotion("conflict-state", { state: "reconciliation_conflict" });
    const conflictResult = validateEvidenceManifest(validManifestV2([conflict]));
    expect(conflictResult.classification).toBe("fail");
    expect(conflictResult.issues).toContainEqual({
      code: "promotion_reconciliation_conflict",
      classification: "fail",
      path: "/evidence/7/state",
    });
  });
});

describe("runtime observation, loop, Desktop, monitor, and teardown invariants", () => {
  it("retains direct and telemetry snapshots separately and reports current disagreement as unknown", () => {
    const direct = runtimeSnapshot("direct_herdr", "direct");
    const agreeing = runtimeSnapshot("herdr_telemetry_bridge", "telemetry");
    expect(validateEvidenceManifest(validManifestV2([direct, agreeing])).issues).toEqual([]);

    const disagreeing = structuredClone(agreeing);
    disagreeing.observation.runtimeState = "blocked";
    expectIssue(
      validManifestV2([direct, disagreeing]),
      "runtime_observation_disagreement",
      "unknown",
    );

    disagreeing.freshness = "stale";
    expect(validateEvidenceManifest(validManifestV2([direct, disagreeing])).issues).toEqual([]);
  });

  it("validates the sixth send, local seventh rejection, and authenticated-human-only reset per channel", () => {
    const transitions = [
      loopTransition("one", "active(0)", "active(1)"),
      loopTransition("two", "active(1)", "active(2)"),
      loopTransition("three", "active(2)", "active(3)"),
      loopTransition("four", "active(3)", "active(4)"),
      loopTransition("five", "active(4)", "active(5)"),
      loopTransition("six", "active(5)", "paused(6)"),
      loopTransition("seven", "paused(6)", "paused(6)"),
      loopTransition("reset", "paused(6)", "active(0)", { origin: "human" }),
    ];
    expect(validateEvidenceManifest(validManifestV2(transitions)).issues).toEqual([]);

    expectIssue(
      validManifestV2([loopTransition("out-of-order", "active(1)", "active(2)")]),
      "loop_sequence_invalid",
      "fail",
    );
    expectIssue(
      validManifestV2([loopTransition("partial", "active(0)", "active(1)")]),
      "loop_evidence_incomplete",
      "unknown",
    );
  });

  it("keeps the pure loop guard at six and rejects unauthenticated resets", () => {
    let state = createLoopGuardState("channel-one");
    for (let index = 0; index < 6; index += 1) {
      const decision = requestAutonomousSend(state);
      expect(decision.allowed).toBe(true);
      state = decision.state;
    }
    expect(requestAutonomousSend(state)).toMatchObject({
      allowed: false,
      rejectedBeforeMcp: true,
      mcpInvocationAllowed: false,
      state: { phase: "paused", autonomousCount: 6 },
    });
    const evidence = {
      origin: "human",
      authenticated: true,
      identityVerified: true,
      providerInstanceId: "agentchattr-instance",
      channelId: "channel-one",
      stableMessageUid: "human-message",
      observedAtUtc: times.four,
      directUpstreamEvidence: hashes.a,
    };
    expect(recordAuthenticatedHumanOrigin(state, { ...evidence, authenticated: false }).reset).toBe(false);
    expect(recordAuthenticatedHumanOrigin(state, evidence).reset).toBe(true);
  });

  it("classifies each Desktop client independently and rejects only contradictory duplicate client evidence", () => {
    const claude = desktopCapability("claude_code_desktop");
    const codex = desktopCapability("codex_desktop", {
      expectedResult: "unsupported",
      observedResult: "unsupported",
      classification: "unsupported",
      readClassification: "unsupported",
      sendClassification: "unsupported",
      storedMessageUid: null,
      storedMessageEvidenceHash: null,
    });
    expect(validateEvidenceManifest(validManifestV2([claude, codex])).classification).toBe("unsupported");
    expectIssue(
      validManifestV2([claude, { ...claude, caseId: "desktop-claude-conflict", readClassification: "unknown" }]),
      "desktop_result_conflict",
      "fail",
    );
  });

  it("requires every monitor from before service start through post-deregistration final capture", () => {
    expect(validateEvidenceManifest(validManifestV2()).issues).toEqual([]);

    const missing = validManifestV2();
    missing.evidence = missing.evidence.filter(
      (record) => record.kind !== "monitor_interval" || Reflect.get(record, "monitorKind") !== "input_control",
    );
    expectIssue(missing, "monitor_coverage_missing", "unknown");

    const lateStart = validManifestV2();
    const processMonitor = lateStart.evidence.find(
      (record) => record.kind === "monitor_interval" && Reflect.get(record, "monitorKind") === "process",
    );
    if (processMonitor) processMonitor.startedAt = times.two;
    expectIssue(lateStart, "monitor_coverage_gap", "fail");

    const earlyEnd = validManifestV2();
    const childMonitor = earlyEnd.evidence.find(
      (record) => record.kind === "monitor_interval" && Reflect.get(record, "monitorKind") === "child_process",
    );
    if (childMonitor) childMonitor.observedAt = times.seven;
    expectIssue(earlyEnd, "monitor_coverage_gap", "fail");
  });

  it("enforces completed endpoint, safety, monitor hashes, and exactly one teardown", () => {
    const bound = validManifestV2();
    bound.endpoint.state = "bound";
    expectIssue(bound, "teardown_envelope_inconsistent", "fail");

    const unsafe = validManifestV2();
    unsafe.safety.terminalInjection = "enabled";
    expectIssue(unsafe, "safety_boundary_inconsistent", "fail");

    const mismatched = validManifestV2();
    const final = mismatched.evidence.at(-1);
    if (final?.kind === "teardown") {
      const finalMonitorCapture = Reflect.get(final, "finalMonitorCapture") as JsonRecord;
      finalMonitorCapture.evidenceHash = hashes.e;
    }
    expectIssue(mismatched, "teardown_monitor_mismatch", "fail");

    const duplicate = validManifestV2([teardown()]);
    expectIssue(duplicate, "teardown_count_invalid", "fail");
  });
});

const actionIds = {
  action: "11111111-1111-4111-8111-111111111111",
  otherAction: "22222222-2222-4222-8222-222222222222",
  correlation: "33333333-3333-4333-8333-333333333333",
  otherCorrelation: "44444444-4444-4444-8444-444444444444",
  attemptOne: "55555555-5555-4555-8555-555555555555",
  attemptTwo: "66666666-6666-4666-8666-666666666666",
};
const paneTarget = { targetKind: "pane", workspaceId: "workspace-1", tabId: "tab-1", paneId: "pane-1" };
const paneTargetHash = "sha256:1831ba5a820177d0646b0137cb9497a43cd4a861a64b1db57cb7344ab2f305c1";

function uuidFor(index: number) {
  return `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`;
}

function runtimeControlRecord(
  sequence: number,
  event: JsonRecord,
  overrides: JsonRecord = {},
) {
  const observedAt = [times.start, times.one, times.two, times.three, times.four, times.five, times.six, times.seven][sequence] ?? times.eight;
  return {
    ...evidenceBase("runtime_control_action", `runtime-control-${sequence}-${String(event.phase)}`, observedAt),
    eventId: uuidFor(sequence + 1),
    actionId: actionIds.action,
    correlationId: actionIds.correlation,
    idempotencyKey: hashes.a,
    sequence,
    runtimeProvider: "herdr",
    event,
    ...overrides,
  };
}

function requestEvent(overrides: JsonRecord = {}) {
  return {
    phase: "request",
    action: "send_text",
    target: paneTarget,
    effectClass: "non_idempotent_mutation",
    parameterHash: hashes.b,
    requestState: "recorded",
    retryPolicy: { mode: "bounded", maxAttempts: 2 },
    durablePromotion: "not_required",
    humanIntent: {
      state: "exact_assignment",
      assignedActorId: "actor-one",
      targetHash: paneTargetHash,
      evidenceHash: hashes.c,
    },
    ...overrides,
  };
}

function authorizationEvent(index: number, overrides: JsonRecord = {}) {
  return {
    phase: "authorization",
    authorizationId: uuidFor(100 + index),
    decision: "authorized",
    authorizingActorId: "actor-one",
    authorizingSource: "human",
    scope: { action: "send_text", target: paneTarget, parameterHash: hashes.b },
    validFrom: times.start,
    validUntil: times.later,
    evidenceHash: hashes.c,
    ...overrides,
  };
}

function executionEvent(
  attemptNumber: number,
  state: "started" | "succeeded" | "failed" | "timed_out" | "unknown",
  overrides: JsonRecord = {},
) {
  return {
    phase: "execution",
    attemptId: attemptNumber === 1 ? actionIds.attemptOne : actionIds.attemptTwo,
    attemptNumber,
    adapter: "direct_herdr",
    state,
    providerOperationId: `operation-${attemptNumber}`,
    providerIdempotencyState: "supported",
    resultArtifactHash: hashes.d,
    ...overrides,
  };
}

function verificationEvent(
  attemptId: string,
  state: "verified_applied" | "verified_not_applied" | "mismatched" | "timed_out" | "unknown" | "unsupported",
) {
  return {
    phase: "verification",
    attemptId,
    state,
    evidenceReference: { kind: "artifact", artifactHash: hashes.e },
  };
}

function acknowledgementEvent(
  attemptId: string,
  state: "not_applicable" | "pending" | "acknowledged" | "timed_out" | "unknown" | "unsupported",
) {
  return {
    phase: "acknowledgement",
    attemptId,
    state,
    ...(state === "acknowledged" ? { directAcknowledgementEvidenceHash: hashes.e } : {}),
  };
}

function reconciliationEvent(attemptId: string, overrides: JsonRecord = {}) {
  return {
    phase: "reconciliation",
    attemptId,
    observedDisposition: "not_applied",
    retryDecision: "retry_authorized",
    decidingActorId: "actor-one",
    decidingSource: "human",
    evidenceHash: hashes.e,
    ...overrides,
  };
}

function timeline(events: JsonRecord[]) {
  return events.map((event, sequence) => runtimeControlRecord(sequence, event));
}

function runtimePromotion(actionId = actionIds.action, overrides: JsonRecord = {}) {
  return beadsPromotion("runtime", {
    artifactType: "handoff_capsule",
    promotionSource: {
      kind: "runtime_control",
      correlationId: actionIds.correlation,
      actionIds: [actionId],
    },
    ...overrides,
  });
}

describe("typed runtime-control state machine", () => {
  it("requires globally unique events, one sequence-zero request, increasing sequence, and immutable identities", () => {
    const valid = timeline([requestEvent(), authorizationEvent(1), executionEvent(1, "succeeded")]);
    expect(validateEvidenceManifest(validManifestV2(valid)).issues).toEqual([]);

    expectIssue(
      validManifestV2([valid[0], { ...valid[1], eventId: valid[0].eventId }]),
      "runtime_event_id_duplicate",
      "fail",
    );
    expectIssue(validManifestV2(valid.slice(1)), "runtime_request_missing", "fail");
    expectIssue(
      validManifestV2([valid[0], { ...valid[1], sequence: 0 }]),
      "runtime_sequence_invalid",
      "fail",
    );
    expectIssue(
      validManifestV2([valid[0], { ...valid[1], correlationId: actionIds.otherCorrelation }]),
      "runtime_action_identity_changed",
      "fail",
    );
    expectIssue(
      validManifestV2([valid[0], { ...valid[1], idempotencyKey: hashes.f }]),
      "runtime_action_identity_changed",
      "fail",
    );
    expectIssue(
      validManifestV2([
        valid[0],
        runtimeControlRecord(1, requestEvent({ parameterHash: hashes.f })),
      ]),
      "runtime_request_tuple_changed",
      "fail",
    );
  });

  it("requires current exact authorization and exact human assignment before execution", () => {
    const invalidAuthorizations = [
      [],
      [authorizationEvent(1, { decision: "pending" })],
      [authorizationEvent(1, { decision: "denied" })],
      [authorizationEvent(1, { authorizingActorId: "actor-two" })],
      [authorizationEvent(1, { scope: { action: "send_text", target: paneTarget, parameterHash: hashes.f } })],
      [authorizationEvent(1, { validUntil: times.one })],
    ];
    for (const authorization of invalidAuthorizations) {
      expectIssue(
        validManifestV2(timeline([requestEvent(), ...authorization, executionEvent(1, "succeeded")])),
        "runtime_execution_unauthorized",
        "fail",
      );
    }

    expectIssue(
      validManifestV2(timeline([
        requestEvent({ humanIntent: { state: "denied", evidenceHash: hashes.c } }),
        authorizationEvent(1),
        executionEvent(1, "succeeded"),
      ])),
      "runtime_human_intent_conflict",
      "fail",
    );
    expectIssue(
      validManifestV2(timeline([
        requestEvent({ humanIntent: { state: "none" } }),
        authorizationEvent(1),
        executionEvent(1, "succeeded"),
      ])),
      "runtime_human_intent_unproven",
      "unknown",
    );
    expectIssue(
      validManifestV2(timeline([
        requestEvent({ humanIntent: { state: "exact_assignment", assignedActorId: "actor-one", targetHash: hashes.f, evidenceHash: hashes.c } }),
        authorizationEvent(1),
        executionEvent(1, "succeeded"),
      ])),
      "runtime_human_target_mismatch",
      "fail",
    );
  });

  it("forbids authorization or execution after a rejected or cancelled request", () => {
    for (const requestState of ["rejected", "cancelled"]) {
      expectIssue(
        validManifestV2(timeline([requestEvent({ requestState }), authorizationEvent(1), executionEvent(1, "succeeded")])),
        "runtime_request_terminal",
        "fail",
      );
    }
  });

  it("requires unique increasing attempts and known references from later phases", () => {
    const invalidNumber = timeline([
      requestEvent(),
      authorizationEvent(1),
      executionEvent(1, "failed"),
      verificationEvent(actionIds.attemptOne, "verified_not_applied"),
      reconciliationEvent(actionIds.attemptOne),
      authorizationEvent(2),
      executionEvent(1, "failed", { attemptId: actionIds.attemptTwo }),
    ]);
    expectIssue(validManifestV2(invalidNumber), "runtime_attempt_order_invalid", "fail");

    const duplicateAttempt = timeline([
      requestEvent(), authorizationEvent(1), executionEvent(1, "failed"),
      reconciliationEvent(actionIds.attemptOne), authorizationEvent(2),
      executionEvent(2, "succeeded", { attemptId: actionIds.attemptOne }),
    ]);
    expectIssue(validManifestV2(duplicateAttempt), "runtime_attempt_id_duplicate", "fail");

    expectIssue(
      validManifestV2(timeline([requestEvent(), verificationEvent(actionIds.attemptOne, "unknown")])),
      "runtime_attempt_reference_missing",
      "fail",
    );
  });

  it("rejects request, authorized, succeeded, retry as a duplicate", () => {
    expectIssue(
      validManifestV2(timeline([
        requestEvent(), authorizationEvent(1), executionEvent(1, "succeeded"),
        authorizationEvent(2), executionEvent(2, "succeeded"),
      ])),
      "runtime_duplicate_execution_risk",
      "fail",
    );
  });

  it("rejects request, authorized, timed-out, retry until reconciliation", () => {
    expectIssue(
      validManifestV2(timeline([
        requestEvent(), authorizationEvent(1), executionEvent(1, "timed_out"),
        authorizationEvent(2), executionEvent(2, "succeeded"),
      ])),
      "runtime_reconciliation_required",
      "fail",
    );
  });

  it("rejects request, authorized, unknown, acknowledgement unknown, retry as duplicate risk", () => {
    expectIssue(
      validManifestV2(timeline([
        requestEvent(), authorizationEvent(1), executionEvent(1, "unknown"),
        acknowledgementEvent(actionIds.attemptOne, "unknown"),
        authorizationEvent(2), executionEvent(2, "succeeded"),
      ])),
      "runtime_duplicate_execution_risk",
      "fail",
    );
  });

  it("allows failed, verified-not-applied, retry-authorized reconciliation, fresh authorization, retry", () => {
    const records = timeline([
      requestEvent(), authorizationEvent(1), executionEvent(1, "failed"),
      verificationEvent(actionIds.attemptOne, "verified_not_applied"),
      reconciliationEvent(actionIds.attemptOne),
      authorizationEvent(2), executionEvent(2, "succeeded"),
    ]);
    expect(validateEvidenceManifest(validManifestV2(records))).toEqual({ classification: "pass", issues: [] });
  });

  it("uses the latest applicable reconciliation so a later applied do-not-retry decision wins", () => {
    const records = timeline([
      requestEvent(),
      authorizationEvent(1),
      executionEvent(1, "failed"),
      reconciliationEvent(actionIds.attemptOne),
      reconciliationEvent(actionIds.attemptOne, {
        observedDisposition: "applied",
        retryDecision: "do_not_retry",
      }),
      authorizationEvent(2),
      executionEvent(2, "succeeded"),
    ]);
    expect(validateEvidenceManifest(validManifestV2(records)).issues).toContainEqual({
      code: "runtime_duplicate_execution_risk",
      classification: "fail",
      path: "/evidence",
    });
  });

  it("allows timed-out retry only with the reviewed provider-idempotency artifact and same key", () => {
    const records = timeline([
      requestEvent({ reviewedProviderIdempotencyArtifactHash: hashes.f }),
      authorizationEvent(1),
      executionEvent(1, "timed_out", { providerIdempotencyState: "supported" }),
      authorizationEvent(2),
      executionEvent(2, "succeeded", { providerIdempotencyState: "supported" }),
    ]);
    expect(validateEvidenceManifest(validManifestV2(records))).toEqual({ classification: "pass", issues: [] });
  });

  it("rejects mesh unknown to direct-Herdr fallback without reconciliation", () => {
    expectIssue(
      validManifestV2(timeline([
        requestEvent(),
        authorizationEvent(1),
        executionEvent(1, "unknown", { adapter: "herdr_mesh" }),
        authorizationEvent(2),
        executionEvent(2, "succeeded", { adapter: "direct_herdr" }),
      ])),
      "runtime_reconciliation_required",
      "fail",
    );
  });

  it("allows a reconciled mesh-to-direct fallback as a new attempt of the same action", () => {
    const records = timeline([
      requestEvent(),
      authorizationEvent(1),
      executionEvent(1, "failed", { adapter: "herdr_mesh" }),
      verificationEvent(actionIds.attemptOne, "verified_not_applied"),
      reconciliationEvent(actionIds.attemptOne),
      authorizationEvent(2),
      executionEvent(2, "succeeded", { adapter: "direct_herdr" }),
    ]);
    expect(validateEvidenceManifest(validManifestV2(records))).toEqual({ classification: "pass", issues: [] });
  });

  it("locks retry after applied verification or pending and unknown acknowledgement", () => {
    const lockEvents = [
      verificationEvent(actionIds.attemptOne, "verified_applied"),
      acknowledgementEvent(actionIds.attemptOne, "pending"),
      acknowledgementEvent(actionIds.attemptOne, "unknown"),
    ];
    for (const lockEvent of lockEvents) {
      expectIssue(
        validManifestV2(timeline([
          requestEvent(), authorizationEvent(1), executionEvent(1, "failed"), lockEvent,
          authorizationEvent(2), executionEvent(2, "succeeded"),
        ])),
        "runtime_duplicate_execution_risk",
        "fail",
      );
    }
    expectIssue(
      validManifestV2(timeline([
        requestEvent(), authorizationEvent(1), executionEvent(1, "started"),
        authorizationEvent(2), executionEvent(2, "succeeded"),
      ])),
      "runtime_duplicate_execution_risk",
      "fail",
    );
  });

  it("requires human reconciliation for unknown mutating outcomes with unsupported or unknown provider idempotency", () => {
    for (const providerIdempotencyState of ["unsupported", "unknown"]) {
      expectIssue(
        validManifestV2(timeline([
          requestEvent({ reviewedProviderIdempotencyArtifactHash: hashes.f }),
          authorizationEvent(1),
          executionEvent(1, "unknown", { providerIdempotencyState }),
          authorizationEvent(2),
          executionEvent(2, "succeeded"),
        ])),
        "runtime_human_reconciliation_required",
        "fail",
      );
    }
  });

  it("does not let policy reconciliation unlock timed-out or unknown unsupported-idempotency mutations", () => {
    for (const state of ["timed_out", "unknown"] as const) {
      for (const providerIdempotencyState of ["unsupported", "unknown"] as const) {
        const records = timeline([
          requestEvent(),
          authorizationEvent(1),
          executionEvent(1, state, { providerIdempotencyState }),
          reconciliationEvent(actionIds.attemptOne, { decidingSource: "scotty_policy" }),
          authorizationEvent(2),
          executionEvent(2, "succeeded"),
        ]);
        expect(validateEvidenceManifest(validManifestV2(records)).issues).toContainEqual({
          code: "runtime_human_reconciliation_required",
          classification: "fail",
          path: "/evidence",
        });
      }
    }
  });

  it("allows read-only retries only inside the bound and with a fresh current authorization", () => {
    const request = requestEvent({
      action: "read_pane",
      effectClass: "read_only",
      retryPolicy: { mode: "bounded", maxAttempts: 2 },
    });
    const authorize = (index: number) => authorizationEvent(index, {
      scope: { action: "read_pane", target: paneTarget, parameterHash: hashes.b },
    });
    const allowed = timeline([
      request, authorize(1), executionEvent(1, "failed"), authorize(2), executionEvent(2, "succeeded"),
    ]);
    expect(validateEvidenceManifest(validManifestV2(allowed)).issues).toEqual([]);

    expectIssue(
      validManifestV2(timeline([request, authorize(1), executionEvent(1, "failed"), executionEvent(2, "succeeded")])),
      "runtime_execution_unauthorized",
      "fail",
    );
    expectIssue(
      validManifestV2(timeline([
        requestEvent({ action: "read_pane", effectClass: "read_only", retryPolicy: { mode: "bounded", maxAttempts: 1 } }),
        authorize(1), executionEvent(1, "failed"), authorize(2), executionEvent(2, "succeeded"),
      ])),
      "runtime_retry_policy_exceeded",
      "fail",
    );
  });

  it("applies bounded maxAttempts to the first observed execution attempt", () => {
    const records = timeline([
      requestEvent({ retryPolicy: { mode: "bounded", maxAttempts: 1 } }),
      authorizationEvent(1),
      executionEvent(2, "succeeded"),
    ]);
    expect(validateEvidenceManifest(validManifestV2(records)).issues).toContainEqual({
      code: "runtime_retry_policy_exceeded",
      classification: "fail",
      path: "/evidence",
    });
  });

  it("keeps provider success separate from verification and acknowledgement", () => {
    expect(validateEvidenceManifest(validManifestV2(timeline([
      requestEvent(), authorizationEvent(1), executionEvent(1, "succeeded"),
    ])))).toEqual({ classification: "pass", issues: [] });
  });

  it("accepts primitive relay plus exact durable Beads promotion under one correlation", () => {
    const records = timeline([
      requestEvent({ action: "relay_message", durablePromotion: "required" }),
      authorizationEvent(1, { scope: { action: "relay_message", target: paneTarget, parameterHash: hashes.b } }),
      executionEvent(1, "succeeded"),
    ]);
    expect(validateEvidenceManifest(validManifestV2([...records, runtimePromotion()]))).toEqual({
      classification: "pass",
      issues: [],
    });
  });

  it("keeps required promotion incomplete and rejects mismatched runtime promotion sources", () => {
    const records = timeline([
      requestEvent({ action: "relay_message", durablePromotion: "required" }),
      authorizationEvent(1, { scope: { action: "relay_message", target: paneTarget, parameterHash: hashes.b } }),
      executionEvent(1, "succeeded"),
    ]);
    expectIssue(validManifestV2(records), "runtime_durable_promotion_missing", "unknown");
    expectIssue(
      validManifestV2([...records, runtimePromotion(actionIds.otherAction)]),
      "runtime_durable_promotion_mismatch",
      "fail",
    );
  });

  it("rejects opaque handoff actions structurally", () => {
    const manifest = validManifestV2(timeline([requestEvent({ action: "handoff" })]));
    expect(validateEvidenceManifest(manifest).classification).toBe("fail");
    expectIssue(manifest, "invalid_field", "fail");
  });
});

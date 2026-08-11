import { describe, expect, it } from "vitest";

import * as spikeContract from "./spike-contract";
import {
  APPROVED_UPSTREAM_PIN,
  createLoopGuardState,
  recordAuthenticatedHumanOrigin,
  requestAutonomousSend,
  validateEvidenceManifest,
} from "./spike-contract";
import { artifactBindingSchema } from "./evidence-schema";
import committedIdentityFixture from "./fixtures/identity-bindings.json";
import committedMessageFixture from "./fixtures/message-contract.json";
import committedAuthorityFirewallFixture from "./fixtures/authority-firewall.json";

const hashes = {
  a: `sha256:${"a".repeat(64)}`,
  b: `sha256:${"b".repeat(64)}`,
  c: `sha256:${"c".repeat(64)}`,
  d: `sha256:${"d".repeat(64)}`,
  e: `sha256:${"e".repeat(64)}`,
  f: `sha256:${"f".repeat(64)}`,
};

const upstreamImplementation = {
  mode: "upstream",
  repository: APPROVED_UPSTREAM_PIN.repository,
  upstreamBaseCommit: APPROVED_UPSTREAM_PIN.commit,
  runtimeCommit: APPROVED_UPSTREAM_PIN.commit,
  patchSha256: null,
  licenseSha256: APPROVED_UPSTREAM_PIN.licenseSha256,
};

const notRunArtifactBinding = {
  kind: "source_bundle_file_manifest",
  artifactSha256: null,
  entrypointSha256: null,
  interpreterSha256: null,
  fileManifestSha256: null,
  verificationState: "not_run",
};

const verifiedSourceBundleBinding = {
  kind: "source_bundle_file_manifest",
  artifactSha256: hashes.a,
  entrypointSha256: hashes.b,
  interpreterSha256: hashes.c,
  fileManifestSha256: hashes.d,
  verificationState: "verified",
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

const provenanceByKind: Record<string, string> = {
  configuration_boundary: "runtime_manager",
  monitor_interval: "runtime_manager",
  runtime_observation: "operator_observation",
  runtime_control_action: "operator_observation",
  mcp_exchange: "agentchattr_mcp",
  message_observation: "agentchattr_store",
  identity_binding: "operator_observation",
  loop_guard_transition: "agentchattr_mcp",
  beads_promotion: "beads",
  desktop_capability: "desktop_client",
  teardown: "runtime_manager",
};

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
      sourceKind: provenanceByKind[kind] ?? "operator_observation",
      sourceRef: `${caseId}-source`,
      digest: hashes.a,
    },
    artifacts: [{ kind: "source_snapshot", digest: hashes.a }],
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
    authorityMutationFirewall: {
      ...structuredClone(committedAuthorityFirewallFixture),
      classification: "pass",
    },
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

function validManifestV2(
  records: JsonRecord[] = [],
  options: { includeDirectFoundation?: boolean } = {},
) {
  const foundation = options.includeDirectFoundation === false
    ? []
    : [runtimeSnapshot("direct_herdr", "manifest-foundation", {
      startedAt: times.before,
      observedAt: times.after,
      observation: {
        observationKind: "agent_snapshot",
        workspaceId: "foundation-workspace",
        tabId: "foundation-tab",
        paneId: "foundation-pane",
        terminalId: "foundation-terminal",
        agentSessionId: "foundation-agent-session",
        runtimeState: "working",
        modelMetadata: {
          reportingState: "reported",
          provider: "anthropic",
          model: "claude-sonnet",
        },
        project: { projectKind: "configured_id", projectId: "scotty", relation: "root" },
      },
    })];
  return {
    schemaVersion: 2,
    spike: "agentchattr-compatibility",
    stage: "1.5",
    manifestId: "agentchattr-contract-manifest",
    runId: "contract-run",
    executionState: "completed",
    upstream: { ...APPROVED_UPSTREAM_PIN },
    implementationSource: { ...upstreamImplementation },
    artifactBinding: { ...verifiedSourceBundleBinding },
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
      ...foundation,
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
    implementationSource: { ...upstreamImplementation },
    artifactBinding: { ...notRunArtifactBinding },
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

function mcpChatSend(suffix: string, stableMessageUid: string, overrides: JsonRecord = {}) {
  return {
    ...evidenceBase("mcp_exchange", `mcp-send-${suffix}`, times.four),
    clientKind: "operator_mcp_client",
    clientVersion: "v1",
    providerInstanceId: "agentchattr-instance",
    channelId: "channel-one",
    operation: "chat_send",
    authenticationState: "authenticated",
    requestArtifactHash: hashes.a,
    responseArtifactHash: hashes.b,
    resultingStableMessageUid: stableMessageUid,
    ...overrides,
  };
}

function loopProofRecords(transitions: JsonRecord[]) {
  const records: JsonRecord[] = [];
  let cursorId = 1;
  for (const transition of transitions) {
    const origin = transition.origin;
    const stableMessageUid = transition.stableMessageUid;
    if (origin === "agent" && typeof stableMessageUid === "string") {
      records.push(messageObservation(`loop-${cursorId}`, {
        stableMessageUid,
        cursorId,
        channelId: transition.channelId,
      }));
      records.push(mcpChatSend(`loop-${cursorId}`, stableMessageUid));
      cursorId += 1;
    }
    if (origin === "human") {
      records.push(messageObservation("human-reset", {
        stableMessageUid: "human-reset-message",
        cursorId,
        channelId: transition.channelId,
        senderExternalId: "external-human-one",
        directEvidenceArtifactHash: transition.authenticatedHumanProofHash,
      }));
      records.push(identityBinding("human", {
        actorId: "actor-human",
        logicalSessionId: "logical-session-human",
        orchestrationRole: "human",
        agentChattrExternalId: "external-human-one",
      }));
    }
  }
  return records;
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
    provenance: {
      sourceKind: adapter === "direct_herdr" ? "herdr_direct" : "herdr_telemetry_bridge",
      sourceRef: `${suffix}-source`,
      digest: hashes.a,
    },
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

function runtimeControlResultObservation(
  adapter: "direct_herdr" | "herdr_telemetry_bridge",
  suffix: string,
  disposition: "applied" | "not_applied",
  overrides: JsonRecord = {},
) {
  return runtimeSnapshot(adapter, suffix, {
    observation: {
      observationKind: "control_result",
      actionId: actionIds.action,
      attemptId: actionIds.attemptOne,
      action: "send_text",
      target: paneTarget,
      disposition,
      resultArtifactHash: hashes.d,
      eventAt: times.four,
    },
    controlProof: runtimeControlProof(disposition),
    ...overrides,
  });
}

describe("typed manifest aggregation and opaque extensions", () => {
  it("accepts the strict empty not-run envelope", () => {
    expect(validateEvidenceManifest(validNotRunManifestV2())).toEqual({ classification: "pass", issues: [] });
  });

  it("requires concrete source-bundle evidence before a binding becomes verified", () => {
    const notRunToVerifiedWithOneMissingDigest = {
      ...notRunArtifactBinding,
      artifactSha256: hashes.a,
      entrypointSha256: null,
      interpreterSha256: hashes.c,
      fileManifestSha256: hashes.d,
      verificationState: "verified",
    };
    const transitionResult = artifactBindingSchema.safeParse(notRunToVerifiedWithOneMissingDigest);
    expect(transitionResult.success).toBe(false);
    if (!transitionResult.success) {
      expect(transitionResult.error.issues).toHaveLength(1);
      expect(transitionResult.error.issues[0]?.path).toEqual(["entrypointSha256"]);
    }

    expect(artifactBindingSchema.safeParse({
      ...verifiedSourceBundleBinding,
      kind: "wheel",
      fileManifestSha256: null,
    }).success).toBe(true);
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

  it("requires a passing authority firewall for a completed configuration boundary", () => {
    const passing = validManifestV2();
    expect(validateEvidenceManifest(passing).issues).toEqual([]);

    const missing = validManifestV2();
    const missingConfiguration = missing.evidence.find((record) => record.kind === "configuration_boundary");
    if (missingConfiguration) Reflect.deleteProperty(missingConfiguration, "authorityMutationFirewall");
    expectIssue(missing, "authority_mutation_firewall_missing", "unknown");

    const unknown = validManifestV2();
    const unknownConfiguration = unknown.evidence.find((record) => record.kind === "configuration_boundary");
    if (unknownConfiguration) {
      const firewall = Reflect.get(unknownConfiguration, "authorityMutationFirewall") as JsonRecord;
      firewall.classification = "unknown";
    }
    expectIssue(unknown, "authority_mutation_firewall_unknown", "unknown");

    const invoked = validManifestV2();
    const invokedConfiguration = invoked.evidence.find((record) => record.kind === "configuration_boundary");
    if (invokedConfiguration) {
      const firewall = Reflect.get(invokedConfiguration, "authorityMutationFirewall") as JsonRecord;
      const invocations = Reflect.get(firewall, "invocations") as JsonRecord[];
      invocations[0] = { ...invocations[0], result: "invoked" };
    }
    expectIssue(invoked, "authority_mutation_firewall_failed", "fail");
  });
});

describe("typed message, identity, collaboration, and promotion invariants", () => {
  it("accepts the committed synthetic identity and message records together", () => {
    const records = [
      ...committedIdentityFixture.records,
      ...committedMessageFixture.records,
    ].map((record) => ({
      ...record,
      provenance: {
        ...record.provenance,
        sourceKind: record.kind === "message_observation" ? "agentchattr_store" : "operator_observation",
      },
    }));

    expect(validateEvidenceManifest(validManifestV2(records)).issues).toEqual([]);
  });

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

  it("allows transport, acknowledgement, read, and evidence to progress without changing the approved replay tuple", () => {
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

    const collaborationDivergence = {
      ...progressed,
      caseId: "message-progressive-collaboration-divergent",
      collaborationIntent: "peer_acceptance",
      collaborationSessionId: "progressive-session",
      collaborationSequence: 99,
    };
    expect(validateEvidenceManifest(validManifestV2([identityBinding(), initial, collaborationDivergence])).issues)
      .toContainEqual({
        code: "message_uid_divergence",
        classification: "fail",
        path: "/evidence/9/stableMessageUid",
      });
  });

  it("scopes durable message identity by provider instance, channel, and UID", () => {
    const channelOne = messageObservation("shared-uid-one", {
      stableMessageUid: "provider-local-shared-uid",
      channelId: "channel-one",
      contentChecksum: hashes.a,
    });
    const channelTwo = messageObservation("shared-uid-two", {
      stableMessageUid: "provider-local-shared-uid",
      channelId: "channel-two",
      contentChecksum: hashes.f,
    });
    expect(validateEvidenceManifest(validManifestV2([identityBinding(), channelOne, channelTwo]))).toEqual({
      classification: "pass",
      issues: [],
    });
  });

  it("resets cursor epochs after restart for subsequent new UIDs while preserving replay identity", () => {
    const beforeRestart = messageObservation("epoch-before", { stableMessageUid: "epoch-before-uid", cursorId: 100 });
    const restart = {
      ...beforeRestart,
      caseId: "message-epoch-restart",
      cursorId: 1,
      observationContext: "post_restart",
    };
    const afterRestart = messageObservation("epoch-after", { stableMessageUid: "epoch-after-uid", cursorId: 2 });
    expect(validateEvidenceManifest(validManifestV2([
      identityBinding(), beforeRestart, restart, afterRestart,
    ]))).toEqual({ classification: "pass", issues: [] });
  });

  it("opens only one cursor epoch for repeated post-restart observations", () => {
    const beforeRestart = messageObservation("epoch-original", {
      stableMessageUid: "epoch-original-uid",
      cursorId: 100,
    });
    const firstRestart = messageObservation("epoch-first-restart", {
      stableMessageUid: "epoch-first-restart-uid",
      cursorId: 5,
      observationContext: "post_restart",
    });
    const repeatedRestart = messageObservation("epoch-repeated-restart", {
      stableMessageUid: "epoch-repeated-restart-uid",
      cursorId: 4,
      observationContext: "post_restart",
    });

    expect(validateEvidenceManifest(validManifestV2([
      identityBinding(), beforeRestart, firstRestart, repeatedRestart,
    ])).issues).toContainEqual({
      code: "message_cursor_order",
      classification: "fail",
      path: "/evidence/10/cursorId",
    });
  });

  it("orders message observations chronologically before opening restart epochs", () => {
    const prior = messageObservation("chronology-prior", {
      stableMessageUid: "chronology-prior-uid",
      cursorId: 100,
      observedAt: times.five,
    });
    const retroactiveRestart = messageObservation("chronology-restart", {
      stableMessageUid: "chronology-restart-uid",
      cursorId: 5,
      observedAt: times.four,
      observationContext: "post_restart",
    });
    expect(validateEvidenceManifest(validManifestV2([
      identityBinding(), prior, retroactiveRestart,
    ])).issues).toContainEqual({
      code: "message_observation_chronology",
      classification: "fail",
      path: "/evidence/9/observedAt",
    });
  });

  it("enforces cursor order for a known UID within an epoch and permits a later genuine restart", () => {
    const original = messageObservation("known-uid-original", {
      stableMessageUid: "known-restart-uid",
      cursorId: 100,
      observedAt: times.one,
    });
    const firstRestart = messageObservation("known-uid-restart", {
      stableMessageUid: "known-restart-uid",
      cursorId: 5,
      observedAt: times.two,
      observationContext: "post_restart",
    });
    const decreasingReplay = messageObservation("known-uid-decreasing", {
      stableMessageUid: "known-restart-uid",
      cursorId: 4,
      observedAt: times.three,
      observationContext: "post_restart",
    });
    expect(validateEvidenceManifest(validManifestV2([
      identityBinding(), original, firstRestart, decreasingReplay,
    ])).issues).toContainEqual({
      code: "message_cursor_order",
      classification: "fail",
      path: "/evidence/10/cursorId",
    });

    const withinFirstEpoch = messageObservation("first-epoch-progress", {
      stableMessageUid: "first-epoch-progress-uid",
      cursorId: 6,
      observedAt: times.three,
    });
    const laterRestart = messageObservation("later-genuine-restart", {
      stableMessageUid: "later-genuine-restart-uid",
      cursorId: 1,
      observedAt: times.five,
      observationContext: "post_restart",
    });
    const withinLaterEpoch = messageObservation("later-epoch-progress", {
      stableMessageUid: "later-epoch-progress-uid",
      cursorId: 2,
      observedAt: times.six,
    });
    expect(validateEvidenceManifest(validManifestV2([
      identityBinding(), original, firstRestart, withinFirstEpoch, laterRestart, withinLaterEpoch,
    ]))).toEqual({ classification: "pass", issues: [] });
  });

  it("requires tombstone state deleted in addition to prior-present durable linkage", () => {
    const present = messageObservation("tombstone-state");
    const invalidTombstone = {
      ...present,
      caseId: "message-tombstone-state-replay",
      observationContext: "tombstone",
      messageState: "present",
    };
    expect(validateEvidenceManifest(validManifestV2([identityBinding(), present, invalidTombstone])).issues).toContainEqual({
      code: "message_tombstone_state_invalid",
      classification: "fail",
      path: "/evidence/9/messageState",
    });
  });

  it("deduplicates exact replay observations before collaboration sequence and convergence", () => {
    const blocked = messageObservation("dedup-blocked", {
      collaborationIntent: "blocked",
      collaborationSessionId: "dedup-session",
      collaborationSequence: 0,
    });
    const blockedReplay = {
      ...blocked,
      caseId: "message-dedup-blocked-replay",
      observationContext: "overlap_page",
    };
    const stalemate = messageObservation("dedup-stalemate", {
      cursorId: 11,
      collaborationIntent: "stalemate",
      collaborationSessionId: "dedup-session",
      collaborationSequence: 1,
    });
    const accepted = messageObservation("dedup-accepted", {
      cursorId: 12,
      collaborationIntent: "peer_acceptance",
      collaborationSessionId: "dedup-session",
      collaborationSequence: 2,
    });
    expect(validateEvidenceManifest(validManifestV2([
      identityBinding(), blocked, blockedReplay, stalemate, accepted,
    ]))).toEqual({ classification: "pass", issues: [] });
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
  it("requires a passing direct Herdr foundation for every executed trial", () => {
    const noObservation = validManifestV2([], { includeDirectFoundation: false });
    expect(validateEvidenceManifest(noObservation).issues).toContainEqual({
      code: "runtime_direct_foundation_missing",
      classification: "unknown",
      path: "/evidence",
    });

    const meshOnly = validManifestV2(timeline([
      requestEvent(),
      authorizationEvent(1),
      executionEvent(1, "succeeded", { adapter: "herdr_mesh" }),
    ]), { includeDirectFoundation: false });
    expect(validateEvidenceManifest(meshOnly).issues).toContainEqual({
      code: "runtime_direct_foundation_missing",
      classification: "unknown",
      path: "/evidence",
    });

    const beforeTrial = runtimeSnapshot("direct_herdr", "before-trial", {
      startedAt: times.before,
      observedAt: times.before,
    });
    const preConfigurationOnly = validManifestV2([beforeTrial], { includeDirectFoundation: false });
    expect(validateEvidenceManifest(preConfigurationOnly).issues).toContainEqual({
      code: "runtime_direct_foundation_missing",
      classification: "unknown",
      path: "/evidence",
    });

    const postTrialOnly = validManifestV2([
      runtimeSnapshot("direct_herdr", "after-trial", {
        startedAt: times.after,
        observedAt: times.later,
      }),
    ], { includeDirectFoundation: false });
    expect(validateEvidenceManifest(postTrialOnly).issues).toContainEqual({
      code: "runtime_direct_foundation_missing",
      classification: "unknown",
      path: "/evidence",
    });

    const overlappingIntervals = [
      { suffix: "strictly-in-trial", startedAt: times.one, observedAt: times.two },
      { suffix: "configuration-boundary", startedAt: times.before, observedAt: times.start },
      { suffix: "teardown-boundary", startedAt: times.eight, observedAt: times.after },
      { suffix: "spanning-trial", startedAt: times.before, observedAt: times.after },
    ];
    for (const interval of overlappingIntervals) {
      const manifest = validManifestV2([
        runtimeSnapshot("direct_herdr", interval.suffix, {
          startedAt: interval.startedAt,
          observedAt: interval.observedAt,
        }),
      ], { includeDirectFoundation: false });
      expect(validateEvidenceManifest(manifest).issues.filter(
        (issue) => issue.code === "runtime_direct_foundation_missing",
      )).toEqual([]);
    }
  });

  it("enforces observation adapter, provenance source, and native contract compatibility", () => {
    const invalid = [
      runtimeSnapshot("direct_herdr", "direct-source", {
        provenance: { sourceKind: "herdr_telemetry_bridge", sourceRef: "wrong", digest: hashes.a },
      }),
      runtimeSnapshot("herdr_telemetry_bridge", "telemetry-source", {
        provenance: { sourceKind: "herdr_direct", sourceRef: "wrong", digest: hashes.a },
      }),
      runtimeSnapshot("direct_herdr", "direct-contract", {
        nativeContract: { versionKind: "named", name: "herdr-telemetry", version: "v1" },
      }),
      runtimeSnapshot("herdr_telemetry_bridge", "telemetry-contract", {
        nativeContract: { versionKind: "herdr_protocol", protocol: 2 },
      }),
    ];
    for (const observation of invalid) {
      expect(validateEvidenceManifest(validManifestV2([observation])).issues).toContainEqual({
        code: "runtime_observation_provenance_mismatch",
        classification: "fail",
        path: "/evidence/7",
      });
    }

    const synthetic = configurationBoundary();
    synthetic.provenance.sourceKind = "synthetic_fixture";
    expect(validateEvidenceManifest(validManifestV2([synthetic])).issues).toContainEqual({
      code: "operational_provenance_invalid",
      classification: "fail",
      path: "/evidence/7/provenance/sourceKind",
    });
  });

  it("requires every telemetry observation to have passing direct foundation for the exact subtype, target, and window", () => {
    const telemetry = runtimeSnapshot("herdr_telemetry_bridge", "foundation-telemetry");
    expect(validateEvidenceManifest(validManifestV2([telemetry])).issues).toContainEqual({
      code: "runtime_direct_foundation_missing",
      classification: "unknown",
      path: "/evidence/7",
    });

    const exactDirect = runtimeSnapshot("direct_herdr", "foundation-direct");
    expect(validateEvidenceManifest(validManifestV2([exactDirect, telemetry])).issues).toEqual([]);

    const wrongTarget = runtimeSnapshot("direct_herdr", "foundation-wrong-target", {
      observation: {
        ...runtimeSnapshot("direct_herdr", "foundation-wrong-target").observation,
        paneId: "pane-other",
      },
    });
    const wrongWindow = runtimeSnapshot("direct_herdr", "foundation-wrong-window", {
      startedAt: times.start,
      observedAt: times.three,
    });
    const wrongAgentSession = runtimeSnapshot("direct_herdr", "foundation-wrong-agent", {
      observation: {
        ...runtimeSnapshot("direct_herdr", "foundation-wrong-agent").observation,
        agentSessionId: "agent-session-other",
      },
    });
    const wrongSubtype = runtimeSnapshot("direct_herdr", "foundation-wrong-subtype", {
      observation: {
        observationKind: "trace_summary",
        agentSessionId: "agent-session-1",
        messageCount: 1,
        toolCallCount: 0,
        tokenCount: null,
        tokenCountQuality: "unknown",
        summaryArtifactHash: hashes.a,
      },
    });
    const nonpassing = runtimeSnapshot("direct_herdr", "foundation-nonpassing", {
      observedResult: "unknown",
      classification: "unknown",
    });
    for (const direct of [wrongTarget, wrongAgentSession, wrongWindow, wrongSubtype, nonpassing]) {
      expectIssue(validManifestV2([direct, telemetry]), "runtime_direct_foundation_missing", "unknown");
    }
  });

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
    const complete = validManifestV2([identityBinding(), ...transitions, ...loopProofRecords(transitions)]);
    expect(validateEvidenceManifest(complete).issues).toEqual([]);

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

  it("joins each allowed loop send to a distinct message UID and exact chat-send MCP evidence", () => {
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
    const proof = loopProofRecords(transitions);
    expect(validateEvidenceManifest(validManifestV2([identityBinding(), ...transitions, ...proof])).issues).toEqual([]);

    const missingMessage = proof.filter((record) => record.kind !== "message_observation"
      || record.stableMessageUid !== "loop-message-six");
    expectIssue(
      validManifestV2([identityBinding(), ...transitions, ...missingMessage]),
      "loop_message_evidence_missing",
      "fail",
    );

    const missingMcp = proof.filter((record) => record.kind !== "mcp_exchange"
      || record.resultingStableMessageUid !== "loop-message-six");
    expectIssue(
      validManifestV2([identityBinding(), ...transitions, ...missingMcp]),
      "loop_mcp_evidence_missing",
      "fail",
    );

    const reused = transitions.map((transition) => transition.mcpInvoked
      ? { ...transition, stableMessageUid: "loop-message-one" }
      : transition);
    expectIssue(
      validManifestV2([identityBinding(), ...reused, ...loopProofRecords(reused)]),
      "loop_message_uid_reused",
      "fail",
    );

    const wrongProviderAndChannel = proof.map((record) => record.kind === "mcp_exchange"
      && record.resultingStableMessageUid === "loop-message-six"
      ? { ...record, providerInstanceId: "agentchattr-other", channelId: "channel-other" }
      : record);
    expectIssue(
      validManifestV2([identityBinding(), ...transitions, ...wrongProviderAndChannel]),
      "loop_mcp_evidence_missing",
      "fail",
    );
  });

  it("proves the seventh rejection across its actual interval with no message or MCP invocation", () => {
    const transitions = [
      loopTransition("one", "active(0)", "active(1)"),
      loopTransition("two", "active(1)", "active(2)"),
      loopTransition("three", "active(2)", "active(3)"),
      loopTransition("four", "active(3)", "active(4)"),
      loopTransition("five", "active(4)", "active(5)"),
      loopTransition("six", "active(5)", "paused(6)"),
      loopTransition("seven", "paused(6)", "paused(6)", {
        startedAt: times.four,
        observedAt: times.six,
      }),
      loopTransition("reset", "paused(6)", "active(0)", { origin: "human" }),
    ];
    const upstreamSeventh = messageObservation("loop-seven-upstream", {
      stableMessageUid: "loop-message-seven-upstream",
      cursorId: 7,
      observedAt: times.five,
    });
    const failedNonChatInvocation = mcpChatSend("loop-seven-failed-tools", "loop-message-seven-upstream", {
      caseId: "mcp-loop-seven-failed-tools",
      startedAt: times.five,
      observedAt: times.five,
      operation: "tools/list",
      expectedResult: "fail",
      observedResult: "fail",
      classification: "fail",
      authenticationState: "failed",
      resultingStableMessageUid: null,
    });
    const base = [identityBinding(), ...transitions, ...loopProofRecords(transitions)];
    expect(validateEvidenceManifest(validManifestV2(base)).issues).toEqual([]);
    const repeatedSixthUidInvocation = mcpChatSend("loop-seven-repeated-sixth", "loop-message-six", {
      startedAt: times.five,
      observedAt: times.five,
      requestArtifactHash: hashes.f,
    });
    const unseenProviderInvocation = mcpChatSend("loop-seven-unseen-provider", "loop-message-seven-upstream", {
      caseId: "mcp-loop-seven-unseen-provider",
      providerInstanceId: "agentchattr-unseen-instance",
      startedAt: times.five,
      observedAt: times.five,
      operation: "tools/list",
      expectedResult: "fail",
      observedResult: "fail",
      classification: "fail",
      authenticationState: "failed",
      resultingStableMessageUid: null,
    });
    for (const upstreamEvidence of [
      [upstreamSeventh],
      [mcpChatSend("loop-seven-upstream", "loop-message-seven-upstream")],
      [upstreamSeventh, mcpChatSend("loop-seven-upstream", "loop-message-seven-upstream")],
      [failedNonChatInvocation],
      [repeatedSixthUidInvocation],
      [unseenProviderInvocation],
    ]) {
      expectIssue(
        validManifestV2([...base, ...upstreamEvidence]),
        "loop_seventh_upstream_present",
        "fail",
      );
    }
  });

  it("binds human reset to a verified human identity and exact direct message proof", () => {
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
    const proof = loopProofRecords(transitions);
    const withoutHumanIdentity = proof.filter((record) => record.kind !== "identity_binding"
      || record.orchestrationRole !== "human");
    expectIssue(
      validManifestV2([identityBinding(), ...transitions, ...withoutHumanIdentity]),
      "loop_human_reset_unproven",
      "fail",
    );
    const mismatchedDirectProof = proof.map((record) => record.kind === "message_observation"
      && record.senderExternalId === "external-human-one"
      ? { ...record, directEvidenceArtifactHash: hashes.f }
      : record);
    expectIssue(
      validManifestV2([identityBinding(), ...transitions, ...mismatchedDirectProof]),
      "loop_human_reset_unproven",
      "fail",
    );
    const staleDirectProof = proof.map((record) => {
      if (record.kind === "message_observation" && record.senderExternalId === "external-human-one") {
        return { ...record, startedAt: times.before, observedAt: times.before };
      }
      if (record.kind === "identity_binding" && record.orchestrationRole === "human") {
        return { ...record, validFrom: times.before };
      }
      return record;
    });
    expectIssue(
      validManifestV2([identityBinding(), ...transitions, ...staleDirectProof]),
      "loop_human_reset_unproven",
      "fail",
    );
  });

  it("keeps the pure loop guard at six and accepts only a typed validator-derived human proof", () => {
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
    const rawAssertion = {
      origin: "human",
      authenticated: true,
      identityVerified: true,
      providerInstanceId: "agentchattr-instance",
      channelId: "channel-one",
      stableMessageUid: "human-message",
      observedAtUtc: times.four,
      directUpstreamEvidence: hashes.a,
    };
    expect(recordAuthenticatedHumanOrigin(state, rawAssertion as never).reset).toBe(false);

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
    const proofManifest = validManifestV2([identityBinding(), ...transitions, ...loopProofRecords(transitions)]);
    const deriveProof = Reflect.get(spikeContract, "deriveAuthenticatedHumanOriginProof") as
      | undefined
      | ((value: unknown, channelId: string) => unknown);
    expect(deriveProof).toBeTypeOf("function");
    if (deriveProof) {
      const proof = deriveProof(proofManifest, "channel-one");
      const duplicateProof = deriveProof(proofManifest, "channel-one");
      const aliasedEvidenceManifest = structuredClone(proofManifest);
      const aliasedReset = aliasedEvidenceManifest.evidence.find((record) => record.kind === "loop_guard_transition"
        && Reflect.get(record, "origin") === "human");
      if (aliasedReset) aliasedReset.caseId = "loop-reset-aliased-evidence";
      const aliasedProof = deriveProof(aliasedEvidenceManifest, "channel-one");
      const uidAliasedEvidenceManifest = structuredClone(proofManifest);
      const uidAliasedMessage = uidAliasedEvidenceManifest.evidence.find((record) => record.kind === "message_observation"
        && Reflect.get(record, "senderExternalId") === "external-human-one");
      if (uidAliasedMessage) Reflect.set(uidAliasedMessage, "stableMessageUid", "human-reset-message-aliased");
      const uidAliasedProof = deriveProof(uidAliasedEvidenceManifest, "channel-one");
      expect(proof).not.toBeNull();
      expect(duplicateProof).not.toBeNull();
      expect(aliasedProof).not.toBeNull();
      expect(uidAliasedProof).not.toBeNull();
      expect(Reflect.ownKeys(proof as object)).toEqual([]);
      expect(recordAuthenticatedHumanOrigin(state, { ...(proof as object) } as never).reset).toBe(false);
      expect(recordAuthenticatedHumanOrigin(
        { ...state, channelId: "channel-other" },
        proof as never,
      ).reset).toBe(false);
      const firstReset = recordAuthenticatedHumanOrigin(state, proof as never);
      expect(firstReset.reset).toBe(true);
      expect(recordAuthenticatedHumanOrigin(state, proof as never).reset).toBe(false);
      expect(recordAuthenticatedHumanOrigin(state, duplicateProof as never).reset).toBe(false);
      expect(recordAuthenticatedHumanOrigin(state, aliasedProof as never).reset).toBe(false);
      expect(recordAuthenticatedHumanOrigin(state, uidAliasedProof as never).reset).toBe(false);

      let nextEpochState = firstReset.state;
      for (let index = 0; index < 6; index += 1) {
        nextEpochState = requestAutonomousSend(nextEpochState).state;
      }

      const mutableAliasCases = [
        {
          name: "timestamps only",
          startedAt: "2026-08-10T08:00:04.100Z",
          observedAt: "2026-08-10T08:00:04.200Z",
          mutate: () => undefined,
        },
        {
          name: "case and stable UID",
          startedAt: "2026-08-10T08:00:04.300Z",
          observedAt: "2026-08-10T08:00:04.400Z",
          mutate: (reset: JsonRecord, message: JsonRecord) => {
            Reflect.set(reset, "caseId", "loop-reset-case-alias");
            Reflect.set(message, "caseId", "message-human-case-alias");
            Reflect.set(message, "stableMessageUid", "human-reset-uid-alias");
          },
        },
        {
          name: "cursor",
          startedAt: "2026-08-10T08:00:04.500Z",
          observedAt: "2026-08-10T08:00:04.600Z",
          mutate: (_reset: JsonRecord, message: JsonRecord) => {
            Reflect.set(message, "cursorId", 70);
          },
        },
        {
          name: "sender label",
          startedAt: "2026-08-10T08:00:04.700Z",
          observedAt: "2026-08-10T08:00:04.800Z",
          mutate: (_reset: JsonRecord, message: JsonRecord, humanBinding: JsonRecord) => {
            Reflect.set(message, "senderExternalId", "external-human-alias");
            Reflect.set(humanBinding, "agentChattrExternalId", "external-human-alias");
          },
        },
        {
          name: "provider label",
          startedAt: "2026-08-10T08:00:04.900Z",
          observedAt: "2026-08-10T08:00:05.000Z",
          mutate: (_reset: JsonRecord, message: JsonRecord, humanBinding: JsonRecord) => {
            Reflect.set(message, "providerInstanceId", "agentchattr-instance-alias");
            Reflect.set(humanBinding, "agentChattrInstanceId", "agentchattr-instance-alias");
          },
        },
        {
          name: "content checksum",
          startedAt: "2026-08-10T08:00:05.100Z",
          observedAt: "2026-08-10T08:00:05.200Z",
          mutate: (_reset: JsonRecord, message: JsonRecord) => {
            Reflect.set(message, "contentChecksum", hashes.e);
          },
        },
        {
          name: "parent and thread labels",
          startedAt: "2026-08-10T08:00:05.300Z",
          observedAt: "2026-08-10T08:00:05.400Z",
          mutate: (_reset: JsonRecord, message: JsonRecord) => {
            Reflect.set(message, "parentUid", "parent-message-alias");
            Reflect.set(message, "threadId", "thread-alias");
          },
        },
        {
          name: "transport acknowledgement read and observation states",
          startedAt: "2026-08-10T08:00:05.500Z",
          observedAt: "2026-08-10T08:00:05.600Z",
          mutate: (_reset: JsonRecord, message: JsonRecord) => {
            Reflect.set(message, "transportState", "queued");
            Reflect.set(message, "receiverAcknowledgementState", "acknowledged");
            Reflect.set(message, "readState", "read");
            Reflect.set(message, "observationContext", "retry_replay");
          },
        },
      ];
      for (const [index, aliasCase] of mutableAliasCases.entries()) {
        const aliasManifest = structuredClone(proofManifest);
        const aliasReset = aliasManifest.evidence.find((record) => record.kind === "loop_guard_transition"
          && Reflect.get(record, "origin") === "human") as JsonRecord | undefined;
        const aliasMessage = aliasManifest.evidence.find((record) => record.kind === "message_observation"
          && Reflect.get(record, "senderExternalId") === "external-human-one") as JsonRecord | undefined;
        const aliasHumanBinding = aliasManifest.evidence.find((record) => record.kind === "identity_binding"
          && Reflect.get(record, "orchestrationRole") === "human") as JsonRecord | undefined;
        expect(aliasReset, aliasCase.name).toBeDefined();
        expect(aliasMessage, aliasCase.name).toBeDefined();
        expect(aliasHumanBinding, aliasCase.name).toBeDefined();
        if (aliasReset && aliasMessage && aliasHumanBinding) {
          Reflect.set(aliasReset, "startedAt", aliasCase.startedAt);
          Reflect.set(aliasReset, "observedAt", aliasCase.observedAt);
          Reflect.set(aliasMessage, "startedAt", aliasCase.startedAt);
          Reflect.set(aliasMessage, "observedAt", aliasCase.observedAt);
          aliasCase.mutate(aliasReset, aliasMessage, aliasHumanBinding);
        }
        const aliasProof = deriveProof(aliasManifest, "channel-one");
        expect(aliasProof, aliasCase.name).not.toBeNull();
        let aliasState = index === 0 ? nextEpochState : createLoopGuardState("channel-one");
        if (index !== 0) {
          for (let sendIndex = 0; sendIndex < 6; sendIndex += 1) {
            aliasState = requestAutonomousSend(aliasState).state;
          }
        }
        expect(recordAuthenticatedHumanOrigin(aliasState, aliasProof as never).reset, aliasCase.name).toBe(false);
      }

      const laterEvidenceManifest = structuredClone(proofManifest);
      const laterReset = laterEvidenceManifest.evidence.find((record) => record.kind === "loop_guard_transition"
        && Reflect.get(record, "origin") === "human");
      if (laterReset) {
        laterReset.caseId = "loop-reset-later-epoch";
        laterReset.startedAt = "2026-08-10T08:00:05.700Z";
        laterReset.observedAt = "2026-08-10T08:00:05.800Z";
        Reflect.set(laterReset, "authenticatedHumanProofHash", hashes.c);
      }
      const laterMessage = laterEvidenceManifest.evidence.find((record) => record.kind === "message_observation"
        && Reflect.get(record, "senderExternalId") === "external-human-one");
      if (laterMessage) {
        laterMessage.caseId = "message-human-reset-later-epoch";
        Reflect.set(laterMessage, "stableMessageUid", "human-reset-message-later-epoch");
        laterMessage.startedAt = "2026-08-10T08:00:05.700Z";
        laterMessage.observedAt = "2026-08-10T08:00:05.800Z";
        Reflect.set(laterMessage, "contentChecksum", hashes.d);
        Reflect.set(laterMessage, "directEvidenceArtifactHash", hashes.c);
      }
      const laterProof = deriveProof(laterEvidenceManifest, "channel-one");
      expect(laterProof).not.toBeNull();
      expect(recordAuthenticatedHumanOrigin(state, laterProof as never).reset).toBe(false);
      const laterResetResult = recordAuthenticatedHumanOrigin(nextEpochState, laterProof as never);
      expect(laterResetResult.reset).toBe(true);
      expect(recordAuthenticatedHumanOrigin(nextEpochState, laterProof as never).reset).toBe(false);

      const otherChannelManifest = structuredClone(proofManifest);
      for (const record of otherChannelManifest.evidence) {
        if (record.kind === "loop_guard_transition"
          || record.kind === "message_observation"
          || record.kind === "mcp_exchange") {
          Reflect.set(record, "channelId", "channel-two");
        }
      }
      const otherChannelProof = deriveProof(otherChannelManifest, "channel-two");
      let otherChannelState = createLoopGuardState("channel-two");
      for (let index = 0; index < 6; index += 1) {
        otherChannelState = requestAutonomousSend(otherChannelState).state;
      }
      expect(otherChannelProof).not.toBeNull();
      expect(recordAuthenticatedHumanOrigin(otherChannelState, otherChannelProof as never).reset).toBe(true);
    }
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

  it("requires Desktop common classification to equal fail-over-unsupported-over-unknown-over-pass subresult aggregation", () => {
    for (const [readClassification, sendClassification, classification] of [
      ["pass", "pass", "pass"],
      ["unknown", "pass", "unknown"],
      ["pass", "unsupported", "unsupported"],
      ["fail", "unsupported", "fail"],
    ] as const) {
      const record = desktopCapability("claude_code_desktop", {
        expectedResult: classification,
        observedResult: classification,
        classification,
        readClassification,
        sendClassification,
        storedMessageUid: sendClassification === "pass" ? "desktop-message-aggregate" : null,
        storedMessageEvidenceHash: sendClassification === "pass" ? hashes.b : null,
      });
      expect(validateEvidenceManifest(validManifestV2([record])).issues).toEqual([]);
    }

    const contradictoryPass = desktopCapability("claude_code_desktop", {
      readClassification: "unknown",
      classification: "pass",
    });
    expect(validateEvidenceManifest(validManifestV2([contradictoryPass])).issues).toContainEqual({
      code: "desktop_classification_mismatch",
      classification: "fail",
      path: "/evidence/7/classification",
    });
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

  it("requires all six monitor starts before the configuration boundary for running and aborted execution without teardown", () => {
    for (const executionState of ["running", "aborted"] as const) {
      const runtimeRecords = [
        runtimeControlRecord(0, requestEvent()),
        runtimeControlRecord(1, authorizationEvent(1)),
        runtimeControlRecord(2, executionEvent(1, "succeeded"), { observedAt: times.six }),
      ];
      const fullyCovered = validManifestV2(runtimeRecords);
      fullyCovered.executionState = executionState;
      fullyCovered.endpoint.state = executionState === "running" ? "bound" : "stopped";
      fullyCovered.evidence = fullyCovered.evidence.filter((record) => record.kind !== "teardown");
      if (executionState === "aborted") {
        fullyCovered.evidence[0].observedResult = "unknown";
        fullyCovered.evidence[0].classification = "unknown";
      }
      expect(validateEvidenceManifest(fullyCovered).issues.filter((issue) => issue.code === "monitor_coverage_gap"))
        .toEqual([]);

      const manifest = validManifestV2();
      manifest.executionState = executionState;
      manifest.endpoint.state = executionState === "running" ? "bound" : "stopped";
      manifest.evidence = manifest.evidence.filter((record) => record.kind !== "teardown");
      if (executionState === "aborted") {
        manifest.evidence[0].observedResult = "unknown";
        manifest.evidence[0].classification = "unknown";
      }
      const processMonitor = manifest.evidence.find(
        (record) => record.kind === "monitor_interval" && Reflect.get(record, "monitorKind") === "process",
      );
      if (processMonitor) processMonitor.startedAt = times.two;
      expect(validateEvidenceManifest(manifest).issues).toContainEqual({
        code: "monitor_coverage_gap",
        classification: "fail",
        path: "/evidence",
      });

      const endedBeforeStart = validManifestV2();
      endedBeforeStart.executionState = executionState;
      endedBeforeStart.endpoint.state = executionState === "running" ? "bound" : "stopped";
      endedBeforeStart.evidence = endedBeforeStart.evidence.filter((record) => record.kind !== "teardown");
      if (executionState === "aborted") {
        endedBeforeStart.evidence[0].observedResult = "unknown";
        endedBeforeStart.evidence[0].classification = "unknown";
      }
      const endedProcessMonitor = endedBeforeStart.evidence.find(
        (record) => record.kind === "monitor_interval" && Reflect.get(record, "monitorKind") === "process",
      );
      if (endedProcessMonitor) {
        endedProcessMonitor.startedAt = times.before;
        endedProcessMonitor.observedAt = times.before;
      }
      expect(validateEvidenceManifest(endedBeforeStart).issues).toContainEqual({
        code: "monitor_coverage_gap",
        classification: "fail",
        path: "/evidence",
      });

      const endedBeforeLatestEvidence = validManifestV2(runtimeRecords);
      endedBeforeLatestEvidence.executionState = executionState;
      endedBeforeLatestEvidence.endpoint.state = executionState === "running" ? "bound" : "stopped";
      endedBeforeLatestEvidence.evidence = endedBeforeLatestEvidence.evidence
        .filter((record) => record.kind !== "teardown");
      if (executionState === "aborted") {
        endedBeforeLatestEvidence.evidence[0].observedResult = "unknown";
        endedBeforeLatestEvidence.evidence[0].classification = "unknown";
      }
      const shortProcessMonitor = endedBeforeLatestEvidence.evidence.find(
        (record) => record.kind === "monitor_interval" && Reflect.get(record, "monitorKind") === "process",
      );
      if (shortProcessMonitor) shortProcessMonitor.observedAt = times.five;
      expect(validateEvidenceManifest(endedBeforeLatestEvidence).issues).toContainEqual({
        code: "monitor_coverage_gap",
        classification: "fail",
        path: "/evidence",
      });
    }
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

const actionEffectMatrix = [
  ["list_agents", "read_only", { targetKind: "workspace", workspaceId: "workspace-1" }],
  ["get_agent", "read_only", { targetKind: "agent_session", agentSessionId: "agent-session-1" }],
  ["read_pane", "read_only", paneTarget],
  ["wait_for_agent", "read_only", { targetKind: "agent_session", agentSessionId: "agent-session-1" }],
  ["wait_for_output", "read_only", { targetKind: "agent_session", agentSessionId: "agent-session-1" }],
  ["relay_message", "non_idempotent_mutation", paneTarget],
  ["send_text", "non_idempotent_mutation", paneTarget],
  ["submit_input", "non_idempotent_mutation", paneTarget],
  ["spawn_agent", "non_idempotent_mutation", { targetKind: "tab", workspaceId: "workspace-1", tabId: "tab-1" }],
  ["focus_agent", "idempotent_mutation", paneTarget],
  ["rename_agent", "idempotent_mutation", paneTarget],
  ["run_command", "non_idempotent_mutation", paneTarget],
  ["send_keys", "non_idempotent_mutation", paneTarget],
  ["split_pane", "non_idempotent_mutation", paneTarget],
  ["close_pane", "idempotent_mutation", paneTarget],
  ["stop_session", "idempotent_mutation", { targetKind: "agent_session", agentSessionId: "agent-session-1" }],
  ["delete_session", "idempotent_mutation", { targetKind: "agent_session", agentSessionId: "agent-session-1" }],
  ["create_tab", "non_idempotent_mutation", { targetKind: "workspace", workspaceId: "workspace-1" }],
  ["close_tab", "idempotent_mutation", { targetKind: "tab", workspaceId: "workspace-1", tabId: "tab-1" }],
  ["create_workspace", "non_idempotent_mutation", { targetKind: "runtime_manager_project", projectId: "project-1" }],
  ["close_workspace", "idempotent_mutation", { targetKind: "workspace", workspaceId: "workspace-1" }],
] as const;

function uuidFor(index: number) {
  return `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`;
}

function runtimeControlRecord(
  sequence: number,
  event: JsonRecord,
  overrides: JsonRecord = {},
): JsonRecord {
  const observedAt = [times.start, times.one, times.two, times.three, times.four, times.five, times.six, times.seven][sequence] ?? times.eight;
  const verificationArtifactHash = event.phase === "verification"
    && (event.evidenceReference as JsonRecord | undefined)?.kind === "artifact"
    ? (event.evidenceReference as JsonRecord).artifactHash
    : undefined;
  return {
    ...evidenceBase("runtime_control_action", `runtime-control-${sequence}-${String(event.phase)}`, observedAt),
    ...(typeof verificationArtifactHash === "string"
      ? { artifacts: [{ kind: "verification", digest: verificationArtifactHash }] }
      : {}),
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

function runtimeObservationEvidenceReference(
  state: "verified_applied" | "verified_not_applied" | "mismatched" | "timed_out" | "unknown" | "unsupported",
  overrides: JsonRecord = {},
) {
  return {
    kind: "runtime_observation",
    caseId: "runtime-verification-observation",
    actionId: actionIds.action,
    attemptId: actionIds.attemptOne,
    action: "send_text",
    target: paneTarget,
    claimedState: state,
    ...overrides,
  };
}

function runtimeControlProof(
  disposition: "applied" | "not_applied",
  overrides: JsonRecord = {},
) {
  return {
    actionId: actionIds.action,
    attemptId: actionIds.attemptOne,
    action: "send_text",
    target: paneTarget,
    disposition,
    resultArtifactHash: hashes.d,
    ...overrides,
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
  it("pins the semantic effect class for every runtime action", () => {
    for (const [action, effectClass, target] of actionEffectMatrix) {
      const validRequest = runtimeControlRecord(0, requestEvent({
        action,
        target,
        effectClass,
        retryPolicy: { mode: "none" },
      }));
      expect(
        validateEvidenceManifest(validManifestV2([validRequest])).issues,
        `${action} should accept ${effectClass}`,
      ).toEqual([]);

      const invalidEffectClass = effectClass === "read_only" ? "idempotent_mutation" : "read_only";
      const invalidRequest = runtimeControlRecord(0, requestEvent({
        action,
        target,
        effectClass: invalidEffectClass,
        retryPolicy: { mode: "none" },
      }));
      expect(validateEvidenceManifest(validManifestV2([invalidRequest])).issues).toContainEqual({
        code: "runtime_effect_class_mismatch",
        classification: "fail",
        path: "/evidence/7/event/effectClass",
      });

      if (effectClass !== "read_only") {
        const swappedMutationClass = effectClass === "idempotent_mutation"
          ? "non_idempotent_mutation"
          : "idempotent_mutation";
        const swappedRequest = runtimeControlRecord(0, requestEvent({
          action,
          target,
          effectClass: swappedMutationClass,
          retryPolicy: { mode: "none" },
        }));
        expect(validateEvidenceManifest(validManifestV2([swappedRequest])).issues).toContainEqual({
          code: "runtime_effect_class_mismatch",
          classification: "fail",
          path: "/evidence/7/event/effectClass",
        });
      }
    }
  });

  it("does not let mutating send, spawn, or close actions self-label read-only to bypass retry safety", () => {
    for (const [action, target] of [
      ["send_text", paneTarget],
      ["spawn_agent", { targetKind: "tab", workspaceId: "workspace-1", tabId: "tab-1" }],
      ["close_pane", paneTarget],
    ] as const) {
      const scope = { action, target, parameterHash: hashes.b };
      const records = timeline([
        requestEvent({ action, target, effectClass: "read_only", humanIntent: { state: "none" } }),
        authorizationEvent(1, { scope }),
        executionEvent(1, "succeeded"),
        authorizationEvent(2, { scope }),
        executionEvent(2, "succeeded"),
      ]);
      expect(validateEvidenceManifest(validManifestV2(records)).issues).toContainEqual({
        code: "runtime_duplicate_execution_risk",
        classification: "fail",
        path: "/evidence",
      });
    }
  });

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

  it("binds artifact verification to a declared verification artifact on the same record", () => {
    const records = timeline([
      requestEvent(),
      authorizationEvent(1),
      executionEvent(1, "failed"),
      verificationEvent(actionIds.attemptOne, "verified_not_applied"),
    ]);
    expect(validateEvidenceManifest(validManifestV2(records)).issues).toEqual([]);

    records[3].artifacts = [{ kind: "verification", digest: hashes.a }];
    expect(validateEvidenceManifest(validManifestV2(records)).issues).toContainEqual({
      code: "runtime_verification_artifact_missing",
      classification: "fail",
      path: "/evidence/10/event/evidenceReference",
    });
  });

  it("binds runtime-observation verification to later current direct Herdr proof for the exact request target", () => {
    const verified = runtimeControlResultObservation("direct_herdr", "verification", "applied", {
      caseId: "runtime-verification-observation",
      startedAt: times.four,
      observedAt: times.four,
    });
    const records = timeline([
      requestEvent(),
      authorizationEvent(1),
      executionEvent(1, "succeeded"),
      {
        ...verificationEvent(actionIds.attemptOne, "verified_applied"),
        evidenceReference: runtimeObservationEvidenceReference("verified_applied"),
      },
    ]);
    expect(validateEvidenceManifest(validManifestV2([...records, verified])).issues).toEqual([]);

    const invalidProofs = [
      runtimeControlResultObservation("herdr_telemetry_bridge", "verification-telemetry", "applied", {
        caseId: "runtime-verification-observation",
        startedAt: times.four,
        observedAt: times.four,
      }),
      runtimeControlResultObservation("direct_herdr", "verification-earlier", "applied", {
        caseId: "runtime-verification-observation",
        startedAt: times.start,
        observedAt: times.two,
      }),
      runtimeControlResultObservation("direct_herdr", "verification-event-predates-verification", "applied", {
        caseId: "runtime-verification-observation",
        startedAt: times.start,
        observedAt: times.four,
        observation: {
          ...runtimeControlResultObservation(
            "direct_herdr",
            "verification-event-predates-verification",
            "applied",
          ).observation,
          eventAt: times.two,
        },
      }),
      runtimeControlResultObservation("direct_herdr", "verification-target", "applied", {
        caseId: "runtime-verification-observation",
        startedAt: times.four,
        observedAt: times.four,
        controlProof: runtimeControlProof("applied", {
          target: { ...paneTarget, paneId: "pane-other" },
        }),
        observation: {
          ...runtimeControlResultObservation("direct_herdr", "verification-target", "applied").observation,
          target: { ...paneTarget, paneId: "pane-other" },
        },
      }),
      runtimeControlResultObservation("direct_herdr", "verification-provenance", "applied", {
        caseId: "runtime-verification-observation",
        startedAt: times.four,
        observedAt: times.four,
        provenance: { sourceKind: "operator_observation", sourceRef: "wrong-source", digest: hashes.a },
      }),
      runtimeControlResultObservation("direct_herdr", "verification-unknown", "applied", {
        caseId: "runtime-verification-observation",
        startedAt: times.four,
        observedAt: times.four,
        observedResult: "unknown",
        classification: "unknown",
      }),
    ];
    for (const proof of invalidProofs) {
      expect(validateEvidenceManifest(validManifestV2([...records, proof])).issues).toContainEqual({
        code: "runtime_verification_evidence_invalid",
        classification: "fail",
        path: "/evidence/10/event/evidenceReference",
      });
    }
  });

  it("binds runtime observation proof to action, attempt, target, claimed result, and observation semantics", () => {
    const verifiedApplied = {
      ...verificationEvent(actionIds.attemptOne, "verified_applied"),
      evidenceReference: runtimeObservationEvidenceReference("verified_applied"),
    };
    const base = timeline([
      requestEvent(),
      authorizationEvent(1),
      executionEvent(1, "succeeded"),
      verifiedApplied,
    ]);
    const passing = runtimeControlResultObservation("direct_herdr", "verification-binding", "applied", {
      caseId: "runtime-verification-observation",
      startedAt: times.four,
      observedAt: times.four,
    });
    expect(validateEvidenceManifest(validManifestV2([...base, passing])).issues).toEqual([]);

    const referenceMismatches = [
      runtimeObservationEvidenceReference("verified_applied", { action: "read_pane" }),
      runtimeObservationEvidenceReference("verified_applied", { attemptId: actionIds.attemptTwo }),
      runtimeObservationEvidenceReference("verified_applied", {
        target: { ...paneTarget, paneId: "pane-other" },
      }),
      runtimeObservationEvidenceReference("verified_not_applied"),
    ];
    for (const evidenceReference of referenceMismatches) {
      const records = timeline([
        requestEvent(), authorizationEvent(1), executionEvent(1, "succeeded"),
        { ...verifiedApplied, evidenceReference },
      ]);
      expectIssue(
        validManifestV2([...records, passing]),
        "runtime_verification_evidence_invalid",
        "fail",
      );
    }

    const blockedSnapshot = runtimeSnapshot("direct_herdr", "verification-blocked", {
      caseId: "runtime-verification-observation",
      startedAt: times.four,
      observedAt: times.four,
      observation: {
        ...runtimeSnapshot("direct_herdr", "verification-blocked").observation,
        runtimeState: "blocked",
      },
      controlProof: runtimeControlProof("applied"),
    });
    expectIssue(
      validManifestV2([...base, blockedSnapshot]),
      "runtime_verification_evidence_invalid",
      "fail",
    );
    const workingSnapshot = runtimeSnapshot("direct_herdr", "verification-working", {
      caseId: "runtime-verification-observation",
      startedAt: times.four,
      observedAt: times.four,
      controlProof: runtimeControlProof("applied"),
    });
    expectIssue(
      validManifestV2([...base, workingSnapshot]),
      "runtime_verification_evidence_invalid",
      "fail",
    );

    const verifiedNotApplied = timeline([
      requestEvent(),
      authorizationEvent(1),
      executionEvent(1, "failed"),
      {
        ...verificationEvent(actionIds.attemptOne, "verified_not_applied"),
        evidenceReference: runtimeObservationEvidenceReference("verified_not_applied"),
      },
    ]);
    const paneCreated = runtimeSnapshot("direct_herdr", "verification-pane-created", {
      caseId: "runtime-verification-observation",
      startedAt: times.four,
      observedAt: times.four,
      observation: {
        observationKind: "lifecycle_event",
        event: "pane_created",
        target: paneTarget,
        nativeSequence: 1,
        eventAt: times.four,
      },
      controlProof: runtimeControlProof("not_applied"),
    });
    expectIssue(
      validManifestV2([...verifiedNotApplied, paneCreated]),
      "runtime_verification_evidence_invalid",
      "fail",
    );
    const genericNotApplied = runtimeSnapshot("direct_herdr", "verification-generic-not-applied", {
      caseId: "runtime-verification-observation",
      startedAt: times.four,
      observedAt: times.four,
      controlProof: runtimeControlProof("not_applied"),
    });
    expectIssue(
      validManifestV2([...verifiedNotApplied, genericNotApplied]),
      "runtime_verification_evidence_invalid",
      "fail",
    );

    const exactNotApplied = runtimeControlResultObservation(
      "direct_herdr",
      "verification-exact-not-applied",
      "not_applied",
      {
        caseId: "runtime-verification-observation",
        startedAt: times.four,
        observedAt: times.four,
      },
    );
    expect(validateEvidenceManifest(validManifestV2([
      ...verifiedNotApplied, exactNotApplied,
    ])).issues).toEqual([]);
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

  it("evaluates late final proof so applied verification after a retry reports duplicate risk", () => {
    const records = timeline([
      requestEvent(),
      authorizationEvent(1),
      executionEvent(1, "failed"),
      reconciliationEvent(actionIds.attemptOne),
      authorizationEvent(2),
      executionEvent(2, "succeeded"),
      verificationEvent(actionIds.attemptOne, "verified_applied"),
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
    records[0].artifacts = [
      { kind: "request", digest: hashes.e },
      {
        kind: "provider_idempotency_review",
        digest: hashes.f,
        reviewedRequestArtifactHash: hashes.e,
        reviewedIdempotencyKey: hashes.a,
      },
    ];
    expect(validateEvidenceManifest(validManifestV2(records))).toEqual({ classification: "pass", issues: [] });
  });

  it("does not unlock provider-idempotent retry with generic, absent, or incorrectly bound review evidence", () => {
    for (const artifacts of [
      [{ kind: "verification", digest: hashes.f }],
      [{ kind: "verification", digest: hashes.a }],
      [],
      [{
        kind: "provider_idempotency_review",
        digest: hashes.f,
        reviewedRequestArtifactHash: hashes.e,
        reviewedIdempotencyKey: hashes.a,
      }],
      [
        { kind: "request", digest: hashes.e },
        {
          kind: "provider_idempotency_review",
          digest: hashes.f,
          reviewedRequestArtifactHash: hashes.e,
          reviewedIdempotencyKey: hashes.b,
        },
      ],
    ]) {
      const records = timeline([
        requestEvent({ reviewedProviderIdempotencyArtifactHash: hashes.f }),
        authorizationEvent(1),
        executionEvent(1, "timed_out", { providerIdempotencyState: "supported" }),
        authorizationEvent(2),
        executionEvent(2, "succeeded", { providerIdempotencyState: "supported" }),
      ]);
      records[0].artifacts = artifacts;
      expect(validateEvidenceManifest(validManifestV2(records)).issues).toContainEqual({
        code: "runtime_provider_idempotency_evidence_missing",
        classification: "fail",
        path: "/evidence/7/event/reviewedProviderIdempotencyArtifactHash",
      });
      expectIssue(validManifestV2(records), "runtime_reconciliation_required", "fail");
    }
  });

  it("requires exactly one canonical provider-idempotency review tuple", () => {
    const canonicalReview = {
      kind: "provider_idempotency_review",
      digest: hashes.f,
      reviewedRequestArtifactHash: hashes.e,
      reviewedIdempotencyKey: hashes.a,
    };
    for (const reviews of [
      [canonicalReview, { ...canonicalReview }],
      [canonicalReview, { ...canonicalReview, reviewedIdempotencyKey: hashes.b }],
      [canonicalReview, { ...canonicalReview, reviewedRequestArtifactHash: hashes.d }],
    ]) {
      const records = timeline([
        requestEvent({ reviewedProviderIdempotencyArtifactHash: hashes.f }),
        authorizationEvent(1),
        executionEvent(1, "timed_out", { providerIdempotencyState: "supported" }),
        authorizationEvent(2),
        executionEvent(2, "succeeded", { providerIdempotencyState: "supported" }),
      ]);
      records[0].artifacts = [
        { kind: "request", digest: hashes.e },
        ...reviews,
      ];
      expect(validateEvidenceManifest(validManifestV2(records)).issues).toContainEqual({
        code: "runtime_provider_idempotency_evidence_ambiguous",
        classification: "fail",
        path: "/evidence/7/event/reviewedProviderIdempotencyArtifactHash",
      });
    }
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

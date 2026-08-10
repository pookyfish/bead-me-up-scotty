import { describe, expect, it } from "vitest";
import {
  acknowledgementStateSchema,
  beadsPromotionSchema,
  caseIdSchema,
  collaborationIntentSchema,
  configurationBoundarySchema,
  desktopCapabilitySchema,
  evidenceArtifactSchema,
  evidenceProvenanceSchema,
  identityBindingSchema,
  identityFixtureSchema,
  loopGuardTransitionSchema,
  mcpExchangeSchema,
  monitorIntervalSchema,
  messageFixtureSchema,
  messageObservationSchema,
  readStateSchema,
  safeExtensionsSchema,
  safeRefSchema,
  sha256Schema,
  teardownSchema,
  transportStateSchema,
  runtimeObservationSchema,
  withEvidenceBase,
} from "./evidence-schema";
import { z } from "zod";

const digest = `sha256:${"a".repeat(64)}`;

const invalidExtensions = [
  { "x-team-path": "C:/Users/example" },
  { "x-team-url": "https://example.invalid" },
  { "x-team-command": "node server.js" },
  { "x-team-config": "token=secret" },
  { "x-team-array": ["present"] },
  { "x-team-object": { state: "present" } },
  { "team-state": "present" },
  { "x-Team-state": "present" },
];

const syntheticEvidenceSchema = withEvidenceBase("synthetic_fixture", {});

function validEvidence() {
  return {
    caseId: "schema-primitives",
    kind: "synthetic_fixture",
    expectedResult: "pass",
    observedResult: "pass",
    classification: "pass",
    startedAt: "2026-08-10T08:00:00.000Z",
    observedAt: "2026-08-10T08:00:01.000Z",
    provenance: {
      sourceKind: "synthetic_fixture",
      sourceRef: "fixture-1",
      digest,
    },
    artifacts: [{ kind: "synthetic_fixture", digest }],
  };
}

describe("strict evidence schema primitives", () => {
  it("accepts only lowercase sha256 digests", () => {
    expect(sha256Schema.safeParse(digest).success).toBe(true);
    expect(sha256Schema.safeParse(`sha256:${"A".repeat(64)}`).success).toBe(false);
    expect(sha256Schema.safeParse("sha256:abc").success).toBe(false);
    expect(sha256Schema.safeParse("checksum").success).toBe(false);
  });

  it("rejects unsafe ID references", () => {
    for (const value of ["\u0000", "   ", "ref/name", "ref:name", "a".repeat(129)]) {
      expect(safeRefSchema.safeParse(value).success).toBe(false);
    }
  });

  it("accepts only case IDs in the approved grammar", () => {
    expect(caseIdSchema.safeParse("schema-primitives").success).toBe(true);
    for (const value of ["ab", "Schema-primitives", "schema_primitives", "schema primitives", "a".repeat(65)]) {
      expect(caseIdSchema.safeParse(value).success).toBe(false);
    }
  });

  it("accepts only bounded flat namespaced extension values", () => {
    const values = [null, true, -1_000_000_000, "present", "absent", "enabled", "disabled", "unknown", "unsupported", "redacted", "matched", "mismatched", digest];
    const extensions = Object.fromEntries(values.map((value, index) => [`x-team-value-${index}`, value]));

    expect(safeExtensionsSchema.safeParse(extensions).success).toBe(true);
    expect(safeExtensionsSchema.safeParse(Object.fromEntries(Array.from({ length: 17 }, (_, index) => [`x-team-${index}`, null]))).success).toBe(false);
    expect(safeExtensionsSchema.safeParse({ "x-team-count": 1_000_000_001 }).success).toBe(false);
  });

  it("rejects unsafe extension mutations", () => {
    for (const extensions of invalidExtensions) {
      expect(safeExtensionsSchema.safeParse(extensions).success).toBe(false);
    }
  });

  it("rejects unknown fields at common, provenance, and artifact boundaries", () => {
    expect(syntheticEvidenceSchema.safeParse({ ...validEvidence(), unexpected: true }).success).toBe(false);
    expect(evidenceProvenanceSchema.safeParse({ ...validEvidence().provenance, unexpected: true }).success).toBe(false);
    expect(evidenceArtifactSchema.safeParse({ ...validEvidence().artifacts[0], unexpected: true }).success).toBe(false);
  });

  it("requires timestamps to be monotonic within an evidence record", () => {
    expect(syntheticEvidenceSchema.safeParse(validEvidence()).success).toBe(true);
    expect(
      syntheticEvidenceSchema.safeParse({
        ...validEvidence(),
        startedAt: "2026-08-10T08:00:02.000Z",
      }).success,
    ).toBe(false);
  });

  it("keeps the evidence kind literal when a record shape defines kind", () => {
    const schema = withEvidenceBase("synthetic_fixture", { kind: z.string() });

    expect(schema.safeParse({ ...validEvidence(), kind: "other_kind" }).success).toBe(false);
  });
});

function validRecord(kind: string) {
  return {
    ...validEvidence(),
    caseId: "conversation-evidence",
    kind,
  };
}

function validMessageObservation() {
  return {
    ...validRecord("message_observation"),
    providerInstanceId: "agentchattr-instance",
    channelId: "channel-1",
    stableMessageUid: "message-1",
    cursorId: 12,
    parentUid: null,
    threadId: null,
    senderExternalId: "external-agent-1",
    contentChecksum: digest,
    collaborationIntent: "task_proposal",
    collaborationSessionId: "collaboration-a",
    collaborationSequence: 0,
    directEvidenceArtifactHash: digest,
    transportState: "server_accepted",
    receiverAcknowledgementState: "pending",
    readState: "unread",
    observationContext: "initial_page",
    messageState: "present",
  };
}

function validIdentityBinding(surface = "herdr") {
  return {
    ...validRecord("identity_binding"),
    actorId: "actor-1",
    logicalSessionId: "logical-session-1",
    executionSurface: surface,
    orchestrationRole: "worker",
    modelProvider: "anthropic",
    modelId: "claude-1",
    herdrSessionRef: surface === "herdr" ? "herdr-session-1" : null,
    agentChattrInstanceId: "agentchattr-instance",
    agentChattrSessionId: "agentchattr-session-1",
    agentChattrExternalId: "external-agent-1",
    beadsActorId: "beads-actor-1",
    validFrom: "2026-08-10T08:00:00.000Z",
    validUntil: "2026-08-10T09:00:00.000Z",
    bindingState: "verified",
  };
}

function validLoopGuardTransition() {
  return {
    ...validRecord("loop_guard_transition"),
    channelId: "channel-1",
    origin: "agent",
    fromState: "active(4)",
    toState: "active(5)",
    mcpInvoked: true,
    stableMessageUid: "message-5",
    authenticatedHumanProofHash: null,
  };
}

function validBeadsPromotion() {
  return {
    ...validRecord("beads_promotion"),
    beadId: "bead-1",
    scottyDecisionId: "decision-1",
    artifactType: "decision",
    selectedValueChecksum: digest,
    agentChattrIdempotencyKey: "agentchattr:agentchattr-instance:message-1:selected",
    promotionSource: { kind: "agentchattr_message" },
    beadsArtifactId: "beads-comment-1",
    acknowledgedAt: "2026-08-10T08:00:02.000Z",
    verifiedAt: "2026-08-10T08:00:03.000Z",
    state: "durable",
  };
}

function validMcpExchange() {
  return {
    ...validRecord("mcp_exchange"),
    clientKind: "operator_mcp_client",
    clientVersion: "v1",
    operation: "chat_send",
    authenticationState: "authenticated",
    requestArtifactHash: digest,
    responseArtifactHash: digest,
    resultingStableMessageUid: "message-1",
  };
}

function validDesktopCapability(client = "claude_code_desktop") {
  return {
    ...validRecord("desktop_capability"),
    client,
    clientVersion: "v1",
    readClassification: "pass",
    sendClassification: "pass",
    authenticationEvidenceHash: digest,
    storedMessageUid: "message-1",
    storedMessageEvidenceHash: digest,
  };
}

function expectNestedUnknownFieldRejected(schema: { safeParse(value: unknown): { success: boolean } }, value: Record<string, unknown>) {
  expect(schema.safeParse({ ...value, provenance: { ...(value.provenance as object), unexpected: true } }).success).toBe(false);
}

describe("typed conversation evidence records", () => {
  it("accepts each closed record kind and rejects nested unknown fields", () => {
    const records = [
      [messageObservationSchema, validMessageObservation()],
      [identityBindingSchema, validIdentityBinding()],
      [loopGuardTransitionSchema, validLoopGuardTransition()],
      [beadsPromotionSchema, validBeadsPromotion()],
      [mcpExchangeSchema, validMcpExchange()],
      [desktopCapabilitySchema, validDesktopCapability()],
    ] as const;

    for (const [schema, record] of records) {
      expect(schema.safeParse(record).success).toBe(true);
      expectNestedUnknownFieldRejected(schema, record);
    }
  });

  it("keeps message transport, acknowledgement, and read states independent", () => {
    const valid = validMessageObservation();

    expect(messageObservationSchema.safeParse(valid).success).toBe(true);
    expect(messageObservationSchema.safeParse({ ...valid, transportState: "delivered" }).success).toBe(false);
    expect(messageObservationSchema.safeParse({ ...valid, receiverAcknowledgementState: "read" }).success).toBe(false);
    expect(messageObservationSchema.safeParse({ ...valid, readState: "acknowledged" }).success).toBe(false);
    expect(messageObservationSchema.safeParse({ ...valid, delivery: "accepted" }).success).toBe(false);
  });

  it("admits only declared collaboration intent and session sequence pairs", () => {
    const valid = validMessageObservation();

    expect(collaborationIntentSchema.safeParse("peer_acceptance").success).toBe(true);
    expect(collaborationIntentSchema.safeParse("approval").success).toBe(false);
    expect(messageObservationSchema.safeParse({ ...valid, collaborationIntent: "approval" }).success).toBe(false);
    expect(messageObservationSchema.safeParse({ ...valid, collaborationSessionId: undefined, collaborationSequence: undefined }).success).toBe(true);
    expect(messageObservationSchema.safeParse({ ...valid, collaborationSessionId: "collaboration-a", collaborationSequence: undefined }).success).toBe(false);
    expect(messageObservationSchema.safeParse({ ...valid, collaborationSessionId: undefined, collaborationSequence: 0 }).success).toBe(false);
  });

  it("uses the approved closed message state vocabularies", () => {
    expect(transportStateSchema.safeParse("submitted").success).toBe(true);
    expect(acknowledgementStateSchema.safeParse("acknowledged").success).toBe(true);
    expect(readStateSchema.safeParse("read").success).toBe(true);
    expect(transportStateSchema.safeParse("delivered").success).toBe(false);
  });

  it("requires a complete verified identity interval and excludes inferred binding fields", () => {
    const valid = validIdentityBinding();

    expect(identityBindingSchema.safeParse(valid).success).toBe(true);
    expect(identityBindingSchema.safeParse({ ...valid, validFrom: "2026-08-10T10:00:00.000Z" }).success).toBe(false);
    expect(identityBindingSchema.safeParse({ ...valid, validUntil: null }).success).toBe(false);
    expect(identityBindingSchema.safeParse({ ...valid, bindingState: "unverified", validUntil: null }).success).toBe(true);
    for (const field of ["displayName", "channelId", "mentionId", "replyToUid", "role", "beadId"]) {
      expect(identityBindingSchema.safeParse({ ...valid, [field]: "not-a-binding-key" }).success).toBe(false);
    }
  });

  it("requires a Herdr session only for Herdr and forbids it on Desktop surfaces", () => {
    const herdr = validIdentityBinding();

    expect(identityBindingSchema.safeParse({ ...herdr, herdrSessionRef: null }).success).toBe(false);
    expect(identityBindingSchema.safeParse(validIdentityBinding("claude_code_desktop")).success).toBe(true);
    expect(identityBindingSchema.safeParse(validIdentityBinding("codex_desktop")).success).toBe(true);
    expect(identityBindingSchema.safeParse({ ...validIdentityBinding("claude_code_desktop"), herdrSessionRef: "herdr-session-1" }).success).toBe(false);
    expect(identityBindingSchema.safeParse({ ...validIdentityBinding("codex_desktop"), herdrSessionRef: "herdr-session-1" }).success).toBe(false);
  });

  it("admits only the four structural loop-guard transitions", () => {
    const ordinaryTransitions = [
      ["active(0)", "active(1)"],
      ["active(1)", "active(2)"],
      ["active(2)", "active(3)"],
      ["active(3)", "active(4)"],
      ["active(4)", "active(5)"],
    ] as const;
    const sixth = {
      ...validLoopGuardTransition(),
      fromState: "active(5)",
      toState: "paused(6)",
      stableMessageUid: "message-6",
    };
    const seventh = {
      ...validLoopGuardTransition(),
      fromState: "paused(6)",
      toState: "paused(6)",
      mcpInvoked: false,
      stableMessageUid: null,
    };
    const reset = {
      ...validLoopGuardTransition(),
      origin: "human",
      fromState: "paused(6)",
      toState: "active(0)",
      mcpInvoked: false,
      stableMessageUid: null,
      authenticatedHumanProofHash: digest,
    };

    for (const [fromState, toState] of ordinaryTransitions) {
      expect(loopGuardTransitionSchema.safeParse({ ...validLoopGuardTransition(), fromState, toState }).success).toBe(true);
    }
    expect(loopGuardTransitionSchema.safeParse(sixth).success).toBe(true);
    expect(loopGuardTransitionSchema.safeParse(seventh).success).toBe(true);
    expect(loopGuardTransitionSchema.safeParse(reset).success).toBe(true);
    expect(loopGuardTransitionSchema.safeParse({ ...seventh, mcpInvoked: true }).success).toBe(false);
    expect(loopGuardTransitionSchema.safeParse({ ...reset, authenticatedHumanProofHash: null }).success).toBe(false);
    expect(loopGuardTransitionSchema.safeParse({ ...validLoopGuardTransition(), fromState: "active(2)", toState: "active(4)" }).success).toBe(false);
  });

  it("keeps Beads durability separate and makes runtime promotion source correlation structural", () => {
    const messagePromotion = validBeadsPromotion();
    const runtimePromotion = {
      ...messagePromotion,
      promotionSource: {
        kind: "runtime_control",
        correlationId: "1f4e8aa2-834a-4d12-9832-ced9ed1f9e6a",
        actionIds: ["6e47daf6-b252-4e26-845a-1292d134a082"],
      },
    };

    expect(beadsPromotionSchema.safeParse(messagePromotion).success).toBe(true);
    expect(beadsPromotionSchema.safeParse(runtimePromotion).success).toBe(true);
    expect(beadsPromotionSchema.safeParse({ ...runtimePromotion, promotionSource: { kind: "runtime_control" } }).success).toBe(false);
    expect(beadsPromotionSchema.safeParse({ ...runtimePromotion, promotionSource: { ...runtimePromotion.promotionSource, actionIds: [] } }).success).toBe(false);
    expect(beadsPromotionSchema.safeParse({ ...runtimePromotion, promotionSource: { ...runtimePromotion.promotionSource, actionIds: ["6e47daf6-b252-4e26-845a-1292d134a082", "6e47daf6-b252-4e26-845a-1292d134a082"] } }).success).toBe(false);
    expect(beadsPromotionSchema.safeParse({ ...runtimePromotion, promotionSource: { ...runtimePromotion.promotionSource, correlationId: "not-a-uuid" } }).success).toBe(false);
    expect(beadsPromotionSchema.safeParse({ ...runtimePromotion, promotionSource: { ...runtimePromotion.promotionSource, actionIds: ["not-a-uuid"] } }).success).toBe(false);
    expect(beadsPromotionSchema.safeParse({ ...runtimePromotion, promotionSource: { ...runtimePromotion.promotionSource, unexpected: true } }).success).toBe(false);
  });

  it("requires complete, chronologically ordered durable promotion evidence", () => {
    const durable = validBeadsPromotion();

    expect(beadsPromotionSchema.safeParse({ ...durable, beadsArtifactId: null }).success).toBe(false);
    expect(beadsPromotionSchema.safeParse({ ...durable, acknowledgedAt: null }).success).toBe(false);
    expect(beadsPromotionSchema.safeParse({ ...durable, verifiedAt: null }).success).toBe(false);
    expect(beadsPromotionSchema.safeParse({ ...durable, acknowledgedAt: "2026-08-10T08:00:04.000Z" }).success).toBe(false);
  });

  it("requires successful authenticated chat exchanges to carry a UID and leaves sequences scoped by session", () => {
    const valid = validMcpExchange();
    const sessionA = validMessageObservation();
    const sessionB = { ...validMessageObservation(), stableMessageUid: "message-2", collaborationSessionId: "collaboration-b", collaborationSequence: 0 };

    expect(mcpExchangeSchema.safeParse(valid).success).toBe(true);
    expect(mcpExchangeSchema.safeParse({ ...valid, operation: "tools/list", resultingStableMessageUid: "message-1" }).success).toBe(false);
    expect(mcpExchangeSchema.safeParse({ ...valid, authenticationState: "unknown" }).success).toBe(false);
    expect(messageFixtureSchema.safeParse({ schemaVersion: 2, fixture: "message_contract", records: [sessionA, sessionB] }).success).toBe(true);
  });

  it("verifies Claude Code Desktop and Codex Desktop capabilities independently", () => {
    const claude = validDesktopCapability("claude_code_desktop");
    const codex = validDesktopCapability("codex_desktop");
    const mixed = {
      ...validDesktopCapability("codex_desktop"),
      readClassification: "pass",
      sendClassification: "unsupported",
      storedMessageUid: null,
      storedMessageEvidenceHash: null,
    };

    expect(desktopCapabilitySchema.safeParse(claude).success).toBe(true);
    expect(desktopCapabilitySchema.safeParse(codex).success).toBe(true);
    expect(desktopCapabilitySchema.safeParse(mixed).success).toBe(true);
    expect(desktopCapabilitySchema.safeParse({ ...claude, sendClassification: "pass", storedMessageUid: null, storedMessageEvidenceHash: null }).success).toBe(false);
    expect(desktopCapabilitySchema.safeParse({ ...claude, storedMessageUid: null }).success).toBe(false);
    expect(desktopCapabilitySchema.safeParse({ ...claude, storedMessageEvidenceHash: null }).success).toBe(false);
  });

  it("uses version-2 fixture envelopes without making session Bead links bindings", () => {
    const fixture = {
      schemaVersion: 2,
      fixture: "identity_bindings",
      records: [validIdentityBinding()],
      sessionBeadLinks: [
        { logicalSessionId: "logical-session-1", beadId: "bead-1" },
        { logicalSessionId: "logical-session-1", beadId: "bead-2" },
        { logicalSessionId: "logical-session-2", beadId: "bead-1" },
      ],
    };

    expect(identityFixtureSchema.safeParse(fixture).success).toBe(true);
    expect(identityFixtureSchema.safeParse({ ...fixture, records: [validIdentityBinding()], sessionBeadLinks: fixture.sessionBeadLinks }).success).toBe(true);
    expect(identityFixtureSchema.safeParse({ ...fixture, sessionBeadLinks: [{ ...fixture.sessionBeadLinks[0], actorId: "actor-1" }] }).success).toBe(false);
  });
});

function validConfigurationBoundary() {
  return {
    ...validRecord("configuration_boundary"),
    lifecycleOwner: "runtime-manager",
    invocation: "direct_server",
    bindHost: "127.0.0.1",
    authentication: "enabled",
    disposableRootLabel: "agentchattr-spike-1",
    argvTemplateHash: digest,
    reviewedArgvTemplate: ["agentchattr-server", "<data-dir>", "<port>", "<secret>"],
    launcherState: "not_run",
    wrapperState: "disabled",
    triggerConsumerState: "disabled",
    terminalInjectionState: "disabled",
    autoWakeState: "disabled",
    jobsState: "not_run",
    persistentRulesState: "disabled",
  };
}

function validMonitorInterval(monitorKind = "process") {
  return {
    ...validRecord("monitor_interval"),
    monitorKind,
    intervalMs: 250,
    eventCount: 0,
    baselineEvidenceHash: digest,
    finalEvidenceHash: digest,
    gapState: "no_gap",
    finalCaptureState: "captured",
  };
}

function validAgentSnapshot() {
  return {
    ...validRecord("runtime_observation"),
    runtimeProvider: "herdr",
    adapter: "direct_herdr",
    measurementQuality: "direct",
    freshness: "live",
    nativeContract: { versionKind: "herdr_protocol", protocol: 2 },
    nativeEventId: "event-1",
    observation: {
      observationKind: "agent_snapshot",
      workspaceId: "workspace-1",
      tabId: "tab-1",
      paneId: "pane-1",
      terminalId: "terminal-1",
      agentSessionId: "agent-session-1",
      runtimeState: "working",
      modelMetadata: { reportingState: "reported", provider: "anthropic", model: "claude-4" },
      project: { projectKind: "configured_id", projectId: "scotty", relation: "root" },
    },
  };
}

function validLifecycleEvent() {
  return {
    ...validRecord("runtime_observation"),
    runtimeProvider: "herdr",
    adapter: "herdr_telemetry_bridge",
    measurementQuality: "derived",
    freshness: "cached",
    nativeContract: { versionKind: "named", name: "herdr-telemetry", version: "v1" },
    nativeEventId: null,
    observation: {
      observationKind: "lifecycle_event",
      event: "pane_created",
      target: { targetKind: "pane", workspaceId: "workspace-1", tabId: "tab-1", paneId: "pane-1" },
      nativeSequence: 14,
      eventAt: "2026-08-10T08:00:01.000Z",
    },
  };
}

function validTraceSummary() {
  return {
    ...validRecord("runtime_observation"),
    runtimeProvider: "herdr",
    adapter: "direct_herdr",
    measurementQuality: "direct",
    freshness: "live",
    nativeContract: { versionKind: "herdr_protocol", protocol: 2 },
    nativeEventId: "trace-event-1",
    observation: {
      observationKind: "trace_summary",
      agentSessionId: "agent-session-1",
      messageCount: 14,
      toolCallCount: 6,
      tokenCount: 1200,
      tokenCountQuality: "reported",
      summaryArtifactHash: digest,
    },
  };
}

function validTeardown() {
  return {
    ...validRecord("teardown"),
    serviceDeregistration: { serviceName: "agentchattr-spike", state: "deregistered", evidenceHash: digest },
    baselineInventoryRestoration: { state: "restored_exact", baselineEvidenceHash: digest, finalEvidenceHash: digest },
    desktopProfileConfigRestoration: { state: "restored", evidenceHash: digest },
    credentialRemoval: { state: "removed", evidenceHash: digest },
    listenerRemoval: { state: "removed", evidenceHash: digest },
    finalMonitorCapture: { state: "captured", evidenceHash: digest },
    disposableRoot: { state: "deleted", ownership: "owned" },
  };
}

const forbiddenRuntimeFields = [
  "transcript", "paneOutput", "thinking", "commandLine", "toolInput",
  "toolOutput", "cwd", "repositoryPath", "sessionPath", "rawHostEvent",
  "queueContent", "token", "credential",
] as const;

describe("operational boundaries and Herdr observations", () => {
  it("accepts the reviewed loopback configuration boundary and rejects unsafe template changes", () => {
    const valid = validConfigurationBoundary();

    expect(configurationBoundarySchema.safeParse(valid).success).toBe(true);
    expect(configurationBoundarySchema.safeParse({ ...valid, lifecycleOwner: "operator" }).success).toBe(false);
    expect(configurationBoundarySchema.safeParse({ ...valid, bindHost: "0.0.0.0" }).success).toBe(false);
    expect(configurationBoundarySchema.safeParse({ ...valid, disposableRootLabel: "C:/temp/spike" }).success).toBe(false);
    expect(configurationBoundarySchema.safeParse({ ...valid, reviewedArgvTemplate: ["C:/tools/server.exe", "<data-dir>", "<port>", "<secret>"] }).success).toBe(false);
    expect(configurationBoundarySchema.safeParse({ ...valid, reviewedArgvTemplate: ["agentchattr-server", "--port", "<port>", "<secret>"] }).success).toBe(false);
  });

  it("accepts every closed monitor kind and bounded hash-only interval evidence", () => {
    for (const monitorKind of ["process", "child_process", "trigger_queue", "herdr_pane", "input_control", "runtime_manager_inventory"]) {
      expect(monitorIntervalSchema.safeParse(validMonitorInterval(monitorKind)).success).toBe(true);
    }
    expect(monitorIntervalSchema.safeParse({ ...validMonitorInterval(), intervalMs: 0 }).success).toBe(false);
    expect(monitorIntervalSchema.safeParse({ ...validMonitorInterval(), intervalMs: 2001 }).success).toBe(false);
    expect(monitorIntervalSchema.safeParse({ ...validMonitorInterval(), eventCount: -1 }).success).toBe(false);
    expect(monitorIntervalSchema.safeParse({ ...validMonitorInterval(), baselineEvidenceHash: "process-output" }).success).toBe(false);
  });

  it("parses direct snapshots, telemetry lifecycle evidence, and direct trace summaries without authority", () => {
    expect(runtimeObservationSchema.safeParse(validAgentSnapshot()).success).toBe(true);
    expect(runtimeObservationSchema.safeParse({ ...validAgentSnapshot(), observation: { ...validAgentSnapshot().observation, modelMetadata: { reportingState: "unknown" }, project: { projectKind: "salted_sha256", projectHash: digest, relation: "descendant" } } }).success).toBe(true);
    expect(runtimeObservationSchema.safeParse(validLifecycleEvent()).success).toBe(true);
    expect(runtimeObservationSchema.safeParse(validTraceSummary()).success).toBe(true);
    expect(runtimeObservationSchema.safeParse({ ...validAgentSnapshot(), runtimeProvider: "desktop" }).success).toBe(false);
    expect(runtimeObservationSchema.safeParse({ ...validAgentSnapshot(), adapter: "herdr_mesh" }).success).toBe(false);
    expect(runtimeObservationSchema.safeParse({ ...validAgentSnapshot(), workspaceId: "workspace-1" }).success).toBe(false);
    expect(runtimeObservationSchema.safeParse({ ...validAgentSnapshot(), observation: { ...validAgentSnapshot().observation, project: { projectKind: "configured_id", projectId: "C:/repo", relation: "root" } } }).success).toBe(false);
    expect(runtimeObservationSchema.safeParse({ ...validLifecycleEvent(), observation: { ...validLifecycleEvent().observation, taskAuthority: "assigned" } }).success).toBe(false);
    expect(runtimeObservationSchema.safeParse({ ...validLifecycleEvent(), observation: { ...validLifecycleEvent().observation, controlAuthority: "granted" } }).success).toBe(false);
    for (const field of ["modelProvider", "actorId", "taskId", "leaseState", "authority"]) {
      expect(runtimeObservationSchema.safeParse({ ...validAgentSnapshot(), [field]: "conflated" }).success).toBe(false);
    }
  });

  it("keeps Herdr targets, native contracts, and token quality closed", () => {
    const lifecycle = validLifecycleEvent();
    const trace = validTraceSummary();

    expect(runtimeObservationSchema.safeParse({ ...lifecycle, nativeContract: { versionKind: "herdr_protocol", protocol: 0 } }).success).toBe(false);
    expect(runtimeObservationSchema.safeParse({ ...lifecycle, nativeContract: { versionKind: "named", name: "herdr-telemetry", version: "v1", protocol: 1 } }).success).toBe(false);
    expect(runtimeObservationSchema.safeParse({ ...lifecycle, observation: { ...lifecycle.observation, target: { targetKind: "pane", workspaceId: "workspace-1", paneId: "pane-1" } } }).success).toBe(false);
    expect(runtimeObservationSchema.safeParse({ ...trace, observation: { ...trace.observation, tokenCount: null, tokenCountQuality: "reported" } }).success).toBe(false);
    expect(runtimeObservationSchema.safeParse({ ...trace, observation: { ...trace.observation, tokenCount: 12, tokenCountQuality: "unknown" } }).success).toBe(false);
  });

  it("rejects raw runtime fields at every strict runtime boundary", () => {
    const snapshot = validAgentSnapshot();
    const lifecycle = validLifecycleEvent();
    const trace = validTraceSummary();
    const configuration = validConfigurationBoundary();
    const monitor = validMonitorInterval();
    const teardown = validTeardown();
    const runtimeMutations: Array<(field: string) => unknown> = [
      (field) => ({ ...snapshot, [field]: "raw" }),
      (field) => ({ ...snapshot, provenance: { ...snapshot.provenance, [field]: "raw" } }),
      (field) => ({ ...snapshot, artifacts: [{ ...snapshot.artifacts[0], [field]: "raw" }] }),
      (field) => ({ ...snapshot, nativeContract: { ...snapshot.nativeContract, [field]: "raw" } }),
      (field) => ({ ...snapshot, observation: { ...snapshot.observation, [field]: "raw" } }),
      (field) => ({ ...snapshot, observation: { ...snapshot.observation, modelMetadata: { ...snapshot.observation.modelMetadata, [field]: "raw" } } }),
      (field) => ({ ...snapshot, observation: { ...snapshot.observation, project: { ...snapshot.observation.project, [field]: "raw" } } }),
      (field) => ({ ...lifecycle, observation: { ...lifecycle.observation, target: { ...lifecycle.observation.target, [field]: "raw" } } }),
      (field) => ({ ...trace, observation: { ...trace.observation, [field]: "raw" } }),
    ];
    const teardownMutations: Array<(field: string) => unknown> = [
      (field) => ({ ...teardown, [field]: "raw" }),
      (field) => ({ ...teardown, serviceDeregistration: { ...teardown.serviceDeregistration, [field]: "raw" } }),
      (field) => ({ ...teardown, baselineInventoryRestoration: { ...teardown.baselineInventoryRestoration, [field]: "raw" } }),
      (field) => ({ ...teardown, desktopProfileConfigRestoration: { ...teardown.desktopProfileConfigRestoration, [field]: "raw" } }),
      (field) => ({ ...teardown, credentialRemoval: { ...teardown.credentialRemoval, [field]: "raw" } }),
      (field) => ({ ...teardown, listenerRemoval: { ...teardown.listenerRemoval, [field]: "raw" } }),
      (field) => ({ ...teardown, finalMonitorCapture: { ...teardown.finalMonitorCapture, [field]: "raw" } }),
      (field) => ({ ...teardown, disposableRoot: { ...teardown.disposableRoot, [field]: "raw" } }),
    ];

    for (const field of forbiddenRuntimeFields) {
      expect(configurationBoundarySchema.safeParse({ ...configuration, [field]: "raw" }).success).toBe(false);
      expect(monitorIntervalSchema.safeParse({ ...monitor, [field]: "raw" }).success).toBe(false);
      for (const mutation of runtimeMutations) {
        expect(runtimeObservationSchema.safeParse(mutation(field)).success).toBe(false);
      }
      for (const mutation of teardownMutations) {
        expect(teardownSchema.safeParse(mutation(field)).success).toBe(false);
      }
    }
  });

  it("requires complete teardown proof and cannot call uncertainty a pass", () => {
    const valid = validTeardown();

    expect(teardownSchema.safeParse(valid).success).toBe(true);
    expect(teardownSchema.safeParse({ ...valid, classification: "pass", observedResult: "unknown", disposableRoot: { state: "unknown", ownership: "unknown" } }).success).toBe(false);
    expect(teardownSchema.safeParse({ ...valid, desktopProfileConfigRestoration: { state: "unknown", evidenceHash: digest }, classification: "pass", observedResult: "pass" }).success).toBe(false);
    expect(teardownSchema.safeParse({ ...valid, listenerRemoval: { state: "removed", evidenceHash: digest, commandLine: "netstat" } }).success).toBe(false);
  });
});

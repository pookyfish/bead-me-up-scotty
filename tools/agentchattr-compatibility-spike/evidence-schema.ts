import { z } from "zod";

export const APPROVED_UPSTREAM_PIN = {
  repository: "https://github.com/bcurts/agentchattr.git",
  commit: "c24f605c9b24fb7a98003f7930e2d5e7a7f7d297",
  tag: "v0.5.0",
  version: "0.5.0",
  licenseSha256: "a1abc583f6725867ed3564f1bcd201d78603612330665433a733a640721f40f3",
} as const;

export const classificationSchema = z.enum(["pass", "fail", "unsupported", "unknown"]);
export const sha256Schema = z.string().regex(/^sha256:[0-9a-f]{64}$/);
export const uuidSchema = z.uuid();
export const caseIdSchema = z.string().regex(/^[a-z][a-z0-9-]{2,63}$/);
export const safeRefSchema = z
  .string()
  .min(1)
  .max(128)
  .regex(/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/);
export const utcTimestampSchema = z.iso.datetime({ offset: false });

const extensionStatusSchema = z.enum([
  "present",
  "absent",
  "enabled",
  "disabled",
  "unknown",
  "unsupported",
  "redacted",
  "matched",
  "mismatched",
]);
export const extensionKeySchema = z.string().max(64).regex(/^x-[a-z0-9]+(?:-[a-z0-9]+)*$/);
export const extensionValueSchema = z.union([
  z.null(),
  z.boolean(),
  z.int().min(-1_000_000_000).max(1_000_000_000),
  extensionStatusSchema,
  sha256Schema,
]);
export const safeExtensionsSchema = z
  .record(extensionKeySchema, extensionValueSchema)
  .refine((extensions) => Object.keys(extensions).length <= 16, {
    message: "Safe extensions support at most 16 entries.",
  });

export const provenanceSourceKindSchema = z.enum([
  "synthetic_fixture",
  "runtime_manager",
  "agentchattr_mcp",
  "agentchattr_store",
  "herdr_direct",
  "herdr_telemetry_bridge",
  "herdr_mesh",
  "beads",
  "desktop_client",
  "operator_observation",
]);

export const artifactKindSchema = z.enum([
  "source_snapshot",
  "request",
  "response",
  "configuration",
  "monitor",
  "message",
  "identity",
  "authorization",
  "execution_result",
  "verification",
  "acknowledgement",
  "beads_artifact",
  "desktop_capability",
  "teardown",
  "synthetic_fixture",
]);

export const evidenceProvenanceSchema = z.strictObject({
  sourceKind: provenanceSourceKindSchema,
  sourceRef: safeRefSchema,
  digest: sha256Schema,
});

export const evidenceArtifactSchema = z.strictObject({
  kind: artifactKindSchema,
  digest: sha256Schema,
});

const evidenceBaseFields = {
  caseId: caseIdSchema,
  expectedResult: classificationSchema,
  observedResult: classificationSchema,
  classification: classificationSchema,
  startedAt: utcTimestampSchema,
  observedAt: utcTimestampSchema,
  provenance: evidenceProvenanceSchema,
  artifacts: z.array(evidenceArtifactSchema),
  extensions: safeExtensionsSchema.optional(),
};

export type EvidenceBase<K extends string = string> = {
  caseId: z.infer<typeof caseIdSchema>;
  kind: K;
  expectedResult: z.infer<typeof classificationSchema>;
  observedResult: z.infer<typeof classificationSchema>;
  classification: z.infer<typeof classificationSchema>;
  startedAt: z.infer<typeof utcTimestampSchema>;
  observedAt: z.infer<typeof utcTimestampSchema>;
  provenance: z.infer<typeof evidenceProvenanceSchema>;
  artifacts: z.infer<typeof evidenceArtifactSchema>[];
  extensions?: z.infer<typeof safeExtensionsSchema>;
};

export function withEvidenceBase<K extends string, Shape extends z.ZodRawShape>(kind: K, shape: Shape) {
  return z
    .strictObject({
      ...shape,
      ...evidenceBaseFields,
      kind: z.literal(kind),
    })
    .refine((record) => {
      const timestamps = record as EvidenceBase;
      return timestamps.startedAt <= timestamps.observedAt;
    }, {
      message: "Evidence timestamps must be monotonic.",
      path: ["observedAt"],
    });
}

export const collaborationIntentSchema = z.enum([
  "task_proposal", "review_request", "question", "ready",
  "peer_acceptance", "blocked", "stalemate", "handoff_notice",
]);
export const transportStateSchema = z.enum([
  "server_accepted", "queued", "submitted", "failed", "timed_out", "unknown", "unsupported",
]);
export const acknowledgementStateSchema = z.enum([
  "not_applicable", "pending", "acknowledged", "timed_out", "unknown", "unsupported",
]);
export const readStateSchema = z.enum([
  "not_observed", "read", "unread", "unknown", "unsupported",
]);
export const observationContextSchema = z.enum([
  "initial_page", "overlap_page", "retry_replay", "post_restart", "tombstone",
]);
export const messageStateSchema = z.enum(["present", "deleted", "unknown"]);

export const messageObservationSchema = withEvidenceBase("message_observation", {
  providerInstanceId: safeRefSchema,
  channelId: safeRefSchema,
  stableMessageUid: safeRefSchema,
  cursorId: z.int().nonnegative(),
  parentUid: safeRefSchema.nullable(),
  threadId: safeRefSchema.nullable(),
  senderExternalId: safeRefSchema,
  contentChecksum: sha256Schema,
  collaborationIntent: collaborationIntentSchema.optional(),
  collaborationSessionId: safeRefSchema.optional(),
  collaborationSequence: z.int().nonnegative().optional(),
  directEvidenceArtifactHash: sha256Schema,
  transportState: transportStateSchema,
  receiverAcknowledgementState: acknowledgementStateSchema,
  readState: readStateSchema,
  observationContext: observationContextSchema,
  messageState: messageStateSchema,
}).refine(
  (record) => (record.collaborationSessionId === undefined) === (record.collaborationSequence === undefined),
  {
    message: "Collaboration session ID and sequence must be provided together.",
    path: ["collaborationSequence"],
  },
);

export const executionSurfaceSchema = z.enum([
  "herdr", "claude_code_desktop", "codex_desktop", "claude_cli", "codex_cli", "external_mcp",
]);
export const orchestrationRoleSchema = z.enum([
  "supervisor", "co_supervisor", "worker", "reviewer", "direct", "human", "observer",
]);
export const bindingStateSchema = z.enum(["verified", "unverified", "revoked", "stale"]);

export const identityBindingSchema = withEvidenceBase("identity_binding", {
  actorId: safeRefSchema,
  logicalSessionId: safeRefSchema,
  executionSurface: executionSurfaceSchema,
  orchestrationRole: orchestrationRoleSchema,
  modelProvider: safeRefSchema,
  modelId: safeRefSchema,
  herdrSessionRef: safeRefSchema.nullable(),
  agentChattrInstanceId: safeRefSchema,
  agentChattrSessionId: safeRefSchema,
  agentChattrExternalId: safeRefSchema,
  beadsActorId: safeRefSchema,
  validFrom: utcTimestampSchema,
  validUntil: utcTimestampSchema.nullable(),
  bindingState: bindingStateSchema,
}).superRefine((record, context) => {
  if (record.bindingState === "verified" && record.validUntil === null) {
    context.addIssue({ code: "custom", message: "Verified bindings require a complete validity interval.", path: ["validUntil"] });
  }
  if (record.executionSurface === "herdr" && record.herdrSessionRef === null) {
    context.addIssue({ code: "custom", message: "Herdr bindings require a Herdr session reference.", path: ["herdrSessionRef"] });
  }
  if (record.executionSurface !== "herdr" && record.herdrSessionRef !== null) {
    context.addIssue({ code: "custom", message: "Only Herdr bindings may carry a Herdr session reference.", path: ["herdrSessionRef"] });
  }
  if (record.validUntil !== null && record.validFrom >= record.validUntil) {
    context.addIssue({ code: "custom", message: "Identity validity interval must be increasing.", path: ["validUntil"] });
  }
});

const loopStateSchema = z.enum([
  "active(0)", "active(1)", "active(2)", "active(3)", "active(4)", "active(5)", "paused(6)",
]);

export const loopGuardTransitionSchema = withEvidenceBase("loop_guard_transition", {
  channelId: safeRefSchema,
  origin: z.enum(["agent", "human"]),
  fromState: loopStateSchema,
  toState: loopStateSchema,
  mcpInvoked: z.boolean(),
  stableMessageUid: safeRefSchema.nullable(),
  authenticatedHumanProofHash: sha256Schema.nullable(),
}).superRefine((record, context) => {
  const agentActiveTransition = record.origin === "agent"
    && /^active\([0-4]\)$/.test(record.fromState)
    && record.toState === `active(${Number(record.fromState.slice(7, 8)) + 1})`
    && record.mcpInvoked
    && record.stableMessageUid !== null
    && record.authenticatedHumanProofHash === null;
  const agentSixthTransition = record.origin === "agent"
    && record.fromState === "active(5)"
    && record.toState === "paused(6)"
    && record.mcpInvoked
    && record.stableMessageUid !== null
    && record.authenticatedHumanProofHash === null;
  const seventhSendRejected = record.origin === "agent"
    && record.fromState === "paused(6)"
    && record.toState === "paused(6)"
    && !record.mcpInvoked
    && record.stableMessageUid === null
    && record.authenticatedHumanProofHash === null;
  const humanReset = record.origin === "human"
    && record.fromState === "paused(6)"
    && record.toState === "active(0)"
    && !record.mcpInvoked
    && record.stableMessageUid === null
    && record.authenticatedHumanProofHash !== null;

  if (!agentActiveTransition && !agentSixthTransition && !seventhSendRejected && !humanReset) {
    context.addIssue({ code: "custom", message: "Loop transition is not an approved transition class." });
  }
});

export const promotionArtifactTypeSchema = z.enum([
  "task", "directive", "decision", "review_verdict", "handoff_capsule",
]);

export const agentChattrIdempotencyKeySchema = z.string().refine((value) => {
  const parts = value.split(":");
  return parts.length === 4 && parts[0] === "agentchattr" && parts.slice(1).every((part) => safeRefSchema.safeParse(part).success);
}, { message: "AgentChattr idempotency keys must use safe canonical components." });

const runtimePromotionSourceSchema = z.strictObject({
  kind: z.literal("runtime_control"),
  correlationId: uuidSchema,
  actionIds: z.array(uuidSchema).min(1).refine((actionIds) => new Set(actionIds).size === actionIds.length, {
    message: "Runtime promotion action IDs must be unique.",
  }),
});
export const promotionSourceSchema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("agentchattr_message") }),
  runtimePromotionSourceSchema,
]);

export const beadsPromotionSchema = withEvidenceBase("beads_promotion", {
  beadId: safeRefSchema,
  scottyDecisionId: safeRefSchema,
  artifactType: promotionArtifactTypeSchema,
  selectedValueChecksum: sha256Schema,
  agentChattrIdempotencyKey: agentChattrIdempotencyKeySchema,
  promotionSource: promotionSourceSchema,
  beadsArtifactId: safeRefSchema.nullable(),
  acknowledgedAt: utcTimestampSchema.nullable(),
  verifiedAt: utcTimestampSchema.nullable(),
  state: z.enum(["durable", "promotion_pending", "reconciliation_conflict"]),
}).superRefine((record, context) => {
  if (record.state === "durable" && (record.beadsArtifactId === null || record.acknowledgedAt === null || record.verifiedAt === null)) {
    context.addIssue({ code: "custom", message: "Durable promotions require an artifact and acknowledgement timestamps." });
  }
  if (record.acknowledgedAt !== null && record.verifiedAt !== null && record.acknowledgedAt > record.verifiedAt) {
    context.addIssue({ code: "custom", message: "Promotion acknowledgement must not follow verification.", path: ["verifiedAt"] });
  }
});

export const mcpOperationSchema = z.enum(["initialize", "tools/list", "chat_send", "chat_read"]);
export const mcpAuthenticationStateSchema = z.enum(["authenticated", "unauthenticated", "failed", "unknown", "unsupported"]);

export const mcpExchangeSchema = withEvidenceBase("mcp_exchange", {
  clientKind: z.enum(["operator_mcp_client", "claude_code_desktop", "codex_desktop"]),
  clientVersion: safeRefSchema,
  operation: mcpOperationSchema,
  authenticationState: mcpAuthenticationStateSchema,
  requestArtifactHash: sha256Schema,
  responseArtifactHash: sha256Schema,
  resultingStableMessageUid: safeRefSchema.nullable(),
}).superRefine((record, context) => {
  const successfulChat = record.observedResult === "pass" && (record.operation === "chat_send" || record.operation === "chat_read");
  if (successfulChat !== (record.resultingStableMessageUid !== null)) {
    context.addIssue({ code: "custom", message: "Only successful chat exchanges may carry a resulting message UID.", path: ["resultingStableMessageUid"] });
  }
  if (record.observedResult === "pass" && record.authenticationState !== "authenticated") {
    context.addIssue({ code: "custom", message: "Passing MCP exchanges require authenticated evidence.", path: ["authenticationState"] });
  }
});

export const desktopClientSchema = z.enum(["claude_code_desktop", "codex_desktop"]);

export const desktopCapabilitySchema = withEvidenceBase("desktop_capability", {
  client: desktopClientSchema,
  clientVersion: safeRefSchema,
  readClassification: classificationSchema,
  sendClassification: classificationSchema,
  authenticationEvidenceHash: sha256Schema,
  storedMessageUid: safeRefSchema.nullable(),
  storedMessageEvidenceHash: sha256Schema.nullable(),
}).superRefine((record, context) => {
  const hasStoredMessage = record.storedMessageUid !== null && record.storedMessageEvidenceHash !== null;
  if (record.sendClassification === "pass" && !hasStoredMessage) {
    context.addIssue({ code: "custom", message: "Passing Desktop sends require stored-message evidence.", path: ["storedMessageEvidenceHash"] });
  }
  if (record.sendClassification !== "pass" && record.classification !== "fail" && (record.storedMessageUid !== null || record.storedMessageEvidenceHash !== null)) {
    context.addIssue({ code: "custom", message: "Non-passing Desktop sends may not carry stored-message evidence.", path: ["storedMessageEvidenceHash"] });
  }
  if (record.sendClassification !== "pass" && record.classification === "fail" && record.storedMessageUid !== null) {
    context.addIssue({ code: "custom", message: "Failed stored-message observations may not claim a stored UID.", path: ["storedMessageUid"] });
  }
});

export const identityFixtureSchema = z.strictObject({
  schemaVersion: z.literal(2),
  fixture: z.literal("identity_bindings"),
  records: z.array(identityBindingSchema).min(1),
  sessionBeadLinks: z.array(z.strictObject({ logicalSessionId: safeRefSchema, beadId: safeRefSchema })),
});

export const messageFixtureSchema = z.strictObject({
  schemaVersion: z.literal(2),
  fixture: z.literal("message_contract"),
  records: z.array(messageObservationSchema).min(1),
});

export type MessageObservation = z.infer<typeof messageObservationSchema>;
export type IdentityBinding = z.infer<typeof identityBindingSchema>;
export type LoopGuardTransition = z.infer<typeof loopGuardTransitionSchema>;
export type BeadsPromotion = z.infer<typeof beadsPromotionSchema>;
export type McpExchange = z.infer<typeof mcpExchangeSchema>;
export type DesktopCapability = z.infer<typeof desktopCapabilitySchema>;

const operationalStateSchema = z.enum(["not_run", "disabled", "enabled", "unknown"]);
const reviewedArgvTemplateSchema = z.tuple([
  safeRefSchema,
  z.literal("<data-dir>"),
  z.literal("<port>"),
  z.literal("<secret>"),
]);

export const configurationBoundarySchema = withEvidenceBase("configuration_boundary", {
  lifecycleOwner: z.literal("runtime-manager"),
  invocation: z.literal("direct_server"),
  bindHost: z.literal("127.0.0.1"),
  authentication: z.literal("enabled"),
  disposableRootLabel: safeRefSchema,
  argvTemplateHash: sha256Schema,
  reviewedArgvTemplate: reviewedArgvTemplateSchema,
  launcherState: operationalStateSchema,
  wrapperState: operationalStateSchema,
  triggerConsumerState: operationalStateSchema,
  terminalInjectionState: operationalStateSchema,
  autoWakeState: operationalStateSchema,
  jobsState: operationalStateSchema,
  persistentRulesState: operationalStateSchema,
});

export const monitorIntervalSchema = withEvidenceBase("monitor_interval", {
  monitorKind: z.enum([
    "process",
    "child_process",
    "trigger_queue",
    "herdr_pane",
    "input_control",
    "runtime_manager_inventory",
  ]),
  intervalMs: z.int().min(1).max(2_000),
  eventCount: z.int().nonnegative(),
  baselineEvidenceHash: sha256Schema,
  finalEvidenceHash: sha256Schema,
  gapState: z.enum(["no_gap", "gap_detected", "unknown"]),
  finalCaptureState: z.enum(["captured", "missing", "unknown"]),
}).superRefine((record, context) => {
  if ((record.observedResult === "pass" || record.classification === "pass")
    && (record.gapState !== "no_gap" || record.finalCaptureState !== "captured")) {
    context.addIssue({
      code: "custom",
      message: "Passing monitor evidence requires a gap-free final capture.",
      path: ["classification"],
    });
  }
});

const teardownProofSchema = z.strictObject({
  state: z.enum(["restored", "not_present", "not_restored", "unknown"]),
  evidenceHash: sha256Schema,
});

export const teardownSchema = withEvidenceBase("teardown", {
  serviceDeregistration: z.strictObject({
    serviceName: safeRefSchema,
    state: z.enum(["deregistered", "not_registered", "failed", "unknown"]),
    evidenceHash: sha256Schema,
  }),
  baselineInventoryRestoration: z.strictObject({
    state: z.enum(["restored_exact", "not_restored", "unknown"]),
    baselineEvidenceHash: sha256Schema,
    finalEvidenceHash: sha256Schema,
  }),
  desktopProfileConfigRestoration: teardownProofSchema,
  credentialRemoval: z.strictObject({
    state: z.enum(["removed", "not_present", "failed", "unknown"]),
    evidenceHash: sha256Schema,
  }),
  listenerRemoval: z.strictObject({
    state: z.enum(["removed", "not_present", "failed", "unknown"]),
    evidenceHash: sha256Schema,
  }),
  finalMonitorCapture: z.strictObject({
    state: z.enum(["captured", "missing", "unknown"]),
    evidenceHash: sha256Schema,
  }),
  disposableRoot: z.strictObject({
    disposition: z.enum(["deleted", "retained", "unknown"]),
    ownership: z.enum(["confirmed", "not_owned", "unknown"]),
  }),
}).superRefine((record, context) => {
  const hasSuccessfulProof = (record.serviceDeregistration.state === "deregistered" || record.serviceDeregistration.state === "not_registered")
    && record.baselineInventoryRestoration.state === "restored_exact"
    && (record.desktopProfileConfigRestoration.state === "restored" || record.desktopProfileConfigRestoration.state === "not_present")
    && (record.credentialRemoval.state === "removed" || record.credentialRemoval.state === "not_present")
    && (record.listenerRemoval.state === "removed" || record.listenerRemoval.state === "not_present")
    && record.finalMonitorCapture.state === "captured"
    && ((record.disposableRoot.disposition === "deleted" && record.disposableRoot.ownership === "confirmed")
      || (record.disposableRoot.disposition === "retained" && record.disposableRoot.ownership === "not_owned"));
  if (!hasSuccessfulProof && (record.observedResult === "pass" || record.classification === "pass")) {
    context.addIssue({
      code: "custom",
      message: "Passing teardown evidence requires every successful teardown proof.",
      path: ["classification"],
    });
  }
});

export const nativeContractSchema = z.discriminatedUnion("versionKind", [
  z.strictObject({
    versionKind: z.literal("named"),
    name: safeRefSchema,
    version: safeRefSchema,
  }),
  z.strictObject({
    versionKind: z.literal("herdr_protocol"),
    protocol: z.int().positive(),
  }),
]);

export const herdrTargetSchema = z.discriminatedUnion("targetKind", [
  z.strictObject({ targetKind: z.literal("workspace"), workspaceId: safeRefSchema }),
  z.strictObject({ targetKind: z.literal("tab"), workspaceId: safeRefSchema, tabId: safeRefSchema }),
  z.strictObject({ targetKind: z.literal("pane"), workspaceId: safeRefSchema, tabId: safeRefSchema, paneId: safeRefSchema }),
  z.strictObject({ targetKind: z.literal("terminal"), workspaceId: safeRefSchema, tabId: safeRefSchema, paneId: safeRefSchema, terminalId: safeRefSchema }),
  z.strictObject({ targetKind: z.literal("agent_session"), agentSessionId: safeRefSchema }),
]);

const projectReferenceSchema = z.discriminatedUnion("projectKind", [
  z.strictObject({
    projectKind: z.literal("configured_id"),
    projectId: safeRefSchema,
    relation: z.enum(["root", "descendant", "outside", "unknown"]),
  }),
  z.strictObject({
    projectKind: z.literal("salted_sha256"),
    projectHash: sha256Schema,
    relation: z.enum(["root", "descendant", "outside", "unknown"]),
  }),
]);

const modelMetadataSchema = z.discriminatedUnion("reportingState", [
  z.strictObject({
    reportingState: z.literal("reported"),
    provider: safeRefSchema,
    model: safeRefSchema,
  }),
  z.strictObject({ reportingState: z.literal("unknown") }),
]);

export const runtimeObservationPayloadSchema = z.discriminatedUnion("observationKind", [
  z.strictObject({
    observationKind: z.literal("agent_snapshot"),
    workspaceId: safeRefSchema,
    tabId: safeRefSchema,
    paneId: safeRefSchema,
    terminalId: safeRefSchema,
    agentSessionId: safeRefSchema,
    runtimeState: z.enum(["working", "waiting", "idle", "blocked", "stopped", "disconnected", "unknown"]),
    modelMetadata: modelMetadataSchema,
    project: projectReferenceSchema,
  }),
  z.strictObject({
    observationKind: z.literal("lifecycle_event"),
    event: z.enum([
      "session_started",
      "session_updated",
      "session_stopped",
      "pane_created",
      "pane_closed",
      "tab_created",
      "tab_closed",
      "workspace_created",
      "workspace_closed",
      "agent_state_changed",
    ]),
    target: herdrTargetSchema,
    nativeSequence: z.int().nonnegative().optional(),
    eventAt: utcTimestampSchema,
  }),
  z.strictObject({
    observationKind: z.literal("trace_summary"),
    agentSessionId: safeRefSchema,
    messageCount: z.int().nonnegative().max(1_000_000),
    toolCallCount: z.int().nonnegative().max(1_000_000),
    tokenCount: z.int().nonnegative().max(1_000_000_000).nullable(),
    tokenCountQuality: z.enum(["reported", "estimated", "unknown"]),
    summaryArtifactHash: sha256Schema,
  }).superRefine((record, context) => {
    if ((record.tokenCountQuality === "unknown") !== (record.tokenCount === null)) {
      context.addIssue({
        code: "custom",
        message: "Unknown token quality requires an absent token count.",
        path: ["tokenCount"],
      });
    }
  }),
]);

export const runtimeObservationSchema = withEvidenceBase("runtime_observation", {
  runtimeProvider: z.literal("herdr"),
  adapter: z.enum(["direct_herdr", "herdr_telemetry_bridge"]),
  measurementQuality: z.enum(["direct", "derived", "estimated", "unknown"]),
  freshness: z.enum(["live", "cached", "stale", "unknown"]),
  nativeContract: nativeContractSchema,
  nativeEventId: safeRefSchema.nullable(),
  observation: runtimeObservationPayloadSchema,
});

export type ConfigurationBoundary = z.infer<typeof configurationBoundarySchema>;
export type MonitorInterval = z.infer<typeof monitorIntervalSchema>;
export type Teardown = z.infer<typeof teardownSchema>;
export type NativeContract = z.infer<typeof nativeContractSchema>;
export type HerdrTarget = z.infer<typeof herdrTargetSchema>;
export type RuntimeObservation = z.infer<typeof runtimeObservationSchema>;

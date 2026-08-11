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
const structuralInvalidFieldParams = { contractStructuralCode: "invalid_field" } as const;
const reservedTypedExtensionSemantics = new Set([
  "implementationsource",
  "implementationmode",
  "sourcemode",
  "sourcerepository",
  "implementationrepository",
  "upstreambasecommit",
  "sourcebasecommit",
  "upstreamcommit",
  "sourcecommit",
  "implementationcommit",
  "runtimecommit",
  "sourceruntimecommit",
  "patchsha256",
  "sourcepatchsha256",
  "patchdigest",
  "licensesha256",
  "sourcelicensesha256",
  "artifactbinding",
  "artifactbindingkind",
  "artifactkind",
  "artifactsha256",
  "artifactdigestsha256",
  "artifactdigest",
  "entrypointsha256",
  "interpretersha256",
  "filemanifestsha256",
  "verificationstate",
  "artifactverificationstate",
]);

function isReservedTypedExtensionSemantic(key: string) {
  return reservedTypedExtensionSemantics.has(key.slice(2).replaceAll("-", "").toLowerCase());
}

export const safeExtensionsSchema = z
  .record(extensionKeySchema, extensionValueSchema)
  .superRefine((extensions, context) => {
    if (Object.keys(extensions).length > 16) {
      context.addIssue({
        code: "custom",
        message: "Safe extensions support at most 16 entries.",
        params: structuralInvalidFieldParams,
      });
    }
    if (Object.keys(extensions).some(isReservedTypedExtensionSemantic)) {
      context.addIssue({
        code: "custom",
        message: "Implementation provenance and artifact bindings must use their typed manifest fields.",
        params: structuralInvalidFieldParams,
      });
    }
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

const standardArtifactKindSchema = z.enum([
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
export const artifactKindSchema = z.enum([
  ...standardArtifactKindSchema.options,
  "provider_idempotency_review",
]);

export const evidenceProvenanceSchema = z.strictObject({
  sourceKind: provenanceSourceKindSchema,
  sourceRef: safeRefSchema,
  digest: sha256Schema,
});

export const evidenceArtifactSchema = z.discriminatedUnion("kind", [
  z.strictObject({
    kind: standardArtifactKindSchema,
    digest: sha256Schema,
  }),
  z.strictObject({
    kind: z.literal("provider_idempotency_review"),
    digest: sha256Schema,
    reviewedRequestArtifactHash: sha256Schema,
    reviewedIdempotencyKey: sha256Schema,
  }),
]);

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

function utcTimestampParts(timestamp: string) {
  const match = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2})(?::(\d{2})(?:\.(\d+))?)?Z$/.exec(timestamp);
  return {
    minute: match?.[1] ?? "",
    second: match?.[2] ?? "00",
    fraction: match?.[3] ?? "",
  };
}

function compareUtcTimestamps(left: string, right: string) {
  const leftParts = utcTimestampParts(left);
  const rightParts = utcTimestampParts(right);
  if (leftParts.minute !== rightParts.minute) {
    return leftParts.minute < rightParts.minute ? -1 : 1;
  }
  if (leftParts.second !== rightParts.second) {
    return leftParts.second < rightParts.second ? -1 : 1;
  }

  const precision = Math.max(leftParts.fraction.length, rightParts.fraction.length);
  const leftFraction = leftParts.fraction.padEnd(precision, "0");
  const rightFraction = rightParts.fraction.padEnd(precision, "0");
  if (leftFraction === rightFraction) {
    return 0;
  }
  return leftFraction < rightFraction ? -1 : 1;
}

export function withEvidenceBase<K extends string, Shape extends z.ZodRawShape>(kind: K, shape: Shape) {
  return z
    .strictObject({
      ...shape,
      ...evidenceBaseFields,
      kind: z.literal(kind),
    })
    .refine((record) => {
      const timestamps = record as EvidenceBase;
      return compareUtcTimestamps(timestamps.startedAt, timestamps.observedAt) <= 0;
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
  if (record.validUntil !== null && compareUtcTimestamps(record.validFrom, record.validUntil) >= 0) {
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
  if (record.acknowledgedAt !== null && record.verifiedAt !== null
    && compareUtcTimestamps(record.acknowledgedAt, record.verifiedAt) > 0) {
    context.addIssue({ code: "custom", message: "Promotion acknowledgement must not follow verification.", path: ["verifiedAt"] });
  }
});

export const mcpOperationSchema = z.enum(["initialize", "tools/list", "chat_send", "chat_read"]);
export const mcpAuthenticationStateSchema = z.enum(["authenticated", "unauthenticated", "failed", "unknown", "unsupported"]);

export const mcpExchangeSchema = withEvidenceBase("mcp_exchange", {
  clientKind: z.enum(["operator_mcp_client", "claude_code_desktop", "codex_desktop"]),
  clientVersion: safeRefSchema,
  providerInstanceId: safeRefSchema,
  channelId: safeRefSchema,
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
  state: z.enum(["restored", "not_applicable", "not_restored", "unknown"]),
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
    state: z.enum(["deleted", "retained", "unknown"]),
    ownership: z.enum(["owned", "not_owned", "unknown"]),
  }),
}).superRefine((record, context) => {
  const hasSuccessfulProof = (record.serviceDeregistration.state === "deregistered" || record.serviceDeregistration.state === "not_registered")
    && record.baselineInventoryRestoration.state === "restored_exact"
    && (record.desktopProfileConfigRestoration.state === "restored" || record.desktopProfileConfigRestoration.state === "not_applicable")
    && (record.credentialRemoval.state === "removed" || record.credentialRemoval.state === "not_present")
    && (record.listenerRemoval.state === "removed" || record.listenerRemoval.state === "not_present")
    && record.finalMonitorCapture.state === "captured"
    && ((record.disposableRoot.state === "deleted" && record.disposableRoot.ownership === "owned")
      || (record.disposableRoot.state === "retained" && record.disposableRoot.ownership === "not_owned"));
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

const runtimeObservationPayloadSchemas = [
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
] as const;

export const runtimeActionSchema = z.enum([
  "list_agents", "get_agent", "read_pane", "wait_for_agent", "wait_for_output",
  "relay_message", "send_text", "submit_input", "spawn_agent", "focus_agent",
  "rename_agent", "run_command", "send_keys", "split_pane", "close_pane",
  "stop_session", "delete_session", "create_tab", "close_tab",
  "create_workspace", "close_workspace",
]);

const runtimeWorkspaceTargetSchema = z.strictObject({
  targetKind: z.literal("workspace"),
  workspaceId: safeRefSchema,
});
const runtimeAgentSessionTargetSchema = z.strictObject({
  targetKind: z.literal("agent_session"),
  agentSessionId: safeRefSchema,
});
const runtimePaneTargetSchema = z.strictObject({
  targetKind: z.literal("pane"),
  workspaceId: safeRefSchema,
  tabId: safeRefSchema,
  paneId: safeRefSchema,
});
const runtimeTabTargetSchema = z.strictObject({
  targetKind: z.literal("tab"),
  workspaceId: safeRefSchema,
  tabId: safeRefSchema,
});
const runtimeManagerProjectTargetSchema = z.strictObject({
  targetKind: z.literal("runtime_manager_project"),
  projectId: safeRefSchema,
});

export const runtimeControlTargetSchema = z.discriminatedUnion("targetKind", [
  runtimeWorkspaceTargetSchema,
  runtimeAgentSessionTargetSchema,
  runtimePaneTargetSchema,
  runtimeTabTargetSchema,
  runtimeManagerProjectTargetSchema,
]);

export const runtimeControlProofSchema = z.strictObject({
  actionId: uuidSchema,
  attemptId: uuidSchema,
  action: runtimeActionSchema,
  target: runtimeControlTargetSchema,
  disposition: z.enum(["applied", "not_applied"]),
  resultArtifactHash: sha256Schema,
});

const runtimeControlResultPayloadSchema = runtimeControlProofSchema.extend({
  observationKind: z.literal("control_result"),
  eventAt: utcTimestampSchema,
});

export const runtimeObservationPayloadSchema = z.discriminatedUnion("observationKind", [
  ...runtimeObservationPayloadSchemas,
  runtimeControlResultPayloadSchema,
]);

export const runtimeObservationSchema = withEvidenceBase("runtime_observation", {
  runtimeProvider: z.literal("herdr"),
  adapter: z.enum(["direct_herdr", "herdr_telemetry_bridge"]),
  measurementQuality: z.enum(["direct", "derived", "estimated", "unknown"]),
  freshness: z.enum(["live", "cached", "stale", "unknown"]),
  nativeContract: nativeContractSchema,
  nativeEventId: safeRefSchema.nullable(),
  observation: runtimeObservationPayloadSchema,
  controlProof: runtimeControlProofSchema.optional(),
});

export const runtimeRetryPolicySchema = z.discriminatedUnion("mode", [
  z.strictObject({ mode: z.literal("none") }),
  z.strictObject({ mode: z.literal("bounded"), maxAttempts: z.int().positive() }),
]);

export const humanIntentSchema = z.discriminatedUnion("state", [
  z.strictObject({ state: z.literal("none") }),
  z.strictObject({
    state: z.literal("exact_assignment"),
    assignedActorId: safeRefSchema,
    targetHash: sha256Schema,
    evidenceHash: sha256Schema,
  }),
  z.strictObject({ state: z.literal("denied"), evidenceHash: sha256Schema }),
]);

const requestEventFields = {
  phase: z.literal("request"),
  effectClass: z.enum(["read_only", "idempotent_mutation", "non_idempotent_mutation"]),
  parameterHash: sha256Schema,
  requestState: z.enum(["recorded", "rejected", "cancelled"]),
  retryPolicy: runtimeRetryPolicySchema,
  reviewedProviderIdempotencyArtifactHash: sha256Schema.optional(),
  durablePromotion: z.enum(["required", "not_required"]),
  humanIntent: humanIntentSchema,
};

export const runtimeControlRequestEventSchema = z.discriminatedUnion("action", [
  z.strictObject({
    ...requestEventFields,
    action: z.enum(["list_agents", "create_tab", "close_workspace"]),
    target: runtimeWorkspaceTargetSchema,
  }),
  z.strictObject({
    ...requestEventFields,
    action: z.enum(["get_agent", "wait_for_agent", "wait_for_output", "stop_session", "delete_session"]),
    target: runtimeAgentSessionTargetSchema,
  }),
  z.strictObject({
    ...requestEventFields,
    action: z.enum([
      "read_pane", "relay_message", "send_text", "submit_input", "focus_agent",
      "rename_agent", "run_command", "send_keys", "split_pane", "close_pane",
    ]),
    target: runtimePaneTargetSchema,
  }),
  z.strictObject({
    ...requestEventFields,
    action: z.enum(["close_tab", "spawn_agent"]),
    target: runtimeTabTargetSchema,
  }),
  z.strictObject({
    ...requestEventFields,
    action: z.literal("create_workspace"),
    target: runtimeManagerProjectTargetSchema,
  }),
]);

const authorizationScopeFields = { parameterHash: sha256Schema };
export const runtimeAuthorizationScopeSchema = z.discriminatedUnion("action", [
  z.strictObject({
    ...authorizationScopeFields,
    action: z.enum(["list_agents", "create_tab", "close_workspace"]),
    target: runtimeWorkspaceTargetSchema,
  }),
  z.strictObject({
    ...authorizationScopeFields,
    action: z.enum(["get_agent", "wait_for_agent", "wait_for_output", "stop_session", "delete_session"]),
    target: runtimeAgentSessionTargetSchema,
  }),
  z.strictObject({
    ...authorizationScopeFields,
    action: z.enum([
      "read_pane", "relay_message", "send_text", "submit_input", "focus_agent",
      "rename_agent", "run_command", "send_keys", "split_pane", "close_pane",
    ]),
    target: runtimePaneTargetSchema,
  }),
  z.strictObject({
    ...authorizationScopeFields,
    action: z.enum(["close_tab", "spawn_agent"]),
    target: runtimeTabTargetSchema,
  }),
  z.strictObject({
    ...authorizationScopeFields,
    action: z.literal("create_workspace"),
    target: runtimeManagerProjectTargetSchema,
  }),
]);

export const runtimeAuthorizationEventSchema = z.strictObject({
  phase: z.literal("authorization"),
  authorizationId: uuidSchema,
  decision: z.enum(["pending", "authorized", "denied", "expired", "cancelled", "unknown"]),
  authorizingActorId: safeRefSchema,
  authorizingSource: z.enum(["human", "scotty_policy", "beads"]),
  scope: runtimeAuthorizationScopeSchema,
  validFrom: utcTimestampSchema,
  validUntil: utcTimestampSchema,
  evidenceHash: sha256Schema,
}).refine((event) => compareUtcTimestamps(event.validFrom, event.validUntil) < 0, {
  message: "Authorization validity interval must be increasing.",
  path: ["validUntil"],
});

export const runtimeExecutionEventSchema = z.strictObject({
  phase: z.literal("execution"),
  attemptId: uuidSchema,
  attemptNumber: z.int().positive(),
  adapter: z.enum(["direct_herdr", "herdr_mesh"]),
  state: z.enum(["started", "succeeded", "failed", "timed_out", "unknown"]),
  providerOperationId: safeRefSchema.optional(),
  providerIdempotencyState: z.enum(["supported", "unsupported", "unknown"]),
  resultArtifactHash: sha256Schema,
});

export const runtimeVerificationStateSchema = z.enum([
  "verified_applied", "verified_not_applied", "mismatched", "timed_out", "unknown", "unsupported",
]);

export const runtimeVerificationEvidenceSchema = z.discriminatedUnion("kind", [
  z.strictObject({
    kind: z.literal("runtime_observation"),
    caseId: caseIdSchema,
    actionId: uuidSchema,
    attemptId: uuidSchema,
    action: runtimeActionSchema,
    target: runtimeControlTargetSchema,
    claimedState: runtimeVerificationStateSchema,
  }),
  z.strictObject({ kind: z.literal("artifact"), artifactHash: sha256Schema }),
]);

export const runtimeVerificationEventSchema = z.strictObject({
  phase: z.literal("verification"),
  attemptId: uuidSchema,
  state: runtimeVerificationStateSchema,
  evidenceReference: runtimeVerificationEvidenceSchema,
});

export const runtimeAcknowledgementEventSchema = z.strictObject({
  phase: z.literal("acknowledgement"),
  attemptId: uuidSchema,
  state: z.enum(["not_applicable", "pending", "acknowledged", "timed_out", "unknown", "unsupported"]),
  directAcknowledgementEvidenceHash: sha256Schema.optional(),
}).superRefine((event, context) => {
  const hasDirectEvidence = event.directAcknowledgementEvidenceHash !== undefined;
  if ((event.state === "acknowledged") !== hasDirectEvidence) {
    context.addIssue({
      code: "custom",
      message: "Direct acknowledgement evidence is required only for acknowledged events.",
      path: ["directAcknowledgementEvidenceHash"],
    });
  }
});

export const runtimeReconciliationEventSchema = z.strictObject({
  phase: z.literal("reconciliation"),
  attemptId: uuidSchema,
  observedDisposition: z.enum(["applied", "not_applied", "unresolved"]),
  retryDecision: z.enum(["do_not_retry", "retry_authorized", "unresolved"]),
  decidingActorId: safeRefSchema,
  decidingSource: z.enum(["human", "scotty_policy", "beads"]),
  evidenceHash: sha256Schema,
});

export const runtimeControlPhaseEventSchema = z.discriminatedUnion("phase", [
  runtimeControlRequestEventSchema,
  runtimeAuthorizationEventSchema,
  runtimeExecutionEventSchema,
  runtimeVerificationEventSchema,
  runtimeAcknowledgementEventSchema,
  runtimeReconciliationEventSchema,
]);

export const runtimeControlActionSchema = withEvidenceBase("runtime_control_action", {
  eventId: uuidSchema,
  actionId: uuidSchema,
  correlationId: uuidSchema,
  idempotencyKey: sha256Schema,
  sequence: z.int().nonnegative(),
  runtimeProvider: z.literal("herdr"),
  event: runtimeControlPhaseEventSchema,
});

export const evidenceRecordSchema = z.discriminatedUnion("kind", [
  configurationBoundarySchema,
  monitorIntervalSchema,
  runtimeObservationSchema,
  runtimeControlActionSchema,
  mcpExchangeSchema,
  messageObservationSchema,
  identityBindingSchema,
  loopGuardTransitionSchema,
  beadsPromotionSchema,
  desktopCapabilitySchema,
  teardownSchema,
]);

export const approvedUpstreamPinSchema = z.strictObject({
  repository: z.literal(APPROVED_UPSTREAM_PIN.repository),
  commit: z.literal(APPROVED_UPSTREAM_PIN.commit),
  tag: z.literal(APPROVED_UPSTREAM_PIN.tag),
  version: z.literal(APPROVED_UPSTREAM_PIN.version),
  licenseSha256: z.literal(APPROVED_UPSTREAM_PIN.licenseSha256),
});

const gitCommitSchema = z.string().regex(/^[0-9a-f]{40}$/);
const httpsGitHubRepositorySchema = z.string().url().regex(
  /^https:\/\/github\.com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+\.git$/,
);

export const implementationSourceSchema = z.discriminatedUnion("mode", [
  z.strictObject({
    mode: z.literal("upstream"),
    repository: z.literal(APPROVED_UPSTREAM_PIN.repository),
    upstreamBaseCommit: z.literal(APPROVED_UPSTREAM_PIN.commit),
    runtimeCommit: z.literal(APPROVED_UPSTREAM_PIN.commit),
    patchSha256: z.null(),
    licenseSha256: z.literal(APPROVED_UPSTREAM_PIN.licenseSha256),
  }),
  z.strictObject({
    mode: z.literal("compatibility_shim"),
    repository: httpsGitHubRepositorySchema,
    upstreamBaseCommit: z.literal(APPROVED_UPSTREAM_PIN.commit),
    runtimeCommit: gitCommitSchema,
    patchSha256: sha256Schema,
    licenseSha256: z.literal(APPROVED_UPSTREAM_PIN.licenseSha256),
  }).refine((value) => value.repository.toLowerCase() !== APPROVED_UPSTREAM_PIN.repository.toLowerCase(), {
    path: ["repository"],
    message: "A compatibility shim must identify its fork repository.",
  }).refine((value) => value.runtimeCommit !== value.upstreamBaseCommit, {
    path: ["runtimeCommit"],
    message: "A compatibility shim must identify its distinct runtime commit.",
  }),
]);

export const artifactBindingSchema = z.strictObject({
  kind: z.enum(["wheel", "zipapp", "source_bundle_file_manifest"]),
  artifactSha256: sha256Schema.nullable(),
  entrypointSha256: sha256Schema.nullable(),
  interpreterSha256: sha256Schema.nullable(),
  fileManifestSha256: sha256Schema.nullable(),
  verificationState: z.enum(["not_run", "verified", "mismatch", "unknown"]),
}).superRefine((binding, context) => {
  if (binding.verificationState === "not_run" || binding.verificationState === "unknown") {
    return;
  }

  for (const field of ["artifactSha256", "entrypointSha256", "interpreterSha256"] as const) {
    if (binding[field] === null) {
      context.addIssue({
        code: "custom",
        message: "Verified or mismatched artifacts require exact digest evidence.",
        path: [field],
      });
    }
  }
  if (binding.kind === "source_bundle_file_manifest" && binding.fileManifestSha256 === null) {
    context.addIssue({
      code: "custom",
      message: "Source bundle bindings require an exact file manifest digest.",
      path: ["fileManifestSha256"],
    });
  }
});

export const endpointBoundarySchema = z.strictObject({
  host: z.literal("127.0.0.1"),
  port: z.int().min(1).max(65_535),
  state: z.enum(["candidate_only_not_bound", "bound", "stopped"]),
});

const notRunResourceAdmissionSchema = z.strictObject({
  measurementState: z.literal("not_run"),
  availablePhysicalMemoryGiB: z.null(),
  aggregateWorkingSetPercent: z.null(),
  otherResourceHeavyJobActive: z.null(),
  runtimeManagerCorrelationId: z.null(),
  admissionResult: z.literal("not_run"),
});

const measuredResourceAdmissionSchema = z.strictObject({
  measurementState: z.literal("measured"),
  availablePhysicalMemoryGiB: z.number().nonnegative(),
  aggregateWorkingSetPercent: z.number().min(0).max(100),
  otherResourceHeavyJobActive: z.boolean(),
  runtimeManagerCorrelationId: safeRefSchema.nullable(),
  admissionResult: z.enum(["not_run", "admitted", "denied", "unknown"]),
}).superRefine((admission, context) => {
  if (admission.admissionResult !== "not_run" && admission.runtimeManagerCorrelationId === null) {
    context.addIssue({
      code: "custom",
      message: "Measured admission results require a Runtime Manager correlation ID.",
      path: ["runtimeManagerCorrelationId"],
    });
  }
});

export const resourceAdmissionSchema = z.discriminatedUnion("measurementState", [
  notRunResourceAdmissionSchema,
  measuredResourceAdmissionSchema,
]);

const prohibitedSafetyStateSchema = z.enum(["not_run", "disabled", "enabled", "unknown"]);
const prohibitedSafetyFields = [
  "launcher",
  "wrapper",
  "triggerQueueConsumer",
  "terminalInjection",
  "autoWake",
  "jobsAuthority",
  "persistentRules",
] as const;

export const safetyBoundarySchema = z.strictObject({
  lifecycleOwner: z.literal("runtime-manager"),
  launcher: prohibitedSafetyStateSchema,
  wrapper: prohibitedSafetyStateSchema,
  triggerQueueConsumer: prohibitedSafetyStateSchema,
  terminalInjection: prohibitedSafetyStateSchema,
  autoWake: prohibitedSafetyStateSchema,
  jobsAuthority: prohibitedSafetyStateSchema,
  persistentRules: prohibitedSafetyStateSchema,
});

export const evidenceManifestV2Schema = z.strictObject({
  schemaVersion: z.literal(2),
  spike: z.literal("agentchattr-compatibility"),
  stage: z.literal("1.5"),
  manifestId: safeRefSchema,
  runId: safeRefSchema,
  executionState: z.enum(["not_run", "running", "completed", "aborted"]),
  upstream: approvedUpstreamPinSchema,
  implementationSource: implementationSourceSchema,
  artifactBinding: artifactBindingSchema,
  endpoint: endpointBoundarySchema,
  resourceAdmission: resourceAdmissionSchema,
  safety: safetyBoundarySchema,
  evidence: z.array(evidenceRecordSchema),
  extensions: safeExtensionsSchema.optional(),
}).superRefine((manifest, context) => {
  if (manifest.executionState === "not_run") {
    if (manifest.artifactBinding.verificationState !== "not_run") {
      context.addIssue({ code: "custom", message: "A not-run manifest must have an unresolved artifact binding.", path: ["artifactBinding", "verificationState"] });
    }
    if (manifest.endpoint.state !== "candidate_only_not_bound") {
      context.addIssue({ code: "custom", message: "A not-run endpoint must remain unbound.", path: ["endpoint", "state"] });
    }
    if (manifest.resourceAdmission.measurementState !== "not_run") {
      context.addIssue({ code: "custom", message: "A not-run manifest cannot contain measured admission.", path: ["resourceAdmission"] });
    }
    for (const field of prohibitedSafetyFields) {
      if (manifest.safety[field] !== "not_run") {
        context.addIssue({ code: "custom", message: "A not-run manifest cannot contain safety observations.", path: ["safety", field] });
      }
    }
    if (manifest.evidence.length !== 0) {
      context.addIssue({ code: "custom", message: "A not-run manifest must have no evidence.", path: ["evidence"] });
    }
    return;
  }

  if ((manifest.executionState === "running" || manifest.executionState === "completed")
    && manifest.artifactBinding.verificationState !== "verified") {
    context.addIssue({ code: "custom", message: "Running or completed execution requires a verified artifact binding.", path: ["artifactBinding", "verificationState"] });
  }

  if (manifest.resourceAdmission.measurementState !== "measured") {
    context.addIssue({ code: "custom", message: "Execution requires measured resource admission.", path: ["resourceAdmission"] });
  }
  for (const field of prohibitedSafetyFields) {
    if (manifest.safety[field] === "not_run") {
      context.addIssue({ code: "custom", message: "Execution requires observed safety state.", path: ["safety", field] });
    }
  }
  if (manifest.executionState === "completed" && !manifest.evidence.some((record) => record.kind === "teardown")) {
    context.addIssue({ code: "custom", message: "Completed execution requires teardown evidence.", path: ["evidence"] });
  }
  if (manifest.executionState === "aborted"
    && !manifest.evidence.some((record) => record.classification === "fail" || record.classification === "unknown")) {
    context.addIssue({ code: "custom", message: "Aborted execution requires a failed or unknown stop condition.", path: ["evidence"] });
  }
});

export type EvidenceRecord = z.infer<typeof evidenceRecordSchema>;
export type ApprovedUpstreamPin = z.infer<typeof approvedUpstreamPinSchema>;
export type EndpointBoundary = z.infer<typeof endpointBoundarySchema>;
export type ResourceAdmission = z.infer<typeof resourceAdmissionSchema>;
export type SafetyBoundary = z.infer<typeof safetyBoundarySchema>;
export type EvidenceManifestV2 = z.infer<typeof evidenceManifestV2Schema>;

export type StructuralIssue = {
  code: "unknown_field" | "invalid_field" | "invalid_invariant" | "unsupported_schema_version";
  classification: "fail";
  path: string;
};

export type ManifestParseResult =
  | { ok: true; manifest: EvidenceManifestV2 }
  | { ok: false; issues: StructuralIssue[] };

function jsonPointer(path: readonly PropertyKey[]) {
  if (path.length === 0) {
    return "";
  }
  return `/${path.map((segment) => String(segment).replaceAll("~", "~0").replaceAll("/", "~1")).join("/")}`;
}

function sanitizedIssuePath(path: readonly PropertyKey[]) {
  const extensionsIndex = path.lastIndexOf("extensions");
  return jsonPointer(extensionsIndex === -1 ? path : path.slice(0, extensionsIndex + 1));
}

export function parseEvidenceManifestV2(value: unknown): ManifestParseResult {
  if (typeof value !== "object" || value === null || Array.isArray(value)
    || (value as Record<string, unknown>).schemaVersion !== 2) {
    return {
      ok: false,
      issues: [{ code: "unsupported_schema_version", classification: "fail", path: "/schemaVersion" }],
    };
  }

  const result = evidenceManifestV2Schema.safeParse(value);
  if (result.success) {
    return { ok: true, manifest: result.data };
  }

  const issues = result.error.issues.map((issue) => ({
      code: issue.code === "unrecognized_keys"
        ? "unknown_field"
        : issue.code === "custom" && issue.params?.contractStructuralCode === "invalid_field"
          ? "invalid_field"
          : issue.code === "custom"
            ? "invalid_invariant"
            : "invalid_field",
      classification: "fail",
      path: sanitizedIssuePath(issue.path),
    } satisfies StructuralIssue));
  return {
    ok: false,
    issues: issues.filter((issue, index) => issues.findIndex((candidate) => candidate.code === issue.code
      && candidate.classification === issue.classification
      && candidate.path === issue.path) === index),
  };
}

export type ConfigurationBoundary = z.infer<typeof configurationBoundarySchema>;
export type MonitorInterval = z.infer<typeof monitorIntervalSchema>;
export type Teardown = z.infer<typeof teardownSchema>;
export type NativeContract = z.infer<typeof nativeContractSchema>;
export type HerdrTarget = z.infer<typeof herdrTargetSchema>;
export type RuntimeObservation = z.infer<typeof runtimeObservationSchema>;
export type RuntimeAction = z.infer<typeof runtimeActionSchema>;
export type RuntimeControlTarget = z.infer<typeof runtimeControlTargetSchema>;
export type HumanIntent = z.infer<typeof humanIntentSchema>;
export type RuntimeControlPhaseEvent = z.infer<typeof runtimeControlPhaseEventSchema>;
export type RuntimeControlAction = z.infer<typeof runtimeControlActionSchema>;

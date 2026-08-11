import { createHash } from "node:crypto";

import {
  parseEvidenceManifestV2,
  type BeadsPromotion,
  type DesktopCapability,
  type EvidenceManifestV2,
  type EvidenceRecord,
  type HerdrTarget,
  type IdentityBinding,
  type LoopGuardTransition,
  type McpExchange,
  type MessageObservation,
  type RuntimeControlAction,
  type RuntimeControlTarget,
  type RuntimeObservation,
  type StructuralIssue,
} from "./evidence-schema";

export { APPROVED_UPSTREAM_PIN } from "./evidence-schema";

export const EVIDENCE_CLASSIFICATIONS = ["pass", "fail", "unsupported", "unknown"] as const;

export type Classification = (typeof EVIDENCE_CLASSIFICATIONS)[number];

export type ContractIssue = {
  code: string;
  classification: Exclude<Classification, "pass">;
  path: string;
};

export type ContractResult = {
  classification: Classification;
  issues: ContractIssue[];
};

type EvidenceKind = EvidenceRecord["kind"];
type EvidenceOf<K extends EvidenceKind> = Extract<EvidenceRecord, { kind: K }>;

const classificationRank: Record<Classification, number> = {
  pass: 0,
  unknown: 1,
  unsupported: 2,
  fail: 3,
};

function aggregateClassification(classifications: readonly Classification[]): Classification {
  return classifications.reduce<Classification>(
    (highest, classification) => classificationRank[classification] > classificationRank[highest]
      ? classification
      : highest,
    "pass",
  );
}

function aggregateIssues(issues: readonly ContractIssue[] | readonly StructuralIssue[]): ContractResult {
  return {
    classification: aggregateClassification(issues.map((issue) => issue.classification)),
    issues: [...issues],
  };
}

function aggregateManifestClassification(
  manifest: EvidenceManifestV2,
  issues: ContractIssue[],
): ContractResult {
  return {
    classification: aggregateClassification([
      ...manifest.evidence.map((record) => record.classification),
      ...issues.map((issue) => issue.classification),
    ]),
    issues,
  };
}

function addIssue(
  issues: ContractIssue[],
  code: string,
  classification: ContractIssue["classification"],
  path: string,
) {
  if (!issues.some((issue) => issue.code === code && issue.classification === classification && issue.path === path)) {
    issues.push({ code, classification, path });
  }
}

function recordsOf<K extends EvidenceKind>(manifest: EvidenceManifestV2, kind: K): EvidenceOf<K>[] {
  return manifest.evidence.filter((record): record is EvidenceOf<K> => record.kind === kind);
}

function timestampParts(timestamp: string) {
  const match = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2})(?::(\d{2})(?:\.(\d+))?)?Z$/.exec(timestamp);
  return {
    minute: match?.[1] ?? "",
    second: match?.[2] ?? "00",
    fraction: match?.[3] ?? "",
  };
}

function compareTimestamps(left: string, right: string) {
  const leftParts = timestampParts(left);
  const rightParts = timestampParts(right);
  if (leftParts.minute !== rightParts.minute) return leftParts.minute < rightParts.minute ? -1 : 1;
  if (leftParts.second !== rightParts.second) return leftParts.second < rightParts.second ? -1 : 1;
  const precision = Math.max(leftParts.fraction.length, rightParts.fraction.length);
  const leftFraction = leftParts.fraction.padEnd(precision, "0");
  const rightFraction = rightParts.fraction.padEnd(precision, "0");
  return leftFraction === rightFraction ? 0 : leftFraction < rightFraction ? -1 : 1;
}

function sameStringSet(left: readonly string[], right: readonly string[]) {
  const leftSorted = [...new Set(left)].sort();
  const rightSorted = [...new Set(right)].sort();
  return leftSorted.length === rightSorted.length
    && leftSorted.every((entry, index) => entry === rightSorted[index]);
}

function isNonemptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function validateCaseIds(manifest: EvidenceManifestV2, issues: ContractIssue[]) {
  const seen = new Set<string>();
  manifest.evidence.forEach((record, index) => {
    if (seen.has(record.caseId)) {
      addIssue(issues, "duplicate_case_id", "fail", `/evidence/${index}/caseId`);
    }
    seen.add(record.caseId);
  });
}

function messageIdentityKey(message: MessageObservation) {
  return `${message.providerInstanceId}|${message.channelId}|${message.stableMessageUid}`;
}

function messageDurableSignature(message: MessageObservation) {
  return JSON.stringify([
    message.providerInstanceId,
    message.channelId,
    message.stableMessageUid,
    message.senderExternalId,
    message.contentChecksum,
    message.parentUid,
    message.threadId,
  ]);
}

function messageReplaySignature(message: MessageObservation) {
  return JSON.stringify([
    messageDurableSignature(message),
    message.messageState,
  ]);
}

function evidencePath(manifest: EvidenceManifestV2, record: EvidenceRecord) {
  return `/evidence/${manifest.evidence.indexOf(record)}`;
}

function validateMessages(
  manifest: EvidenceManifestV2,
  messages: MessageObservation[],
  issues: ContractIssue[],
) {
  const seenByUid = new Map<string, MessageObservation[]>();
  const lastCursorByChannel = new Map<string, number>();
  const knownUids = new Set<string>();

  messages.forEach((message) => {
    const path = evidencePath(manifest, message);
    const channelKey = `${message.providerInstanceId}|${message.channelId}`;
    const uidKey = messageIdentityKey(message);
    const beginsRestartEpoch = message.observationContext === "post_restart";
    const previousCursor = beginsRestartEpoch ? undefined : lastCursorByChannel.get(channelKey);
    if (String(message.cursorId) === message.stableMessageUid) {
      addIssue(issues, "message_cursor_used_as_uid", "fail", `${path}/stableMessageUid`);
    }
    if (!knownUids.has(uidKey) && previousCursor !== undefined && message.cursorId < previousCursor) {
      addIssue(issues, "message_cursor_order", "fail", `${path}/cursorId`);
    }
    lastCursorByChannel.set(channelKey, Math.max(previousCursor ?? message.cursorId, message.cursorId));

    const previous = seenByUid.get(uidKey) ?? [];
    if (message.observationContext === "tombstone") {
      if (message.messageState !== "deleted") {
        addIssue(issues, "message_tombstone_state_invalid", "fail", `${path}/messageState`);
      }
      const linked = previous.find((candidate) => candidate.messageState === "present");
      if (!linked) {
        addIssue(issues, "message_tombstone_unlinked", "fail", `${path}/stableMessageUid`);
      } else if (messageDurableSignature(linked) !== messageDurableSignature(message)) {
        addIssue(issues, "message_uid_divergence", "fail", `${path}/stableMessageUid`);
      }
    } else if (message.messageState === "deleted") {
      addIssue(issues, "message_tombstone_unlinked", "fail", `${path}/messageState`);
    } else if (previous.length > 0) {
      const replayContext = message.observationContext === "overlap_page"
        || message.observationContext === "retry_replay"
        || message.observationContext === "post_restart";
      if (!replayContext || previous.some((candidate) => candidate.messageState !== message.messageState
        || messageReplaySignature(candidate) !== messageReplaySignature(message))) {
        addIssue(issues, "message_uid_divergence", "fail", `${path}/stableMessageUid`);
      }
    }

    previous.push(message);
    seenByUid.set(uidKey, previous);
    knownUids.add(uidKey);
  });
}

function deduplicateMessageReobservations(messages: MessageObservation[]) {
  const seenReplaySignatures = new Set<string>();
  const deduplicated: MessageObservation[] = [];
  for (const message of messages) {
    const signature = messageReplaySignature(message);
    const isReplay = message.observationContext === "overlap_page"
      || message.observationContext === "retry_replay"
      || message.observationContext === "post_restart";
    if (isReplay && seenReplaySignatures.has(signature)) continue;
    seenReplaySignatures.add(signature);
    deduplicated.push(message);
  }
  return deduplicated;
}

function bindingSignature(binding: IdentityBinding) {
  return JSON.stringify([
    binding.actorId,
    binding.logicalSessionId,
    binding.executionSurface,
    binding.orchestrationRole,
    binding.modelProvider,
    binding.modelId,
    binding.herdrSessionRef,
    binding.agentChattrSessionId,
    binding.beadsActorId,
  ]);
}

function bindingCovers(binding: IdentityBinding, timestamp: string) {
  return binding.bindingState === "verified"
    && binding.validUntil !== null
    && compareTimestamps(binding.validFrom, timestamp) <= 0
    && compareTimestamps(timestamp, binding.validUntil) <= 0;
}

function validateIdentityAttribution(
  manifest: EvidenceManifestV2,
  messages: MessageObservation[],
  bindings: IdentityBinding[],
  issues: ContractIssue[],
) {
  messages.forEach((message) => {
    const path = evidencePath(manifest, message);
    const candidates = bindings.filter((binding) => binding.agentChattrInstanceId === message.providerInstanceId
      && binding.agentChattrExternalId === message.senderExternalId
      && bindingCovers(binding, message.observedAt));
    if (candidates.length === 1) return;
    if (candidates.length > 1 && new Set(candidates.map(bindingSignature)).size > 1) {
      addIssue(issues, "identity_conflict", "fail", path);
      return;
    }
    addIssue(issues, "identity_unproven", "unknown", path);
  });
}

function validateCollaborationSequences(
  manifest: EvidenceManifestV2,
  messages: MessageObservation[],
  issues: ContractIssue[],
) {
  const sessions = new Map<string, MessageObservation[]>();
  for (const message of messages) {
    if (message.collaborationSessionId === undefined) continue;
    const records = sessions.get(message.collaborationSessionId) ?? [];
    records.push(message);
    sessions.set(message.collaborationSessionId, records);
  }

  for (const records of sessions.values()) {
    let requiredNext: "stalemate" | "peer_acceptance" | null = null;
    records.forEach((record, index) => {
      if (record.collaborationSequence !== index) {
        addIssue(issues, "collaboration_sequence_invalid", "fail", "/evidence");
      }
      const priorIntent = records[index - 1]?.collaborationIntent;
      const priorPriorIntent = records[index - 2]?.collaborationIntent;
      if (requiredNext !== null && record.collaborationIntent !== requiredNext) {
        addIssue(issues, "collaboration_transition_invalid", "fail", "/evidence");
      }
      if (record.collaborationIntent === "stalemate" && priorIntent !== "blocked") {
        addIssue(issues, "collaboration_transition_invalid", "fail", "/evidence");
      }
      if (record.collaborationIntent === "peer_acceptance"
        && (priorIntent === "blocked" || priorIntent === "stalemate")
        && !(priorPriorIntent === "blocked" && priorIntent === "stalemate")) {
        addIssue(issues, "collaboration_transition_invalid", "fail", "/evidence");
      }
      if (record.collaborationIntent === "blocked") {
        requiredNext = "stalemate";
      } else if (record.collaborationIntent === "stalemate" && priorIntent === "blocked") {
        requiredNext = "peer_acceptance";
      } else if (record.collaborationIntent === "peer_acceptance" && priorIntent === "stalemate") {
        requiredNext = null;
      }
    });
    const finalRecord = records.at(-1);
    if (requiredNext !== null && finalRecord !== undefined) {
      addIssue(
        issues,
        "collaboration_transition_incomplete",
        "unknown",
        `${evidencePath(manifest, finalRecord)}/collaborationIntent`,
      );
    }
  }
}

function promotionSourceSignature(promotion: BeadsPromotion) {
  return promotion.promotionSource.kind === "agentchattr_message"
    ? "agentchattr_message"
    : JSON.stringify([
      "runtime_control",
      promotion.promotionSource.correlationId,
      [...promotion.promotionSource.actionIds].sort(),
    ]);
}

function promotionCoreSignature(promotion: BeadsPromotion) {
  return JSON.stringify([
    promotion.beadId,
    promotion.scottyDecisionId,
    promotion.artifactType,
    promotion.selectedValueChecksum,
    promotion.agentChattrIdempotencyKey,
    promotionSourceSignature(promotion),
  ]);
}

function validatePromotions(
  manifest: EvidenceManifestV2,
  promotions: BeadsPromotion[],
  issues: ContractIssue[],
) {
  const byKey = new Map<string, BeadsPromotion[]>();
  for (const promotion of promotions) {
    if (promotion.state === "promotion_pending") {
      addIssue(issues, "promotion_pending", "unknown", `${evidencePath(manifest, promotion)}/state`);
    } else if (promotion.state === "reconciliation_conflict") {
      addIssue(
        issues,
        "promotion_reconciliation_conflict",
        "fail",
        `${evidencePath(manifest, promotion)}/state`,
      );
    }
    const records = byKey.get(promotion.agentChattrIdempotencyKey) ?? [];
    records.push(promotion);
    byKey.set(promotion.agentChattrIdempotencyKey, records);
  }

  for (const records of byKey.values()) {
    if (new Set(records.map(promotionCoreSignature)).size > 1) {
      addIssue(issues, "promotion_reconciliation_conflict", "fail", "/evidence");
    }
    const artifacts = records.flatMap((record) => record.beadsArtifactId === null ? [] : [record.beadsArtifactId]);
    if (new Set(artifacts).size > 1) {
      addIssue(issues, "promotion_retry_divergence", "fail", "/evidence");
    }
    const durable = records.filter((record) => record.state === "durable");
    const durableSignatures = durable.map((record) => JSON.stringify([
      record.beadsArtifactId,
      record.acknowledgedAt,
      record.verifiedAt,
    ]));
    if (new Set(durableSignatures).size > 1) {
      addIssue(issues, "promotion_reconciliation_conflict", "fail", "/evidence");
    }
  }
}

function observationTargetKey(observation: RuntimeObservation) {
  const payload = observation.observation;
  switch (payload.observationKind) {
    case "agent_snapshot":
      return JSON.stringify([
        payload.observationKind,
        payload.workspaceId,
        payload.tabId,
        payload.paneId,
        payload.terminalId,
        payload.agentSessionId,
      ]);
    case "lifecycle_event":
      return JSON.stringify([payload.observationKind, runtimeTargetSignature(payload.target)]);
    case "trace_summary":
      return JSON.stringify([payload.observationKind, payload.agentSessionId]);
  }
}

function observationValueSignature(observation: RuntimeObservation) {
  const payload = observation.observation;
  switch (payload.observationKind) {
    case "agent_snapshot":
      return JSON.stringify([
        payload.agentSessionId,
        payload.runtimeState,
        payload.modelMetadata,
        payload.project,
      ]);
    case "lifecycle_event":
      return JSON.stringify([payload.event, payload.nativeSequence ?? null, payload.eventAt]);
    case "trace_summary":
      return JSON.stringify([
        payload.messageCount,
        payload.toolCallCount,
        payload.tokenCount,
        payload.tokenCountQuality,
        payload.summaryArtifactHash,
      ]);
  }
}

function intervalsOverlap(left: RuntimeObservation, right: RuntimeObservation) {
  return compareTimestamps(left.startedAt, right.observedAt) <= 0
    && compareTimestamps(right.startedAt, left.observedAt) <= 0;
}

function observationHasCompatibleProvenance(observation: RuntimeObservation) {
  return observation.adapter === "direct_herdr"
    ? observation.provenance.sourceKind === "herdr_direct"
      && observation.nativeContract.versionKind === "herdr_protocol"
    : observation.provenance.sourceKind === "herdr_telemetry_bridge"
      && observation.nativeContract.versionKind === "named";
}

function validateRuntimeObservations(
  manifest: EvidenceManifestV2,
  observations: RuntimeObservation[],
  issues: ContractIssue[],
) {
  const groups = new Map<string, RuntimeObservation[]>();
  for (const observation of observations) {
    if (!observationHasCompatibleProvenance(observation)) {
      addIssue(
        issues,
        "runtime_observation_provenance_mismatch",
        "fail",
        evidencePath(manifest, observation),
      );
    }
    const records = groups.get(observationTargetKey(observation)) ?? [];
    records.push(observation);
    groups.set(observationTargetKey(observation), records);
  }

  for (const records of groups.values()) {
    const direct = records.filter((record) => record.adapter === "direct_herdr");
    const telemetry = records.filter((record) => record.adapter === "herdr_telemetry_bridge");
    const disagrees = direct.some((left) => telemetry.some((right) => left.freshness !== "stale"
      && left.freshness !== "unknown"
      && right.freshness !== "stale"
      && right.freshness !== "unknown"
      && intervalsOverlap(left, right)
      && observationValueSignature(left) !== observationValueSignature(right)));
    if (disagrees) {
      addIssue(issues, "runtime_observation_disagreement", "unknown", "/evidence");
    }
  }

  const direct = observations.filter((record) => record.adapter === "direct_herdr");
  for (const telemetry of observations.filter((record) => record.adapter === "herdr_telemetry_bridge")) {
    const hasFoundation = direct.some((record) => observationTargetKey(record) === observationTargetKey(telemetry)
      && record.startedAt === telemetry.startedAt
      && record.observedAt === telemetry.observedAt
      && record.freshness === "live"
      && record.measurementQuality === "direct"
      && record.observedResult === "pass"
      && record.classification === "pass"
      && observationHasCompatibleProvenance(record));
    if (!hasFoundation) {
      addIssue(
        issues,
        "runtime_direct_foundation_missing",
        "unknown",
        evidencePath(manifest, telemetry),
      );
    }
  }
}

function humanResetMessage(
  transition: LoopGuardTransition,
  messages: MessageObservation[],
  bindings: IdentityBinding[],
) {
  if (transition.origin !== "human" || transition.authenticatedHumanProofHash === null) return undefined;
  const candidates = messages.filter((message) => message.channelId === transition.channelId
    && message.directEvidenceArtifactHash === transition.authenticatedHumanProofHash
    && message.messageState === "present"
    && message.observedResult === "pass"
    && message.classification === "pass"
    && compareTimestamps(transition.startedAt, message.observedAt) <= 0
    && compareTimestamps(message.observedAt, transition.observedAt) <= 0
    && bindings.filter((binding) => binding.agentChattrInstanceId === message.providerInstanceId
      && binding.agentChattrExternalId === message.senderExternalId
      && binding.orchestrationRole === "human"
      && bindingCovers(binding, message.observedAt)).length === 1);
  return candidates.length === 1 ? candidates[0] : undefined;
}

function validateLoopTransitions(
  manifest: EvidenceManifestV2,
  transitions: LoopGuardTransition[],
  messages: MessageObservation[],
  bindings: IdentityBinding[],
  exchanges: McpExchange[],
  issues: ContractIssue[],
) {
  const stateByChannel = new Map<string, LoopGuardTransition["fromState"]>();
  const byChannel = new Map<string, LoopGuardTransition[]>();
  for (const transition of transitions) {
    const expected = stateByChannel.get(transition.channelId) ?? "active(0)";
    if (transition.fromState !== expected) {
      addIssue(issues, "loop_sequence_invalid", "fail", "/evidence");
    }
    stateByChannel.set(transition.channelId, transition.toState);
    const channelTransitions = byChannel.get(transition.channelId) ?? [];
    channelTransitions.push(transition);
    byChannel.set(transition.channelId, channelTransitions);
  }
  const allAllowedUids = new Set(transitions.flatMap((transition) => transition.origin === "agent"
    && transition.mcpInvoked
    && transition.stableMessageUid !== null
    ? [transition.stableMessageUid]
    : []));
  const allHumanResetUids = new Set(transitions.flatMap((transition) => {
    const proofMessage = humanResetMessage(transition, messages, bindings);
    return proofMessage === undefined ? [] : [proofMessage.stableMessageUid];
  }));
  for (const channelTransitions of byChannel.values()) {
    const allowedUids = new Set<string>();
    const humanResetUids = new Set<string>();
    for (const transition of channelTransitions) {
      const transitionPath = evidencePath(manifest, transition);
      if (transition.origin === "agent" && transition.mcpInvoked && transition.stableMessageUid !== null) {
        if (allowedUids.has(transition.stableMessageUid)) {
          addIssue(issues, "loop_message_uid_reused", "fail", `${transitionPath}/stableMessageUid`);
        }
        allowedUids.add(transition.stableMessageUid);
        const matchingMessage = messages.some((message) => message.channelId === transition.channelId
          && message.stableMessageUid === transition.stableMessageUid
          && message.messageState === "present"
          && message.observedResult === "pass"
          && message.classification === "pass");
        if (!matchingMessage) {
          addIssue(issues, "loop_message_evidence_missing", "fail", `${transitionPath}/stableMessageUid`);
        }
        const matchingMcp = exchanges.some((exchange) => exchange.operation === "chat_send"
          && exchange.authenticationState === "authenticated"
          && exchange.observedResult === "pass"
          && exchange.classification === "pass"
          && exchange.resultingStableMessageUid === transition.stableMessageUid);
        if (!matchingMcp) {
          addIssue(issues, "loop_mcp_evidence_missing", "fail", `${transitionPath}/stableMessageUid`);
        }
      }
      if (transition.origin === "human") {
        const proofMessage = humanResetMessage(transition, messages, bindings);
        if (proofMessage === undefined) {
          addIssue(issues, "loop_human_reset_unproven", "fail", `${transitionPath}/authenticatedHumanProofHash`);
        } else {
          humanResetUids.add(proofMessage.stableMessageUid);
        }
      }
    }

    const hasSixth = channelTransitions.some((transition) => transition.origin === "agent"
      && transition.fromState === "active(5)"
      && transition.toState === "paused(6)"
      && transition.mcpInvoked
      && transition.stableMessageUid !== null);
    const hasSeventhRejection = channelTransitions.some((transition) => transition.origin === "agent"
      && transition.fromState === "paused(6)"
      && transition.toState === "paused(6)"
      && !transition.mcpInvoked
      && transition.stableMessageUid === null);
    const hasHumanReset = channelTransitions.some((transition) => transition.origin === "human"
      && transition.fromState === "paused(6)"
      && transition.toState === "active(0)"
      && transition.authenticatedHumanProofHash !== null);
    if (!hasSixth || !hasSeventhRejection || !hasHumanReset) {
      addIssue(issues, "loop_evidence_incomplete", "unknown", "/evidence");
    }

    for (const rejection of channelTransitions.filter((transition) => transition.origin === "agent"
      && transition.fromState === "paused(6)"
      && transition.toState === "paused(6)"
      && !transition.mcpInvoked)) {
      const hasUpstreamMessage = messages.some((message) => message.channelId === rejection.channelId
        && compareTimestamps(message.observedAt, rejection.observedAt) >= 0
        && !allowedUids.has(message.stableMessageUid)
        && !humanResetUids.has(message.stableMessageUid));
      const hasUpstreamMcp = exchanges.some((exchange) => exchange.operation === "chat_send"
        && exchange.authenticationState === "authenticated"
        && exchange.observedResult === "pass"
        && compareTimestamps(exchange.observedAt, rejection.observedAt) >= 0
        && exchange.resultingStableMessageUid !== null
        && !allAllowedUids.has(exchange.resultingStableMessageUid)
        && !allHumanResetUids.has(exchange.resultingStableMessageUid));
      if (hasUpstreamMessage || hasUpstreamMcp) {
        addIssue(
          issues,
          "loop_seventh_upstream_present",
          "fail",
          evidencePath(manifest, rejection),
        );
      }
    }
  }
}

function desktopSignature(record: DesktopCapability) {
  return JSON.stringify([
    record.clientVersion,
    record.readClassification,
    record.sendClassification,
    record.authenticationEvidenceHash,
    record.storedMessageUid,
    record.storedMessageEvidenceHash,
  ]);
}

function validateDesktop(
  manifest: EvidenceManifestV2,
  records: DesktopCapability[],
  issues: ContractIssue[],
) {
  for (const record of records) {
    const derived = aggregateClassification([record.readClassification, record.sendClassification]);
    if (record.classification !== derived) {
      addIssue(
        issues,
        "desktop_classification_mismatch",
        "fail",
        `${evidencePath(manifest, record)}/classification`,
      );
    }
  }
  for (const client of ["claude_code_desktop", "codex_desktop"] as const) {
    const clientRecords = records.filter((record) => record.client === client);
    if (new Set(clientRecords.map(desktopSignature)).size > 1) {
      addIssue(issues, "desktop_result_conflict", "fail", "/evidence");
    }
  }
}

function validateMonitorAndTeardown(manifest: EvidenceManifestV2, issues: ContractIssue[]) {
  if (manifest.executionState === "not_run") return;

  const configurations = recordsOf(manifest, "configuration_boundary");
  const monitors = recordsOf(manifest, "monitor_interval");
  const teardowns = recordsOf(manifest, "teardown");
  const configuration = configurations[0];
  const teardownRecord = teardowns[0];

  if (configurations.length !== 1) {
    addIssue(issues, "configuration_boundary_count_invalid", configurations.length === 0 ? "unknown" : "fail", "/evidence");
  }
  if (manifest.executionState === "completed" && teardowns.length !== 1) {
    addIssue(issues, "teardown_count_invalid", "fail", "/evidence");
  }

  const expectedEndpointState = manifest.executionState === "running" ? "bound" : "stopped";
  if (manifest.endpoint.state !== expectedEndpointState) {
    addIssue(issues, "teardown_envelope_inconsistent", "fail", "/endpoint/state");
  }
  if (manifest.resourceAdmission.measurementState === "measured"
    && manifest.resourceAdmission.admissionResult !== "admitted") {
    addIssue(
      issues,
      "resource_admission_inconsistent",
      manifest.resourceAdmission.admissionResult === "denied" ? "fail" : "unknown",
      "/resourceAdmission/admissionResult",
    );
  }

  const safetyStates = [
    manifest.safety.launcher,
    manifest.safety.wrapper,
    manifest.safety.triggerQueueConsumer,
    manifest.safety.terminalInjection,
    manifest.safety.autoWake,
    manifest.safety.jobsAuthority,
    manifest.safety.persistentRules,
  ];
  if (safetyStates.some((state) => state !== "disabled")) {
    addIssue(
      issues,
      "safety_boundary_inconsistent",
      safetyStates.some((state) => state === "enabled") ? "fail" : "unknown",
      "/safety",
    );
  }

  if (configuration) {
    const configurationStates = [
      configuration.launcherState,
      configuration.wrapperState,
      configuration.triggerConsumerState,
      configuration.terminalInjectionState,
      configuration.autoWakeState,
      configuration.jobsState,
      configuration.persistentRulesState,
    ];
    if (configurationStates.some((state) => state !== "disabled")) {
      addIssue(
        issues,
        "configuration_boundary_inconsistent",
        configurationStates.some((state) => state === "enabled") ? "fail" : "unknown",
        "/evidence",
      );
    }
  }

  for (const monitorKind of [
    "process",
    "child_process",
    "trigger_queue",
    "herdr_pane",
    "input_control",
    "runtime_manager_inventory",
  ] as const) {
    const candidates = monitors.filter((monitor) => monitor.monitorKind === monitorKind);
    if (candidates.length === 0) {
      addIssue(issues, "monitor_coverage_missing", "unknown", "/evidence");
      continue;
    }
    if (configuration) {
      const hasStartCoverage = candidates.some((monitor) => compareTimestamps(
        monitor.startedAt,
        configuration.startedAt,
      ) <= 0);
      const hasCompletedCoverage = teardownRecord === undefined || candidates.some((monitor) => compareTimestamps(
        monitor.startedAt,
        configuration.startedAt,
      ) <= 0 && compareTimestamps(monitor.observedAt, teardownRecord.observedAt) >= 0);
      if (!hasStartCoverage || !hasCompletedCoverage) {
        addIssue(issues, "monitor_coverage_gap", "fail", "/evidence");
      }
    }
  }

  for (const monitor of monitors) {
    if (monitor.gapState !== "no_gap" || monitor.finalCaptureState !== "captured") {
      addIssue(
        issues,
        "monitor_capture_incomplete",
        monitor.gapState === "gap_detected" || monitor.finalCaptureState === "missing" ? "fail" : "unknown",
        "/evidence",
      );
    }
  }

  if (teardownRecord) {
    const inventory = monitors.filter((monitor) => monitor.monitorKind === "runtime_manager_inventory");
    const inventoryMatches = inventory.some((monitor) => monitor.baselineEvidenceHash
      === teardownRecord.baselineInventoryRestoration.baselineEvidenceHash
      && monitor.finalEvidenceHash === teardownRecord.baselineInventoryRestoration.finalEvidenceHash);
    const finalCaptureMatches = monitors.some((monitor) => monitor.finalEvidenceHash
      === teardownRecord.finalMonitorCapture.evidenceHash);
    if (!inventoryMatches || !finalCaptureMatches) {
      addIssue(issues, "teardown_monitor_mismatch", "fail", "/evidence");
    }
  }
}

function runtimeTargetSignature(target: RuntimeControlTarget | HerdrTarget) {
  switch (target.targetKind) {
    case "workspace":
      return JSON.stringify({ targetKind: target.targetKind, workspaceId: target.workspaceId });
    case "agent_session":
      return JSON.stringify({ targetKind: target.targetKind, agentSessionId: target.agentSessionId });
    case "pane":
      return JSON.stringify({
        targetKind: target.targetKind,
        workspaceId: target.workspaceId,
        tabId: target.tabId,
        paneId: target.paneId,
      });
    case "tab":
      return JSON.stringify({ targetKind: target.targetKind, workspaceId: target.workspaceId, tabId: target.tabId });
    case "terminal":
      return JSON.stringify({
        targetKind: target.targetKind,
        workspaceId: target.workspaceId,
        tabId: target.tabId,
        paneId: target.paneId,
        terminalId: target.terminalId,
      });
    case "runtime_manager_project":
      return JSON.stringify({ targetKind: target.targetKind, projectId: target.projectId });
  }
}

function runtimeTargetHash(target: RuntimeControlTarget) {
  return `sha256:${createHash("sha256").update(runtimeTargetSignature(target)).digest("hex")}`;
}

function runtimeScopeSignature(scope: Extract<RuntimeControlAction["event"], { phase: "authorization" }>["scope"]) {
  return JSON.stringify([scope.action, runtimeTargetSignature(scope.target), scope.parameterHash]);
}

function runtimeRequestSignature(record: RuntimeControlAction) {
  if (record.event.phase !== "request") return "";
  return JSON.stringify([
    record.runtimeProvider,
    record.actionId,
    record.event.action,
    runtimeTargetSignature(record.event.target),
    record.event.parameterHash,
    record.event.effectClass,
    record.event.durablePromotion,
    record.idempotencyKey,
  ]);
}

const READ_ONLY_RUNTIME_ACTIONS = new Set([
  "list_agents",
  "get_agent",
  "read_pane",
  "wait_for_agent",
  "wait_for_output",
]);

function observationMatchesControlTarget(observation: RuntimeObservation, target: RuntimeControlTarget) {
  const payload = observation.observation;
  if (payload.observationKind === "agent_snapshot") {
    switch (target.targetKind) {
      case "workspace":
        return payload.workspaceId === target.workspaceId;
      case "tab":
        return payload.workspaceId === target.workspaceId && payload.tabId === target.tabId;
      case "pane":
        return payload.workspaceId === target.workspaceId
          && payload.tabId === target.tabId
          && payload.paneId === target.paneId;
      case "agent_session":
        return payload.agentSessionId === target.agentSessionId;
      case "runtime_manager_project":
        return false;
    }
  }
  if (payload.observationKind === "lifecycle_event") {
    return runtimeTargetSignature(payload.target) === runtimeTargetSignature(target);
  }
  return target.targetKind === "agent_session" && payload.agentSessionId === target.agentSessionId;
}

function validRuntimeVerificationObservation(
  manifest: EvidenceManifestV2,
  verification: RuntimeControlAction,
  observation: EvidenceRecord | undefined,
  target: RuntimeControlTarget,
) {
  return observation?.kind === "runtime_observation"
    && manifest.evidence.indexOf(observation) > manifest.evidence.indexOf(verification)
    && compareTimestamps(verification.observedAt, observation.observedAt) <= 0
    && observation.adapter === "direct_herdr"
    && observation.provenance.sourceKind === "herdr_direct"
    && observation.nativeContract.versionKind === "herdr_protocol"
    && observation.measurementQuality === "direct"
    && observation.freshness === "live"
    && observation.observedResult === "pass"
    && observation.classification === "pass"
    && observationMatchesControlTarget(observation, target);
}

function validateRuntimeActionGroup(
  manifest: EvidenceManifestV2,
  records: RuntimeControlAction[],
  caseIndex: ReadonlyMap<string, EvidenceRecord>,
  issues: ContractIssue[],
) {
  const requests = records.filter((record) => record.event.phase === "request");
  if (requests.length === 0) {
    addIssue(issues, "runtime_request_missing", "fail", "/evidence");
    return;
  }
  if (requests.length !== 1) {
    addIssue(issues, "runtime_request_count_invalid", "fail", "/evidence");
    if (new Set(requests.map(runtimeRequestSignature)).size > 1) {
      addIssue(issues, "runtime_request_tuple_changed", "fail", "/evidence");
    }
  }
  const requestRecord = requests[0];
  if (requestRecord.sequence !== 0) {
    addIssue(issues, "runtime_sequence_invalid", "fail", "/evidence");
  }

  const identities = new Set(records.map((record) => JSON.stringify([
    record.runtimeProvider,
    record.correlationId,
    record.idempotencyKey,
  ])));
  if (identities.size > 1) {
    addIssue(issues, "runtime_action_identity_changed", "fail", "/evidence");
  }
  for (let index = 1; index < records.length; index += 1) {
    if (records[index].sequence <= records[index - 1].sequence
      || compareTimestamps(records[index].observedAt, records[index - 1].observedAt) < 0) {
      addIssue(issues, "runtime_sequence_invalid", "fail", "/evidence");
    }
  }

  if (requestRecord.event.phase !== "request") return;
  const request = requestRecord.event;
  const requestPath = evidencePath(manifest, requestRecord);
  const actionIsReadOnly = READ_ONLY_RUNTIME_ACTIONS.has(request.action);
  if (actionIsReadOnly !== (request.effectClass === "read_only")) {
    addIssue(issues, "runtime_effect_class_mismatch", "fail", `${requestPath}/event/effectClass`);
  }
  const declaredProviderIdempotencyArtifact = request.reviewedProviderIdempotencyArtifactHash !== undefined
    && requestRecord.artifacts.some((artifact) => artifact.digest === request.reviewedProviderIdempotencyArtifactHash);
  if (request.reviewedProviderIdempotencyArtifactHash !== undefined && !declaredProviderIdempotencyArtifact) {
    addIssue(
      issues,
      "runtime_provider_idempotency_evidence_missing",
      "fail",
      `${requestPath}/event/reviewedProviderIdempotencyArtifactHash`,
    );
  }
  const laterAuthorityOrExecution = records.some((record) => record.sequence > requestRecord.sequence
    && (record.event.phase === "authorization" || record.event.phase === "execution"));
  if (request.requestState !== "recorded" && laterAuthorityOrExecution) {
    addIssue(issues, "runtime_request_terminal", "fail", "/evidence");
  }

  const executions = records.filter((record): record is RuntimeControlAction & {
    event: Extract<RuntimeControlAction["event"], { phase: "execution" }>;
  } => record.event.phase === "execution");
  const executionByAttempt = new Map(executions.map((record) => [record.event.attemptId, record]));

  for (const record of records) {
    if (record.event.phase !== "verification"
      && record.event.phase !== "acknowledgement"
      && record.event.phase !== "reconciliation") continue;
    const execution = executionByAttempt.get(record.event.attemptId);
    if (!execution || execution.sequence >= record.sequence) {
      addIssue(issues, "runtime_attempt_reference_missing", "fail", "/evidence");
    }
    if (record.event.phase === "verification"
      && record.event.evidenceReference.kind === "runtime_observation"
      && caseIndex.get(record.event.evidenceReference.caseId)?.kind !== "runtime_observation") {
      addIssue(issues, "runtime_verification_evidence_missing", "unknown", "/evidence");
    }
  }

  for (const record of records) {
    if (record.event.phase !== "verification") continue;
    const verificationPath = `${evidencePath(manifest, record)}/event/evidenceReference`;
    const evidenceReference = record.event.evidenceReference;
    if (evidenceReference.kind === "artifact") {
      if (!record.artifacts.some((artifact) => artifact.kind === "verification"
        && artifact.digest === evidenceReference.artifactHash)) {
        addIssue(issues, "runtime_verification_artifact_missing", "fail", verificationPath);
      }
      continue;
    }
    if (!validRuntimeVerificationObservation(
      manifest,
      record,
      caseIndex.get(evidenceReference.caseId),
      request.target,
    )) {
      addIssue(issues, "runtime_verification_evidence_invalid", "fail", verificationPath);
    }
  }

  let previousAttemptNumber = 0;
  const seenAttemptIds = new Set<string>();
  for (const execution of executions) {
    if (seenAttemptIds.has(execution.event.attemptId)) {
      addIssue(issues, "runtime_attempt_id_duplicate", "fail", "/evidence");
    }
    if (execution.event.attemptNumber <= previousAttemptNumber) {
      addIssue(issues, "runtime_attempt_order_invalid", "fail", "/evidence");
    }
    seenAttemptIds.add(execution.event.attemptId);
    previousAttemptNumber = execution.event.attemptNumber;
    const maxAttempts = request.retryPolicy.mode === "bounded" ? request.retryPolicy.maxAttempts : 1;
    if (execution.event.attemptNumber > maxAttempts) {
      addIssue(issues, "runtime_retry_policy_exceeded", "fail", "/evidence");
    }

    const recordIndex = records.indexOf(execution);
    const previousExecution = executions[executions.indexOf(execution) - 1];
    const authorizations = records.slice(0, recordIndex).filter((record): record is RuntimeControlAction & {
      event: Extract<RuntimeControlAction["event"], { phase: "authorization" }>;
    } => record.event.phase === "authorization");
    const authorization = authorizations.at(-1);
    const expectedScope = JSON.stringify([
      request.action,
      runtimeTargetSignature(request.target),
      request.parameterHash,
    ]);
    const authorizationIsCurrent = authorization !== undefined
      && authorization.event.decision === "authorized"
      && runtimeScopeSignature(authorization.event.scope) === expectedScope
      && compareTimestamps(authorization.event.validFrom, execution.observedAt) <= 0
      && compareTimestamps(execution.observedAt, authorization.event.validUntil) <= 0
      && (previousExecution === undefined || authorization.sequence > previousExecution.sequence);
    if (!authorizationIsCurrent) {
      addIssue(issues, "runtime_execution_unauthorized", "fail", "/evidence");
    }

    if (request.humanIntent.state === "denied") {
      addIssue(issues, "runtime_human_intent_conflict", "fail", "/evidence");
      addIssue(issues, "runtime_execution_unauthorized", "fail", "/evidence");
    } else if (request.humanIntent.state === "none") {
      addIssue(issues, "runtime_human_intent_unproven", "unknown", "/evidence");
      addIssue(issues, "runtime_execution_unauthorized", "fail", "/evidence");
    } else {
      if (authorization?.event.authorizingActorId !== request.humanIntent.assignedActorId) {
        addIssue(issues, "runtime_human_intent_conflict", "fail", "/evidence");
        addIssue(issues, "runtime_execution_unauthorized", "fail", "/evidence");
      }
      if (runtimeTargetHash(request.target) !== request.humanIntent.targetHash) {
        addIssue(issues, "runtime_human_target_mismatch", "fail", "/evidence");
        addIssue(issues, "runtime_execution_unauthorized", "fail", "/evidence");
      }
    }
  }

  validateRuntimeRetries(records, request, executions, declaredProviderIdempotencyArtifact, issues);
}

function validateRuntimeRetries(
  records: RuntimeControlAction[],
  request: Extract<RuntimeControlAction["event"], { phase: "request" }>,
  executions: Array<RuntimeControlAction & {
    event: Extract<RuntimeControlAction["event"], { phase: "execution" }>;
  }>,
  declaredProviderIdempotencyArtifact: boolean,
  issues: ContractIssue[],
) {
  for (let index = 1; index < executions.length; index += 1) {
    const previous = executions[index - 1];
    const current = executions[index];
    if (READ_ONLY_RUNTIME_ACTIONS.has(request.action)) continue;

    const between = records.filter((record) => record.sequence > previous.sequence
      && record.sequence < current.sequence);
    const finalEvidence = records.filter((record) => record.sequence > previous.sequence);
    const verifications = finalEvidence.filter((record) => record.event.phase === "verification"
      && record.event.attemptId === previous.event.attemptId);
    const acknowledgements = finalEvidence.filter((record) => record.event.phase === "acknowledgement"
      && record.event.attemptId === previous.event.attemptId);
    const reconciliations = between.filter((record) => record.event.phase === "reconciliation"
      && record.event.attemptId === previous.event.attemptId);
    const hardDuplicateRisk = previous.event.state === "succeeded"
      || previous.event.state === "started"
      || verifications.some((record) => record.event.phase === "verification" && record.event.state === "verified_applied")
      || acknowledgements.some((record) => record.event.phase === "acknowledgement"
        && (record.event.state === "acknowledged" || record.event.state === "pending" || record.event.state === "unknown"));
    if (hardDuplicateRisk) {
      addIssue(issues, "runtime_duplicate_execution_risk", "fail", "/evidence");
      continue;
    }

    const latestReconciliation = reconciliations.at(-1);
    if (latestReconciliation?.event.phase === "reconciliation"
      && (latestReconciliation.event.observedDisposition === "applied"
        || latestReconciliation.event.retryDecision === "do_not_retry")) {
      addIssue(issues, "runtime_duplicate_execution_risk", "fail", "/evidence");
      continue;
    }
    const reconciliation = latestReconciliation?.event.phase === "reconciliation"
      && latestReconciliation.event.observedDisposition === "not_applied"
      && latestReconciliation.event.retryDecision === "retry_authorized"
      ? latestReconciliation
      : undefined;
    const uncertainUnsupported = (previous.event.state === "timed_out" || previous.event.state === "unknown")
      && previous.event.providerIdempotencyState !== "supported";
    if (uncertainUnsupported && (reconciliation?.event.phase !== "reconciliation"
      || reconciliation.event.decidingSource !== "human")) {
      addIssue(issues, "runtime_human_reconciliation_required", "fail", "/evidence");
      continue;
    }
    if (reconciliation) continue;

    const reviewedProviderIdempotency = request.reviewedProviderIdempotencyArtifactHash !== undefined
      && declaredProviderIdempotencyArtifact
      && previous.event.providerIdempotencyState === "supported";
    if (reviewedProviderIdempotency) continue;

    addIssue(issues, "runtime_reconciliation_required", "fail", "/evidence");
  }
}

function validateRuntimeControl(
  manifest: EvidenceManifestV2,
  actions: RuntimeControlAction[],
  promotions: BeadsPromotion[],
  issues: ContractIssue[],
) {
  const caseIndex = new Map(manifest.evidence.map((record) => [record.caseId, record]));
  const eventIds = new Set<string>();
  const authorizationIds = new Set<string>();
  const attemptIds = new Set<string>();
  const byAction = new Map<string, RuntimeControlAction[]>();

  for (const action of actions) {
    if (eventIds.has(action.eventId)) {
      addIssue(issues, "runtime_event_id_duplicate", "fail", "/evidence");
    }
    eventIds.add(action.eventId);
    if (action.event.phase === "authorization") {
      if (authorizationIds.has(action.event.authorizationId)) {
        addIssue(issues, "runtime_authorization_id_duplicate", "fail", "/evidence");
      }
      authorizationIds.add(action.event.authorizationId);
    }
    if (action.event.phase === "execution") {
      if (attemptIds.has(action.event.attemptId)) {
        addIssue(issues, "runtime_attempt_id_duplicate", "fail", "/evidence");
      }
      attemptIds.add(action.event.attemptId);
    }
    const records = byAction.get(action.actionId) ?? [];
    records.push(action);
    byAction.set(action.actionId, records);
  }

  for (const records of byAction.values()) {
    validateRuntimeActionGroup(manifest, records, caseIndex, issues);
  }
  validateRuntimePromotions(actions, promotions, issues);
}

function validateRuntimePromotions(
  actions: RuntimeControlAction[],
  promotions: BeadsPromotion[],
  issues: ContractIssue[],
) {
  const requiredByCorrelation = new Map<string, string[]>();
  for (const action of actions) {
    if (action.event.phase !== "request" || action.event.durablePromotion !== "required") continue;
    const ids = requiredByCorrelation.get(action.correlationId) ?? [];
    ids.push(action.actionId);
    requiredByCorrelation.set(action.correlationId, ids);
  }
  const actionsById = new Map(actions.map((action) => [action.actionId, action]));
  const runtimePromotions = promotions.filter((promotion) => promotion.promotionSource.kind === "runtime_control");

  for (const promotion of runtimePromotions) {
    const source = promotion.promotionSource;
    if (source.kind !== "runtime_control") continue;
    const sourceActions = source.actionIds.map((actionId) => actionsById.get(actionId));
    if (sourceActions.some((action) => action === undefined
      || action.correlationId !== source.correlationId)) {
      addIssue(issues, "runtime_durable_promotion_mismatch", "fail", "/evidence");
    }
  }

  for (const [correlationId, requiredActionIds] of requiredByCorrelation) {
    const candidates = runtimePromotions.filter((promotion) => promotion.state === "durable"
      && promotion.promotionSource.kind === "runtime_control"
      && promotion.promotionSource.correlationId === correlationId);
    if (candidates.length === 0) {
      addIssue(issues, "runtime_durable_promotion_missing", "unknown", "/evidence");
      continue;
    }
    if (!candidates.some((promotion) => promotion.promotionSource.kind === "runtime_control"
      && sameStringSet(promotion.promotionSource.actionIds, requiredActionIds))) {
      addIssue(issues, "runtime_durable_promotion_mismatch", "fail", "/evidence");
    }
  }
}

function validateOperationalProvenance(manifest: EvidenceManifestV2, issues: ContractIssue[]) {
  if (manifest.executionState === "not_run") return;
  for (const record of manifest.evidence) {
    if (record.provenance.sourceKind === "synthetic_fixture") {
      addIssue(
        issues,
        "operational_provenance_invalid",
        "fail",
        `${evidencePath(manifest, record)}/provenance/sourceKind`,
      );
    }
  }
}

function validateCrossRecordInvariants(manifest: EvidenceManifestV2): ContractIssue[] {
  const issues: ContractIssue[] = [];
  validateOperationalProvenance(manifest, issues);
  validateCaseIds(manifest, issues);
  const messages = recordsOf(manifest, "message_observation");
  const bindings = recordsOf(manifest, "identity_binding");
  const promotions = recordsOf(manifest, "beads_promotion");
  const deduplicatedMessages = deduplicateMessageReobservations(messages);
  validateMessages(manifest, messages, issues);
  validateIdentityAttribution(manifest, messages, bindings, issues);
  validateCollaborationSequences(manifest, deduplicatedMessages, issues);
  validatePromotions(manifest, promotions, issues);
  validateRuntimeObservations(manifest, recordsOf(manifest, "runtime_observation"), issues);
  validateLoopTransitions(
    manifest,
    recordsOf(manifest, "loop_guard_transition"),
    messages,
    bindings,
    recordsOf(manifest, "mcp_exchange"),
    issues,
  );
  validateDesktop(manifest, recordsOf(manifest, "desktop_capability"), issues);
  validateMonitorAndTeardown(manifest, issues);
  validateRuntimeControl(manifest, recordsOf(manifest, "runtime_control_action"), promotions, issues);
  return issues;
}

export function validateEvidenceManifest(value: unknown): ContractResult {
  const parsed = parseEvidenceManifestV2(value);
  if (!parsed.ok) {
    return aggregateIssues(parsed.issues);
  }
  const issues = validateCrossRecordInvariants(parsed.manifest);
  return aggregateManifestClassification(parsed.manifest, issues);
}

export type LoopGuardState = {
  channelId: string;
  phase: "active" | "paused";
  autonomousCount: number;
};

export type AutonomousSendDecision = {
  allowed: boolean;
  rejectedBeforeMcp: boolean;
  mcpInvocationAllowed: boolean;
  recordedBeforeMcp: true;
  state: LoopGuardState;
};

export function createLoopGuardState(channelId: string): LoopGuardState {
  if (!isNonemptyString(channelId)) throw new Error("A loop guard requires a channel ID.");
  return { channelId, phase: "active", autonomousCount: 0 };
}

export function requestAutonomousSend(state: LoopGuardState): AutonomousSendDecision {
  if (state.phase === "paused" || state.autonomousCount >= 6) {
    return {
      allowed: false,
      rejectedBeforeMcp: true,
      mcpInvocationAllowed: false,
      recordedBeforeMcp: true,
      state: { ...state, phase: "paused", autonomousCount: 6 },
    };
  }
  const autonomousCount = state.autonomousCount + 1;
  return {
    allowed: true,
    rejectedBeforeMcp: false,
    mcpInvocationAllowed: true,
    recordedBeforeMcp: true,
    state: {
      ...state,
      phase: autonomousCount === 6 ? "paused" : "active",
      autonomousCount,
    },
  };
}

const authenticatedHumanOriginProofBrand: unique symbol = Symbol("authenticated-human-origin-proof");

export type AuthenticatedHumanOriginProof = {
  readonly channelId: string;
  readonly [authenticatedHumanOriginProofBrand]: true;
};

export function deriveAuthenticatedHumanOriginProof(
  value: unknown,
  channelId: string,
): AuthenticatedHumanOriginProof | null {
  const parsed = parseEvidenceManifestV2(value);
  if (!parsed.ok || validateEvidenceManifest(value).issues.length > 0) return null;
  const messages = recordsOf(parsed.manifest, "message_observation");
  const bindings = recordsOf(parsed.manifest, "identity_binding");
  const reset = recordsOf(parsed.manifest, "loop_guard_transition").find((transition) => transition.channelId === channelId
    && transition.origin === "human"
    && transition.fromState === "paused(6)"
    && transition.toState === "active(0)"
    && humanResetMessage(transition, messages, bindings) !== undefined);
  if (reset === undefined) return null;
  return Object.freeze({ channelId, [authenticatedHumanOriginProofBrand]: true as const });
}

export function recordAuthenticatedHumanOrigin(
  state: LoopGuardState,
  proof: AuthenticatedHumanOriginProof | null,
): { reset: boolean; state: LoopGuardState } {
  if (state.phase !== "paused"
    || proof === null
    || proof[authenticatedHumanOriginProofBrand] !== true
    || proof.channelId !== state.channelId) {
    return { reset: false, state };
  }
  return { reset: true, state: createLoopGuardState(state.channelId) };
}

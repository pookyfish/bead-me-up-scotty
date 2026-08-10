export const APPROVED_UPSTREAM_PIN = {
  repository: "https://github.com/bcurts/agentchattr.git",
  commit: "c24f605c9b24fb7a98003f7930e2d5e7a7f7d297",
  tag: "v0.5.0",
  version: "0.5.0",
  licenseSha256: "a1abc583f6725867ed3564f1bcd201d78603612330665433a733a640721f40f3",
} as const;

export const DELIVERY_VOCABULARY = [
  "accepted",
  "queued",
  "delivered",
  "read",
  "failed",
  "unknown",
  "unsupported",
] as const;

export const EVIDENCE_CLASSIFICATIONS = ["pass", "fail", "unsupported", "unknown"] as const;

export type Classification = "pass" | "fail" | "unsupported" | "unknown";

export type ContractIssue = {
  code: string;
  classification: Exclude<Classification, "pass">;
};

export type ContractResult = {
  classification: Classification;
  issues: ContractIssue[];
};

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function string(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function hasUtcTimestamp(value: unknown): value is boolean {
  return string(value) && !Number.isNaN(Date.parse(value));
}

function result(issues: ContractIssue[]): ContractResult {
  if (issues.some((issue) => issue.classification === "fail")) {
    return { classification: "fail", issues };
  }
  if (issues.some((issue) => issue.classification === "unsupported")) {
    return { classification: "unsupported", issues };
  }
  if (issues.some((issue) => issue.classification === "unknown")) {
    return { classification: "unknown", issues };
  }
  return { classification: "pass", issues };
}

function normalizedKey(key: string): string {
  return key.replace(/[^a-z0-9]/gi, "").toLowerCase();
}

function semanticKeyTokens(key: string): string[] {
  return key
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

function hasSemanticFamily(key: string, roots: readonly string[], context: readonly string[]): boolean {
  const tokens = new Set(semanticKeyTokens(key));
  const compact = normalizedKey(key);
  return roots.some(
    (root) =>
      tokens.has(root) ||
      compact === root ||
      (root.length >= 6 && compact.includes(root)) ||
      context.some((term) => compact.includes(`${root}${term}`) || compact.includes(`${term}${root}`)),
  );
}

function isApprovedArgvTemplate(value: unknown, container: UnknownRecord): boolean {
  return (
    string(value) &&
    /^[a-z0-9_.-]+(?: --[a-z0-9-]+ <(?:data-dir|port|secret)>)+$/i.test(value) &&
    value.includes("<data-dir>") &&
    value.includes("<port>") &&
    value.includes("<secret>") &&
    string(container.argvHash) &&
    /^sha256:[a-f0-9]{64}$/i.test(container.argvHash)
  );
}

function hasRawCommandEvidence(value: unknown): boolean {
  if (Array.isArray(value)) return value.some(hasRawCommandEvidence);
  if (!isRecord(value)) return false;
  return Object.entries(value).some(([key, nested]) => {
    const normalized = normalizedKey(key);
    if (normalized === "sanitizedargvtemplate" || normalized === "argvhash") return false;
    return /(commandline|cmdline|rawcommand|launcharguments|launchparams|processargs|argv|invocation)/.test(normalized) || hasRawCommandEvidence(nested);
  });
}

function containsRawSensitiveEvidence(value: unknown): boolean {
  if (Array.isArray(value)) return value.some(containsRawSensitiveEvidence);
  if (!isRecord(value)) return false;

  const rawConfigKeys = new Set(["host", "port", "bindhost", "datadir", "datafolder", "authenabled"]);
  if (Object.keys(value).map(normalizedKey).filter((key) => rawConfigKeys.has(key)).length >= 2) {
    return true;
  }

  return Object.entries(value).some(([key, nested]) => {
    const normalized = normalizedKey(key);
    if (normalized === "sanitizedargvtemplate") {
      return !isApprovedArgvTemplate(nested, value);
    }
    if (normalized === "argvhash") {
      return !string(nested) || !/^sha256:[a-f0-9]{64}$/i.test(nested) || !isApprovedArgvTemplate(value.sanitizedArgvTemplate, value);
    }
    const sensitiveKey =
      /(commandline|cmdline|rawcommand|launch(?:arguments|params|text)|processargs|argv|invocation)/.test(normalized) ||
      /(token|secret|credential|password|authorization|apikey|accesskey|authkey)/.test(normalized) ||
      /(config|configuration|settings|preferences)/.test(normalized) ||
      /(queue|pendingmessage|messagepayload)/.test(normalized) ||
      /(absolutepath|userpath|filepath|directory)/.test(normalized);
    if (sensitiveKey) return true;
    if (string(nested)) {
      const nonemptyLines = nested
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter((line) => line.length > 0 && !/^[#;]/.test(line));
      const isHeaderlessConfig =
        nonemptyLines.length >= 2 &&
        nonemptyLines.every((line) => /^[a-z_][a-z0-9_.-]*\s*[:=]\s*[^\r\n]+$/i.test(line));
      const sensitiveValue =
        /(?:^|\s)--(?:token|secret|password)(?:=|\s+)(?!<(?:secret)>)/i.test(nested) ||
        /\b(?:token|secret|password|api[_-]?key|access[_-]?key|auth[_-]?key)\s*[:=]\s*(?!<secret>)[^\s,;}\]]+/i.test(nested) ||
        /\bBearer\s+[A-Za-z0-9._~+/=-]+/i.test(nested) ||
        /(?:^|[^a-z0-9+.-])[a-z]:[\\/]|\\\\[^\\]+\\|\/(?:home|users|var|opt|etc|tmp)\//i.test(nested) ||
        /\b[a-z0-9_.-]+\.(?:exe|cmd|bat|ps1|py)\s+(?:--|-|\/)/i.test(nested) ||
        /\b(?:python|node|pwsh|powershell)\s+[^\r\n]+/i.test(nested) ||
        /^\s*\[[^\]]+\]\s*[\r\n]+[a-z0-9_.-]+\s*=/i.test(nested) ||
        isHeaderlessConfig;
      if (sensitiveValue) return true;
    }
    return containsRawSensitiveEvidence(nested);
  });
}

function containsInferredAuthorityStatus(value: unknown): boolean {
  if (Array.isArray(value)) return value.some(containsInferredAuthorityStatus);
  if (!isRecord(value)) return false;
  return Object.entries(value).some(([key, nested]) => {
    const normalized = normalizedKey(key);
    const status = typeof nested === "string" ? nested.toLowerCase().replace(/[\s-]+/g, "_") : nested;
    const stateContext = ["state", "status", "flag", "result", "authority"];
    if (
      normalized === "messagestatus" ||
      hasSemanticFamily(
        key,
        ["delivery", "delivered", "read", "acceptance", "accepted", "queued"],
        ["receipt", "confirmation", "acknowledgement", "acknowledgment", "evidence", "observation", ...stateContext],
      )
    ) {
      return ![false, null, "none", "unknown", "unsupported", "unobserved", "not_observed"].includes(status as never);
    }
    if (hasSemanticFamily(key, ["work"], ["started", ...stateContext])) {
      return ![false, null, "none", "not_started", "unknown", "unsupported"].includes(status as never);
    }
    if (hasSemanticFamily(key, ["lease"], ["claim", "claimed", "owner", ...stateContext])) {
      return ![false, null, "none", "unclaimed", "unknown", "unsupported"].includes(status as never);
    }
    if (hasSemanticFamily(key, ["task", "assignment"], ["assignment", ...stateContext])) {
      return ![false, null, "none", "unassigned", "unknown", "unsupported"].includes(status as never);
    }
    if (hasSemanticFamily(key, ["approval", "approved"], ["outcome", "granted", ...stateContext])) {
      return ![false, null, "none", "unknown", "unsupported", "not_granted", "not_approved"].includes(status as never);
    }
    if (hasSemanticFamily(key, ["handoff", "handedoff"], ["resolution", "complete", ...stateContext])) {
      return ![false, null, "none", "unknown", "unsupported", "pending", "not_complete"].includes(status as never);
    }
    if (hasSemanticFamily(key, ["binding"], ["identity", "verified", ...stateContext])) {
      return ![false, null, "none", "unknown", "unsupported", "unbound", "unverified"].includes(status as never);
    }
    return containsInferredAuthorityStatus(nested);
  });
}

function hasExactPin(value: unknown): value is typeof APPROVED_UPSTREAM_PIN {
  return (
    isRecord(value) &&
    value.repository === APPROVED_UPSTREAM_PIN.repository &&
    value.commit === APPROVED_UPSTREAM_PIN.commit &&
    value.tag === APPROVED_UPSTREAM_PIN.tag &&
    value.version === APPROVED_UPSTREAM_PIN.version &&
    value.licenseSha256 === APPROVED_UPSTREAM_PIN.licenseSha256
  );
}

export function validateEvidenceManifest(value: unknown): ContractResult {
  const issues: ContractIssue[] = [];
  if (!isRecord(value)) {
    return result([{ code: "invalid_manifest", classification: "fail" }]);
  }

  const upstream = value.upstream;
  if (!isRecord(upstream) || !string(upstream.commit)) {
    issues.push({ code: "missing_upstream_pin", classification: "fail" });
  } else if (!hasExactPin(upstream)) {
    issues.push({ code: "changed_upstream_pin", classification: "fail" });
  }

  const endpoint = value.endpoint;
  if (!isRecord(endpoint) || endpoint.host !== "127.0.0.1") {
    issues.push({ code: "non_loopback_endpoint", classification: "fail" });
  }
  if (!isRecord(endpoint) || !Number.isInteger(endpoint.port) || (endpoint.port as number) < 1 || (endpoint.port as number) > 65535) {
    issues.push({ code: "invalid_endpoint_port", classification: "unknown" });
  }

  const admission = value.resourceAdmission;
  if (!isRecord(admission) || !string(admission.runtimeManagerCorrelationToken)) {
    issues.push({ code: "missing_admission_correlation", classification: "unknown" });
  }
  if (!isRecord(admission) || admission.admitted !== true) {
    issues.push({ code: "admission_not_confirmed", classification: "unknown" });
  }
  if (!isRecord(admission) || typeof admission.availablePhysicalMemoryGiB !== "number" || admission.availablePhysicalMemoryGiB < 4) {
    issues.push({ code: "insufficient_available_memory", classification: "fail" });
  }
  if (!isRecord(admission) || typeof admission.aggregateWorkingSetPercent !== "number" || admission.aggregateWorkingSetPercent > 70) {
    issues.push({ code: "working_set_limit_exceeded", classification: "fail" });
  }
  if (!isRecord(admission) || admission.otherResourceHeavyJobActive !== false) {
    issues.push({ code: "resource_heavy_job_active", classification: "fail" });
  }

  const safety = value.safety;
  const requiredSafety = [
    "wrappersDisabled",
    "triggerQueueConsumerDisabled",
    "terminalInjectionDisabled",
    "autoWakeDisabled",
    "jobsIgnored",
    "persistentRulesUnused",
  ];
  if (!isRecord(safety) || safety.lifecycleOwner !== "runtime-manager" || requiredSafety.some((key) => safety?.[key] !== true)) {
    issues.push({ code: "unsafe_service_boundary", classification: "fail" });
  }

  if (!Array.isArray(value.evidence) || value.evidence.length === 0) {
    issues.push({ code: "missing_evidence_records", classification: "unknown" });
  } else {
    for (const evidence of value.evidence) {
      if (!isRecord(evidence)) {
        issues.push({ code: "invalid_evidence_record", classification: "fail" });
        continue;
      }
      const requiredFields = [
        "caseId",
        "upstreamPin",
        "hostVersion",
        "toolVersions",
        "sourceArtifactHashes",
        "resultArtifactHashes",
        "expectedResult",
        "observedResult",
        "classification",
        "provenance",
        "startedAtUtc",
        "endedAtUtc",
        "processRecords",
        "teardownState",
      ];
      if (requiredFields.some((field) => evidence[field] === undefined)) {
        issues.push({ code: "incomplete_evidence_record", classification: "unknown" });
      }
      if (evidence.upstreamPin !== APPROVED_UPSTREAM_PIN.commit) {
        issues.push({ code: "evidence_pin_mismatch", classification: "fail" });
      }
      if (!hasUtcTimestamp(evidence.startedAtUtc) || !hasUtcTimestamp(evidence.endedAtUtc)) {
        issues.push({ code: "invalid_evidence_timestamp", classification: "unknown" });
      }
      if (evidence.teardownState !== "confirmed") {
        issues.push({ code: "teardown_not_confirmed", classification: "unknown" });
      }
      if (!EVIDENCE_CLASSIFICATIONS.includes(evidence.classification as (typeof EVIDENCE_CLASSIFICATIONS)[number])) {
        issues.push({ code: "invalid_evidence_classification", classification: "fail" });
      }
      if (containsInferredAuthorityStatus(evidence)) {
        issues.push({ code: "inferred_authority_status", classification: "fail" });
      }
      if (!Array.isArray(evidence.processRecords) || evidence.processRecords.some((record) => !isRecord(record) || !Number.isInteger(record.pid) || !string(record.executable) || /[\\/]/.test(record.executable) || !hasUtcTimestamp(record.startedAtUtc))) {
        issues.push({ code: "invalid_sanitized_process_record", classification: "fail" });
      }
      if (hasRawCommandEvidence(evidence)) {
        issues.push({ code: "raw_command_line", classification: "fail" });
      }
      if (containsRawSensitiveEvidence(evidence)) {
        issues.push({ code: "raw_sensitive_evidence", classification: "fail" });
      }
    }
  }

  return result(issues);
}

export function validateMessageContract(value: unknown): ContractResult {
  const issues: ContractIssue[] = [];
  if (!isRecord(value)) {
    return result([{ code: "invalid_message_contract", classification: "fail" }]);
  }

  const required = [
    "providerInstanceId",
    "channelId",
    "stableMessageUid",
    "senderExternalId",
    "contentChecksum",
  ];
  if (required.some((field) => !string(value[field]))) {
    issues.push({ code: "missing_message_identity", classification: "fail" });
  }
  if (!Number.isInteger(value.cursorId)) {
    issues.push({ code: "invalid_cursor_id", classification: "fail" });
  }
  if (typeof value.stableMessageUid !== "string" || value.stableMessageUid === String(value.cursorId) || value.durableKey === `cursor:${value.cursorId}`) {
    issues.push({ code: "cursor_used_as_uid", classification: "fail" });
  }
  if (value.parentUid !== null && !string(value.parentUid)) {
    issues.push({ code: "invalid_parent_uid", classification: "fail" });
  }
  if (value.threadId !== null && !string(value.threadId)) {
    issues.push({ code: "invalid_thread_id", classification: "fail" });
  }
  if (!DELIVERY_VOCABULARY.includes(value.delivery as (typeof DELIVERY_VOCABULARY)[number])) {
    issues.push({ code: "unknown_delivery_vocabulary", classification: "unsupported" });
  } else if (["accepted", "queued", "delivered", "read"].includes(value.delivery as string) && !string(value.directUpstreamEvidence)) {
    issues.push({ code: "unobserved_delivery_state", classification: "unknown" });
  }
  if (value.workState !== "not_started" || value.leaseState !== "none") {
    issues.push({ code: "message_implies_work_or_lease", classification: "fail" });
  }
  return result(issues);
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
  if (!string(channelId)) throw new Error("A loop guard requires a channel ID.");
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

export function recordAuthenticatedHumanOrigin(
  state: LoopGuardState,
  evidence: unknown,
): { reset: boolean; state: LoopGuardState } {
  if (
    state.phase !== "paused" ||
    !isRecord(evidence) ||
    evidence.origin !== "human" ||
    evidence.authenticated !== true ||
    evidence.identityVerified !== true ||
    evidence.channelId !== state.channelId ||
    !string(evidence.providerInstanceId) ||
    !string(evidence.stableMessageUid) ||
    !hasUtcTimestamp(evidence.observedAtUtc) ||
    !string(evidence.directUpstreamEvidence)
  ) {
    return { reset: false, state };
  }
  return { reset: true, state: createLoopGuardState(state.channelId) };
}

export function validateMessagePages(pages: unknown): ContractResult {
  const issues: ContractIssue[] = [];
  if (!Array.isArray(pages)) {
    return result([{ code: "invalid_message_pages", classification: "fail" }]);
  }
  const seen = new Set<string>();
  for (const page of pages) {
    if (!Array.isArray(page)) {
      issues.push({ code: "invalid_message_page", classification: "fail" });
      continue;
    }
    for (const message of page) {
      const contract = validateMessageContract(message);
      issues.push(...contract.issues);
      if (isRecord(message) && string(message.stableMessageUid)) {
        if (seen.has(message.stableMessageUid)) {
          issues.push({ code: "duplicate_message_uid", classification: "fail" });
        }
        seen.add(message.stableMessageUid);
      }
    }
  }
  return result(issues);
}

const REQUIRED_BINDING_FIELDS = [
  "bindingId",
  "actorId",
  "logicalSessionId",
  "providerModel",
  "executionSurface",
  "role",
  "runtimeSessionRef",
  "upstreamInstanceId",
  "upstreamSessionId",
  "senderExternalId",
  "displayName",
  "beadsActorId",
  "boundAtUtc",
  "boundBy",
] as const;

function isCompleteVerifiedBinding(binding: UnknownRecord): boolean {
  return (
    binding.validity === "verified" &&
    REQUIRED_BINDING_FIELDS.every((field) => string(binding[field])) &&
    hasUtcTimestamp(binding.boundAtUtc) &&
    (!String(binding.executionSurface).includes("herdr") || string(binding.herdrPaneRef))
  );
}

function exactStringSet(value: unknown, expected: string[]): boolean {
  if (!Array.isArray(value) || value.some((entry) => !string(entry))) return false;
  const actual = [...new Set(value as string[])].sort();
  return actual.length === expected.length && actual.every((entry, index) => entry === expected[index]);
}

export function validateIdentityFixture(value: unknown, attributedMessage?: unknown): ContractResult {
  const issues: ContractIssue[] = [];
  if (!isRecord(value) || !Array.isArray(value.bindings) || !Array.isArray(value.sessionBeadLinks)) {
    return result([{ code: "invalid_identity_fixture", classification: "fail" }]);
  }
  const bindings = value.bindings.filter(isRecord);
  if (bindings.length !== value.bindings.length) {
    issues.push({ code: "invalid_identity_binding", classification: "fail" });
  }
  for (const binding of bindings) {
    if (string(binding.displayName) && !string(binding.actorId) && !string(binding.senderExternalId) && !string(binding.upstreamInstanceId)) {
      issues.push({ code: "display_name_only_binding", classification: "fail" });
    }
    if (binding.validity === "verified" && !isCompleteVerifiedBinding(binding)) {
      issues.push({ code: "incomplete_verified_binding", classification: "fail" });
    }
  }

  const verified = bindings.filter((binding) => binding.validity === "verified");
  const actorSessions = new Map<string, Set<string>>();
  const sessionRoles = new Map<string, Set<string>>();
  for (const binding of verified) {
    if (string(binding.actorId) && string(binding.logicalSessionId) && string(binding.executionSurface)) {
      const values = actorSessions.get(binding.actorId) ?? new Set<string>();
      values.add(`${binding.logicalSessionId}:${binding.executionSurface}`);
      actorSessions.set(binding.actorId, values);
    }
    if (string(binding.logicalSessionId) && string(binding.role)) {
      const values = sessionRoles.get(binding.logicalSessionId) ?? new Set<string>();
      values.add(binding.role);
      sessionRoles.set(binding.logicalSessionId, values);
    }
  }
  const hasMultiSurfaceActor = [...actorSessions.values()].some((sessions) => sessions.size >= 2);
  const hasMultiRoleSession = [...sessionRoles.values()].some((roles) => roles.size >= 2);
  const beadActors = new Map<string, Set<string>>();
  for (const link of value.sessionBeadLinks.filter(isRecord)) {
    if (!string(link.logicalSessionId) || !string(link.beadId)) {
      continue;
    }
    for (const binding of verified.filter((candidate) => candidate.logicalSessionId === link.logicalSessionId && string(candidate.actorId))) {
      const actors = beadActors.get(link.beadId) ?? new Set<string>();
      actors.add(binding.actorId as string);
      beadActors.set(link.beadId, actors);
    }
  }
  const hasMultiActorBead = [...beadActors.values()].some((actors) => actors.size >= 2);
  if (!hasMultiSurfaceActor || !hasMultiRoleSession || !hasMultiActorBead) {
    issues.push({ code: "identity_fixture_not_many_to_many", classification: "fail" });
  }

  if (isRecord(attributedMessage) && attributedMessage.attributed === true) {
    const externalCandidate = bindings.find(
      (binding) =>
        binding.upstreamInstanceId === attributedMessage.providerInstanceId &&
        binding.senderExternalId === attributedMessage.senderExternalId,
    );
    if (!externalCandidate || externalCandidate.validity !== "verified") {
      issues.push({ code: "unverified_binding", classification: "unknown" });
    }
    const expectedBeads = value.sessionBeadLinks
      .filter(isRecord)
      .filter((link) => link.logicalSessionId === attributedMessage.logicalSessionId && string(link.beadId))
      .map((link) => link.beadId as string)
      .filter((beadId, index, all) => all.indexOf(beadId) === index)
      .sort();
    const exactCandidate = bindings.find(
      (binding) =>
        isCompleteVerifiedBinding(binding) &&
        binding.upstreamInstanceId === attributedMessage.providerInstanceId &&
        binding.upstreamSessionId === attributedMessage.upstreamSessionId &&
        binding.senderExternalId === attributedMessage.senderExternalId &&
        binding.actorId === attributedMessage.actorId &&
        binding.logicalSessionId === attributedMessage.logicalSessionId &&
        binding.providerModel === attributedMessage.providerModel &&
        binding.executionSurface === attributedMessage.executionSurface &&
        binding.role === attributedMessage.role &&
        binding.runtimeSessionRef === attributedMessage.runtimeSessionRef &&
        binding.beadsActorId === attributedMessage.beadsActorId,
    );
    if (!exactCandidate || !exactStringSet(attributedMessage.relatedBeadIds, expectedBeads)) {
      issues.push({ code: "unbound_attributed_message", classification: "unknown" });
    }
  }
  return result(issues);
}

function matchingPromotionEvidence(
  promotion: UnknownRecord,
  evidence: unknown,
  timestampField: "acknowledgedAtUtc" | "verifiedAtUtc",
): boolean {
  return (
    isRecord(evidence) &&
    evidence.beadsArtifactId === promotion.beadsArtifactId &&
    evidence.relatedBeadId === promotion.relatedBeadId &&
    evidence.scottyDecisionId === promotion.scottyDecisionId &&
    evidence.idempotencyKey === promotion.idempotencyKey &&
    evidence.selectedValueChecksum === promotion.selectedValueChecksum &&
    evidence[timestampField] === promotion[timestampField] &&
    hasUtcTimestamp(evidence[timestampField])
  );
}

export function validatePromotionResult(value: unknown): ContractResult {
  const issues: ContractIssue[] = [];
  if (!isRecord(value)) {
    return result([{ code: "invalid_promotion_record", classification: "fail" }]);
  }
  const required = ["relatedBeadId", "scottyDecisionId", "artifactType", "selectedValueChecksum", "beadsArtifactId"];
  if (required.some((field) => !string(value[field]))) {
    issues.push({ code: "incomplete_promotion_record", classification: "fail" });
  }
  if (!string(value.idempotencyKey) || !/^agentchattr:[^:]+:[^:]+:[^:]+$/.test(value.idempotencyKey)) {
    issues.push({ code: "invalid_promotion_idempotency_key", classification: "fail" });
  }
  if (value.result === "durable") {
    const hasTopLevelTimestamps = hasUtcTimestamp(value.acknowledgedAtUtc) && hasUtcTimestamp(value.verifiedAtUtc);
    if (!hasTopLevelTimestamps || !isRecord(value.acknowledgement) || !isRecord(value.reconciliation)) {
      issues.push({ code: "promotion_pending", classification: "unknown" });
    } else if (
      !matchingPromotionEvidence(value, value.acknowledgement, "acknowledgedAtUtc") ||
      !matchingPromotionEvidence(value, value.reconciliation, "verifiedAtUtc")
    ) {
      issues.push({ code: "reconciliation_conflict", classification: "fail" });
    }
  }
  if (Array.isArray(value.attempts) && new Set(value.attempts.filter(string)).size > 1) {
    issues.push({ code: "promotion_retry_created_second_artifact", classification: "fail" });
  }
  return result(issues);
}

export function validateDesktopResults(value: unknown): ContractResult {
  const issues: ContractIssue[] = [];
  if (!isRecord(value)) {
    return result([{ code: "invalid_desktop_results", classification: "fail" }]);
  }
  const expectedClients = {
    claudeCodeDesktop: "claude-code-desktop",
    codexDesktop: "codex-desktop",
  } as const;
  for (const [field, client] of Object.entries(expectedClients)) {
    const record = value[field];
    if (!isRecord(record) || !string(record.status)) {
      issues.push({ code: "missing_desktop_result", classification: "unsupported" });
    } else if (record.observedBy !== client) {
      issues.push({ code: "desktop_result_inferred", classification: "unknown" });
    }
  }
  return result(issues);
}

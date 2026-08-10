import { describe, expect, it } from "vitest";

import identityFixture from "./fixtures/identity-bindings.json";
import messageFixture from "./fixtures/message-contract.json";
import {
  APPROVED_UPSTREAM_PIN,
  createLoopGuardState,
  recordAuthenticatedHumanOrigin,
  requestAutonomousSend,
  validateDesktopResults,
  validateEvidenceManifest,
  validateIdentityFixture,
  validateMessageContract,
  validateMessagePages,
  validatePromotionResult,
} from "./spike-contract";

const validManifest = () => ({
  schemaVersion: 1,
  upstream: { ...APPROVED_UPSTREAM_PIN },
  endpoint: { host: "127.0.0.1", port: 43123 },
  resourceAdmission: {
    availablePhysicalMemoryGiB: 8,
    aggregateWorkingSetPercent: 35,
    otherResourceHeavyJobActive: false,
    runtimeManagerCorrelationToken: "admission-correlation-1",
    admitted: true,
  },
  safety: {
    lifecycleOwner: "runtime-manager",
    wrappersDisabled: true,
    triggerQueueConsumerDisabled: true,
    terminalInjectionDisabled: true,
    autoWakeDisabled: true,
    jobsIgnored: true,
    persistentRulesUnused: true,
  },
  evidence: [
    {
      caseId: "contract-smoke",
      upstreamPin: APPROVED_UPSTREAM_PIN.commit,
      hostVersion: "Windows test host",
      toolVersions: { node: "24.16.0", vitest: "4.1.10" },
      sourceArtifactHashes: { source: "sha256:source" },
      resultArtifactHashes: { result: "sha256:result" },
      expectedResult: "validator accepts sanitized contract evidence",
      observedResult: "validator accepted sanitized contract evidence",
      classification: "pass",
      provenance: "docs/superpowers/evidence/2026-08-09-scotty-agentchattr-compatibility-spike/provenance.md",
      startedAtUtc: "2026-08-10T08:00:00.000Z",
      endedAtUtc: "2026-08-10T08:00:01.000Z",
      processRecords: [
        {
          pid: 4210,
          executable: "agentchattr.exe",
          startedAtUtc: "2026-08-10T08:00:00.000Z",
        },
      ],
      teardownState: "confirmed",
    },
  ],
});

const validMessage = () => ({
  providerInstanceId: "spike-instance-1",
  channelId: "channel-disposable",
  stableMessageUid: "message-0001",
  cursorId: 7,
  parentUid: null,
  threadId: null,
  senderExternalId: "external-operator-1",
  delivery: "queued",
  directUpstreamEvidence: "sha256:queued-response",
  contentChecksum: "sha256:content",
  workState: "not_started",
  leaseState: "none",
});

describe("AgentChattr compatibility spike evidence contract", () => {
  it("accepts the synthetic many-to-many identity fixture and its permitted message vocabulary", () => {
    expect(validateIdentityFixture(identityFixture).issues).toEqual([]);
    for (const message of messageFixture.cases) {
      expect(validateMessageContract(message).issues).toEqual([]);
    }
  });

  it("rejects a non-loopback endpoint", () => {
    const manifest = validManifest();
    manifest.endpoint.host = "0.0.0.0";

    expect(validateEvidenceManifest(manifest).issues).toContainEqual(
      expect.objectContaining({ code: "non_loopback_endpoint", classification: "fail" }),
    );
  });

  it("rejects a missing or changed approved upstream pin", () => {
    const missingPin = validManifest();
    // @ts-expect-error Deliberately incomplete evidence.
    delete missingPin.upstream.commit;
    const changedPin = validManifest();
    Reflect.set(changedPin.upstream, "commit", "different-commit");

    expect(validateEvidenceManifest(missingPin).issues).toContainEqual(
      expect.objectContaining({ code: "missing_upstream_pin", classification: "fail" }),
    );
    expect(validateEvidenceManifest(changedPin).issues).toContainEqual(
      expect.objectContaining({ code: "changed_upstream_pin", classification: "fail" }),
    );
  });

  it("requires safety, resource, and sanitized evidence records", () => {
    const manifest = validManifest();
    manifest.resourceAdmission.runtimeManagerCorrelationToken = "";
    manifest.evidence[0].processRecords[0] = {
      ...manifest.evidence[0].processRecords[0],
      // @ts-expect-error Deliberately unsafe raw command line.
      commandLine: "C:\\Users\\operator\\secret.exe --token plaintext",
    };

    const issues = validateEvidenceManifest(manifest).issues;
    expect(issues).toContainEqual(
      expect.objectContaining({ code: "missing_admission_correlation", classification: "unknown" }),
    );
    expect(issues).toContainEqual(
      expect.objectContaining({ code: "raw_command_line", classification: "fail" }),
    );
  });

  it("rejects alternate-key and embedded raw evidence while accepting the approved sanitized argv pair", () => {
    const unsafeCases = [
      { launchArgumentsText: "agentchattr.exe --port 43123 --secret plaintext" },
      { authCredentialValue: "Bearer secret-value" },
      { serviceSettingsDump: "[server]\nhost=127.0.0.1\nport=43123" },
      { pendingMessagePayload: "private queued text" },
      { evidenceNote: "captured at C:\\Users\\operator\\spike\\config.toml" },
    ];

    for (const unsafe of unsafeCases) {
      const manifest = validManifest();
      Object.assign(manifest.evidence[0], unsafe);
      expect(validateEvidenceManifest(manifest).issues).toContainEqual(
        expect.objectContaining({ code: "raw_sensitive_evidence", classification: "fail" }),
      );
    }

    const sanitized = validManifest();
    Object.assign(sanitized.evidence[0].processRecords[0], {
      sanitizedArgvTemplate:
        "agentchattr.exe --data-dir <data-dir> --port <port> --secret <secret>",
      argvHash: `sha256:${"a".repeat(64)}`,
    });
    expect(validateEvidenceManifest(sanitized).issues).toEqual([]);
  });

  it("rejects an attributed message without an exact verified binding", () => {
    const fixture = {
      bindings: [
        {
          bindingId: "binding-unverified",
          actorId: "actor-a",
          logicalSessionId: "session-a",
          executionSurface: "claude-desktop",
          role: "participant",
          runtimeSessionRef: "runtime-a",
          upstreamInstanceId: "spike-instance-1",
          senderExternalId: "external-a",
          displayName: "Operator",
          beadsActorId: "beads-a",
          boundAtUtc: "2026-08-10T08:00:00.000Z",
          boundBy: "operator",
          validity: "unverified",
        },
      ],
      sessionBeadLinks: [],
    };

    expect(validateIdentityFixture(fixture, { ...validMessage(), attributed: true }).issues).toContainEqual(
      expect.objectContaining({ code: "unverified_binding", classification: "unknown" }),
    );
  });

  it("rejects attribution through a verified binding missing independently bound dimensions", () => {
    const fixture = structuredClone(identityFixture);
    Reflect.deleteProperty(fixture.bindings[0], "providerModel");
    const attributed = {
      ...validMessage(),
      attributed: true,
      providerInstanceId: "spike-instance-synthetic",
      senderExternalId: "external-synthetic-a-claude",
      actorId: "actor-synthetic-a",
      logicalSessionId: "session-coordination",
      providerModel: "claude-code",
      upstreamSessionId: "upstream-session-claude-a",
      executionSurface: "claude-code-desktop",
      role: "participant",
      runtimeSessionRef: "runtime-session-synthetic-a",
      beadsActorId: "beads-actor-synthetic-a",
      relatedBeadIds: ["synthetic-review-bead", "synthetic-spike-bead"],
    };

    const issues = validateIdentityFixture(fixture, attributed).issues;
    expect(issues).toContainEqual(
      expect.objectContaining({ code: "incomplete_verified_binding", classification: "fail" }),
    );
    expect(issues).toContainEqual(
      expect.objectContaining({ code: "unbound_attributed_message", classification: "unknown" }),
    );

    expect(validateIdentityFixture(identityFixture, attributed).issues).toEqual([]);
    expect(
      validateIdentityFixture(identityFixture, {
        ...attributed,
        relatedBeadIds: ["synthetic-spike-bead"],
      }).issues,
    ).toContainEqual(
      expect.objectContaining({ code: "unbound_attributed_message", classification: "unknown" }),
    );
  });

  it("requires the attributed Beads actor to match the independently verified binding", () => {
    const attributed = {
      ...validMessage(),
      attributed: true,
      providerInstanceId: "spike-instance-synthetic",
      senderExternalId: "external-synthetic-a-claude",
      actorId: "actor-synthetic-a",
      logicalSessionId: "session-coordination",
      providerModel: "claude-code",
      upstreamSessionId: "upstream-session-claude-a",
      executionSurface: "claude-code-desktop",
      role: "participant",
      runtimeSessionRef: "runtime-session-synthetic-a",
      relatedBeadIds: ["synthetic-review-bead", "synthetic-spike-bead"],
    };

    expect(validateIdentityFixture(identityFixture, attributed).issues).toContainEqual(
      expect.objectContaining({ code: "unbound_attributed_message", classification: "unknown" }),
    );
    expect(
      validateIdentityFixture(identityFixture, {
        ...attributed,
        beadsActorId: "beads-actor-synthetic-b",
      }).issues,
    ).toContainEqual(
      expect.objectContaining({ code: "unbound_attributed_message", classification: "unknown" }),
    );
  });

  it("rejects display-name-only bindings", () => {
    const fixture = {
      bindings: [
        {
          bindingId: "display-name-only",
          displayName: "Operator",
          validity: "verified",
        },
      ],
      sessionBeadLinks: [],
    };

    expect(validateIdentityFixture(fixture).issues).toContainEqual(
      expect.objectContaining({ code: "display_name_only_binding", classification: "fail" }),
    );
  });

  it("rejects a one-to-one actor, session, and Bead fixture", () => {
    const fixture = {
      bindings: [
        {
          bindingId: "only-binding",
          actorId: "actor-a",
          logicalSessionId: "session-a",
          executionSurface: "claude-desktop",
          role: "participant",
          runtimeSessionRef: "runtime-a",
          upstreamInstanceId: "spike-instance-1",
          senderExternalId: "external-a",
          displayName: "Operator A",
          beadsActorId: "beads-a",
          boundAtUtc: "2026-08-10T08:00:00.000Z",
          boundBy: "operator",
          validity: "verified",
        },
      ],
      sessionBeadLinks: [{ logicalSessionId: "session-a", beadId: "bead-1" }],
    };

    expect(validateIdentityFixture(fixture).issues).toContainEqual(
      expect.objectContaining({ code: "identity_fixture_not_many_to_many", classification: "fail" }),
    );
  });

  it("rejects a cursor ID used as a durable message UID", () => {
    const message = { ...validMessage(), stableMessageUid: 7, durableKey: "cursor:7" };

    expect(validateMessageContract(message).issues).toContainEqual(
      expect.objectContaining({ code: "cursor_used_as_uid", classification: "fail" }),
    );
  });

  it("classifies an unobserved delivery or read state as unknown", () => {
    const message = { ...validMessage(), delivery: "read", directUpstreamEvidence: undefined };

    expect(validateMessageContract(message).issues).toContainEqual(
      expect.objectContaining({ code: "unobserved_delivery_state", classification: "unknown" }),
    );
  });

  it("rejects duplicate stable UIDs across overlapping pages", () => {
    const duplicate = validMessage();

    expect(validateMessagePages([[duplicate], [{ ...duplicate, cursorId: 8 }]]).issues).toContainEqual(
      expect.objectContaining({ code: "duplicate_message_uid", classification: "fail" }),
    );
  });

  it("allows the sixth autonomous send before MCP, rejects the seventh locally, and only resets on verified human proof", () => {
    let state = createLoopGuardState("channel-disposable");
    let sixth: ReturnType<typeof requestAutonomousSend> | undefined;
    for (let index = 0; index < 6; index += 1) {
      const decision = requestAutonomousSend(state);
      expect(decision.allowed).toBe(true);
      state = decision.state;
      if (index === 5) sixth = decision;
    }
    expect(sixth).toMatchObject({
      allowed: true,
      rejectedBeforeMcp: false,
      mcpInvocationAllowed: true,
      state: { phase: "paused", autonomousCount: 6 },
    });

    const seventh = requestAutonomousSend(state);
    expect(seventh).toMatchObject({
      allowed: false,
      rejectedBeforeMcp: true,
      mcpInvocationAllowed: false,
      state: { phase: "paused", autonomousCount: 6 },
    });

    const validHumanEvidence = {
      origin: "human",
      authenticated: true,
      identityVerified: true,
      providerInstanceId: "spike-instance-1",
      channelId: "channel-disposable",
      stableMessageUid: "human-message-1",
      observedAtUtc: "2026-08-10T08:05:00.000Z",
      directUpstreamEvidence: "sha256:authenticated-human-event",
    };
    for (const invalid of [
      { ...validHumanEvidence, authenticated: false },
      { ...validHumanEvidence, origin: "agent" },
      { ...validHumanEvidence, origin: "/continue" },
    ]) {
      expect(recordAuthenticatedHumanOrigin(seventh.state, invalid)).toMatchObject({
        reset: false,
        state: { phase: "paused", autonomousCount: 6 },
      });
    }

    expect(
      recordAuthenticatedHumanOrigin(seventh.state, validHumanEvidence),
    ).toMatchObject({ reset: true, state: { phase: "active", autonomousCount: 0 } });
  });

  it("rejects a queued mention marked as work or a lease", () => {
    const message = { ...validMessage(), mention: true, workState: "started", leaseState: "claimed" };

    expect(validateMessageContract(message).issues).toContainEqual(
      expect.objectContaining({ code: "message_implies_work_or_lease", classification: "fail" }),
    );
  });

  it("keeps promotion pending until a matching Beads artifact is acknowledged", () => {
    const promotion = {
      relatedBeadId: "spike-bead-1",
      scottyDecisionId: "decision-1",
      artifactType: "review_verdict",
      selectedValueChecksum: "sha256:value",
      idempotencyKey: "agentchattr:spike-instance-1:message-0001:approve",
      beadsArtifactId: "beads-comment-1",
      acknowledgedAtUtc: null,
      verifiedAtUtc: null,
      result: "durable",
    };

    expect(validatePromotionResult(promotion).issues).toContainEqual(
      expect.objectContaining({ code: "promotion_pending", classification: "unknown" }),
    );
  });

  it("rejects durable promotion when acknowledgement or reconciliation identifies another Beads artifact", () => {
    const promotion = {
      relatedBeadId: "spike-bead-1",
      scottyDecisionId: "decision-1",
      artifactType: "approval",
      selectedValueChecksum: "sha256:value",
      idempotencyKey: "agentchattr:spike-instance-1:message-0001:approve",
      beadsArtifactId: "beads-comment-1",
      acknowledgedAtUtc: "2026-08-10T08:00:01.000Z",
      verifiedAtUtc: "2026-08-10T08:00:02.000Z",
      result: "durable",
      acknowledgement: {
        beadsArtifactId: "beads-comment-2",
        relatedBeadId: "spike-bead-1",
        scottyDecisionId: "decision-1",
        idempotencyKey: "agentchattr:spike-instance-1:message-0001:approve",
        selectedValueChecksum: "sha256:value",
        acknowledgedAtUtc: "2026-08-10T08:00:01.000Z",
      },
      reconciliation: {
        beadsArtifactId: "beads-comment-1",
        relatedBeadId: "spike-bead-1",
        scottyDecisionId: "decision-1",
        idempotencyKey: "agentchattr:spike-instance-1:message-0001:approve",
        selectedValueChecksum: "sha256:value",
        verifiedAtUtc: "2026-08-10T08:00:02.000Z",
      },
      attempts: ["beads-comment-1", "beads-comment-1"],
    };

    expect(validatePromotionResult(promotion).issues).toContainEqual(
      expect.objectContaining({ code: "reconciliation_conflict", classification: "fail" }),
    );

    const matching = structuredClone(promotion);
    matching.acknowledgement.beadsArtifactId = "beads-comment-1";
    expect(validatePromotionResult(matching).issues).toEqual([]);
  });

  it("rejects a retry that creates a second Beads artifact", () => {
    const promotion = {
      relatedBeadId: "spike-bead-1",
      scottyDecisionId: "decision-1",
      artifactType: "approval",
      selectedValueChecksum: "sha256:value",
      idempotencyKey: "agentchattr:spike-instance-1:message-0001:approve",
      beadsArtifactId: "beads-comment-1",
      acknowledgedAtUtc: "2026-08-10T08:00:01.000Z",
      verifiedAtUtc: "2026-08-10T08:00:02.000Z",
      result: "durable",
      attempts: ["beads-comment-1", "beads-comment-2"],
    };

    expect(validatePromotionResult(promotion).issues).toContainEqual(
      expect.objectContaining({ code: "promotion_retry_created_second_artifact", classification: "fail" }),
    );
  });

  it("rejects a Desktop result inferred from the other Desktop client", () => {
    const results = {
      claudeCodeDesktop: { status: "pass", observedBy: "claude-code-desktop" },
      codexDesktop: { status: "pass", observedBy: "claude-code-desktop" },
    };

    expect(validateDesktopResults(results).issues).toContainEqual(
      expect.objectContaining({ code: "desktop_result_inferred", classification: "unknown" }),
    );
  });

  it("rejects sensitive assignments, absolute paths, and headerless config embedded in neutral fields", () => {
    const unsafeValues = [
      { note: "token=plaintext" },
      { artifactDescription: "C:\\ProgramData\\AgentChattr\\config.toml" },
      { observation: "host=127.0.0.1\nport=43123" },
      { nested: { metadata: "api_key: plaintext-value" } },
      { nested: { launchText: "agentchattr.exe --port 43123" } },
      { neutral: "# captured configuration\nhost=127.0.0.1\nport=43123" },
      { neutral: { host: "127.0.0.1", port: 43123 } },
    ];

    for (const unsafe of unsafeValues) {
      const manifest = validManifest();
      Object.assign(manifest.evidence[0], unsafe);
      expect(validateEvidenceManifest(manifest).issues).toContainEqual(
        expect.objectContaining({ code: "raw_sensitive_evidence", classification: "fail" }),
      );
    }
  });

  it("rejects colon-format raw config and drive paths after non-whitespace separators", () => {
    for (const unsafe of [
      { note: "host: 127.0.0.1\nport: 43123" },
      { note: "HOST : 127.0.0.1\nPORT : 43123" },
      { note: "location=C:\\ProgramData\\AgentChattr\\config.toml" },
      { nested: { detail: "artifact|c:\\ProgramData\\AgentChattr\\config.toml" } },
    ]) {
      const manifest = validManifest();
      Object.assign(manifest.evidence[0], unsafe);
      expect(validateEvidenceManifest(manifest).issues).toContainEqual(
        expect.objectContaining({ code: "raw_sensitive_evidence", classification: "fail" }),
      );
    }
  });

  it("restricts evidence classifications and rejects inferred message, work, lease, and task authority", () => {
    const invalidClassification = validManifest();
    invalidClassification.evidence[0].classification = "delivered";
    expect(validateEvidenceManifest(invalidClassification).issues).toContainEqual(
      expect.objectContaining({ code: "invalid_evidence_classification", classification: "fail" }),
    );

    for (const inferred of [
      { messageStatus: "delivered" },
      { messageStatus: "read" },
      { workStatus: "work_started" },
      { leaseState: "claimed" },
      { taskAuthority: "assigned" },
    ]) {
      const manifest = validManifest();
      Object.assign(manifest.evidence[0], inferred);
      expect(validateEvidenceManifest(manifest).issues).toContainEqual(
        expect.objectContaining({ code: "inferred_authority_status", classification: "fail" }),
      );
    }
  });

  it("rejects nested semantic aliases for delivery, read, lease, approval, and handoff authority", () => {
    for (const inferred of [
      { delivery: "delivered" },
      { read: true },
      { nested: { lease: "claimed" } },
      { nested: { approval: "granted" } },
      { nested: { handoff: "complete" } },
      { nested: { reportedLeaseClaim: "claimed" } },
      { nested: { approvalOutcome: "granted" } },
      { nested: { handoffResolution: "complete" } },
    ]) {
      const manifest = validManifest();
      Object.assign(manifest.evidence[0], inferred);
      expect(validateEvidenceManifest(manifest).issues).toContainEqual(
        expect.objectContaining({ code: "inferred_authority_status", classification: "fail" }),
      );
    }

    const neutral = validManifest();
    Object.assign(neutral.evidence[0], {
      transport: { delivery: "unknown", read: false },
      authority: { work: "not_started", lease: "none", approval: "unknown", handoff: "unknown" },
    });
    expect(validateEvidenceManifest(neutral).issues).toEqual([]);
  });

  it("rejects delivery receipt and read confirmation families across case and separators", () => {
    for (const inferred of [
      { deliveryReceipt: "delivered" },
      { readConfirmation: true },
      { nested: { reported_delivery_receipt: "delivered" } },
      { nested: { "READ-CONFIRMATION": true } },
      { nested: { transportDeliveryAcknowledgement: "accepted" } },
    ]) {
      const manifest = validManifest();
      Object.assign(manifest.evidence[0], inferred);
      expect(validateEvidenceManifest(manifest).issues).toContainEqual(
        expect.objectContaining({ code: "inferred_authority_status", classification: "fail" }),
      );
    }

    const neutral = validManifest();
    Object.assign(neutral.evidence[0], {
      transport: { deliveryReceipt: "unknown", readConfirmation: false },
    });
    expect(validateEvidenceManifest(neutral).issues).toEqual([]);
  });
});

import { describe, expect, it } from "vitest";

import identityFixture from "./fixtures/identity-bindings.json";
import messageFixture from "./fixtures/message-contract.json";
import {
  APPROVED_UPSTREAM_PIN,
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

  it("rejects a seventh autonomous agent message", () => {
    expect(validateMessageContract({ ...validMessage(), autonomousAgentMessages: 7 }).issues).toContainEqual(
      expect.objectContaining({ code: "autonomous_send_limit_exceeded", classification: "fail" }),
    );
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
});

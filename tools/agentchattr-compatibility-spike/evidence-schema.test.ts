import { describe, expect, it } from "vitest";
import {
  caseIdSchema,
  evidenceArtifactSchema,
  evidenceProvenanceSchema,
  safeExtensionsSchema,
  safeRefSchema,
  sha256Schema,
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

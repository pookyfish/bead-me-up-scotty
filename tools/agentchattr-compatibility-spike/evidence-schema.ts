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

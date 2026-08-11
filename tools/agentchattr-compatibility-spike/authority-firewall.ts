export const authoritySurfaces = [
  "beads",
  "supervisor_appointments",
  "dispatch_configuration",
  "execution_leases",
  "runtime_manager_definitions",
  "git_state",
] as const;

export type AuthoritySurface = typeof authoritySurfaces[number];

export const authorityMechanisms = [
  "callback",
  "plugin",
  "extension",
  "configuration",
  "http",
  "mcp",
  "message",
  "mention",
] as const;

export type AuthoritySnapshot = {
  surface: AuthoritySurface;
  digest: string;
  inventoryCount: number;
};

export type AuthorityInvocation = {
  mechanism: typeof authorityMechanisms[number];
  surface: AuthoritySurface;
  result: "rejected" | "inert" | "invoked" | "unknown";
  externalProcessCount: number;
};

export type AuthorityFirewallInput = {
  before: AuthoritySnapshot[];
  after: AuthoritySnapshot[];
  invocations: AuthorityInvocation[];
};

export type AuthorityFirewallIssue =
  | {
    surface: AuthoritySurface;
    code: "snapshot_missing" | "snapshot_duplicate" | "authority_mutated";
  }
  | {
    surface: AuthoritySurface;
    mechanism: AuthorityInvocation["mechanism"];
    code: "invocation_missing" | "invocation_duplicate" | "authority_invoked"
      | "invocation_unknown" | "external_process_created";
  };

export type AuthorityFirewallResult = {
  classification: "pass" | "fail" | "unknown";
  issues: AuthorityFirewallIssue[];
};

const failCodes = new Set<AuthorityFirewallIssue["code"]>([
  "snapshot_duplicate",
  "authority_mutated",
  "invocation_missing",
  "invocation_duplicate",
  "authority_invoked",
  "external_process_created",
]);

function classifyAuthorityFirewall(issues: AuthorityFirewallIssue[]): AuthorityFirewallResult {
  if (issues.some((issue) => failCodes.has(issue.code))) {
    return { classification: "fail", issues };
  }
  if (issues.length > 0) {
    return { classification: "unknown", issues };
  }
  return { classification: "pass", issues };
}

export function evaluateAuthorityFirewall(input: AuthorityFirewallInput): AuthorityFirewallResult {
  const issues: AuthorityFirewallIssue[] = [];

  for (const surface of authoritySurfaces) {
    const before = input.before.filter((item) => item.surface === surface);
    const after = input.after.filter((item) => item.surface === surface);
    if (before.length === 0 || after.length === 0) {
      issues.push({ surface, code: "snapshot_missing" });
    } else if (before.length !== 1 || after.length !== 1) {
      issues.push({ surface, code: "snapshot_duplicate" });
    } else if (before[0].digest !== after[0].digest
      || before[0].inventoryCount !== after[0].inventoryCount) {
      issues.push({ surface, code: "authority_mutated" });
    }
  }

  for (const surface of authoritySurfaces) {
    for (const mechanism of authorityMechanisms) {
      const invocations = input.invocations.filter((item) => item.surface === surface
        && item.mechanism === mechanism);
      if (invocations.length === 0) {
        issues.push({ surface, mechanism, code: "invocation_missing" });
        continue;
      }
      if (invocations.length !== 1) {
        issues.push({ surface, mechanism, code: "invocation_duplicate" });
        continue;
      }

      const invocation = invocations[0];
      if (invocation.externalProcessCount > 0) {
        issues.push({ surface, mechanism, code: "external_process_created" });
      }
      if (invocation.result === "invoked") {
        issues.push({ surface, mechanism, code: "authority_invoked" });
      } else if (invocation.result === "unknown") {
        issues.push({ surface, mechanism, code: "invocation_unknown" });
      }
    }
  }

  return classifyAuthorityFirewall(issues);
}

import { describe, expect, it } from "vitest";

import committedFixture from "./fixtures/authority-firewall.json";
import {
  authorityMechanisms,
  authoritySurfaces,
  evaluateAuthorityFirewall,
  type AuthorityFirewallInput,
} from "./authority-firewall";

function fixture(): AuthorityFirewallInput {
  return structuredClone(committedFixture) as AuthorityFirewallInput;
}

describe("typed authority-mutation firewall", () => {
  it("passes identical snapshots and one rejected or inert attempt for every closed pair", () => {
    const result = evaluateAuthorityFirewall(fixture());

    expect(committedFixture.before).toHaveLength(6);
    expect(committedFixture.after).toHaveLength(6);
    expect(committedFixture.invocations).toHaveLength(48);
    expect(result).toEqual({ classification: "pass", issues: [] });
  });

  it("fails a changed digest at the exact authority surface", () => {
    const input = fixture();
    input.after = input.after.map((snapshot) => snapshot.surface === "dispatch_configuration"
      ? { ...snapshot, digest: `sha256:${"0".repeat(64)}` }
      : snapshot);

    expect(evaluateAuthorityFirewall(input)).toEqual({
      classification: "fail",
      issues: [{ surface: "dispatch_configuration", code: "authority_mutated" }],
    });
  });

  it("fails a changed inventory count", () => {
    const input = fixture();
    input.after = input.after.map((snapshot) => snapshot.surface === "execution_leases"
      ? { ...snapshot, inventoryCount: snapshot.inventoryCount + 1 }
      : snapshot);

    expect(evaluateAuthorityFirewall(input).issues).toContainEqual({
      surface: "execution_leases",
      code: "authority_mutated",
    });
  });

  it("fails an invoked attempt even when the snapshots match", () => {
    const input = fixture();
    input.invocations = input.invocations.map((invocation) => invocation.surface === "beads"
      && invocation.mechanism === "plugin" ? { ...invocation, result: "invoked" } : invocation);

    expect(evaluateAuthorityFirewall(input).issues).toContainEqual({
      surface: "beads",
      mechanism: "plugin",
      code: "authority_invoked",
    });
    expect(evaluateAuthorityFirewall(input).classification).toBe("fail");
  });

  it("classifies an unknown attempt as unknown and never pass", () => {
    const input = fixture();
    input.invocations = input.invocations.map((invocation) => invocation.surface === "git_state"
      && invocation.mechanism === "mention" ? { ...invocation, result: "unknown" } : invocation);

    expect(evaluateAuthorityFirewall(input)).toEqual({
      classification: "unknown",
      issues: [{ surface: "git_state", mechanism: "mention", code: "invocation_unknown" }],
    });
  });

  it("fails any attempt that creates an external process", () => {
    const input = fixture();
    input.invocations = input.invocations.map((invocation) => invocation.surface === "runtime_manager_definitions"
      && invocation.mechanism === "callback" ? { ...invocation, externalProcessCount: 1 } : invocation);

    expect(evaluateAuthorityFirewall(input).issues).toContainEqual({
      surface: "runtime_manager_definitions",
      mechanism: "callback",
      code: "external_process_created",
    });
    expect(evaluateAuthorityFirewall(input).classification).toBe("fail");
  });

  it("requires each of the six surfaces by eight mechanisms exactly once", () => {
    const expectedPairs = authoritySurfaces.flatMap((surface) => authorityMechanisms.map(
      (mechanism) => `${surface}:${mechanism}`,
    ));
    const actualPairs = committedFixture.invocations.map(
      (invocation) => `${invocation.surface}:${invocation.mechanism}`,
    );

    expect(actualPairs).toEqual(expectedPairs);
    expect(new Set(actualPairs).size).toBe(48);
  });

  it("fails duplicate and missing invocation pairs", () => {
    const missing = fixture();
    missing.invocations = missing.invocations.slice(1);
    expect(evaluateAuthorityFirewall(missing).issues).toContainEqual({
      surface: "beads",
      mechanism: "callback",
      code: "invocation_missing",
    });
    expect(evaluateAuthorityFirewall(missing).classification).toBe("fail");

    const duplicate = fixture();
    duplicate.invocations = [...duplicate.invocations, duplicate.invocations[0]];
    expect(evaluateAuthorityFirewall(duplicate).issues).toContainEqual({
      surface: "beads",
      mechanism: "callback",
      code: "invocation_duplicate",
    });
    expect(evaluateAuthorityFirewall(duplicate).classification).toBe("fail");
  });

  it("does not interpret authority-looking x-* extensions", () => {
    const baseline = evaluateAuthorityFirewall(fixture());
    const extended = {
      ...fixture(),
      extensions: {
        "x-supervisor-authority": "enabled",
        "x-beads-mutation": "present",
        "x-git-token": `sha256:${"9".repeat(64)}`,
      },
    } as AuthorityFirewallInput;

    expect(evaluateAuthorityFirewall(extended)).toEqual(baseline);
  });
});

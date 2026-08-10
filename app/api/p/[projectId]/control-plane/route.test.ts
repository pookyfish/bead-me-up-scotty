import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("../../../../../lib/control-plane/snapshot", () => ({ buildControlPlaneSnapshot: vi.fn() }));
import { buildControlPlaneSnapshot } from "../../../../../lib/control-plane/snapshot";
import { ConfigError } from "../../../../../lib/config";
import { GET } from "./route";

describe("GET /api/p/:projectId/control-plane", () => {
  it("returns the snapshot response", async () => {
    vi.mocked(buildControlPlaneSnapshot).mockResolvedValue({ generatedAt: "2026-08-09T21:00:00.000Z" } as never);
    const response = await GET(new Request("http://localhost"), { params: Promise.resolve({ projectId: "demo" }) });
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ generatedAt: "2026-08-09T21:00:00.000Z" });
  });

  it("keeps unknown projects in the existing 404 envelope", async () => {
    vi.mocked(buildControlPlaneSnapshot).mockRejectedValue(new ConfigError("Unknown project: missing", "unknown_project"));
    const response = await GET(new Request("http://localhost"), { params: Promise.resolve({ projectId: "missing" }) });
    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toMatchObject({ code: "unknown_project" });
  });
});

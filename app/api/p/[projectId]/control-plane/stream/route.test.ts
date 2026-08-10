import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("../../../../../../lib/config", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../../../../../lib/config")>()),
  getProject: vi.fn(),
}));
vi.mock("../../../../../../lib/orchestra-watch", () => ({ subscribeOrchestraChange: vi.fn() }));
import { getProject } from "../../../../../../lib/config";
import { subscribeOrchestraChange } from "../../../../../../lib/orchestra-watch";
import { GET } from "./route";

describe("GET /api/p/:projectId/control-plane/stream", () => {
  it("returns the existing 404 envelope for an unknown project", async () => {
    vi.mocked(getProject).mockReturnValue(undefined);
    const response = await GET(new Request("http://localhost"), { params: Promise.resolve({ projectId: "missing" }) });
    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toMatchObject({ code: "unknown_project" });
    expect(subscribeOrchestraChange).not.toHaveBeenCalled();
  });

  it("returns no content for Demo without creating a watcher", async () => {
    vi.mocked(getProject).mockReturnValue({ id: "demo", name: "Demo", path: null });
    const response = await GET(new Request("http://localhost"), { params: Promise.resolve({ projectId: "demo" }) });
    expect(response.status).toBe(204);
    expect(subscribeOrchestraChange).not.toHaveBeenCalled();
  });

  it("subscribes a real project and emits only the orchestra invalidation", async () => {
    let emit: (() => void) | undefined;
    const abort = new AbortController();
    vi.mocked(getProject).mockReturnValue({
      id: "project",
      name: "Project",
      path: "C:/repo",
      addedAt: "2026-08-09T22:00:00.000Z",
      lastOpened: "2026-08-09T22:00:00.000Z",
    });
    vi.mocked(subscribeOrchestraChange).mockImplementation((_projectId, onChange) => { emit = onChange; return () => {}; });
    const response = await GET(new Request("http://localhost", { signal: abort.signal }), { params: Promise.resolve({ projectId: "project" }) });
    const reader = response.body?.getReader();
    try {
      emit?.();
      const first = await reader?.read();
      const second = await reader?.read();
      const decode = new TextDecoder();
      const output = `${first?.value ? decode.decode(first.value) : ""}${second?.value ? decode.decode(second.value) : ""}`;
      expect(output).toContain("event: change\ndata: orchestra\n\n");
      expect(output).not.toContain("active_work");
    } finally {
      abort.abort();
      await reader?.cancel();
    }
  });
});

import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("../../../../../../lib/config", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../../../../../lib/config")>()),
  getProject: vi.fn(),
}));
vi.mock("../../../../../../lib/beads-watch", () => ({ subscribeBeadsChange: vi.fn() }));
import { getProject } from "../../../../../../lib/config";
import { subscribeBeadsChange } from "../../../../../../lib/beads-watch";
import { GET } from "./route";

describe("GET /api/p/:projectId/beads/stream", () => {
  it("preserves exact signal headers and the data: 1 payload through a real response body", async () => {
    let emit: (() => void) | undefined;
    const abort = new AbortController();
    vi.mocked(getProject).mockReturnValue({
      id: "project",
      name: "Project",
      path: "C:/repo",
      addedAt: "2026-08-09T22:00:00.000Z",
      lastOpened: "2026-08-09T22:00:00.000Z",
    });
    vi.mocked(subscribeBeadsChange).mockImplementation((_projectId, onChange) => {
      emit = onChange;
      return () => {};
    });
    const response = await GET(
      new Request("http://localhost", { signal: abort.signal }),
      { params: Promise.resolve({ projectId: "project" }) },
    );
    const reader = response.body?.getReader();
    try {
      expect(response.headers.get("Content-Type")).toBe("text/event-stream");
      expect(response.headers.get("Cache-Control")).toBe("no-cache, no-transform");
      expect(response.headers.get("Connection")).toBe("keep-alive");
      emit?.();
      const decoder = new TextDecoder();
      const first = await reader?.read();
      const second = await reader?.read();
      const output = `${first?.value ? decoder.decode(first.value) : ""}${second?.value ? decoder.decode(second.value) : ""}`;
      expect(output).toContain("event: change\ndata: 1\n\n");
    } finally {
      abort.abort();
      await reader?.cancel();
    }
  });
});

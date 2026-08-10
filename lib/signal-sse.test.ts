import { describe, expect, it, vi } from "vitest";
import { createSignalSseResponse } from "./signal-sse";
import { signalHarness } from "./signal-sse-test-helpers";

describe("signal SSE lifecycle", () => {
  it("emits source ids without domain state", async () => {
    const harness = signalHarness();
    const response = createSignalSseResponse(harness.request, harness.subscribe, harness.deps);
    const reader = harness.readerFor(response);
    try {
      harness.emit("orchestra");
      const chunk = await reader.readUntil("orchestra", 1000);
      expect(chunk).toContain("event: change\ndata: orchestra\n\n");
      expect(chunk).not.toContain("active_work");
    } finally {
      harness.abort();
      await reader.cancel();
    }
  });

  it("cleans subscribe, heartbeat, and global registration exactly once", async () => {
    const harness = signalHarness();
    const response = createSignalSseResponse(harness.request, harness.subscribe, harness.deps);
    const reader = harness.readerFor(response);
    try {
      harness.abort();
      harness.abort();
      expect(harness.unsubscribeCount()).toBe(1);
      expect(harness.unregisterCount()).toBe(1);
      expect(harness.clearedHeartbeatCount()).toBe(1);
    } finally {
      await reader.cancel();
    }
  });

  it.each(["request-abort", "reader-cancel", "shutdown", "enqueue-failure"] as const)("cleans every %s path exactly once", async (mode) => {
    const harness = signalHarness({ mode });
    const response = createSignalSseResponse(harness.request, harness.subscribe, harness.deps);
    const reader = harness.readerFor(response);
    try {
      await harness.trigger(mode);
    } finally {
      await reader.cancel();
      await harness.dispose();
    }
    expect(harness.unsubscribeCount()).toBe(1);
    expect(harness.unregisterCount()).toBe(1);
    expect(harness.clearedHeartbeatCount()).toBe(1);
    expect(harness.openTimerCount()).toBe(0);
  });

  it.each(["heartbeat", "unsubscribe", "unregister"] as const)("continues idempotent cleanup when %s cleanup throws", async (cleanupThrows) => {
    const harness = signalHarness({ cleanupThrows });
    const response = createSignalSseResponse(harness.request, harness.subscribe, harness.deps);
    const reader = harness.readerFor(response);
    try {
      await expect(harness.trigger("shutdown")).resolves.toBeUndefined();
      await expect(harness.trigger("shutdown")).resolves.toBeUndefined();
      expect(harness.unsubscribeCount()).toBe(1);
      expect(harness.unregisterCount()).toBe(1);
      expect(harness.clearedHeartbeatCount()).toBe(1);
      expect(harness.openTimerCount()).toBe(0);
    } finally {
      await reader.cancel();
      await harness.dispose();
    }
  });

  it.each(["request-abort", "reader-cancel"] as const)("does not leak cleanup errors through %s", async (mode) => {
    const harness = signalHarness({ cleanupThrows: "unsubscribe" });
    const response = createSignalSseResponse(harness.request, harness.subscribe, harness.deps);
    const reader = harness.readerFor(response);
    try {
      await expect(harness.trigger(mode)).resolves.toBeUndefined();
      expect(harness.unregisterCount()).toBe(1);
      expect(harness.clearedHeartbeatCount()).toBe(1);
    } finally {
      await reader.cancel();
      await harness.dispose();
    }
  });

  it("cleans up after an actual controller enqueue failure without cancelling first", async () => {
    const harness = signalHarness();
    const response = createSignalSseResponse(harness.request, harness.subscribe, harness.deps);
    const reader = harness.readerFor(response);
    const enqueue = vi.spyOn(ReadableStreamDefaultController.prototype, "enqueue").mockImplementationOnce(() => {
      throw new Error("enqueue failed");
    });
    try {
      expect(() => harness.emit("orchestra")).not.toThrow();
      expect(harness.unsubscribeCount()).toBe(1);
      expect(harness.unregisterCount()).toBe(1);
      expect(harness.clearedHeartbeatCount()).toBe(1);
      expect(harness.openTimerCount()).toBe(0);
    } finally {
      enqueue.mockRestore();
      await reader.cancel();
      await harness.dispose();
    }
  });

  it("cleans registration when subscribe throws", async () => {
    const harness = signalHarness({ subscribeThrows: true });
    try {
      expect(() => createSignalSseResponse(harness.request, harness.subscribe, harness.deps)).toThrow("subscribe failed");
      expect(harness.cleanupCounts()).toEqual({ unsubscribe: 0, unregister: 1, heartbeat: 0 });
    } finally {
      await harness.dispose();
    }
  });

  it("preserves the Beads data: 1 contract", async () => {
    const harness = signalHarness();
    const response = createSignalSseResponse(harness.request, harness.subscribe, harness.deps);
    const reader = harness.readerFor(response);
    try {
      harness.emit("1");
      expect(await reader.readUntil("data: 1", 1000)).toContain("event: change\ndata: 1\n\n");
    } finally {
      await reader.cancel();
      await harness.dispose();
    }
  });
});

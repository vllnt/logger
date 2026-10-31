import { describe, expect, it, vi } from "vitest";
import { createPostHogOutput } from "../src/posthog.js";

describe("createPostHogOutput", () => {
  it("calls capture with event and properties (AC-4)", () => {
    const capture = vi.fn();
    const output = createPostHogOutput(capture);

    output({
      event: "auth.login",
      level: "info",
      timestamp: "2026-01-01T00:00:00Z",
      userId: "123",
    });

    expect(capture).toHaveBeenCalledOnce();
    expect(capture).toHaveBeenCalledWith("auth.login", {
      level: "info",
      timestamp: "2026-01-01T00:00:00Z",
      userId: "123",
    });
  });

  it("swallows capture errors (AC-E2)", () => {
    const capture = vi.fn().mockImplementation(() => {
      throw new Error("PostHog SDK error");
    });
    const output = createPostHogOutput(capture);

    expect(() =>
      output({
        event: "test",
        level: "info",
        timestamp: "2026-01-01T00:00:00Z",
      }),
    ).not.toThrow();
  });

  it("handles rejected promises returned by capture", async () => {
    const rejected = Promise.reject(new Error("network"));
    const catchSpy = vi.spyOn(rejected, "catch");
    const output = createPostHogOutput(() => rejected);

    expect(() =>
      output({
        event: "test",
        level: "info",
        timestamp: "2026-01-01T00:00:00Z",
      }),
    ).not.toThrow();

    expect(catchSpy).toHaveBeenCalledOnce();
    await expect(rejected).rejects.toThrow("network");
  });

  it("ignores a capture result whose then getter throws", () => {
    const output = createPostHogOutput(() => ({
      get then(): never {
        throw new Error("getter");
      },
    }));

    expect(() =>
      output({
        event: "test",
        level: "info",
        timestamp: "2026-01-01T00:00:00Z",
      }),
    ).not.toThrow();
  });
});

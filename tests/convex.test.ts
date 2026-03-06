import { describe, expect, it, vi } from "vitest";
import { createConvexLogger } from "../src/convex.js";

describe("createConvexLogger", () => {
  it("works without process global (AC-3, FH-1)", () => {
    vi.spyOn(console, "info").mockImplementation(() => {});

    const saved = globalThis.process;
    // @ts-expect-error — intentionally removing process for isolation test
    delete globalThis.process;

    try {
      const logger = createConvexLogger("convex-fn");
      logger.info("test");
      expect(console.info).toHaveBeenCalledOnce();
    } finally {
      globalThis.process = saved;
    }
  });

  it("uses provided log level", () => {
    const infoSpy = vi.spyOn(console, "info").mockImplementation(() => {});
    const debugSpy = vi.spyOn(console, "debug").mockImplementation(() => {});

    const logger = createConvexLogger("test", "info");
    logger.debug("suppressed");
    logger.info("visible");

    expect(debugSpy).not.toHaveBeenCalled();
    expect(infoSpy).toHaveBeenCalledOnce();

    infoSpy.mockRestore();
    debugSpy.mockRestore();
  });

  it("defaults to info level", () => {
    const debugSpy = vi.spyOn(console, "debug").mockImplementation(() => {});
    const infoSpy = vi.spyOn(console, "info").mockImplementation(() => {});

    const logger = createConvexLogger("test");
    logger.debug("suppressed");
    logger.info("visible");

    expect(debugSpy).not.toHaveBeenCalled();
    expect(infoSpy).toHaveBeenCalledOnce();

    debugSpy.mockRestore();
    infoSpy.mockRestore();
  });

  it("has timing helpers", () => {
    const logger = createConvexLogger("test");
    expect(logger.withTiming).toBeTypeOf("function");
    expect(logger.withTimingSync).toBeTypeOf("function");
  });
});

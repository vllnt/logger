import { describe, expect, it, vi } from "vitest";
import { createConvexLogger } from "../src/convex.js";
import type { LogLevel } from "../src/core.js";

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

  it("ignores process.env.LOG_LEVEL", () => {
    const debugSpy = vi.spyOn(console, "debug").mockImplementation(() => {});
    process.env.LOG_LEVEL = "debug";

    try {
      createConvexLogger("test").debug("suppressed");
    } finally {
      delete process.env.LOG_LEVEL;
    }

    expect(debugSpy).not.toHaveBeenCalled();
    debugSpy.mockRestore();
  });

  it("emits debug at an explicit debug level, as one JSON line", () => {
    const debugSpy = vi.spyOn(console, "debug").mockImplementation(() => {});

    createConvexLogger("orders", "debug").debug("created", { orderId: "o_1" });

    expect(debugSpy).toHaveBeenCalledOnce();
    expect(JSON.parse(debugSpy.mock.calls[0]![0] as string)).toEqual({
      event: "orders.created",
      level: "debug",
      orderId: "o_1",
      timestamp: expect.any(String),
    });
    debugSpy.mockRestore();
  });

  it("falls back to info for an invalid runtime level", () => {
    const debugSpy = vi.spyOn(console, "debug").mockImplementation(() => {});
    const infoSpy = vi.spyOn(console, "info").mockImplementation(() => {});

    /** A level read at runtime, for example from config, that is not a LogLevel. */
    const runtimeLevel: LogLevel = JSON.parse('"verbose"');
    const logger = createConvexLogger("test", runtimeLevel);
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

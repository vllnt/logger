import { afterEach, describe, expect, it, vi } from "vitest";
import { createBackendLogger } from "../src/backend.js";

describe("createBackendLogger", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    delete process.env.LOG_LEVEL;
  });

  it("creates a scoped logger (AC-1)", () => {
    process.env.LOG_LEVEL = "debug";
    const spy = vi.spyOn(console, "info").mockImplementation(() => {});

    const logger = createBackendLogger("auth");
    logger.info("login", { userId: "123" });

    expect(spy).toHaveBeenCalledOnce();
    const json = JSON.parse(spy.mock.calls[0]![0] as string) as Record<
      string,
      unknown
    >;
    expect(json.event).toBe("auth.login");
    expect(json.level).toBe("info");
    expect(json.userId).toBe("123");
  });

  it("reads LOG_LEVEL lazily from process.env (AC-E1)", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const debugSpy = vi.spyOn(console, "debug").mockImplementation(() => {});

    const logger = createBackendLogger("test");

    // Default level is "warn" — debug should be suppressed
    logger.debug("should-not-appear");
    expect(debugSpy).not.toHaveBeenCalled();

    logger.warn("should-appear");
    expect(warnSpy).toHaveBeenCalledOnce();
  });

  it("falls back to warn for invalid LOG_LEVEL (AC-E1)", () => {
    process.env.LOG_LEVEL = "verbose";
    const infoSpy = vi.spyOn(console, "info").mockImplementation(() => {});
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const logger = createBackendLogger("test");
    logger.info("suppressed");
    logger.warn("visible");

    expect(infoSpy).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalledOnce();
  });

  it("applies a LOG_LEVEL set after the logger is created", () => {
    const infoSpy = vi.spyOn(console, "info").mockImplementation(() => {});
    const logger = createBackendLogger("test");

    logger.info("dropped");
    process.env.LOG_LEVEL = "info";
    logger.info("kept");

    expect(infoSpy).toHaveBeenCalledOnce();
    expect(infoSpy.mock.calls[0]![0]).toContain('"event":"test.kept"');
  });

  it("accepts a padded, uppercase LOG_LEVEL", () => {
    process.env.LOG_LEVEL = "  DEBUG ";
    const debugSpy = vi.spyOn(console, "debug").mockImplementation(() => {});

    createBackendLogger("test").debug("shown");

    expect(debugSpy).toHaveBeenCalledOnce();
  });

  it("suppresses info and shows error at the default level", () => {
    const infoSpy = vi.spyOn(console, "info").mockImplementation(() => {});
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const logger = createBackendLogger("test");

    logger.info("suppressed");
    logger.error("shown");

    expect(infoSpy).not.toHaveBeenCalled();
    expect(errorSpy).toHaveBeenCalledOnce();
  });

  it("uses warn when loaded without a process global", async () => {
    vi.resetModules();
    vi.stubGlobal("process", undefined);
    let fresh: typeof import("../src/backend.js");
    try {
      fresh = await import("../src/backend.js");
    } finally {
      vi.unstubAllGlobals();
    }
    const infoSpy = vi.spyOn(console, "info").mockImplementation(() => {});
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    process.env.LOG_LEVEL = "debug";

    const logger = fresh.createBackendLogger("test");
    logger.info("suppressed");
    logger.warn("shown");

    expect(infoSpy).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalledOnce();
  });

  it("returns ExtendedLogger with timing helpers", async () => {
    process.env.LOG_LEVEL = "debug";
    vi.spyOn(console, "info").mockImplementation(() => {});

    const logger = createBackendLogger("test");
    expect(logger.withTiming).toBeTypeOf("function");
    expect(logger.withTimingSync).toBeTypeOf("function");

    const result = await logger.withTiming("op", async () => 42);
    expect(result).toBe(42);
  });
});

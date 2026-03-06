import { describe, expect, it, vi } from "vitest";
import {
  composeOutputs,
  consoleOutput,
  createExtendedLogger,
  createLogger,
  formatLogEntry,
  parseLogLevel,
  type LogEntry,
  type LogOutput,
} from "../src/core.js";

describe("parseLogLevel", () => {
  it("parses valid log levels", () => {
    expect(parseLogLevel("debug")).toBe("debug");
    expect(parseLogLevel("info")).toBe("info");
    expect(parseLogLevel("warn")).toBe("warn");
    expect(parseLogLevel("error")).toBe("error");
  });

  it("is case-insensitive", () => {
    expect(parseLogLevel("DEBUG")).toBe("debug");
    expect(parseLogLevel("WARN")).toBe("warn");
  });

  it("returns default for invalid values (AC-E1)", () => {
    expect(parseLogLevel("verbose")).toBe("info");
    expect(parseLogLevel(undefined)).toBe("info");
    expect(parseLogLevel("")).toBe("info");
    expect(parseLogLevel("  ")).toBe("info");
  });

  it("uses custom default", () => {
    expect(parseLogLevel("invalid", "warn")).toBe("warn");
  });
});

describe("formatLogEntry", () => {
  it("creates entry with event, level, timestamp", () => {
    const entry = formatLogEntry("info", "test.event");
    expect(entry.event).toBe("test.event");
    expect(entry.level).toBe("info");
    expect(entry.timestamp).toBeDefined();
  });

  it("includes user data", () => {
    const entry = formatLogEntry("info", "test.event", { userId: "123" });
    expect(entry.userId).toBe("123");
  });

  it("fixed fields win over user data (AC-7)", () => {
    const entry = formatLogEntry("info", "scope.op", {
      event: "override",
      level: "debug",
      timestamp: "custom",
    });
    expect(entry.event).toBe("scope.op");
    expect(entry.level).toBe("info");
    expect(entry.timestamp).not.toBe("custom");
  });
});

describe("createLogger", () => {
  it("produces scoped events (AC-1)", () => {
    const entries: LogEntry[] = [];
    const output: LogOutput = (entry) => entries.push(entry);
    const logger = createLogger("auth", {
      getLogLevel: () => "debug",
      output,
    });

    logger.info("login", { userId: "123" });

    expect(entries).toHaveLength(1);
    expect(entries[0]!.event).toBe("auth.login");
    expect(entries[0]!.level).toBe("info");
    expect(entries[0]!.userId).toBe("123");
  });

  it("filters by log level (AC-2)", () => {
    const entries: LogEntry[] = [];
    const output: LogOutput = (entry) => entries.push(entry);
    const logger = createLogger("test", {
      getLogLevel: () => "warn",
      output,
    });

    logger.debug("ignored");
    logger.info("ignored");
    logger.warn("kept");
    logger.error("kept");

    expect(entries).toHaveLength(2);
    expect(entries[0]!.level).toBe("warn");
    expect(entries[1]!.level).toBe("error");
  });

  it("logs with all four levels", () => {
    const entries: LogEntry[] = [];
    const output: LogOutput = (entry) => entries.push(entry);
    const logger = createLogger("test", {
      getLogLevel: () => "debug",
      output,
    });

    logger.debug("d");
    logger.info("i");
    logger.warn("w");
    logger.error("e");

    expect(entries).toHaveLength(4);
  });

  it("handles empty log data (EC6)", () => {
    const entries: LogEntry[] = [];
    const output: LogOutput = (entry) => entries.push(entry);
    const logger = createLogger("test", {
      getLogLevel: () => "debug",
      output,
    });

    logger.info("empty");
    const entry = entries[0]!;
    expect(entry.event).toBe("test.empty");
    expect(entry.level).toBe("info");
    expect(entry.timestamp).toBeDefined();
  });
});

describe("createExtendedLogger", () => {
  it("supports withTiming (AC-11)", async () => {
    const entries: LogEntry[] = [];
    const output: LogOutput = (entry) => entries.push(entry);
    const logger = createExtendedLogger("test", {
      getLogLevel: () => "debug",
      output,
    });

    const result = await logger.withTiming("db.query", async () => "data");

    expect(result).toBe("data");
    expect(entries).toHaveLength(2);
    expect(entries[0]!.event).toBe("test.db.query.start");
    expect(entries[1]!.event).toBe("test.db.query.complete");
    expect(entries[1]!.durationMs).toBeTypeOf("number");
  });

  it("withTiming logs error and re-throws (AC-12)", async () => {
    const entries: LogEntry[] = [];
    const output: LogOutput = (entry) => entries.push(entry);
    const logger = createExtendedLogger("test", {
      getLogLevel: () => "debug",
      output,
    });

    await expect(
      logger.withTiming("op", async () => {
        throw new Error("fail");
      }),
    ).rejects.toThrow("fail");

    expect(entries).toHaveLength(2);
    expect(entries[1]!.event).toBe("test.op.error");
    expect(entries[1]!.level).toBe("error");
    expect(entries[1]!.durationMs).toBeTypeOf("number");
    expect(entries[1]!.error).toBe("fail");
  });

  it("withTimingSync works", () => {
    const entries: LogEntry[] = [];
    const output: LogOutput = (entry) => entries.push(entry);
    const logger = createExtendedLogger("test", {
      getLogLevel: () => "debug",
      output,
    });

    const result = logger.withTimingSync("op", () => 42);
    expect(result).toBe(42);
    expect(entries).toHaveLength(2);
    expect(entries[1]!.event).toBe("test.op.complete");
  });

  it("withTimingSync logs error and re-throws", () => {
    const entries: LogEntry[] = [];
    const output: LogOutput = (entry) => entries.push(entry);
    const logger = createExtendedLogger("test", {
      getLogLevel: () => "debug",
      output,
    });

    expect(() =>
      logger.withTimingSync("op", () => {
        throw new Error("sync-fail");
      }),
    ).toThrow("sync-fail");

    expect(entries).toHaveLength(2);
    expect(entries[1]!.event).toBe("test.op.error");
    expect(entries[1]!.level).toBe("error");
    expect(entries[1]!.durationMs).toBeTypeOf("number");
    expect(entries[1]!.error).toBe("sync-fail");
  });
});

describe("consoleOutput", () => {
  it("routes to correct console method", () => {
    const debugSpy = vi.spyOn(console, "debug").mockImplementation(() => {});
    const infoSpy = vi.spyOn(console, "info").mockImplementation(() => {});
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    consoleOutput(formatLogEntry("debug", "d"));
    consoleOutput(formatLogEntry("info", "i"));
    consoleOutput(formatLogEntry("warn", "w"));
    consoleOutput(formatLogEntry("error", "e"));

    expect(debugSpy).toHaveBeenCalledOnce();
    expect(infoSpy).toHaveBeenCalledOnce();
    expect(warnSpy).toHaveBeenCalledOnce();
    expect(errorSpy).toHaveBeenCalledOnce();

    debugSpy.mockRestore();
    infoSpy.mockRestore();
    warnSpy.mockRestore();
    errorSpy.mockRestore();
  });

  it("handles unserializable data without crashing (AC-9)", () => {
    const infoSpy = vi.spyOn(console, "info").mockImplementation(() => {});

    const entry: LogEntry = {
      event: "test",
      level: "info",
      timestamp: new Date().toISOString(),
      value: BigInt(123),
    };

    expect(() => consoleOutput(entry)).not.toThrow();
    expect(infoSpy).toHaveBeenCalledWith(
      expect.stringContaining("[logger:serialize-error]"),
    );

    infoSpy.mockRestore();
  });
});

describe("composeOutputs", () => {
  it("fans out to all outputs (AC-5)", () => {
    const a: LogEntry[] = [];
    const b: LogEntry[] = [];
    const composed = composeOutputs(
      (e) => a.push(e),
      (e) => b.push(e),
    );

    const entry = formatLogEntry("info", "test");
    composed(entry);

    expect(a).toHaveLength(1);
    expect(b).toHaveLength(1);
  });

  it("isolates throwing outputs (AC-6)", () => {
    const received: LogEntry[] = [];
    const composed = composeOutputs(
      () => {
        throw new Error("broken");
      },
      (e) => received.push(e),
    );

    const entry = formatLogEntry("info", "test");
    expect(() => composed(entry)).not.toThrow();
    expect(received).toHaveLength(1);
  });

  it("handles 0 outputs without crashing (EC4)", () => {
    const composed = composeOutputs();
    expect(() => composed(formatLogEntry("info", "test"))).not.toThrow();
  });

  it("handles 1 output (EC5)", () => {
    const entries: LogEntry[] = [];
    const composed = composeOutputs((e) => entries.push(e));
    composed(formatLogEntry("info", "test"));
    expect(entries).toHaveLength(1);
  });
});

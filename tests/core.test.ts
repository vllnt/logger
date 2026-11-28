import { readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runInNewContext } from "node:vm";
import { describe, expect, it, vi } from "vitest";
import {
  composeOutputs,
  consoleOutput,
  createExtendedLogger,
  createLogger,
  formatLogEntry,
  parseLogLevel,
  type ExtendedLogger,
  type LogEntry,
  type LogLevel,
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

  it("trims and lowercases", () => {
    expect(parseLogLevel(" WARN ")).toBe("warn");
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

  it("uses an ISO 8601 timestamp", () => {
    const { timestamp } = formatLogEntry("info", "t");
    expect(timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    expect(new Date(timestamp).toISOString()).toBe(timestamp);
  });

  it("puts data keys before the fixed fields", () => {
    const entry = formatLogEntry("info", "t", { a: 1, b: 2 });
    expect(Object.keys(entry)).toEqual([
      "a",
      "b",
      "event",
      "level",
      "timestamp",
    ]);
  });

  it("does not mutate its input", () => {
    const data = { a: 1, event: "mine" };
    formatLogEntry("info", "t", data);
    expect(data).toEqual({ a: 1, event: "mine" });
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

  it.each([
    ["info", ["info", "warn", "error"]],
    ["error", ["error"]],
  ] as const)("at the %s threshold emits %j", (threshold, emitted) => {
    const entries: LogEntry[] = [];
    const logger = createLogger("t", {
      getLogLevel: () => threshold,
      output: (entry) => entries.push(entry),
    });

    logger.debug("d");
    logger.info("i");
    logger.warn("w");
    logger.error("e");

    expect(entries.map((entry) => entry.level)).toEqual(emitted);
  });

  it("reads getLogLevel again after the level changes", () => {
    const entries: LogEntry[] = [];
    let level: LogLevel = "error";
    const logger = createLogger("t", {
      getLogLevel: () => level,
      output: (entry) => entries.push(entry),
    });

    logger.info("dropped");
    level = "debug";
    logger.info("kept");

    expect(entries.map((entry) => entry.event)).toEqual(["t.kept"]);
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

  describe("timing entries", () => {
    const setup = (
      level: LogLevel = "debug",
    ): { entries: LogEntry[]; logger: ExtendedLogger } => {
      const entries: LogEntry[] = [];
      const logger = createExtendedLogger("t", {
        getLogLevel: () => level,
        output: (entry) => entries.push(entry),
      });
      return { entries, logger };
    };
    const fail = (): never => {
      throw new Error("fail");
    };

    it("withTiming puts extraData in .start, .complete and .error, at info and error", async () => {
      const { entries, logger } = setup();

      await logger.withTiming("ok", async () => 1, { table: "users" });
      await expect(
        logger.withTiming("bad", async () => fail(), { table: "users" }),
      ).rejects.toThrow("fail");

      expect(
        entries.map(({ event, level, table }) => ({ event, level, table })),
      ).toEqual([
        { event: "t.ok.start", level: "info", table: "users" },
        { event: "t.ok.complete", level: "info", table: "users" },
        { event: "t.bad.start", level: "info", table: "users" },
        { event: "t.bad.error", level: "error", table: "users" },
      ]);
    });

    it("withTimingSync puts extraData in .start, .complete and .error, at info and error", () => {
      const { entries, logger } = setup();

      logger.withTimingSync("ok", () => 1, { table: "users" });
      expect(() =>
        logger.withTimingSync("bad", fail, { table: "users" }),
      ).toThrow("fail");

      expect(
        entries.map(({ event, level, table }) => ({ event, level, table })),
      ).toEqual([
        { event: "t.ok.start", level: "info", table: "users" },
        { event: "t.ok.complete", level: "info", table: "users" },
        { event: "t.bad.start", level: "info", table: "users" },
        { event: "t.bad.error", level: "error", table: "users" },
      ]);
    });

    it("emits only .error at a warn threshold", async () => {
      const { entries, logger } = setup("warn");

      await logger.withTiming("a", async () => 1);
      await expect(
        logger.withTiming("b", async () => fail()),
      ).rejects.toThrow();
      logger.withTimingSync("c", () => 1);
      expect(() => logger.withTimingSync("d", fail)).toThrow();

      expect(entries.map((entry) => entry.event)).toEqual([
        "t.b.error",
        "t.d.error",
      ]);
    });

    it.each([
      ["a string", "boom", "boom"],
      ["a number", 42, "42"],
      ["a Symbol", Symbol("s"), "Symbol(s)"],
    ])(
      "logs a thrown non-Error value (%s) as String(value)",
      async (_, value, logged) => {
        const { entries, logger } = setup();
        const throwValue = (): never => {
          throw value;
        };

        await expect(
          logger.withTiming("op", async () => throwValue()),
        ).rejects.toBe(value);
        expect(() => logger.withTimingSync("op", throwValue)).toThrow();

        expect(
          entries
            .filter((entry) => entry.level === "error")
            .map((e) => e.error),
        ).toEqual([logged, logged]);
      },
    );

    it("withTiming logs a placeholder when a rejected value cannot be printed", async () => {
      const { entries, logger } = setup();
      const unprintable = Object.create(null) as object;

      await expect(
        logger.withTiming("op", () => Promise.reject(unprintable)),
      ).rejects.toBe(unprintable);
      expect(entries.at(-1)!.error).toBe("[unprintable error]");
    });

    it("withTiming rejects, and logs .error, when execute throws synchronously", async () => {
      const { entries, logger } = setup();

      const result = logger.withTiming("op", () => {
        throw new Error("sync");
      });

      await expect(result).rejects.toThrow("sync");
      expect(entries.at(-1)).toMatchObject({
        error: "sync",
        event: "t.op.error",
      });
    });

    it("overwrites extraData.durationMs in .complete and .error, and extraData.error in .error only", async () => {
      const { entries, logger } = setup();
      const extraData = { durationMs: -1, error: "mine" };

      await logger.withTiming("ok", async () => 1, extraData);
      expect(() => logger.withTimingSync("bad", fail, extraData)).toThrow();

      const [okStart, okComplete, badStart, badError] = entries;
      expect(okStart).toMatchObject(extraData);
      expect(okComplete!.durationMs).toBeGreaterThanOrEqual(0);
      expect(okComplete!.error).toBe("mine");
      expect(badStart).toMatchObject(extraData);
      expect(badError!.durationMs).toBeGreaterThanOrEqual(0);
      expect(badError!.error).toBe("fail");
    });
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

  it("falls back to a minimal line for unserializable data (AC-9)", () => {
    const infoSpy = vi.spyOn(console, "info").mockImplementation(() => {});

    const entry: LogEntry = {
      event: "test",
      level: "info",
      timestamp: new Date().toISOString(),
      value: {
        toJSON() {
          throw new Error("boom");
        },
      },
    };

    expect(() => consoleOutput(entry)).not.toThrow();
    expect(infoSpy).toHaveBeenCalledWith(
      "[logger:serialize-error] event=test level=info",
    );

    infoSpy.mockRestore();
  });

  it("keeps the entry when it holds a BigInt", () => {
    const infoSpy = vi.spyOn(console, "info").mockImplementation(() => {});

    consoleOutput({ ...formatLogEntry("info", "big"), value: BigInt(123) });

    const parsed = JSON.parse(infoSpy.mock.calls[0]![0] as string);
    expect(parsed).toMatchObject({ event: "big", value: "123" });

    infoSpy.mockRestore();
  });

  it("serializes Error values with name, message and stack", () => {
    const infoSpy = vi.spyOn(console, "info").mockImplementation(() => {});

    consoleOutput({
      ...formatLogEntry("info", "err"),
      error: new TypeError("bad input"),
    });

    const parsed = JSON.parse(infoSpy.mock.calls[0]![0] as string);
    expect(parsed.error).toMatchObject({
      message: "bad input",
      name: "TypeError",
    });
    expect(parsed.error.stack).toContain("bad input");

    infoSpy.mockRestore();
  });

  it("marks circular references and keeps repeated references", () => {
    const infoSpy = vi.spyOn(console, "info").mockImplementation(() => {});
    const circular: Record<string, unknown> = { id: 1 };
    circular.self = circular;
    const shared = { ok: true };

    consoleOutput({
      ...formatLogEntry("info", "circ"),
      a: shared,
      b: shared,
      circular,
    });

    const parsed = JSON.parse(infoSpy.mock.calls[0]![0] as string);
    expect(parsed.circular).toEqual({ id: 1, self: "[Circular]" });
    expect(parsed.a).toEqual({ ok: true });
    expect(parsed.b).toEqual({ ok: true });

    infoSpy.mockRestore();
  });

  it("does not throw when the console method throws", () => {
    const infoSpy = vi.spyOn(console, "info").mockImplementation(() => {
      throw new Error("console closed");
    });

    expect(() => consoleOutput(formatLogEntry("info", "x"))).not.toThrow();

    infoSpy.mockRestore();
  });

  it("does not throw when the event getter throws", () => {
    const infoSpy = vi.spyOn(console, "info").mockImplementation(() => {});
    const entry = {
      get event(): string {
        throw new Error("x");
      },
      level: "info",
      timestamp: "t",
    } as LogEntry;

    expect(() => consoleOutput(entry)).not.toThrow();
    expect(infoSpy).toHaveBeenCalledWith("[logger:serialize-error] level=info");

    infoSpy.mockRestore();
  });

  it("does not throw when the level getter throws", () => {
    const infoSpy = vi.spyOn(console, "info").mockImplementation(() => {});
    const entry = {
      event: "e",
      get level(): LogEntry["level"] {
        throw new Error("x");
      },
      timestamp: "t",
    } as LogEntry;

    expect(() => consoleOutput(entry)).not.toThrow();
    expect(infoSpy).toHaveBeenCalledWith("[logger:serialize-error] event=e");

    infoSpy.mockRestore();
  });

  it("serializes an Error from another realm with name, message and stack", () => {
    const infoSpy = vi.spyOn(console, "info").mockImplementation(() => {});

    consoleOutput(
      formatLogEntry("info", "e", {
        err: runInNewContext('new TypeError("x")') as unknown,
      }),
    );

    const parsed = JSON.parse(infoSpy.mock.calls[0]![0] as string);
    expect(parsed.err).toMatchObject({ message: "x", name: "TypeError" });
    expect(parsed.err.stack).toContain("x");

    infoSpy.mockRestore();
  });

  it("reads a spoofed Error without throwing on its getters", () => {
    const infoSpy = vi.spyOn(console, "info").mockImplementation(() => {});
    const spoofed = {
      get message(): string {
        throw new Error("getter");
      },
      name: "Spoof",
      [Symbol.toStringTag]: "Error",
    };

    consoleOutput(formatLogEntry("info", "e", { err: spoofed }));

    const parsed = JSON.parse(infoSpy.mock.calls[0]![0] as string);
    expect(parsed.err).toEqual({ name: "Spoof" });

    infoSpy.mockRestore();
  });

  describe("keeps the own fields of an Error", () => {
    const written = (err: unknown): Record<string, unknown> => {
      const infoSpy = vi.spyOn(console, "info").mockImplementation(() => {});
      consoleOutput(formatLogEntry("info", "e", { err }));
      const line = infoSpy.mock.calls[0]![0] as string;
      infoSpy.mockRestore();
      return (JSON.parse(line) as { err: Record<string, unknown> }).err;
    };

    it("of a Node system error", () => {
      const err = Object.assign(new Error("x"), { code: "ENOENT", errno: -2 });

      expect(written(err)).toEqual({
        code: "ENOENT",
        errno: -2,
        message: "x",
        name: "Error",
        stack: expect.stringContaining("x"),
      });
    });

    it("of a real fs error", () => {
      let err: unknown;
      try {
        readFileSync(join(tmpdir(), "vllnt-logger-missing", "missing.txt"));
      } catch (error) {
        err = error;
      }

      expect(written(err)).toMatchObject({
        code: "ENOENT",
        errno: expect.any(Number),
        name: "Error",
        syscall: "open",
      });
    });

    it("of an Error from another realm", () => {
      const err = runInNewContext(
        'Object.assign(new TypeError("x"), { code: "E_VM" })',
      ) as unknown;

      expect(written(err)).toMatchObject({
        code: "E_VM",
        message: "x",
        name: "TypeError",
      });
    });

    it("skips an own getter that throws", () => {
      const err = Object.defineProperty(
        Object.assign(new Error("x"), { code: "E1" }),
        "bad",
        {
          enumerable: true,
          get(): never {
            throw new Error("getter");
          },
        },
      );

      expect(written(err)).toEqual({
        code: "E1",
        message: "x",
        name: "Error",
        stack: expect.stringContaining("x"),
      });
    });

    it("keeps name and message when listing own fields throws", () => {
      const err = new Proxy(new Error("x"), {
        ownKeys(): never {
          throw new Error("trap");
        },
      });

      expect(written(err)).toMatchObject({ message: "x", name: "Error" });
    });

    it("marks an own field that refers back to the Error as circular", () => {
      const err = new Error("x") as Error & { self?: unknown };
      err.self = err;

      expect(written(err)).toMatchObject({ message: "x", self: "[Circular]" });
    });

    it("with name, message and stack winning over own fields", () => {
      const err = Object.assign(new Error("x"), { message: 42, name: "Own" });

      expect(written(err)).toMatchObject({ message: 42, name: "Own" });
    });
  });

  it("routes an unknown level to console.info", () => {
    const infoSpy = vi.spyOn(console, "info").mockImplementation(() => {});

    consoleOutput({
      ...formatLogEntry("info", "x"),
      level: "trace" as LogEntry["level"],
    });

    expect(infoSpy).toHaveBeenCalledOnce();

    infoSpy.mockRestore();
  });

  it.each(["debug", "info", "warn", "error"] as const)(
    "writes the %s entry as one JSON line",
    (level) => {
      const spy = vi.spyOn(console, level).mockImplementation(() => {});
      const entry = formatLogEntry(level, "e", { a: 1 });

      consoleOutput(entry);

      expect(spy).toHaveBeenCalledExactlyOnceWith(JSON.stringify(entry));
      expect(JSON.parse(spy.mock.calls[0]![0] as string)).toEqual({
        a: 1,
        event: "e",
        level,
        timestamp: entry.timestamp,
      });

      spy.mockRestore();
    },
  );

  it("falls back to the minimal line for a deep throwing getter", () => {
    const infoSpy = vi.spyOn(console, "info").mockImplementation(() => {});

    consoleOutput(
      formatLogEntry("info", "deep", {
        outer: {
          inner: {
            get bad(): string {
              throw new Error("getter");
            },
          },
        },
      }),
    );

    expect(infoSpy).toHaveBeenCalledExactlyOnceWith(
      "[logger:serialize-error] event=deep level=info",
    );

    infoSpy.mockRestore();
  });

  it("writes values JSON cannot hold like JSON.stringify does", () => {
    const infoSpy = vi.spyOn(console, "info").mockImplementation(() => {});
    const odd = {
      fn: () => 1,
      map: new Map([["k", 1]]),
      nan: Number.NaN,
      set: new Set([1]),
      sym: Symbol("s"),
      undef: undefined,
    };

    consoleOutput(
      formatLogEntry("info", "odd", { ...odd, list: Object.values(odd) }),
    );

    const parsed = JSON.parse(infoSpy.mock.calls[0]![0] as string);
    expect(parsed).toEqual({
      event: "odd",
      level: "info",
      list: [null, {}, null, {}, null, null],
      map: {},
      nan: null,
      set: {},
      timestamp: expect.any(String),
    });

    infoSpy.mockRestore();
  });

  it("serializes an Error inside an array", () => {
    const infoSpy = vi.spyOn(console, "info").mockImplementation(() => {});

    consoleOutput(formatLogEntry("info", "e", { errors: [new Error("x")] }));

    const parsed = JSON.parse(infoSpy.mock.calls[0]![0] as string);
    expect(parsed.errors).toEqual([
      { message: "x", name: "Error", stack: expect.stringContaining("x") },
    ]);

    infoSpy.mockRestore();
  });

  it("falls back to the minimal line for data nested 20,000 levels deep", () => {
    const infoSpy = vi.spyOn(console, "info").mockImplementation(() => {});
    let deep: Record<string, unknown> = {};
    for (let index = 0; index < 20_000; index += 1) {
      deep = { deep };
    }

    expect(() =>
      consoleOutput(formatLogEntry("info", "deep", deep)),
    ).not.toThrow();
    expect(infoSpy).toHaveBeenCalledExactlyOnceWith(
      "[logger:serialize-error] event=deep level=info",
    );

    infoSpy.mockRestore();
  });
});

describe("never throws from a log call", () => {
  it("swallows a throwing output", () => {
    const logger = createLogger("t", {
      getLogLevel: () => "debug",
      output: () => {
        throw new Error("sink down");
      },
    });

    expect(() => logger.error("e", { a: 1 })).not.toThrow();
  });

  it("swallows a throwing data getter", () => {
    const entries: LogEntry[] = [];
    const logger = createLogger("t", {
      getLogLevel: () => "debug",
      output: (entry) => entries.push(entry),
    });
    const data = {
      get bad(): string {
        throw new Error("getter");
      },
    };

    expect(() => logger.info("e", data)).not.toThrow();
    expect(entries).toHaveLength(0);
  });

  it("falls back to info when getLogLevel throws", () => {
    const entries: LogEntry[] = [];
    const logger = createLogger("t", {
      getLogLevel: () => {
        throw new Error("no level");
      },
      output: (entry) => entries.push(entry),
    });

    expect(() => {
      logger.debug("dropped");
      logger.info("kept");
    }).not.toThrow();
    expect(entries.map((entry) => entry.event)).toEqual(["t.kept"]);
  });

  it("falls back to info when getLogLevel returns an invalid level", () => {
    const entries: LogEntry[] = [];
    const logger = createLogger("t", {
      getLogLevel: () => "verbose" as never,
      output: (entry) => entries.push(entry),
    });

    logger.debug("dropped");
    logger.warn("kept");

    expect(entries.map((entry) => entry.event)).toEqual(["t.kept"]);
  });

  it("withTiming rethrows the original error even if output fails", async () => {
    const failure = new Error("work failed");
    const logger = createExtendedLogger("t", {
      getLogLevel: () => "debug",
      output: () => {
        throw new Error("sink down");
      },
    });

    await expect(
      logger.withTiming("op", () => Promise.reject(failure)),
    ).rejects.toBe(failure);
    expect(() =>
      logger.withTimingSync("op", () => {
        throw failure;
      }),
    ).toThrow(failure);
  });

  it("withTiming logs a placeholder when a thrown value cannot be printed", () => {
    const entries: LogEntry[] = [];
    const logger = createExtendedLogger("t", {
      getLogLevel: () => "debug",
      output: (entry) => entries.push(entry),
    });
    const unprintable = Object.create(null) as object;

    expect(() =>
      logger.withTimingSync("op", () => {
        throw unprintable;
      }),
    ).toThrow();
    expect(entries.at(-1)!.error).toBe("[unprintable error]");
  });

  it("withTiming and withTimingSync log the message of an Error from another realm", async () => {
    const entries: LogEntry[] = [];
    const logger = createExtendedLogger("t", {
      getLogLevel: () => "debug",
      output: (entry) => entries.push(entry),
    });
    const foreign = runInNewContext('new TypeError("x")') as unknown;

    await expect(
      logger.withTiming("op", () => Promise.reject(foreign)),
    ).rejects.toBe(foreign);
    expect(() =>
      logger.withTimingSync("op", () => {
        throw foreign;
      }),
    ).toThrow();
    expect(
      entries.filter((entry) => entry.level === "error").map((e) => e.error),
    ).toEqual(["x", "x"]);
  });

  it("withTimingSync logs a placeholder for a revoked Proxy", () => {
    const entries: LogEntry[] = [];
    const logger = createExtendedLogger("t", {
      getLogLevel: () => "debug",
      output: (entry) => entries.push(entry),
    });
    const { proxy, revoke } = Proxy.revocable({}, {});
    revoke();

    let thrown: unknown;
    try {
      logger.withTimingSync("op", () => {
        throw proxy;
      });
    } catch (error) {
      thrown = error;
    }
    expect(thrown === proxy).toBe(true);
    expect(entries.at(-1)!.error).toBe("[unprintable error]");
  });

  it("withTimingSync logs String(error) when an Error's message is not a string", () => {
    const entries: LogEntry[] = [];
    const logger = createExtendedLogger("t", {
      getLogLevel: () => "debug",
      output: (entry) => entries.push(entry),
    });
    const err = Object.assign(new Error("x"), { message: 42 });

    expect(() =>
      logger.withTimingSync("op", () => {
        throw err;
      }),
    ).toThrow();
    expect(entries.at(-1)!.error).toBe("Error: 42");
  });

  describe("withTiming with extraData that has a throwing getter", () => {
    const setup = (): { entries: LogEntry[]; logger: ExtendedLogger } => {
      const entries: LogEntry[] = [];
      const logger = createExtendedLogger("t", {
        getLogLevel: () => "debug",
        output: (entry) => entries.push(entry),
      });
      return { entries, logger };
    };
    const badData = {
      get bad(): string {
        throw new Error("getter");
      },
    };

    it("withTiming returns the result and drops the entries", async () => {
      const { entries, logger } = setup();

      await expect(
        logger.withTiming("op", () => Promise.resolve(42), badData),
      ).resolves.toBe(42);
      expect(entries).toHaveLength(0);
    });

    it("withTiming rethrows the original error", async () => {
      const { entries, logger } = setup();
      const failure = new Error("work failed");

      await expect(
        logger.withTiming("op", () => Promise.reject(failure), badData),
      ).rejects.toBe(failure);
      expect(entries).toHaveLength(0);
    });

    it("withTimingSync returns the result and drops the entries", () => {
      const { entries, logger } = setup();

      expect(logger.withTimingSync("op", () => 42, badData)).toBe(42);
      expect(entries).toHaveLength(0);
    });

    it("withTimingSync still logs the entries that can be built", () => {
      const { entries, logger } = setup();
      let reads = 0;
      const failsAfterFirstRead = {
        get flaky(): number {
          reads += 1;
          if (reads > 1) {
            throw new Error("getter");
          }
          return reads;
        },
      };

      expect(logger.withTimingSync("op", () => 42, failsAfterFirstRead)).toBe(
        42,
      );
      expect(entries.map((entry) => entry.event)).toEqual(["t.op.start"]);
    });

    it("withTimingSync rethrows the original error", () => {
      const { entries, logger } = setup();
      const failure = new Error("work failed");

      expect(() =>
        logger.withTimingSync(
          "op",
          () => {
            throw failure;
          },
          badData,
        ),
      ).toThrow(failure);
      expect(entries).toHaveLength(0);
    });
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

  it("calls outputs in order, after a throwing one too, with the same entry object", () => {
    const calls: [string, LogEntry][] = [];
    const composed = composeOutputs(
      (e) => calls.push(["a", e]),
      () => {
        throw new Error("broken");
      },
      (e) => calls.push(["b", e]),
      (e) => calls.push(["c", e]),
    );
    const entry = formatLogEntry("info", "test");

    composed(entry);

    expect(calls.map(([name]) => name)).toEqual(["a", "b", "c"]);
    expect(calls.every(([, received]) => received === entry)).toBe(true);
  });

  it("handles 1 output (EC5)", () => {
    const entries: LogEntry[] = [];
    const composed = composeOutputs((e) => entries.push(e));
    composed(formatLogEntry("info", "test"));
    expect(entries).toHaveLength(1);
  });
});

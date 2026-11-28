import { describe, expect, it } from "vitest";
import {
  createExtendedLogger,
  createLogger,
  formatLogEntry,
} from "../src/core.js";
import { createTestOutput } from "../src/testing.js";

describe("createTestOutput", () => {
  it("captures log entries into array (AC-10)", () => {
    const { entries, output } = createTestOutput();
    const logger = createLogger("test", {
      getLogLevel: () => "debug",
      output,
    });

    logger.info("first", { a: 1 });
    logger.warn("second", { b: 2 });

    expect(entries).toHaveLength(2);
    expect(entries[0]!.event).toBe("test.first");
    expect(entries[0]!.a).toBe(1);
    expect(entries[1]!.event).toBe("test.second");
    expect(entries[1]!.level).toBe("warn");
  });

  it("starts with empty entries", () => {
    const { entries } = createTestOutput();
    expect(entries).toHaveLength(0);
  });

  it("keeps entries in call order", () => {
    const { entries, output } = createTestOutput();
    const logger = createLogger("t", { getLogLevel: () => "debug", output });

    logger.error("a");
    logger.debug("b");
    logger.warn("c");

    expect(entries.map((entry) => entry.event)).toEqual(["t.a", "t.b", "t.c"]);
  });

  it("keeps two instances independent", () => {
    const first = createTestOutput();
    const second = createTestOutput();

    first.output(formatLogEntry("info", "one"));

    expect(first.entries).toHaveLength(1);
    expect(second.entries).toHaveLength(0);
  });

  it("captures entries from the timing helpers", async () => {
    const { entries, output } = createTestOutput();
    const logger = createExtendedLogger("t", {
      getLogLevel: () => "debug",
      output,
    });

    await logger.withTiming("async", async () => 1);
    logger.withTimingSync("sync", () => 1);

    expect(entries.map((entry) => entry.event)).toEqual([
      "t.async.start",
      "t.async.complete",
      "t.sync.start",
      "t.sync.complete",
    ]);
  });
});

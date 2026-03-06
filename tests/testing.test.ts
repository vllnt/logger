import { describe, expect, it } from "vitest";
import { createLogger } from "../src/core.js";
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
});

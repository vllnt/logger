/**
 * @vllnt/logger — Test utilities.
 *
 * Provides a test output that captures log entries for assertion.
 */

import type { LogEntry, LogOutput } from "./core.js";

/** Result of createTestOutput — output function + captured entries */
export type TestOutput = {
  entries: readonly LogEntry[];
  output: LogOutput;
};

/** Create a test output that captures entries into an array for assertion. */
export function createTestOutput(): TestOutput {
  const entries: LogEntry[] = [];
  const output: LogOutput = (entry: LogEntry): void => {
    entries.push(entry);
  };
  return { entries, output };
}

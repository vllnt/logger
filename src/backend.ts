/**
 * @vllnt/logger — Backend preset.
 *
 * Pre-configured logger for Node.js backends.
 * Reads LOG_LEVEL from process.env on each call (no module-level side effects).
 */

import {
  consoleOutput,
  createExtendedLogger,
  type ExtendedLogger,
  type LogLevel,
  parseLogLevel,
} from "./core.js";

const HAS_PROCESS = typeof process !== "undefined";

function getEnvironmentVariable(key: string): string | undefined {
  if (HAS_PROCESS && process.env) {
    return process.env[key];
  }
  return undefined;
}

function getBackendLogLevel(): LogLevel {
  return parseLogLevel(getEnvironmentVariable("LOG_LEVEL"), "warn");
}

/** Create a scoped backend logger. Reads LOG_LEVEL from process.env on each call. */
export function createBackendLogger(scope: string): ExtendedLogger {
  return createExtendedLogger(scope, {
    getLogLevel: getBackendLogLevel,
    output: consoleOutput,
  });
}

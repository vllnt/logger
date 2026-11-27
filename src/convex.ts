/**
 * @vllnt/logger — Convex-safe logger.
 *
 * Imports from core.ts (no process.env, no crypto).
 * Works in Convex queries, mutations, and actions.
 */

import {
  consoleOutput,
  createExtendedLogger,
  type ExtendedLogger,
  type LogLevel,
} from "./core.js";

/**
 * Create a logger for Convex functions.
 * Pass the level explicitly; this logger never reads `process.env`.
 * Defaults to "info".
 */
export function createConvexLogger(
  scope: string,
  level: LogLevel = "info",
): ExtendedLogger {
  return createExtendedLogger(scope, {
    getLogLevel: () => level,
    output: consoleOutput,
  });
}

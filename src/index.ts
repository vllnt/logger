/**
 * @vllnt/logger — zero-dependency structured JSON logger for TypeScript.
 *
 * Core exports + Node.js preset (`createBackendLogger`).
 */

export { createBackendLogger } from "./backend.js";
export {
  composeOutputs,
  consoleOutput,
  createExtendedLogger,
  createLogger,
  type ExtendedLogger,
  formatLogEntry,
  type LogData,
  type LogEntry,
  type Logger,
  type LoggerConfig,
  type LogLevel,
  type LogOutput,
  parseLogLevel,
} from "./core.js";

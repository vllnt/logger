/**
 * @vllnt/logger — Structured logging for the @vllnt ecosystem.
 *
 * Core exports + backend preset.
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

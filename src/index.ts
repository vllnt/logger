/**
 * @vllnt/logger — Structured logging for the @vllnt ecosystem.
 *
 * Core exports + backend preset.
 */

export {
  composeOutputs,
  consoleOutput,
  createExtendedLogger,
  createLogger,
  formatLogEntry,
  parseLogLevel,
  type ExtendedLogger,
  type LogData,
  type LogEntry,
  type Logger,
  type LoggerConfig,
  type LogLevel,
  type LogOutput,
} from "./core.js";

export { createBackendLogger } from "./backend.js";

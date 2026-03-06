/**
 * @vllnt/logger — Core module.
 *
 * Pure functions, ZERO module-level side effects.
 * Safe to import in any runtime (Node, Convex, browser, edge).
 */

/** Log levels ordered by severity */
export type LogLevel = "debug" | "error" | "info" | "warn";

/** Structured log data payload */
export type LogData = Record<string, unknown>;

/** Formatted log entry */
export type LogEntry = {
  event: string;
  level: LogLevel;
  timestamp: string;
} & Record<string, unknown>;

/** Logger interface — 4 level methods */
export type Logger = {
  debug: (event: string, data?: LogData) => void;
  error: (event: string, data?: LogData) => void;
  info: (event: string, data?: LogData) => void;
  warn: (event: string, data?: LogData) => void;
};

/** Extended logger with timing helpers */
export type ExtendedLogger = Logger & {
  withTiming: <T>(
    label: string,
    execute: () => Promise<T>,
    extraData?: LogData,
  ) => Promise<T>;
  withTimingSync: <T>(
    label: string,
    execute: () => T,
    extraData?: LogData,
  ) => T;
};

/** Output handler for log entries. Synchronous by design — async adapters must handle their own promises. */
export type LogOutput = (entry: LogEntry) => void;

/** Configuration for creating a logger */
export type LoggerConfig = {
  /** Returns the current log level. Called on every log emit — keep it cheap. */
  getLogLevel: () => LogLevel;
  output: LogOutput;
};

const LOG_LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

function shouldLog(level: LogLevel, configuredLevel: LogLevel): boolean {
  return LOG_LEVEL_PRIORITY[level] >= LOG_LEVEL_PRIORITY[configuredLevel];
}

/** Parse a log level string, returning default if invalid. */
export function parseLogLevel(
  value: string | undefined,
  defaultLevel: LogLevel = "info",
): LogLevel {
  const normalized = value?.toLowerCase().trim();
  if (
    normalized === "debug" ||
    normalized === "info" ||
    normalized === "warn" ||
    normalized === "error"
  ) {
    return normalized;
  }
  return defaultLevel;
}

/**
 * Format a log entry. User data spread FIRST, fixed fields LAST.
 * This prevents user data from overwriting event/level/timestamp.
 */
export function formatLogEntry(
  level: LogLevel,
  event: string,
  data?: LogData,
): LogEntry {
  return {
    ...data,
    event,
    level,
    timestamp: new Date().toISOString(),
  };
}

/** Create a scoped logger with the given configuration. */
export function createLogger(scope: string, config: LoggerConfig): Logger {
  const log = (level: LogLevel, event: string, data?: LogData): void => {
    if (shouldLog(level, config.getLogLevel())) {
      config.output(formatLogEntry(level, `${scope}.${event}`, data));
    }
  };

  return {
    debug: (event, data) => {
      log("debug", event, data);
    },
    error: (event, data) => {
      log("error", event, data);
    },
    info: (event, data) => {
      log("info", event, data);
    },
    warn: (event, data) => {
      log("warn", event, data);
    },
  };
}

/**
 * Create an extended logger with timing helpers.
 *
 * @remarks Caught errors are logged with `error.message` verbatim.
 * Callers handling sensitive errors should sanitize before throwing.
 */
export function createExtendedLogger(
  scope: string,
  config: LoggerConfig,
): ExtendedLogger {
  const base = createLogger(scope, config);

  const withTiming = async <T>(
    label: string,
    execute: () => Promise<T>,
    extraData?: LogData,
  ): Promise<T> => {
    const start = Date.now();
    base.info(`${label}.start`, extraData);

    try {
      const result = await execute();
      const durationMs = Date.now() - start;
      base.info(`${label}.complete`, { ...extraData, durationMs });
      return result;
    } catch (error) {
      const durationMs = Date.now() - start;
      base.error(`${label}.error`, {
        ...extraData,
        durationMs,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  };

  const withTimingSync = <T>(
    label: string,
    execute: () => T,
    extraData?: LogData,
  ): T => {
    const start = Date.now();
    base.info(`${label}.start`, extraData);

    try {
      const result = execute();
      const durationMs = Date.now() - start;
      base.info(`${label}.complete`, { ...extraData, durationMs });
      return result;
    } catch (error) {
      const durationMs = Date.now() - start;
      base.error(`${label}.error`, {
        ...extraData,
        durationMs,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  };

  return {
    ...base,
    withTiming,
    withTimingSync,
  };
}

/**
 * Default console output handler. Crash-safe — wraps JSON.stringify
 * in try/catch to handle BigInt, circular refs, throwing toJSON.
 */
export function consoleOutput(entry: LogEntry): void {
  let message: string;
  try {
    message = JSON.stringify(entry);
  } catch {
    message = `[logger:serialize-error] event=${String(entry.event)} level=${String(entry.level)}`;
  }

  switch (entry.level) {
    case "debug":
      console.debug(message);
      break;
    case "error":
      console.error(message);
      break;
    case "info":
      console.info(message);
      break;
    case "warn":
      console.warn(message);
      break;
    default:
      console.log(message);
      break;
  }
}

/**
 * Compose multiple outputs into a single LogOutput.
 * Each output is isolated — if one throws, others still execute.
 */
export function composeOutputs(...outputs: LogOutput[]): LogOutput {
  return (entry: LogEntry): void => {
    for (const output of outputs) {
      try {
        output(entry);
      } catch {
        // Isolated — other outputs continue
      }
    }
  };
}

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
  error: 3,
  info: 1,
  warn: 2,
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

/** Resolve the configured level; a throwing or invalid `getLogLevel` falls back to "info". */
function resolveLevel(config: LoggerConfig): LogLevel {
  try {
    return parseLogLevel(config.getLogLevel(), "info");
  } catch {
    return "info";
  }
}

/**
 * Create a scoped logger with the given configuration.
 *
 * Log calls never throw: a failing `getLogLevel`, `output`, or data getter is
 * swallowed so logging cannot break the host application.
 */
export function createLogger(scope: string, config: LoggerConfig): Logger {
  const log = (level: LogLevel, event: string, data?: LogData): void => {
    try {
      if (shouldLog(level, resolveLevel(config))) {
        config.output(formatLogEntry(level, `${scope}.${event}`, data));
      }
    } catch {
      // Swallowed — logging failures must not propagate
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

function formatError(error: unknown): string {
  try {
    return error instanceof Error ? error.message : String(error);
  } catch {
    return "[unprintable error]";
  }
}

function createWithTiming(base: Logger): ExtendedLogger["withTiming"] {
  return async <T>(
    label: string,
    execute: () => Promise<T>,
    extraData?: LogData,
  ): Promise<T> => {
    const start = Date.now();
    base.info(`${label}.start`, extraData);
    try {
      const result = await execute();
      base.info(`${label}.complete`, {
        ...extraData,
        durationMs: Date.now() - start,
      });
      return result;
    } catch (error) {
      base.error(`${label}.error`, {
        ...extraData,
        durationMs: Date.now() - start,
        error: formatError(error),
      });
      throw error;
    }
  };
}

function createWithTimingSync(base: Logger): ExtendedLogger["withTimingSync"] {
  return <T>(label: string, execute: () => T, extraData?: LogData): T => {
    const start = Date.now();
    base.info(`${label}.start`, extraData);
    try {
      const result = execute();
      base.info(`${label}.complete`, {
        ...extraData,
        durationMs: Date.now() - start,
      });
      return result;
    } catch (error) {
      base.error(`${label}.error`, {
        ...extraData,
        durationMs: Date.now() - start,
        error: formatError(error),
      });
      throw error;
    }
  };
}

/**
 * Create an extended logger with timing helpers.
 *
 * @remarks Caught errors use `error.message` verbatim.
 * Callers handling sensitive errors should sanitize before throwing.
 */
export function createExtendedLogger(
  scope: string,
  config: LoggerConfig,
): ExtendedLogger {
  const base = createLogger(scope, config);
  return {
    ...base,
    withTiming: createWithTiming(base),
    withTimingSync: createWithTimingSync(base),
  };
}

/**
 * JSON.stringify replacer that keeps entries serializable. It turns BigInt
 * into a string, Error into `{ name, message, stack }`, and circular
 * references into "[Circular]". Repeated non-circular references stay intact.
 */
function createReplacer(): (
  this: unknown,
  key: string,
  value: unknown,
) => unknown {
  const ancestors: unknown[] = [];
  return function replacer(this: unknown, _key: string, value: unknown) {
    if (typeof value === "bigint") {
      return value.toString();
    }
    const resolved =
      value instanceof Error
        ? { message: value.message, name: value.name, stack: value.stack }
        : value;
    if (typeof resolved !== "object" || resolved === null) {
      return resolved;
    }
    // Drop everything below the current holder: the rest is a finished sibling branch.
    ancestors.splice(ancestors.indexOf(this) + 1);
    if (ancestors.includes(resolved)) {
      return "[Circular]";
    }
    ancestors.push(resolved);
    return resolved;
  };
}

/**
 * Default console output handler. Never throws. It handles BigInt, Error and
 * circular values; anything still unserializable (throwing toJSON or getters)
 * degrades to a minimal event/level line, and console failures disappear.
 */
export function consoleOutput(entry: LogEntry): void {
  let message: string;
  try {
    message = JSON.stringify(entry, createReplacer());
  } catch {
    message = `[logger:serialize-error] event=${entry.event} level=${entry.level}`;
  }

  try {
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
        console.info(message);
        break;
    }
  } catch {
    // Swallowed — a broken console must not break the app
  }
}

/** Compose outputs into a single LogOutput. Each output runs in isolation. */
export function composeOutputs(...outputs: LogOutput[]): LogOutput {
  return (entry: LogEntry): void => {
    outputs.forEach((output) => {
      try {
        output(entry);
      } catch {
        // Isolated — other outputs continue
      }
    });
  };
}

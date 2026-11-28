/**
 * @vllnt/logger — Core module.
 *
 * Pure functions, ZERO module-level side effects.
 * Safe to import in any runtime (Node, Convex, browser, edge).
 */

/** The four log levels. Severity order: debug < info < warn < error. */
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

/**
 * Output handler for log entries. Synchronous by design: the logger does not
 * await or handle a returned promise, so an async output must catch its own
 * rejections.
 */
export type LogOutput = (entry: LogEntry) => void;

/** Configuration for creating a logger */
export type LoggerConfig = {
  /** Returns the current log level. Called on every log call, including calls its level filters out — keep it cheap. */
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

const ERROR_FIELDS: readonly ("message" | "name" | "stack")[] = [
  "message",
  "name",
  "stack",
];

/** Return the own enumerable keys of `value`, or none when listing them throws. */
function ownKeys(value: object): string[] {
  try {
    return Object.keys(value);
  } catch {
    return [];
  }
}

/** Return the key and its value as one entry, or no entry when reading it throws. */
function readEntry(value: object, key: string): [string, unknown][] {
  try {
    const field: unknown = Reflect.get(value, key);
    return [[key, field]];
  } catch {
    return [];
  }
}

/**
 * Read an Error, including one from another realm (for example `node:vm`),
 * detected by `instanceof` or the `Object.prototype.toString` tag; otherwise
 * return undefined. Avoids `Error.isError` so it runs in Convex and browsers.
 * The result holds the own enumerable fields (such as `code` and `errno`) plus
 * `name`, `message` and `stack`.
 * Never throws: it skips a field it cannot read.
 */
function readError(value: unknown): Record<string, unknown> | undefined {
  if (typeof value !== "object" || value === null) {
    return undefined;
  }
  try {
    const isError =
      value instanceof Error ||
      Object.prototype.toString.call(value).slice(8, -1) === "Error";
    if (!isError) {
      return undefined;
    }
  } catch {
    return undefined;
  }
  return Object.fromEntries(
    [...ownKeys(value), ...ERROR_FIELDS].flatMap((key) =>
      readEntry(value, key),
    ),
  );
}

function formatError(error: unknown): string {
  const message = readError(error)?.message;
  if (typeof message === "string") {
    return message;
  }
  try {
    return String(error);
  } catch {
    return "[unprintable error]";
  }
}

/**
 * Build the data and log it. If building throws (for example a throwing
 * getter in `extraData`), drop the entry, as `createLogger` does.
 */
function logBuilt(
  log: Logger["info"],
  event: string,
  build: () => LogData,
): void {
  try {
    log(event, build());
  } catch {
    // Dropped — building the data must not break the timed call
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
      logBuilt(base.info, `${label}.complete`, () => ({
        ...extraData,
        durationMs: Date.now() - start,
      }));
      return result;
    } catch (error) {
      logBuilt(base.error, `${label}.error`, () => ({
        ...extraData,
        durationMs: Date.now() - start,
        error: formatError(error),
      }));
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
      logBuilt(base.info, `${label}.complete`, () => ({
        ...extraData,
        durationMs: Date.now() - start,
      }));
      return result;
    } catch (error) {
      logBuilt(base.error, `${label}.error`, () => ({
        ...extraData,
        durationMs: Date.now() - start,
        error: formatError(error),
      }));
      throw error;
    }
  };
}

/**
 * Create an extended logger with timing helpers.
 *
 * @remarks The `.error` entry logs the `message` of a caught Error (from any
 * realm) verbatim, and any other value as `String(value)`. An Error whose
 * `message` is not a string logs as `String(error)`, for example `"Error: 42"`.
 * Callers handling sensitive errors should sanitize before throwing.
 * `.complete` and `.error` replace `extraData.durationMs`, and `.error` also
 * replaces `extraData.error`; `.start` logs `extraData` unchanged.
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
 * into a string, an Error of any realm into its own enumerable fields plus
 * `name`, `message` and `stack`, and circular references into "[Circular]".
 * Repeated non-circular references stay intact. Tracking the original values
 * on the current path also marks an Error whose own field points back to that
 * Error.
 */
function createReplacer(): (
  this: unknown,
  key: string,
  value: unknown,
) => unknown {
  const ancestors: unknown[] = [];
  const sources: unknown[] = [];
  return function replacer(this: unknown, _key: string, value: unknown) {
    if (typeof value === "bigint") {
      return value.toString();
    }
    const resolved = readError(value) ?? value;
    if (typeof resolved !== "object" || resolved === null) {
      return resolved;
    }
    // Drop everything below the current holder: the rest is a finished sibling branch.
    const depth = ancestors.indexOf(this) + 1;
    ancestors.splice(depth);
    sources.splice(depth);
    if (sources.includes(value)) {
      return "[Circular]";
    }
    ancestors.push(resolved);
    sources.push(value);
    return resolved;
  };
}

/** Return `String(entry[key])`, or undefined when reading or converting it throws. */
function readField(
  entry: LogEntry,
  key: "event" | "level",
): string | undefined {
  try {
    const value: unknown = entry[key];
    return String(value);
  } catch {
    return undefined;
  }
}

const FALLBACK_FIELDS: readonly ("event" | "level")[] = ["event", "level"];

/** Build the fallback line, leaving out each field it cannot read. */
function serializeErrorLine(entry: LogEntry): string {
  const fields = FALLBACK_FIELDS.flatMap((key) => {
    const value = readField(entry, key);
    return value === undefined ? [] : [`${key}=${value}`];
  });
  return ["[logger:serialize-error]", ...fields].join(" ");
}

/**
 * Default console output handler. Never throws, for any `LogEntry`. It handles
 * BigInt, Error (from any realm) and circular values; anything still
 * unserializable (a throwing toJSON or getter, or data nested thousands of
 * levels deep) degrades to a minimal event/level line that leaves out a field
 * it cannot read, and console failures disappear. An unreadable or unknown
 * level writes to `console.info`.
 */
export function consoleOutput(entry: LogEntry): void {
  let message: string;
  try {
    message = JSON.stringify(entry, createReplacer());
  } catch {
    message = serializeErrorLine(entry);
  }

  try {
    switch (readField(entry, "level") ?? "info") {
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

/**
 * Compose outputs into a single LogOutput. It calls them in order, each with
 * the same entry object, so an output must not mutate the entry. A throwing
 * output does not stop the next one.
 */
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

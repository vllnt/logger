# @vllnt/logger API

Reference for every public export. This file ships in the npm package, so the copy at
`node_modules/@vllnt/logger/docs/API.md` matches the installed version. The TypeScript sources
ship in `node_modules/@vllnt/logger/src/`.

## Entry points

The package is ESM only (`import`; there is no `require` condition). Every entry point ships
its own type declarations.

| Import                  | Exports                                                                                                                                                                                                   |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@vllnt/logger`         | `createBackendLogger`, `createLogger`, `createExtendedLogger`, `consoleOutput`, `composeOutputs`, `formatLogEntry`, `parseLogLevel`; types `LogLevel`, `LogData`, `LogEntry`, `LogOutput`, `Logger`, `ExtendedLogger`, `LoggerConfig` |
| `@vllnt/logger/convex`  | `createConvexLogger`                                                                                                                                                                                      |
| `@vllnt/logger/posthog` | `createPostHogOutput`; type `PostHogCapture`                                                                                                                                                              |
| `@vllnt/logger/testing` | `createTestOutput`; type `TestOutput`                                                                                                                                                                     |

`@vllnt/logger/convex`, `/posthog` and `/testing` import their types from `@vllnt/logger`.

## Behaviour shared by every logger

- The emitted `event` is `<scope>.<event>`: `createLogger("auth", …).info("login")` emits
  `auth.login`.
- Levels by severity: `debug` < `info` < `warn` < `error`. An entry is emitted when its level is
  at or above the configured level.
- `getLogLevel` runs on every log call. Its result goes through `parseLogLevel`; an invalid value
  or a throw falls back to `info`.
- Log calls never throw. A throwing `getLogLevel`, output or data getter is swallowed.
- Data is spread first, then `event`, `level` and `timestamp` (ISO 8601), so data cannot
  overwrite those three fields.
- Outputs are synchronous. There is no built-in redaction.

## `@vllnt/logger`

### `createBackendLogger(scope: string): ExtendedLogger`

Node.js preset. Reads `LOG_LEVEL` from `process.env` on each call, parsed with
`parseLogLevel(value, "warn")`, so the default is `warn`. Without `process` it uses `warn`.
Writes with `consoleOutput`.

```ts
import { createBackendLogger } from "@vllnt/logger";

const logger = createBackendLogger("payments");
logger.warn("charge.declined", { amount: 99 });
// console.warn: {"amount":99,"event":"payments.charge.declined","level":"warn","timestamp":"..."}
```

### `createLogger(scope: string, config: LoggerConfig): Logger`

Core factory with your own level source and output.

```ts
import { consoleOutput, createLogger } from "@vllnt/logger";

const logger = createLogger("api", {
  getLogLevel: () => "debug",
  output: consoleOutput,
});
logger.debug("request", { path: "/health" });
```

### `createExtendedLogger(scope: string, config: LoggerConfig): ExtendedLogger`

`createLogger` plus `withTiming` and `withTimingSync`:

- `withTiming<T>(label: string, execute: () => Promise<T>, extraData?: LogData): Promise<T>`
- `withTimingSync<T>(label: string, execute: () => T, extraData?: LogData): T`

Both log `info` `<scope>.<label>.start` with `extraData`, then `info` `<scope>.<label>.complete`
with `extraData` and `durationMs`. If `execute` throws, they log `error` `<scope>.<label>.error`
with `extraData`, `durationMs` and `error` (the `Error` message, otherwise `String(value)`, or
`"[unprintable error]"`), then rethrow the original error. The message is logged verbatim.

```ts
import { consoleOutput, createExtendedLogger } from "@vllnt/logger";

const logger = createExtendedLogger("db", {
  getLogLevel: () => "info",
  output: consoleOutput,
});
const rows = await logger.withTiming("query", () => fetchRows(), { table: "users" });
// db.query.start, then db.query.complete with durationMs
```

### `consoleOutput(entry: LogEntry): void`

Default output. Writes `JSON.stringify(entry)` to `console.debug`, `console.info`,
`console.warn` or `console.error` by level. `BigInt` is written as a string, `Error` as
`{ name, message, stack }`, a circular reference as `"[Circular]"`. If serialization still fails
(a throwing `toJSON` or getter) it writes `[logger:serialize-error] event=<event> level=<level>`.
A throwing `console` method is swallowed.

```ts
import { consoleOutput, formatLogEntry } from "@vllnt/logger";

consoleOutput(formatLogEntry("error", "job.failed", { error: new Error("timeout") }));
```

### `composeOutputs(...outputs: LogOutput[]): LogOutput`

Returns one output that calls each output in order. A throwing output does not stop the others.

```ts
import { composeOutputs, consoleOutput } from "@vllnt/logger";
import { createPostHogOutput } from "@vllnt/logger/posthog";

const output = composeOutputs(consoleOutput, createPostHogOutput(posthog.capture.bind(posthog)));
```

### `formatLogEntry(level: LogLevel, event: string, data?: LogData): LogEntry`

Builds an entry: `{ ...data, event, level, timestamp }`. It does not add a scope prefix.

```ts
import { formatLogEntry } from "@vllnt/logger";

formatLogEntry("info", "cache.hit", { key: "user:1" });
// { key: "user:1", event: "cache.hit", level: "info", timestamp: "2026-…Z" }
```

### `parseLogLevel(value: string | undefined, defaultLevel?: LogLevel): LogLevel`

Trims and lowercases `value`. Returns it when it is `debug`, `info`, `warn` or `error`, otherwise
`defaultLevel` (default `info`).

```ts
import { parseLogLevel } from "@vllnt/logger";

parseLogLevel(" WARN "); // "warn"
parseLogLevel("verbose", "error"); // "error"
```

### Types

```ts
type LogLevel = "debug" | "error" | "info" | "warn";
type LogData = Record<string, unknown>;
type LogEntry = { event: string; level: LogLevel; timestamp: string } & Record<string, unknown>;
type LogOutput = (entry: LogEntry) => void;

type Logger = {
  debug: (event: string, data?: LogData) => void;
  error: (event: string, data?: LogData) => void;
  info: (event: string, data?: LogData) => void;
  warn: (event: string, data?: LogData) => void;
};

type ExtendedLogger = Logger & {
  withTiming: <T>(label: string, execute: () => Promise<T>, extraData?: LogData) => Promise<T>;
  withTimingSync: <T>(label: string, execute: () => T, extraData?: LogData) => T;
};

type LoggerConfig = {
  /** Called on every log call. */
  getLogLevel: () => LogLevel;
  output: LogOutput;
};
```

## `@vllnt/logger/convex`

### `createConvexLogger(scope: string, level?: LogLevel): ExtendedLogger`

Logger for Convex queries, mutations and actions. Uses the fixed `level` (default `info`) and
`consoleOutput`. It does not read `process.env`.

```ts
import { createConvexLogger } from "@vllnt/logger/convex";

const logger = createConvexLogger("orders", "debug");
logger.info("created", { orderId });
```

## `@vllnt/logger/posthog`

### `createPostHogOutput(capture: PostHogCapture): LogOutput`

Calls `capture(entry.event, properties)`, where `properties` is the entry without `event`
(`level`, `timestamp` and your data). Errors thrown by `capture`, and rejections of a promise it
returns, are swallowed. No PostHog SDK dependency: pass your own function.

```ts
import { createLogger } from "@vllnt/logger";
import { createPostHogOutput } from "@vllnt/logger/posthog";

const logger = createLogger("billing", {
  getLogLevel: () => "info",
  output: createPostHogOutput((event, properties) => posthog.capture(event, properties)),
});
```

### `PostHogCapture`

```ts
type PostHogCapture = (event: string, properties?: Record<string, unknown>) => unknown;
```

## `@vllnt/logger/testing`

### `createTestOutput(): TestOutput`

An output that stores every entry in `entries`, for assertions.

```ts
import { createLogger } from "@vllnt/logger";
import { createTestOutput } from "@vllnt/logger/testing";

const { entries, output } = createTestOutput();
const logger = createLogger("test", { getLogLevel: () => "debug", output });
logger.info("hello", { a: 1 });
expect(entries[0]).toMatchObject({ event: "test.hello", level: "info", a: 1 });
```

### `TestOutput`

```ts
type TestOutput = {
  entries: readonly LogEntry[];
  output: LogOutput;
};
```

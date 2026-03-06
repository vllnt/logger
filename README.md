# @vllnt/logger

Structured JSON logging for the [@vllnt](https://github.com/vllnt) ecosystem.

Zero runtime dependencies. Tree-shakeable. Works in Node.js, Convex, browser, and edge runtimes.

## Install

```bash
pnpm add @vllnt/logger
```

## Quick Start

```ts
import { createBackendLogger } from "@vllnt/logger";

const logger = createBackendLogger("auth");

logger.info("login", { userId: "123" });
// → {"event":"auth.login","level":"info","timestamp":"...","userId":"123"}

logger.warn("rate-limited", { ip: "1.2.3.4" });
```

Set `LOG_LEVEL` env var to control verbosity (`debug`, `info`, `warn`, `error`). Defaults to `warn`.

## Subpath Exports

| Import | Use Case |
|--------|----------|
| `@vllnt/logger` | Core API + Node.js backend preset |
| `@vllnt/logger/convex` | Convex-safe logger (no `process.env`) |
| `@vllnt/logger/posthog` | PostHog output adapter |
| `@vllnt/logger/testing` | In-memory test output for assertions |

## API

### `createBackendLogger(scope): ExtendedLogger`

Pre-configured for Node.js. Reads `LOG_LEVEL` from `process.env` lazily on each log call.

```ts
const logger = createBackendLogger("payments");
logger.info("charge", { amount: 99, currency: "usd" });
```

### `createLogger(scope, config): Logger`

Core factory. Bring your own level strategy and output.

```ts
import { createLogger, consoleOutput } from "@vllnt/logger";

const logger = createLogger("api", {
  getLogLevel: () => "debug",
  output: consoleOutput,
});
```

### `createExtendedLogger(scope, config): ExtendedLogger`

Same as `createLogger` but adds `withTiming` and `withTimingSync` helpers.

```ts
const result = await logger.withTiming("db.query", async () => {
  return db.query("SELECT ...");
});
// Logs: scope.db.query.start → scope.db.query.complete (with durationMs)
// On error: scope.db.query.error (with durationMs + error message)
```

### `composeOutputs(...outputs): LogOutput`

Fan-out to multiple outputs. Each output is error-isolated.

```ts
import { composeOutputs, consoleOutput } from "@vllnt/logger";
import { createPostHogOutput } from "@vllnt/logger/posthog";

const output = composeOutputs(
  consoleOutput,
  createPostHogOutput(posthog.capture.bind(posthog)),
);
```

### `createConvexLogger(scope, level?): ExtendedLogger`

Safe for Convex queries, mutations, and actions. No `process.env` access.

```ts
import { createConvexLogger } from "@vllnt/logger/convex";

const logger = createConvexLogger("myFunction", "debug");
logger.info("started");
```

### `createPostHogOutput(capture): LogOutput`

Wraps a PostHog-compatible `capture` function as a `LogOutput`. Swallows errors.

```ts
import { createPostHogOutput } from "@vllnt/logger/posthog";

const output = createPostHogOutput(posthog.capture.bind(posthog));
```

### `createTestOutput(): TestOutput`

Captures log entries in-memory for test assertions.

```ts
import { createTestOutput } from "@vllnt/logger/testing";
import { createLogger } from "@vllnt/logger";

const { entries, output } = createTestOutput();
const logger = createLogger("test", {
  getLogLevel: () => "debug",
  output,
});

logger.info("hello", { a: 1 });
expect(entries[0].event).toBe("test.hello");
```

### Utilities

| Function | Description |
|----------|-------------|
| `formatLogEntry(level, event, data?)` | Build a `LogEntry` manually |
| `parseLogLevel(value, default?)` | Safe `string` to `LogLevel` parsing |
| `consoleOutput(entry)` | JSON to `console.debug/info/warn/error` (crash-safe) |

## Types

```ts
type LogLevel = "debug" | "info" | "warn" | "error";
type LogData = Record<string, unknown>;
type LogEntry = { event: string; level: LogLevel; timestamp: string } & Record<string, unknown>;
type LogOutput = (entry: LogEntry) => void;
type Logger = { debug, info, warn, error: (event: string, data?: LogData) => void };
type ExtendedLogger = Logger & { withTiming, withTimingSync };
type LoggerConfig = { getLogLevel: () => LogLevel; output: LogOutput };
```

## Design Decisions

- **Scoped events**: All events are prefixed with the logger scope (`auth.login`, `payments.charge`)
- **Reserved field protection**: User data cannot overwrite `event`, `level`, or `timestamp`
- **Crash-safe serialization**: `BigInt`, circular refs, and throwing `toJSON` are caught gracefully
- **Synchronous outputs**: `LogOutput` is synchronous by design — async adapters manage their own promises
- **Lazy level evaluation**: `getLogLevel()` is called per-emit, so env changes are picked up without restart
- **Zero side effects**: Core module has zero module-level side effects (`sideEffects: false`)

## License

[MIT](LICENSE)

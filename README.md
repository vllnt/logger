# @vllnt/logger

Zero-dependency structured JSON logger for TypeScript with scoped events, log levels, timing, and console, PostHog and test outputs for Node.js and Convex.

## For coding agents

`node_modules/@vllnt/logger/docs/API.md` documents every export with its signature, and the TypeScript
sources ship in `node_modules/@vllnt/logger/src/`. Both match the installed version.

## When to use

- Use it when you want one JSON line per event, with a scoped event name (`auth.login`), from TypeScript.
- Use it when the same logger API must run in Node.js and in Convex queries, mutations and actions.
- Use it when log entries should go to several outputs, such as the console and PostHog.
- Use it when tests should assert on log entries instead of console output.
- Do not use it when you need log transports, files, rotation, redaction or async batching: use [pino](https://github.com/pinojs/pino) or [winston](https://github.com/winstonjs/winston).
- Do not use it when entries must be stored and queried later: use [`@vllnt/convex-events`](https://oss.vllnt.com/packages/convex-events).
- Do not use it for product analytics with consent: use [`@vllnt/analytics`](https://oss.vllnt.com/packages/analytics).

## Install

```bash
pnpm add @vllnt/logger
```

## Quick start

```ts
import { createBackendLogger } from "@vllnt/logger";

const logger = createBackendLogger("auth");
logger.warn("login.failed", { userId: "123" });
// console.warn: {"userId":"123","event":"auth.login.failed","level":"warn","timestamp":"2026-11-27T12:00:00.000Z"}
```

`createBackendLogger` writes `warn` and `error` by default. Set `LOG_LEVEL=info` or `LOG_LEVEL=debug` to see more.

## API

Full reference with signatures and examples: [docs/API.md](docs/API.md).

| Export | Import from | What it does |
| --- | --- | --- |
| [`createBackendLogger`](docs/API.md#createbackendloggerscope-string-extendedlogger) | `@vllnt/logger` | Node.js logger: level from `LOG_LEVEL` (default `warn`), writes with `consoleOutput` |
| [`createLogger`](docs/API.md#createloggerscope-string-config-loggerconfig-logger) | `@vllnt/logger` | Logger with your own `getLogLevel` and `output` |
| [`createExtendedLogger`](docs/API.md#createextendedloggerscope-string-config-loggerconfig-extendedlogger) | `@vllnt/logger` | `createLogger` plus `withTiming` and `withTimingSync` |
| [`consoleOutput`](docs/API.md#consoleoutputentry-logentry-void) | `@vllnt/logger` | Output that writes one JSON line to `console.debug/info/warn/error` |
| [`composeOutputs`](docs/API.md#composeoutputsoutputs-logoutput-logoutput) | `@vllnt/logger` | Combines outputs; a throwing output does not stop the others |
| [`formatLogEntry`](docs/API.md#formatlogentrylevel-loglevel-event-string-data-logdata-logentry) | `@vllnt/logger` | Builds a `LogEntry` without a scope prefix |
| [`parseLogLevel`](docs/API.md#parseloglevelvalue-string--undefined-defaultlevel-loglevel-loglevel) | `@vllnt/logger` | Parses a string to a `LogLevel`, with a default |
| [`LogLevel`](docs/API.md#types) | `@vllnt/logger` | Type: `"debug" \| "info" \| "warn" \| "error"` |
| [`LogData`](docs/API.md#types) | `@vllnt/logger` | Type: `Record<string, unknown>` passed to a log call |
| [`LogEntry`](docs/API.md#types) | `@vllnt/logger` | Type: `{ event, level, timestamp }` plus your data |
| [`LogOutput`](docs/API.md#types) | `@vllnt/logger` | Type: `(entry: LogEntry) => void` |
| [`Logger`](docs/API.md#types) | `@vllnt/logger` | Type: `debug`, `info`, `warn`, `error` methods |
| [`ExtendedLogger`](docs/API.md#types) | `@vllnt/logger` | Type: `Logger` plus `withTiming`, `withTimingSync` |
| [`LoggerConfig`](docs/API.md#types) | `@vllnt/logger` | Type: `{ getLogLevel, output }` |
| [`createConvexLogger`](docs/API.md#createconvexloggerscope-string-level-loglevel-extendedlogger) | `@vllnt/logger/convex` | Convex logger with a fixed level (default `info`); no `process.env` |
| [`createPostHogOutput`](docs/API.md#createposthogoutputcapture-posthogcapture-logoutput) | `@vllnt/logger/posthog` | Output that calls your PostHog `capture` function |
| [`PostHogCapture`](docs/API.md#posthogcapture) | `@vllnt/logger/posthog` | Type: `(event, properties?) => unknown` |
| [`createTestOutput`](docs/API.md#createtestoutput-testoutput) | `@vllnt/logger/testing` | Output that stores entries in memory for assertions |
| [`TestOutput`](docs/API.md#testoutput) | `@vllnt/logger/testing` | Type: `{ entries, output }` |

## Common tasks

Set the level of `createBackendLogger` at runtime (read on every log call):

```bash
LOG_LEVEL=debug node app.js
```

Use your own level and output:

```ts
import { consoleOutput, createLogger, parseLogLevel } from "@vllnt/logger";

const logger = createLogger("api", {
  getLogLevel: () => parseLogLevel(process.env.API_LOG_LEVEL, "info"),
  output: consoleOutput,
});
logger.info("request", { method: "GET", path: "/health" });
```

Time an async call. It logs `<scope>.<label>.start`, then `.complete` with `durationMs`, or `.error` and rethrows:

```ts
import { consoleOutput, createExtendedLogger } from "@vllnt/logger";

const logger = createExtendedLogger("db", { getLogLevel: () => "info", output: consoleOutput });
const rows = await logger.withTiming("query", async () => [{ id: 1 }], { table: "users" });
logger.info("rows", { count: rows.length });
```

Log from a Convex query, mutation or action:

```ts
import { createConvexLogger } from "@vllnt/logger/convex";

const logger = createConvexLogger("orders", "debug");
logger.info("created", { orderId: "o_1" });
```

Write to the console and to PostHog (posthog-node):

```ts
import { composeOutputs, consoleOutput, createLogger } from "@vllnt/logger";
import { createPostHogOutput } from "@vllnt/logger/posthog";
import { PostHog } from "posthog-node";

const client = new PostHog("phc_project_api_key");
const logger = createLogger("billing", {
  getLogLevel: () => "info",
  output: composeOutputs(
    consoleOutput,
    createPostHogOutput((event, properties = {}) =>
      client.capture({ distinctId: "server", event, properties }),
    ),
  ),
});
logger.info("invoice.paid", { invoiceId: "in_1" });
await client.shutdown();
```

## Errors and fixes

Log calls never throw. These are the error messages and markers you can see, and their fixes:

| Error or message | Cause | Fix |
| --- | --- | --- |
| `[logger:serialize-error] event=<event> level=<level>` written instead of JSON | `consoleOutput` could not serialize the entry: a value has a throwing `toJSON`, a nested object has a throwing getter, or the data is nested thousands of levels deep. A field of this line that cannot be read is left out | Log plain, shallow data; convert class instances before logging |
| `"[Circular]"` as a field value | The data has a circular reference | None needed; log a plain copy to keep the full value |
| `"error": "[unprintable error]"` in a `<label>.error` entry | `withTiming` caught a value whose conversion to a string throws | Throw `Error` instances |
| The error from your function, after a `<label>.error` entry | `withTiming` and `withTimingSync` rethrow the original error | Catch it around the `withTiming` call |
| `ERR_PACKAGE_PATH_NOT_EXPORTED` from `require("@vllnt/logger")` | The package is ESM only and has no `require` export. A CommonJS project built with `moduleResolution: nodenext` type-checks, but its output calls `require` and fails here at runtime | Use `import`; in CommonJS use `await import("@vllnt/logger")`, a `.mts` file, or `"type": "module"` |
| `TS2307: Cannot find module '@vllnt/logger'` (TypeScript 6 reports `TS5107`, `node10` is deprecated, first) | TypeScript `moduleResolution` is `node10` (`node`), which ignores `exports` | Set `moduleResolution` to `nodenext`, `node16` or `bundler` |
| `TS1479: The current file is a CommonJS module whose imports will produce 'require' calls` | A CommonJS file under `node16` imports this ESM package | Add `"type": "module"`, use a `.mts` file, or use `await import()` |

## Limits and gotchas

- `createBackendLogger` defaults to `warn`: `debug` and `info` calls write nothing until `LOG_LEVEL` is set. `withTiming` logs `.start` and `.complete` at `info`, so only `.error` shows at the default.
- `createConvexLogger` uses its fixed `level` (default `info`) and never reads environment variables.
- An invalid `LOG_LEVEL` falls back to `warn`. A custom `getLogLevel` that returns an invalid value or throws falls back to `info`.
- Data keys `event`, `level` and `timestamp` are silently replaced by the logger's values.
- `formatLogEntry` does not add the scope prefix; only logger methods do.
- A throwing output is swallowed without a trace. Outputs are synchronous: a returned promise is not awaited. `createPostHogOutput` swallows rejected promises, but a promise rejected by any other output is not handled; in Node.js that is an unhandled rejection, so catch inside an async output.
- `composeOutputs` calls outputs in order, each with the same entry object, so an output must not mutate the entry. A throwing output does not stop the next one.
- A throwing getter at the top level of log-call data, or of `withTiming`/`withTimingSync` `extraData`, drops that entry silently: it runs while the entry is built. The timing helpers still return the result or rethrow the original error. A throwing getter deeper down gives the `[logger:serialize-error]` line.
- `consoleOutput` writes `BigInt` as a string and an `Error`, also one from another realm such as `node:vm`, as `{ name, message, stack }`. Like `JSON.stringify`, it writes `Map` and `Set` as `{}` and `NaN` as `null`; it drops `undefined`, functions and symbols from objects and writes them as `null` in arrays.
- `withTiming` logs `error.message` verbatim, without the stack. There is no redaction.
- `withTiming` and `withTimingSync` replace `extraData.durationMs` in `.complete` and `.error`, and `extraData.error` in `.error`; `.start` logs `extraData` unchanged.
- `createTestOutput` keeps every entry in memory; create a new one per test.

## Compatibility

- Runtime dependencies: none. Peer dependencies: none.
- ESM only, with typings for every entry point. TypeScript `moduleResolution` must be `nodenext`, `node16` or `bundler`, and the importing file must be ESM: in a CommonJS project, `nodenext` type-checks but the emitted `require` fails at runtime.
- Node.js: no `engines` field. The build targets ES2024; CI tests on Node.js 24.
- Convex: `@vllnt/logger/convex` does not read `process.env`. Browsers and edge runtimes: the core uses no Node.js APIs and `createBackendLogger` checks for `process` first, but tests run only on Node.js.
- PostHog: with posthog-js, pass `(event, properties) => posthog.capture(event, properties)` so `capture` keeps its `this`. posthog-node needs the wrapper shown above; it is type-checked against posthog-node 6.

## Testing

Capture entries with `createTestOutput` and assert on them:

```ts
import assert from "node:assert/strict";
import { createLogger } from "@vllnt/logger";
import { createTestOutput } from "@vllnt/logger/testing";

const { entries, output } = createTestOutput();
const logger = createLogger("checkout", { getLogLevel: () => "debug", output });
logger.info("paid", { orderId: "o_1" });
assert.equal(entries[0]?.event, "checkout.paid");
```

## Security

There is no built-in redaction: pass only data you are willing to log. Report vulnerabilities as described in
[SECURITY.md](https://github.com/vllnt/logger/blob/main/SECURITY.md).

## Related packages

None. This package has no runtime or peer dependencies, and no other @vllnt package shares code, a test or an example with it.

## Contributing

See [CONTRIBUTING.md](https://github.com/vllnt/logger/blob/main/CONTRIBUTING.md). Every publish runs in
`.github/workflows/publish.yml` with npm trusted publishing and provenance; nothing is published from a
local machine. Maintainers only.

- Canary (`@canary`): every push to `main` that touches the package publishes one
  (`pnpm add @vllnt/logger@canary`).
- Stable (`@latest`): merge a PR that sets `package.json` `version` and adds a matching
  `## [X.Y.Z]` entry to `CHANGELOG.md`, then push the tag `vX.Y.Z` on that `main` commit.

## Links

- Docs and changelog: [oss.vllnt.com/packages/logger](https://oss.vllnt.com/packages/logger) · [release feed](https://oss.vllnt.com/packages/logger/rss.xml)
- All @vllnt packages: [oss.vllnt.com](https://oss.vllnt.com) · [search packages and docs on index.vllnt.com](https://index.vllnt.com)
- Source and issues: [GitHub](https://github.com/vllnt/logger) · [issues](https://github.com/vllnt/logger/issues) · [npm](https://www.npmjs.com/package/@vllnt/logger)
- Questions and updates: [Discord](https://bntvllnt.com/discord) · [X @bntvllnt](https://x.com/bntvllnt)
- Company and author: [vllnt.com](https://vllnt.com) · [bntvllnt.com](https://bntvllnt.com) · [GitHub @bntvllnt](https://github.com/bntvllnt) · [LinkedIn](https://linkedin.com/in/bntvllnt)
- Sponsor: [GitHub Sponsors](https://github.com/sponsors/bntvllnt)

## License

[MIT](LICENSE)

---

Part of [vllnt open source](https://oss.vllnt.com) · [Package page](https://oss.vllnt.com/packages/logger) · [vllnt.com](https://vllnt.com) · Built by [bntvllnt](https://bntvllnt.com)

# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses
[Semantic Versioning](https://semver.org/).

## [0.2.0] - 2026-11-28

### Added

- The npm package ships `docs/API.md` (every public export, with a type-checked example for each
  function), `llms.txt`, `CHANGELOG.md` and the TypeScript sources in `src/`, so coding agents can
  read docs that match the installed version in `node_modules/@vllnt/logger/`.
- README: when to use, an API table of every export, common tasks, errors and fixes, limits and
  gotchas, compatibility and links. Every TypeScript example is type-checked against the built
  package.

### Changed

- `consoleOutput` writes an `Error` in data (also one from another realm such as `node:vm`, or any
  object whose `Object.prototype.toString` tag is `Error`) as its own enumerable fields plus
  `name`, `message` and `stack`; a plain `Error` was `{}` before. Stack traces now reach the log
  sink: if it must not store them, map errors to plain data before logging.
- `consoleOutput` keeps the entry when data holds a `BigInt` (written as a string) or a circular
  reference (written as `"[Circular]"`) instead of writing the `[logger:serialize-error]` line.
  Expect strings for these fields when you read the logs.
- `consoleOutput` never throws: a throwing `console` method or a throwing `event` or `level`
  getter is swallowed. The `[logger:serialize-error]` line leaves out a field it cannot read, and
  data nested thousands of levels deep still gives that line. No action needed.
- Log calls never throw: an error from `getLogLevel`, an output or a data getter is swallowed
  instead of reaching the caller. A throwing data getter drops the entry; a throwing output has
  already received it. If you relied on that error, catch it inside your output or check your data
  before logging.
- `getLogLevel` results go through `parseLogLevel`: a level in another case or with spaces
  (`"WARN"`) now selects that level, and any other value, or a throw, falls back to `info`, instead
  of dropping every entry or throwing. Return a valid `LogLevel` to choose another level.
- `withTiming` and `withTimingSync` always run `execute` and return its result or rethrow its
  original error. A throwing output or `extraData` getter no longer stops `execute` from running
  (at `.start`) or replaces its result or error (at `.complete` and `.error`); only entries that
  cannot be built are dropped. Keep catching errors around the call as before.
- The `.error` entry of `withTiming` and `withTimingSync` logs the `message` of an `Error` from
  another realm (or any object tagged `Error`) instead of `"<name>: <message>"`; `String(error)`
  (for example `"Error: 42"`) when an Error's `message` is not a string, instead of the raw value;
  and `"[unprintable error]"` when a thrown value cannot be converted to a string, instead of
  replacing the original error with a `TypeError`. Update log queries that matched the old text.
- `createPostHogOutput` catches a rejection of a promise or other thenable that `capture` returns,
  instead of leaving an unhandled rejection (which stops Node.js by default). It now calls `then`
  on any thenable `capture` returns, so a lazy thenable starts. Watch delivery failures in your
  PostHog client if you need them.
- `PostHogCapture` returns `unknown` instead of `void`; every function accepted before is still
  accepted. No action needed.
- `package.json` `exports` lists the `types` condition first, and the package is built with tsup 9
  and TypeScript 6: the subpath `.d.ts` files import shared types from `./index.js`. Apart from
  `PostHogCapture`, the types consumers see do not change. No action needed.
- `package.json`: new `description`, `homepage`, `keywords`, `funding` and `bugs`; `author` is an
  object.
- Releases: `@latest` publishes only from a `vX.Y.Z` tag on `main` (pushed, or picked for a manual
  run) instead of a manual run that bumped the version, `@canary` also publishes when only docs,
  `README.md`, `CHANGELOG.md`, `llms.txt`, `LICENSE` or `package.json` change, and a canary built
  after a release is numbered above it (for example `0.2.1-canary.<sha>` after `0.2.0`). No action
  needed.
- Development only: CI and release workflow hardening, more tests and package checks, and
  upgraded development dependencies. Runtime and peer dependencies are still none.

## [0.1.2] - 2026-03-10

### Changed

- Publish workflow and CI refinements.

## [0.1.1] - 2026-03-10

### Changed

- Added the publish workflow (trusted publishing, canary and release jobs) and refined CI.

## [0.1.0] - 2026-03-09

### Added

- Initial release: core logger (`createLogger`, `createExtendedLogger`, `composeOutputs`,
  `consoleOutput`, `formatLogEntry`, `parseLogLevel`), Node.js backend preset, and the `/convex`,
  `/posthog` and `/testing` entry points.

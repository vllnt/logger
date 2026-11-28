# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses
[Semantic Versioning](https://semver.org/).

## [0.2.0] - 2026-11-28

### Added

- The npm package ships `docs/API.md` (every public export with a type-checked example),
  `llms.txt`, `CHANGELOG.md` and the TypeScript sources in `src/`, so coding agents can read docs
  that match the installed version in `node_modules/@vllnt/logger/`.
- README: when to use, an API table of every export, common tasks, errors and fixes, limits and
  gotchas, compatibility and links. Every TypeScript example is type-checked against the built
  package.
- Release channels: `@canary` publishes on every push to `main` that touches the package; `@latest`
  publishes only from a `vX.Y.Z` tag on `main`. Both use npm trusted publishing with provenance.

### Changed

- `consoleOutput` writes an `Error` in data, also one from another realm such as `node:vm`, as
  `{ name, message, stack }` instead of `{}`, so stack traces reach the log sink. If the sink must
  not store stacks, map errors to plain data before logging.
- `consoleOutput` keeps the entry when data holds a `BigInt` (written as a string) or a circular
  reference (written as `"[Circular]"`) instead of writing the `[logger:serialize-error]` line.
  Expect strings for these fields when you read the logs.
- `consoleOutput` never throws: a throwing `console` method or a throwing `event` or `level`
  getter is swallowed. The `[logger:serialize-error]` line leaves out a field it cannot read, and
  very deep data (thousands of levels) also gives that line. No action needed.
- Log calls never throw: a throwing `getLogLevel`, output or data getter is swallowed and that
  entry is dropped, instead of the error reaching the caller. Check your output or data directly if
  you relied on that error.
- An invalid or throwing `getLogLevel` falls back to `info` instead of dropping every entry or
  throwing. Return a valid `LogLevel` to choose another level.
- `withTiming` and `withTimingSync` always return the result or rethrow the original error: a
  throwing output or `extraData` getter no longer replaces it, and only entries that cannot be
  built are dropped. Keep catching errors around the call as before.
- `withTiming` and `withTimingSync` log the `message` of an `Error` from another realm instead of
  `"<name>: <message>"`, and `"[unprintable error]"` instead of throwing when a thrown value cannot
  be converted to a string. Update log queries that matched the old text.
- `createPostHogOutput` swallows a rejected promise or thenable returned by `capture` instead of
  leaving an unhandled rejection. Watch delivery failures in your PostHog client if you need them.
- `PostHogCapture` returns `unknown` instead of `void`; every function accepted before is still
  accepted. No action needed.
- `package.json` `exports` lists the `types` condition first, and the package is built with tsup 9
  and TypeScript 6: the subpath `.d.ts` files import shared types from `./index.js`. The types
  consumers see do not change. No action needed.
- `package.json`: new `description`, `homepage`, `keywords`, `funding` and `bugs`; `author` is an
  object.
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

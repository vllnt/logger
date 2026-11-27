# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses
[Semantic Versioning](https://semver.org/).

## [0.1.3] - 2026-11-27

### Added

- The npm package ships `docs/API.md` (every public export with an example), `llms.txt`,
  `CHANGELOG.md` and the TypeScript sources in `src/`, so coding agents can read docs that match
  the installed version from `node_modules/@vllnt/logger/`. `llms.txt` links the shipped files
  with relative paths.
- README notes the bundled docs for coding agents and lists related packages.
- `package.json` sets `homepage` and `keywords`. Docs-only changes on `main` now publish a canary.

### Fixed

- Log calls never throw. A throwing `getLogLevel`, output, or data getter is swallowed instead of
  propagating into the host application; `withTiming` and `withTimingSync` always rethrow the
  original error from the wrapped function.
- An invalid or throwing `getLogLevel` falls back to `info` instead of silently dropping every entry.
- `consoleOutput` keeps the entry when data holds a `BigInt` (written as a string), an `Error`
  (written as `{ name, message, stack }`, previously `{}`) or a circular reference
  (written as `"[Circular]"`). Only a throwing `toJSON` or getter still degrades to the minimal line.
- `consoleOutput` no longer throws when a `console` method throws.
- `createPostHogOutput` swallows rejected promises returned by `capture` instead of leaving an
  unhandled rejection. `PostHogCapture` now accepts functions returning any value.
- `withTiming` logs a placeholder when a thrown value cannot be converted to a string.
- `docs/API.md`: the posthog-node wrapper now type-checks under `exactOptionalPropertyTypes`
  (`(event, properties = {}) => client.capture({ distinctId, event, properties })`), and the
  placeholder note names every placeholder. Tests type-check every example against the sources
  and posthog-node, and check the entry-point table against the real exports.
- The publish workflow builds before it runs the tests, so the check of the built package files
  runs before every publish instead of being skipped.

### Changed

- `package.json` `exports` lists the `types` condition first so every resolver picks the typings.
- Publishing: stable releases come only from a pushed `vX.Y.Z` tag on `main` (npm trusted
  publishing with provenance); canary builds still publish on every push to `main`. Actions are
  pinned to commit SHAs, the workflow token is read-only by default, and pnpm is pinned to 10.34.8
  with a seven-day minimum release age.
- README documents the release flow, serialization behaviour and that there is no built-in redaction.
- Built with tsup 9 and TypeScript 6. The shipped `.d.ts` files use `export type { … }` and
  the subpath declarations import shared types from `./index.js`; the types consumers see are
  unchanged.
- Development only: `@vllnt/typescript` 3 (stricter compiler flags; published output unchanged),
  `vitest` 5.1.1, and `pnpm test:coverage`.

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

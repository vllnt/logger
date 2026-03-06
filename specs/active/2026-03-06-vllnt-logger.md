---
title: "@vllnt/logger — Structured logging package"
status: active
created: 2026-03-06
estimate: 4h
tier: standard
---

# @vllnt/logger — Structured logging package

## Context

Structured logging is duplicated across @vllnt projects. `@songtrivia/logger` (922 LOC, single file) is battle-tested but hardcoded to songtrivia (Axiom dataset URL, platform env vars). Extract core logging into a generic `@vllnt/logger` package with composable provider adapters. Wide events, PII redaction, and tail sampling deferred to v2.

## Codebase Impact (MANDATORY)

| Area | Impact | Detail |
|------|--------|--------|
| `src/core.ts` | CREATE | Pure functions, ZERO side effects: types, createLogger, createExtendedLogger, consoleOutput, composeOutputs, parseLogLevel, formatLogEntry, shouldLog |
| `src/backend.ts` | CREATE | createBackendLogger preset (lazy — no module-level instantiation) |
| `src/convex.ts` | CREATE | createConvexLogger: imports ONLY from core.ts, no process.env |
| `src/posthog.ts` | CREATE | PostHog output adapter: wraps generic capture fn as LogOutput |
| `src/testing.ts` | CREATE | createTestOutput() for consumer test utilities |
| `src/index.ts` | CREATE | Barrel: re-exports core.ts + backend.ts public API |
| `package.json` | CREATE | ESM, subpath exports, publishConfig, tsup build, sideEffects: false |
| `tsconfig.json` | CREATE | Extends @vllnt/typescript/node-library.json |
| `tsup.config.ts` | CREATE | 5 entry points (index, convex, posthog, testing), ESM, dts: true |
| `eslint.config.js` | CREATE | Extends @vllnt/eslint-config/nodejs |
| `vitest.config.ts` | CREATE | Test config |
| `tests/` | CREATE | Unit tests for core, backend, convex, posthog, testing, composeOutputs |

**Files:** 12 create | 0 modify | 0 affected
**Reuse:** Core createLogger/createExtendedLogger/consoleOutput from `@songtrivia/logger` (~300 LOC of 922)
**Breaking changes:** None (new package)
**New dependencies:** None runtime. Dev: `@vllnt/eslint-config`, `@vllnt/typescript`, `vitest`, `tsup`, `@types/node`

### Architecture

```
src/
  core.ts ──────── Pure functions, ZERO side effects
    │                Types, createLogger, createExtendedLogger,
    │                consoleOutput, composeOutputs, parseLogLevel
    │
  index.ts ─────── Barrel: re-exports core + backend
    │
  backend.ts ───── createBackendLogger (lazy process.env read)
    │
  convex.ts ────── createConvexLogger (imports core.ts ONLY)
    │
  posthog.ts ───── createPostHogOutput (generic capture fn)
    │
  testing.ts ───── createTestOutput (test utilities)
```

```
Package exports → dist/
  "."          → index.js     (core + backend)
  "./convex"   → convex.js    (Convex-safe)
  "./posthog"  → posthog.js   (PostHog adapter)
  "./testing"  → testing.js   (test utilities)
```

### Design Constraints (from spec review)

| Constraint | Rationale |
|------------|-----------|
| `core.ts` has ZERO module-level side effects | Safe import in Convex, edge, browser — `sideEffects: false` |
| `backend.ts` reads process.env lazily (inside function, not at module scope) | No eager instantiation of rootBackendLogger |
| `convex.ts` imports ONLY from `core.ts` | Prevents transitive process.env reads |
| `formatLogEntry` spreads user data FIRST, fixed fields LAST | Prevents `data.event` overwriting structured `event` field |
| `consoleOutput` wraps JSON.stringify in try/catch | Prevents BigInt/toJSON crashes |
| `LogOutput` is synchronous by design | Async adapters own their error handling; must not block caller |
| Public API is minimal — internals unexported | `shouldLog`, `LOG_LEVEL_PRIORITY`, `DEFAULT_LOG_LEVELS` are internal |

## User Journey (MANDATORY)

### Primary Journey

ACTOR: Developer in @vllnt ecosystem (vllnt, the-forge, songtrivia, backtier, cortex, pm-killer)
GOAL: Add structured logging to their project with minimal config
PRECONDITION: Project uses pnpm, TypeScript, ESM

1. Developer installs `@vllnt/logger`
   -> Package available via npm
   -> Developer adds to package.json

2. Developer imports and creates a scoped logger
   -> `import { createBackendLogger } from "@vllnt/logger"`
   -> Logger available with `.info()`, `.warn()`, `.error()`, `.debug()`, `.withTiming()`

3. Developer logs structured events
   -> `logger.info("user.created", { userId: "123" })`
   -> JSON output: `{"userId":"123","event":"auth.user.created","level":"info","timestamp":"..."}`
   -> Note: user data spread first, fixed fields last (no collision risk)

4. Developer composes multiple outputs
   -> `import { consoleOutput, composeOutputs } from "@vllnt/logger"`
   -> `const output = composeOutputs(consoleOutput, postHogOutput)`
   -> Single logger fans out to multiple destinations; each output isolated

5. Developer adds PostHog provider
   -> `import { createPostHogOutput } from "@vllnt/logger/posthog"`
   -> Logs forwarded to PostHog via capture function

6. Developer uses logger in Convex functions
   -> `import { createConvexLogger } from "@vllnt/logger/convex"`
   -> Works in Convex runtime (no process.env, no crypto.randomUUID)

7. Developer writes tests for code that logs
   -> `import { createTestOutput } from "@vllnt/logger/testing"`
   -> `const { output, entries } = createTestOutput()`
   -> Assert against captured entries

POSTCONDITION: Structured JSON logging across all environments with consistent API

### Error Journeys

E1. Invalid log level configuration
    Trigger: `LOG_LEVEL` env var set to invalid value (e.g., "verbose")
    1. Developer sets `LOG_LEVEL=verbose`
       -> System falls back to default level ("warn")
       -> No crash, no warning — silent fallback
    Recovery: Logger works with default level

E2. PostHog capture function throws
    Trigger: PostHog SDK error during capture
    1. Logger calls PostHog output adapter
       -> Adapter catches error silently
       -> Console output still works (adapters are independent)
    Recovery: Logging continues without PostHog

E3. composeOutputs: one output throws
    Trigger: Any output in the composed chain throws
    1. Logger emits entry through composeOutputs
       -> Failing output is caught; remaining outputs still execute
    Recovery: Partial delivery (non-throwing outputs succeed)

E4. Unserializable log data (BigInt, circular ref, throwing toJSON)
    Trigger: Developer passes problematic value to logger
    1. consoleOutput attempts JSON.stringify
       -> Caught; fallback string representation logged instead
    Recovery: Entry logged in degraded format, no crash

### Edge Cases

EC1. Convex runtime: `process` is undefined -> logger uses explicit level param or defaults
EC2. Empty log data -> Event logged with only event, level, timestamp
EC3. User data contains `event`, `level`, or `timestamp` keys -> Fixed fields win (spread order)
EC4. composeOutputs with 0 outputs -> No-op (valid, no crash)
EC5. composeOutputs with 1 output -> Behaves identically to that output

## Acceptance Criteria (MANDATORY)

### Must Have (BLOCKING)

- [ ] AC-1: GIVEN `createBackendLogger("auth")` WHEN `logger.info("login", { userId: "123" })` THEN console receives JSON with `event: "auth.login"`, `level: "info"`, `timestamp`, `userId: "123"`
- [ ] AC-2: GIVEN a logger configured with level "warn" WHEN `logger.debug()` is called THEN no output is produced
- [ ] AC-3: GIVEN `createConvexLogger` imported from `@vllnt/logger/convex` WHEN used in env without `process` global THEN it works without errors
- [ ] AC-4: GIVEN `createPostHogOutput(capture)` WHEN logger emits THEN `capture(event, properties)` is called with correct args
- [ ] AC-5: GIVEN `composeOutputs(outputA, outputB)` WHEN a log entry is emitted THEN both outputs receive the entry
- [ ] AC-6: GIVEN `composeOutputs(throwingOutput, goodOutput)` WHEN a log entry is emitted THEN goodOutput still receives the entry
- [ ] AC-7: GIVEN `logger.info("op", { event: "override" })` WHEN entry is formatted THEN `event` is `"scope.op"` (fixed fields win, not user data)
- [ ] AC-8: GIVEN `@vllnt/logger` published to npm WHEN installed THEN subpath exports `.`, `./convex`, `./posthog`, `./testing` resolve correctly (compiled JS + .d.ts)
- [ ] AC-9: GIVEN `consoleOutput` receives an entry with BigInt value WHEN JSON.stringify fails THEN it falls back to string representation without throwing
- [ ] AC-10: GIVEN `createTestOutput()` imported from `@vllnt/logger/testing` WHEN logger emits entries THEN `entries` array contains all emitted LogEntry objects

### Error Criteria (BLOCKING)

- [ ] AC-E1: GIVEN LOG_LEVEL is set to an invalid value WHEN logger is created THEN it falls back to default level without crashing
- [ ] AC-E2: GIVEN PostHog capture function throws WHEN logger emits THEN error is swallowed silently

### Should Have

- [ ] AC-11: GIVEN `withTiming("label", fn)` WHEN fn completes THEN `.start` and `.complete` events are logged with durationMs
- [ ] AC-12: GIVEN `withTiming("label", fn)` WHEN fn throws THEN `.error` event logged with durationMs and error is re-thrown

## Scope

- [ ] 1. Core types in `core.ts`: `LogLevel`, `LogData`, `LogEntry`, `Logger`, `ExtendedLogger`, `LogOutput`, `LoggerConfig` -> AC-1, AC-2
- [ ] 2. `createLogger(scope, config)` + `createExtendedLogger` with timing in `core.ts` -> AC-1, AC-2, AC-11, AC-12
- [ ] 3. `consoleOutput` (crash-safe JSON.stringify) in `core.ts` -> AC-1, AC-9
- [ ] 4. `composeOutputs(...outputs)` with per-output error isolation in `core.ts` -> AC-5, AC-6
- [ ] 5. `formatLogEntry` with user-data-first spread (reserved field protection) in `core.ts` -> AC-7
- [ ] 6. `createBackendLogger(scope)` in `backend.ts` (lazy process.env, no module-level singleton) -> AC-1, AC-E1
- [ ] 7. `createConvexLogger(scope, level?)` in `convex.ts` (imports core.ts only) -> AC-3
- [ ] 8. `createPostHogOutput(capture)` in `posthog.ts` (error-swallowing) -> AC-4, AC-E2
- [ ] 9. `createTestOutput()` in `testing.ts` -> AC-10
- [ ] 10. Package config: package.json (exports, sideEffects: false), tsconfig, tsup, eslint, vitest -> AC-8
- [ ] 11. Unit tests for all ACs + failure modes -> all ACs

### Out of Scope

- Wide events (WideEventBuilder, withWideEvent, createWideEventLogger) — **v2**
- PII/secrets redaction — **v2** (with narrowed regex patterns)
- Tail sampling (shouldSampleEvent, getSamplingConfig) — **v2**
- Platform detection (Expo/Next) — dropped permanently
- Client logger preset — consumers compose with composeOutputs
- Axiom adapter — defer to v2 or separate package
- Standalone `log()`, `warn()`, `error()`, `debug()` functions — forces explicit scoping
- `BackendLogger` type / `.log()` alias — `createBackendLogger` returns `ExtendedLogger`
- Log rotation, file output, or log aggregation
- React hooks or framework-specific integrations

## Quality Checklist

### Blocking

- [ ] All Must Have ACs passing
- [ ] All Error Criteria ACs passing
- [ ] All scope items implemented
- [ ] Error states handled (not just happy path)
- [ ] No hardcoded secrets or credentials
- [ ] Zero runtime dependencies
- [ ] All subpath exports resolve correctly
- [ ] TypeScript strict mode passes
- [ ] `core.ts` has zero module-level side effects
- [ ] `convex.ts` has zero transitive imports from `backend.ts`
- [ ] `sideEffects: false` is truthful in package.json

### Advisory

- [ ] All Should Have ACs passing
- [ ] TSDoc on all exported functions (document LogOutput sync-only design)
- [ ] README with usage examples for each entrypoint

## Test Strategy (MANDATORY)

### Test Environment

| Component | Status | Detail |
|-----------|--------|--------|
| Test runner | to configure | vitest |
| E2E framework | N/A | pure library, no UI |
| Mock boundaries | 2 | console (vi.spyOn), PostHog capture (vi.fn) |

### AC -> Test Mapping

| AC | Test Type | Test Intention |
|----|-----------|----------------|
| AC-1 | Unit | createBackendLogger produces correct JSON shape to console |
| AC-2 | Unit | Log level filtering suppresses lower-priority levels |
| AC-3 | Unit | createConvexLogger works without process/crypto globals |
| AC-4 | Unit | createPostHogOutput calls capture fn with correct args |
| AC-5 | Unit | composeOutputs fans out to all outputs |
| AC-6 | Unit | composeOutputs isolates throwing outputs |
| AC-7 | Unit | User data with reserved keys doesn't overwrite fixed fields |
| AC-8 | Unit | Subpath exports resolve (import test) |
| AC-9 | Unit | consoleOutput handles BigInt/unserializable without throwing |
| AC-10 | Unit | createTestOutput captures entries into array |
| AC-E1 | Unit | parseLogLevel falls back on invalid input |
| AC-E2 | Unit | PostHog adapter swallows capture errors |
| AC-11 | Unit | withTiming logs start/complete with durationMs |
| AC-12 | Unit | withTiming logs error + re-throws on failure |

### Failure Mode Tests (MANDATORY)

| Source | ID | Test Intention | Priority |
|--------|----|----------------|----------|
| Error Journey | E1 | invalid LOG_LEVEL -> uses default, no crash | BLOCKING |
| Error Journey | E2 | throwing PostHog capture -> swallowed | BLOCKING |
| Error Journey | E3 | composeOutputs: throwing output doesn't kill others | BLOCKING |
| Error Journey | E4 | BigInt in log data -> fallback, no crash | BLOCKING |
| Edge Case | EC1 | No process global -> logger works with defaults | BLOCKING |
| Edge Case | EC3 | Reserved field collision -> fixed fields win | BLOCKING |
| Edge Case | EC4 | composeOutputs with 0 outputs -> no-op | Advisory |

### Mock Boundary

| Dependency | Strategy | Justification |
|------------|----------|---------------|
| console | Spy (vi.spyOn) | Verify output shape without real console noise |
| PostHog capture | vi.fn mock | Consumer provides fn — test the contract |

### TDD Commitment

All tests written BEFORE implementation (RED -> GREEN -> REFACTOR).

## Risks

| Risk | Impact | Likelihood | Mitigation |
|------|--------|------------|------------|
| Migration friction for songtrivia (no createClientLogger, no wide events) | MED | HIGH | Document migration path; songtrivia keeps own logger until v2 ships wide events |
| tsup config complexity for subpath exports | LOW | MED | Simple config: 5 entry points, ESM only, dts: true |
| Package name collision on npm | LOW | LOW | Check npm registry before publish |

**Kill criteria:** If tsup can't handle the subpath exports cleanly, fall back to tsc + manual .d.ts.

## State Machine

**Status:** N/A — Stateless library

**Rationale:** Pure utility library. No stateful flows in v1 (wide event builder deferred to v2).

## Analysis

### Assumptions Challenged

| # | Assumption | Evidence For | Evidence Against | Verdict | Action |
|---|------------|-------------|-----------------|---------|--------|
| 1 | Compiled JS + .d.ts via tsup | Standard npm practice; @vllnt published packages ship JS/JSON | Adds build step + dev dep | VALID | -> no action |
| 2 | No peer deps for PostHog | Generic capture fn; consumer passes their own | PostHog types would improve DX | VALID | -> no action |
| 3 | core.ts + backend.ts split is necessary | Prevents module-level side effects leaking into Convex/edge; enables sideEffects: false | More files than reference | VALID | -> no action (confirmed by spec review: 4 perspectives agree) |
| 4 | Drop standalone log/warn/error/debug exports | Forces explicit scoping, avoids hidden global singleton | Less convenient for scripts | VALID | -> no action (user confirmed) |
| 5 | Wide events deferred to v2 | Cuts scope to ~300 LOC; only songtrivia uses them today | Delays feature for songtrivia | VALID | -> no action (user confirmed) |

### Blind Spots

1. **[Integration]** songtrivia migration: no createClientLogger, no wide events, no platform detection, no Axiom
   Why it matters: songtrivia keeps its own logger until v2. Document this explicitly.

2. **[DX]** LogOutput sync-only design not obvious from types
   Why it matters: consumer might return a Promise from output fn, expecting it to be awaited. TSDoc must state: "synchronous by design — async adapters must handle their own promises."

### Failure Hypotheses

| # | IF | THEN | BECAUSE | Severity | Mitigation |
|---|-----|------|---------|----------|-----------|
| FH-1 | convex.ts transitively imports backend.ts | Convex runtime may fail on process.env | Import chain: convex -> index -> backend (module-level side effects) | HIGH | convex.ts imports ONLY from core.ts (BLOCKING constraint) |
| FH-2 | User passes BigInt/circular ref to basic logger | consoleOutput crashes caller | JSON.stringify throws on BigInt, no try/catch in reference | HIGH | Crash-safe consoleOutput with try/catch (AC-9) |
| FH-3 | User data has `event` key | Structured event name overwritten, log data corrupted | Reference spreads data LAST | HIGH | Spread data FIRST, fixed fields LAST (AC-7) |

### The Real Question

v1 is the right scope: core logger + composeOutputs + convex + posthog + testing utilities. ~300 LOC. Ships in 4h. Proven patterns from songtrivia, minus the songtrivia-specific parts. Wide events are powerful but only 1 consumer uses them — defer per Rule of Three.

### Open Items

- [gap] songtrivia migration plan -> no action (songtrivia keeps own logger until v2 adds wide events)
- [improvement] v2 PII redaction: narrow regex patterns (word boundaries, not `/auth/i`) -> no action (v2 scope)

## Notes

Spec review applied: 2026-03-06. All 4 HIGH-severity findings fixed in spec.

## Progress

| # | Scope Item | Status | Iteration |
|---|-----------|--------|-----------|
| 1 | Core types in core.ts | [x] Complete | 1 |
| 2 | createLogger + createExtendedLogger | [x] Complete | 1 |
| 3 | consoleOutput (crash-safe) | [x] Complete | 1 |
| 4 | composeOutputs (error isolation) | [x] Complete | 1 |
| 5 | formatLogEntry (reserved field protection) | [x] Complete | 1 |
| 6 | createBackendLogger (lazy process.env) | [x] Complete | 1 |
| 7 | createConvexLogger | [x] Complete | 1 |
| 8 | createPostHogOutput | [x] Complete | 1 |
| 9 | createTestOutput | [x] Complete | 1 |
| 10 | Package config (exports, tsup, etc.) | [x] Complete | 1 |
| 11 | Unit tests (32 passing) | [x] Complete | 1 |

## Timeline

| Action | Timestamp | Duration | Notes |
|--------|-----------|----------|-------|
| plan | 2026-03-06T00:00:00Z | - | Created |
| spec-review | 2026-03-06T00:00:00Z | - | 4 perspectives, 4 HIGH findings fixed, scope cut to v1 core |
| ship | 2026-03-06T00:00:00Z | - | All 11 scope items complete. 32 tests pass. Build clean. |

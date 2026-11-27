# @vllnt/logger

Structured logging for the `@vllnt` ecosystem. Public npm package, zero runtime dependencies.

## Agent instructions

`AGENTS.md` is the sole agent-instruction source for this repository. Do not add
`CLAUDE.md` or `.claude` content.

## Project Structure

```
src/
  core.ts       ← logger core, consoleOutput, composeOutputs, parseLogLevel
  backend.ts    ← createBackendLogger (reads LOG_LEVEL from process.env)
  convex.ts     ← createConvexLogger (no process.env)
  posthog.ts    ← createPostHogOutput
  testing.ts    ← createTestOutput
  index.ts      ← main entry (core + backend preset)
tests/          ← vitest tests, one file per module; package.test.ts checks the tarball
docs/API.md     ← public API reference, shipped in the npm package
llms.txt        ← agent index, shipped in the npm package
```

Entry points: `@vllnt/logger`, `@vllnt/logger/convex`, `@vllnt/logger/posthog`,
`@vllnt/logger/testing`.

## Commands

Node.js is pinned in `.node-version`; pnpm is pinned by `packageManager` in `package.json`.

| Command | What |
|---------|------|
| `pnpm install --frozen-lockfile` | Install |
| `pnpm lint` | ESLint, zero warnings |
| `pnpm check-types` | `tsc --noEmit` |
| `pnpm test` | Vitest |
| `pnpm test:coverage` | Vitest with v8 coverage of `src/` |
| `pnpm build` | tsup build to `dist/` |
| `pnpm pack --dry-run` | Preview tarball (`dist`, `src`, `docs/API.md`, `CHANGELOG.md`, `llms.txt`, `README.md`, `LICENSE`, `package.json`) |

## Conventions

- Keep zero runtime dependencies and `sideEffects: false`.
- Log calls never throw; keep that guarantee when changing `core.ts`.
- User data cannot overwrite the reserved fields `event`, `level` and `timestamp`.
- Keep `/convex` free of `process.env` and other Node-only assumptions.
- Update `README.md`, `docs/API.md`, `CHANGELOG.md` and `llms.txt` when changing the public API.
  `tests/package.test.ts` fails when an export is missing from `docs/API.md` or a shipped file is
  missing from the tarball.
- `llms.txt` links shipped files with relative paths (`./docs/API.md`) and everything else
  with absolute URLs.

## Publishing

Nothing is published from a local machine. `.github/workflows/publish.yml` uses npm
trusted publishing (OIDC) with provenance and holds no npm token.

- Canary (`@canary`): every push to `main` that touches the package.
- Stable (`@latest`): only a pushed `vX.Y.Z` tag on a `main` commit whose `package.json`
  version is `X.Y.Z` and whose `CHANGELOG.md` has a `## [X.Y.Z]` entry. Merging to `main`
  never publishes `@latest`.

Agents must not bump versions, push tags or publish unless a maintainer asks.

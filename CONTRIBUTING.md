# Contributing to @vllnt/logger

Thanks for your interest in contributing! The package is intentionally small: zero runtime
dependencies, predictable structured JSON output, and runtime-safe subpath exports for Node.js,
Convex, PostHog and tests.

## Getting Started

1. Fork and clone the repo
2. Use the Node.js version in `.node-version` and the pnpm version pinned by `packageManager`
   in `package.json` (Corepack picks it up)
3. Install dependencies: `pnpm install --frozen-lockfile`

## Checks

```bash
pnpm lint
pnpm check-types
pnpm test
pnpm build
```

CI runs the same four checks on every pull request.

## Pull Requests

- Branch from `main`
- Use conventional commits: `feat(scope):`, `fix(scope):`, `chore(scope):`
- Keep PRs focused: one change per PR
- Add or update tests for behavior changes
- Document public API changes in `README.md` and `CHANGELOG.md`

## Design constraints

- No runtime dependencies.
- Log calls never throw.
- Reserved fields `event`, `level` and `timestamp` cannot be overwritten by user data.
- Keep the `/convex` entry point free of `process.env`.
- Keep subpath exports stable unless a breaking change is intentional and documented.

## Releases

Maintainers only. Every publish runs in `.github/workflows/publish.yml` with npm trusted
publishing and provenance; nothing is published from a local machine.

- Canary (`@canary`): every push to `main` that touches the package publishes one.
- Stable (`@latest`): merge a PR that sets `package.json` `version` and adds a matching
  `## [X.Y.Z]` entry to `CHANGELOG.md`, then push the tag `vX.Y.Z` on that `main` commit.

## Reporting Issues

Open a [GitHub issue](https://github.com/vllnt/logger/issues) with the package version, your
Node.js version and a minimal reproduction. For security problems, see [SECURITY.md](SECURITY.md).

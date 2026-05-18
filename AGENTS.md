# Agent Instructions for @vllnt/logger

This repository contains the public `@vllnt/logger` npm package.

## Scope

- Keep changes focused on structured logging utilities, tests, docs, and release-readiness files.
- Do not publish to npm, create tags, bump versions, merge PRs, or announce releases unless explicitly instructed by a human maintainer.
- Do not add private VLLNT operational details, credentials, customer data, or internal roadmap content to public files.

## Commands

Use pnpm:

```bash
pnpm install --frozen-lockfile
pnpm run lint
pnpm run check-types
pnpm run build
pnpm run test
```

## Package constraints

- Preserve zero runtime dependencies.
- Preserve `sideEffects: false` unless a maintainer approves a change.
- Keep Convex-safe exports free of `process.env` and other Node-only assumptions.
- Update `README.md`, `CHANGELOG.md`, `llms.txt`, and `llms-full.txt` when changing public API or package positioning.

## Review checklist

Before handoff, report:

- files changed;
- checks run and results;
- whether any release action was intentionally not taken.

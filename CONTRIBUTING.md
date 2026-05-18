# Contributing to @vllnt/logger

Thank you for helping improve `@vllnt/logger`.

This package is intentionally small: zero runtime dependencies, predictable structured JSON output, and runtime-safe subpath exports for Node.js, Convex, PostHog, and tests. Please keep changes focused on that contract.

## Development

Requirements:

- Node.js 22 or newer
- pnpm 10.28.2 or compatible

Setup:

```bash
pnpm install --frozen-lockfile
```

Common checks:

```bash
pnpm run lint
pnpm run check-types
pnpm run build
pnpm run test
```

## Pull requests

Before opening a pull request:

1. Create a branch from `main`.
2. Keep the diff scoped to one concern.
3. Add or update tests for behavior changes.
4. Run the common checks above.
5. Document public API changes in `README.md` and `CHANGELOG.md`.

## Release notes

Do not bump versions, create tags, or publish from a documentation or feature PR unless the maintainer explicitly asks for a release. Public release entries belong in `CHANGELOG.md`.

## Design constraints

- Keep the package dependency-free at runtime.
- Preserve crash-safe serialization.
- Preserve reserved field protection for `event`, `level`, and `timestamp`.
- Keep subpath exports stable unless a breaking change is intentional and documented.
- Avoid runtime-specific globals in Convex-safe exports.

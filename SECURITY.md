# Security Policy

## Supported versions

Security updates target the latest published `@vllnt/logger` release on npm.

## Reporting a vulnerability

Please report suspected vulnerabilities privately through GitHub's security reporting flow for this repository if it is available.

If private reporting is unavailable, contact the maintainers through the `vllnt/logger` GitHub repository without including exploit details in a public issue. Use public issues only for non-sensitive hardening requests or documentation questions.

## Scope

This package provides structured logging utilities. Security-sensitive areas include:

- crash-safe serialization of arbitrary log data;
- prevention of user data overwriting reserved log fields;
- runtime-safe behavior across Node.js, Convex, browser, and edge environments;
- avoiding accidental introduction of runtime dependencies or secret-handling side effects.

## Maintainer response

The maintainer will triage valid reports, prepare a fix when needed, and publish release notes after a safe remediation path exists.

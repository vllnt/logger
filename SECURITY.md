# Security Policy

## Supported Versions

Security fixes target the latest stable `@vllnt/logger` release on npm (`latest`). Canary builds
are prereleases, not a separate support line. No backports to older versions are promised.

## Reporting a Vulnerability

**Do not open a public issue for security vulnerabilities.**

Use GitHub Security Advisories:

1. Go to [Security Advisories](https://github.com/vllnt/logger/security/advisories)
2. Click "Report a vulnerability"
3. Fill in the details

## Scope

This package writes structured log lines from application code. Relevant areas:

- serialization of arbitrary log data (`consoleOutput`), including circular references,
  `BigInt` and `Error` values;
- user data overwriting the reserved fields `event`, `level` and `timestamp`;
- log calls throwing into the host application.

The package has no built-in redaction: what you pass in log data is written out. Do not log
secrets. Publishing uses npm trusted publishing with provenance, so releases can be traced to
this repository's workflow.

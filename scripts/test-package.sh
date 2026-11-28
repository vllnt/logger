#!/usr/bin/env bash
#
# test-package.sh — install the packed tarball into a clean consumer project,
# import every entry point in package.json "exports" at runtime, and type-check
# a strict NodeNext ESM consumer that imports from each of them.
#
# The entry points come from the installed package's "exports", so a new entry
# point is covered automatically. Each runtime import must expose exactly the
# value exports its typings declare. The tarball has no dependencies, so the
# install is offline; the type-check uses the repository's own TypeScript.
#
# Run `pnpm build` first.
#
# Exit codes: 0 pass, 1 packing, install, import or type-check failure, 2 misuse.

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TSC="$ROOT/node_modules/typescript/bin/tsc"
if [[ ! -f "$TSC" ]]; then
  echo "error: $TSC is missing; run pnpm install first" >&2
  exit 2
fi
if [[ ! -d "$ROOT/dist" ]]; then
  echo "error: dist/ is missing; run pnpm build first" >&2
  exit 2
fi

tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT
mkdir -p "$tmp/pack" "$tmp/consumer"

if ! (cd "$ROOT" && npm pack --ignore-scripts --pack-destination "$tmp/pack" > "$tmp/pack.out" 2>&1); then
  cat "$tmp/pack.out" >&2
  echo "FAIL package test: npm pack failed" >&2
  exit 1
fi
tarball="$(find "$tmp/pack" -maxdepth 1 -name '*.tgz' -print -quit)"
if [[ -z "$tarball" ]]; then
  echo "FAIL package test: npm pack produced no tarball" >&2
  exit 1
fi

PKG_NAME="$(ROOT="$ROOT" node -p 'require(process.env.ROOT + "/package.json").name')"
cd "$tmp/consumer"
PKG_NAME="$PKG_NAME" TARBALL="$tarball" node -e '
  const fs = require("fs");
  fs.writeFileSync("package.json", JSON.stringify({
    name: "package-test-consumer",
    private: true,
    type: "module",
    dependencies: { [process.env.PKG_NAME]: "file:" + process.env.TARBALL },
  }, null, 2));
  fs.writeFileSync("tsconfig.json", JSON.stringify({
    compilerOptions: {
      strict: true,
      exactOptionalPropertyTypes: true,
      module: "NodeNext",
      moduleResolution: "NodeNext",
      target: "ES2022",
      noEmit: true,
      skipLibCheck: false,
      types: [],
    },
    include: ["consumer.ts"],
  }, null, 2));
'

# CI makes pnpm default to a frozen lockfile; this throwaway project has none.
if ! pnpm install --offline --ignore-scripts --no-frozen-lockfile --lockfile=false > "$tmp/install.out" 2>&1; then
  cat "$tmp/install.out" >&2
  echo "FAIL package test: pnpm could not install the tarball" >&2
  exit 1
fi

# Import every entry point, compare its runtime exports with the value exports
# its typings declare, and write consumer.ts importing all of them by name.
if ! PKG_NAME="$PKG_NAME" ROOT="$ROOT" node --input-type=module -e '
  import { createRequire } from "node:module";
  import { existsSync, readFileSync, writeFileSync } from "node:fs";
  import { join } from "node:path";

  const ts = createRequire(join(process.env.ROOT, "package.json"))("typescript");
  const name = process.env.PKG_NAME;
  const pkgDir = join(process.cwd(), "node_modules", name);
  const manifest = JSON.parse(readFileSync(join(pkgDir, "package.json"), "utf8"));
  const exportsMap = manifest.exports;
  const problems = [];

  if (!exportsMap || typeof exportsMap !== "object" || Object.keys(exportsMap).length === 0) {
    console.error("FAIL package test: package.json has no exports map");
    process.exit(1);
  }

  const entries = [];
  for (const [subpath, target] of Object.entries(exportsMap)) {
    const specifier = name + subpath.slice(1);
    if (!target || typeof target.import !== "string" || typeof target.types !== "string") {
      problems.push(`${specifier}: exports["${subpath}"] needs "import" and "types" targets`);
      continue;
    }
    for (const condition of ["import", "types"]) {
      if (!existsSync(join(pkgDir, target[condition]))) {
        problems.push(`${specifier}: ${condition} target ${target[condition]} is missing from the tarball`);
      }
    }
    entries.push({ specifier, types: join(pkgDir, target.types) });
  }

  const present = entries.filter((entry) => existsSync(entry.types));
  const program = ts.createProgram(present.map((entry) => entry.types), { noEmit: true });
  const checker = program.getTypeChecker();
  const imports = [];

  for (const [index, { specifier, types }] of entries.entries()) {
    let mod;
    try {
      mod = await import(specifier);
    } catch (error) {
      problems.push(`${specifier}: import failed: ${error instanceof Error ? error.message : String(error)}`);
      continue;
    }
    const runtime = Object.keys(mod).sort();
    if (runtime.length === 0) {
      problems.push(`${specifier}: has no runtime exports`);
      continue;
    }
    const source = program.getSourceFile(types);
    const symbol = source && checker.getSymbolAtLocation(source);
    if (!symbol) {
      problems.push(`${specifier}: typings ${types} could not be read`);
      continue;
    }
    const expected = checker
      .getExportsOfModule(symbol)
      .filter((s) => (ts.skipAlias(s, checker).flags & ts.SymbolFlags.Value) !== 0)
      .map((s) => s.getName())
      .sort();
    const missing = expected.filter((n) => !runtime.includes(n));
    const extra = runtime.filter((n) => !expected.includes(n));
    if (missing.length || extra.length) {
      problems.push(
        `${specifier}: runtime exports differ from typings` +
          (missing.length ? `; missing at runtime: ${missing.join(", ")}` : "") +
          (extra.length ? `; not in typings: ${extra.join(", ")}` : ""),
      );
      continue;
    }
    imports.push({ index, specifier, names: expected });
    console.log(`OK    import ${specifier}: ${expected.join(", ")}`);
  }

  if (problems.length) {
    for (const problem of problems) console.error(`  ${problem}`);
    console.error(`FAIL package test: ${problems.length} entry point problem(s)`);
    process.exit(1);
  }

  const lines = imports.map(({ index, specifier, names }) =>
    `import { ${names.map((n) => `${n} as e${index}_${n}`).join(", ")} } from "${specifier}";`,
  );
  const used = imports.flatMap(({ index, names }) => names.map((n) => `e${index}_${n}`));
  writeFileSync("consumer.ts", `${lines.join("\n")}\n\nexport const used: unknown[] = [${used.join(", ")}];\n`);
'; then
  exit 1
fi

if ! node "$TSC" -p tsconfig.json > "$tmp/tsc.out" 2>&1; then
  cat "$tmp/tsc.out" >&2
  echo "FAIL package test: strict NodeNext consumer does not type-check" >&2
  exit 1
fi

echo "OK    package test: $(basename "$tarball") installs, imports and type-checks"
exit 0

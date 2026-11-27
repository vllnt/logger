/**
 * Checks what `npm pack` would publish: the bundled agent docs ship, contributor
 * files do not, llms.txt links resolve inside the tarball, and docs/API.md names
 * every public export.
 */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

type ExportTarget = { import: string; types: string };

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isExportTarget(value: unknown): value is ExportTarget {
  return (
    isRecord(value) &&
    typeof value.import === "string" &&
    typeof value.types === "string"
  );
}

function readExportTargets(): ExportTarget[] {
  const manifest: unknown = JSON.parse(
    readFileSync(join(root, "package.json"), "utf8"),
  );
  if (!isRecord(manifest) || !isRecord(manifest.exports)) {
    throw new Error("package.json has no exports map");
  }
  const targets = Object.values(manifest.exports);
  if (!targets.every(isExportTarget)) {
    throw new Error("every exports entry needs import and types");
  }
  return targets;
}

function packedFiles(): Set<string> {
  const out = execFileSync(
    "npm",
    ["pack", "--dry-run", "--json", "--ignore-scripts"],
    { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] },
  );
  const result: unknown = JSON.parse(out);
  const files = Array.isArray(result) && isRecord(result[0]) ? result[0].files : [];
  if (!Array.isArray(files)) {
    throw new Error("npm pack returned no file list");
  }
  return new Set(
    files.flatMap((file: unknown) =>
      isRecord(file) && typeof file.path === "string" ? [file.path] : [],
    ),
  );
}

const exportTargets = readExportTargets();
const packed = packedFiles();
const entrySources = exportTargets.map((entry) =>
  entry.import.replace(/^\.\/dist\/(.+)\.js$/, "src/$1.ts"),
);

describe("package contents", () => {
  it.each([
    "package.json",
    "README.md",
    "LICENSE",
    "CHANGELOG.md",
    "llms.txt",
    "docs/API.md",
    "src/core.ts",
    ...entrySources,
  ])("ships %s", (file) => {
    expect(packed).toContain(file);
  });

  it.skipIf(!existsSync(join(root, "dist")))(
    "ships every exports target (needs a build)",
    () => {
      for (const entry of exportTargets) {
        expect(packed).toContain(entry.import.replace(/^\.\//, ""));
        expect(packed).toContain(entry.types.replace(/^\.\//, ""));
      }
    },
  );

  it("does not ship contributor, test or internal files", () => {
    const internal = [...packed].filter((file) =>
      /^(AGENTS\.md|CLAUDE\.md|CONTRIBUTING\.md|SECURITY\.md|\.claude\/|\.github\/|scripts\/|specs\/|tests\/)|\.(test|spec)\.[cm]?[jt]sx?$/.test(
        file,
      ),
    );
    expect(internal).toEqual([]);
  });

  it("resolves every relative link in llms.txt inside the package", () => {
    const llms = readFileSync(join(root, "llms.txt"), "utf8");
    const links = [...llms.matchAll(/\]\(([^)]+)\)/g)]
      .map((match) => match[1] ?? "")
      .filter((href) => !/^[a-z]+:/i.test(href));
    expect(links.length).toBeGreaterThan(0);
    for (const href of links) {
      expect(packed).toContain(normalize(href));
    }
  });
});

describe("docs/API.md", () => {
  const api = readFileSync(join(root, "docs/API.md"), "utf8");
  const program = ts.createProgram(
    entrySources.map((file) => join(root, file)),
    {
      module: ts.ModuleKind.NodeNext,
      moduleResolution: ts.ModuleResolutionKind.NodeNext,
    },
  );
  const checker = program.getTypeChecker();

  it.each(entrySources)("documents every export of %s", (file) => {
    const source = program.getSourceFile(join(root, file));
    const moduleSymbol = source && checker.getSymbolAtLocation(source);
    if (!moduleSymbol) {
      throw new Error(`cannot read exports of ${file}`);
    }
    const names = checker
      .getExportsOfModule(moduleSymbol)
      .map((exported) => exported.getName());
    expect(names.length).toBeGreaterThan(0);
    for (const name of names) {
      expect(api, `${name} missing from docs/API.md`).toMatch(
        new RegExp(`\`${name}[\`(]`),
      );
    }
  });
});

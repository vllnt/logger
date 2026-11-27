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

function readExportTargets(): [string, ExportTarget][] {
  const manifest: unknown = JSON.parse(
    readFileSync(join(root, "package.json"), "utf8"),
  );
  if (!isRecord(manifest) || !isRecord(manifest.exports)) {
    throw new Error("package.json has no exports map");
  }
  return Object.entries(manifest.exports).map(([subpath, target]) => {
    if (!isExportTarget(target)) {
      throw new Error(`exports["${subpath}"] needs import and types`);
    }
    return [subpath, target];
  });
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
const entries = exportTargets.map(([subpath, target]) => ({
  source: target.import.replace(/^\.\/dist\/(.+)\.js$/, "src/$1.ts"),
  specifier: `@vllnt/logger${subpath.slice(1)}`,
}));
const entrySources = entries.map((entry) => entry.source);

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
      for (const [, entry] of exportTargets) {
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

  it.each(["llms.txt", "README.md"])(
    "resolves every relative link in %s inside the package",
    (file) => {
      const text = readFileSync(join(root, file), "utf8");
      const links = [...text.matchAll(/\]\(([^)]+)\)/g)]
        .map((match) => match[1] ?? "")
        .filter((href) => !/^[a-z]+:/i.test(href));
      expect(links.length).toBeGreaterThan(0);
      for (const href of links) {
        expect(packed).toContain(normalize(href));
      }
    },
  );
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

  it.each(entries)(
    "documents exactly the exports of $specifier",
    ({ source, specifier }) => {
      const file = program.getSourceFile(join(root, source));
      const moduleSymbol = file && checker.getSymbolAtLocation(file);
      if (!moduleSymbol) {
        throw new Error(`cannot read exports of ${source}`);
      }
      const exported = checker
        .getExportsOfModule(moduleSymbol)
        .map((symbol) => symbol.getName());
      const header = `## \`${specifier}\`\n`;
      const start = api.indexOf(header);
      expect(start, `docs/API.md has no "${header.trim()}" section`).not.toBe(-1);
      const end = api.indexOf("\n## ", start + header.length);
      const section = api.slice(start, end === -1 ? undefined : end);
      const documented = new Set(
        [
          ...section.matchAll(/^### `(\w+)/gm),
          ...section.matchAll(/^type (\w+) =/gm),
        ].map((match) => match[1]),
      );
      expect([...documented].sort()).toEqual(exported.sort());
    },
  );
});

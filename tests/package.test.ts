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

/** Markdown links in a shipped file that point inside the package. */
function relativeLinks(file: string): string[] {
  const text = readFileSync(join(root, file), "utf8");
  return [...text.matchAll(/\]\(([^)\s]+)\)/g)]
    .map((match) => match[1] ?? "")
    .filter((href) => !/^[a-z]+:/i.test(href) && !href.startsWith("#"));
}

/** Packed path a relative link in `file` points to, without its `#anchor`. */
function linkTarget(file: string, href: string): string {
  return normalize(join(dirname(file), href.replace(/#.*$/, "")));
}

const shippedDocs = ["llms.txt", "README.md", "docs/API.md", "CHANGELOG.md"];
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

  it("finds relative links to check", () => {
    expect(relativeLinks("llms.txt").length).toBeGreaterThan(0);
    expect(relativeLinks("README.md").length).toBeGreaterThan(0);
  });

  it("resolves a link relative to its file and without its #anchor", () => {
    expect(linkTarget("README.md", "docs/API.md#entry-points")).toBe("docs/API.md");
    expect(linkTarget("llms.txt", "./docs/API.md")).toBe("docs/API.md");
    expect(linkTarget("docs/API.md", "../README.md#install")).toBe("README.md");
  });

  it.each(shippedDocs)(
    "resolves every relative link in %s inside the package",
    (file) => {
      for (const href of relativeLinks(file)) {
        expect(packed).toContain(linkTarget(file, href));
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

  function exportsOf(source: string): string[] {
    const file = program.getSourceFile(join(root, source));
    const moduleSymbol = file && checker.getSymbolAtLocation(file);
    if (!moduleSymbol) {
      throw new Error(`cannot read exports of ${source}`);
    }
    return checker.getExportsOfModule(moduleSymbol).map((symbol) => symbol.getName());
  }

  it.each(entries)(
    "lists exactly the exports of $specifier in the entry-point table",
    ({ source, specifier }) => {
      const row = api.split("\n").find((line) => line.startsWith(`| \`${specifier}\` `));
      expect(row, `docs/API.md has no entry-point row for ${specifier}`).toBeDefined();
      const listed = [...(row?.split("|")[2] ?? "").matchAll(/`(\w+)`/g)].map(
        (match) => match[1],
      );
      expect(listed.sort()).toEqual(exportsOf(source).sort());
    },
  );

  /** Types the examples' placeholders are checked with. */
  const placeholderTypes: Record<string, string> = {
    apiKey: "string",
    distinctId: "string",
    expect: 'typeof import("vitest").expect',
    fetchRows: "() => Promise<unknown[]>",
    orderId: "string",
    posthog: "{ capture: (event: string, properties?: Record<string, unknown>) => void }",
  };

  it("names every placeholder the examples use", () => {
    const note = /^Examples use[\s\S]*?(?=\n\n)/m.exec(api)?.[0] ?? "";
    const named = [...note.matchAll(/`(\w+)`/g)].map((match) => match[1]);
    expect(named.sort()).toEqual(Object.keys(placeholderTypes).sort());
  });

  /** A full type-check takes seconds on a loaded host, hence the long timeout. */
  it("type-checks every example against the sources", () => {
    const declarations = Object.entries(placeholderTypes)
      .map(([name, type]) => `declare const ${name}: ${type};`)
      .join("\n");
    const examples = [...api.matchAll(/```ts\n([\s\S]*?)```/g)]
      .map((match) => match[1] ?? "")
      .filter((code) => /^import /m.test(code));
    expect(examples.length).toBeGreaterThan(0);
    const files = new Map(
      examples.map((code, index) => [
        join(root, `docs-example-${index}.ts`),
        `${declarations}\nexport {};\n${code}`,
      ]),
    );
    const options: ts.CompilerOptions = {
      exactOptionalPropertyTypes: true,
      module: ts.ModuleKind.ESNext,
      moduleResolution: ts.ModuleResolutionKind.Bundler,
      noEmit: true,
      paths: {
        "@vllnt/logger": [join(root, "src/index.ts")],
        "@vllnt/logger/*": [join(root, "src/*.ts")],
      },
      skipLibCheck: true,
      strict: true,
      target: ts.ScriptTarget.ES2022,
      types: ["node"],
    };
    const host = ts.createCompilerHost(options);
    const { fileExists, getSourceFile, readFile } = host;
    host.fileExists = (name) => files.has(name) || fileExists(name);
    host.readFile = (name) => files.get(name) ?? readFile(name);
    host.getSourceFile = (name, version, ...rest) => {
      const text = files.get(name);
      return text === undefined
        ? getSourceFile(name, version, ...rest)
        : ts.createSourceFile(name, text, version);
    };
    const diagnostics = ts
      .getPreEmitDiagnostics(ts.createProgram([...files.keys()], options, host))
      .map((diagnostic) => {
        const message = ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n");
        if (!diagnostic.file) return message;
        const { line } = diagnostic.file.getLineAndCharacterOfPosition(diagnostic.start ?? 0);
        const text = diagnostic.file.text.split("\n")[line]?.trim();
        return `${diagnostic.file.fileName.replace(`${root}/`, "")}: ${text}\n  ${message}`;
      });
    expect(diagnostics).toEqual([]);
  }, 60_000);

  it.each(entries)(
    "documents exactly the exports of $specifier",
    ({ source, specifier }) => {
      const exported = exportsOf(source);
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

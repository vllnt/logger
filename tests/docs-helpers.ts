/**
 * Shared helpers for the docs and package tests: package paths, exports per
 * entry point, Markdown links, anchors and code blocks, and in-memory
 * type-checking of code examples.
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

/** Repository root. */
export const root = join(dirname(fileURLToPath(import.meta.url)), "..");

/** Shipped Markdown and text docs. */
export const shippedDocs = ["llms.txt", "README.md", "docs/API.md", "CHANGELOG.md"];

type ExportTarget = { import: string; types: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isExportTarget(value: unknown): value is ExportTarget {
  return isRecord(value) && typeof value.import === "string" && typeof value.types === "string";
}

/** Parsed `package.json`. */
export const manifest: Record<string, unknown> = (() => {
  const parsed: unknown = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
  if (!isRecord(parsed)) {
    throw new Error("package.json is not an object");
  }
  return parsed;
})();

/** `[subpath, target]` pairs of the `exports` map. */
export const exportTargets: [string, ExportTarget][] = (() => {
  if (!isRecord(manifest.exports)) {
    throw new Error("package.json has no exports map");
  }
  return Object.entries(manifest.exports).map(([subpath, target]) => {
    if (!isExportTarget(target)) {
      throw new Error(`exports["${subpath}"] needs import and types`);
    }
    return [subpath, target];
  });
})();

/** Every entry point: its source file and its import specifier. */
export const entries = exportTargets.map(([subpath, target]) => ({
  source: target.import.replace(/^\.\/dist\/(.+)\.js$/, "src/$1.ts"),
  specifier: `@vllnt/logger${subpath.slice(1)}`,
}));

/** Paths `npm pack` would publish. */
export function packedFiles(): Set<string> {
  const out = execFileSync("npm", ["pack", "--dry-run", "--json", "--ignore-scripts"], {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  });
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

/**
 * Program over the entry point sources. Built when the module loads, so its
 * seconds-long setup is not charged to the timeout of whichever test runs first.
 */
const sourceProgram = ts.createProgram(
  entries.map((entry) => join(root, entry.source)),
  { module: ts.ModuleKind.NodeNext, moduleResolution: ts.ModuleResolutionKind.NodeNext },
);
ts.getPreEmitDiagnostics(sourceProgram);

/** Exported symbols of an entry point source, aliases resolved. */
export function exportSymbols(source: string): ts.Symbol[] {
  const checker = sourceProgram.getTypeChecker();
  const file = sourceProgram.getSourceFile(join(root, source));
  const moduleSymbol = file && checker.getSymbolAtLocation(file);
  if (!moduleSymbol) {
    throw new Error(`cannot read exports of ${source}`);
  }
  return checker
    .getExportsOfModule(moduleSymbol)
    .map((symbol) =>
      symbol.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(symbol) : symbol,
    );
}

/** Names exported by an entry point source. */
export function exportsOf(source: string): string[] {
  return exportSymbols(source).map((symbol) => symbol.getName());
}

/** TSDoc summary of an exported symbol, or "" when it has none. */
export function docSummary(symbol: ts.Symbol): string {
  return ts.displayPartsToString(symbol.getDocumentationComment(sourceProgram.getTypeChecker()));
}

/** Contents of a repository file. */
export function read(file: string): string {
  return readFileSync(join(root, file), "utf8");
}

/** Markdown links in a file that point inside the package (not URLs, not same-file anchors). */
export function relativeLinks(file: string): string[] {
  return [...read(file).matchAll(/\]\(([^)\s]+)\)/g)]
    .map((match) => match[1] ?? "")
    .filter((href) => !/^[a-z]+:/i.test(href) && !href.startsWith("#"));
}

/** Packed path a relative link in `file` points to, without its `#anchor`. */
export function linkTarget(file: string, href: string): string {
  return normalize(join(dirname(file), href.replace(/#.*$/, "")));
}

/** GitHub heading anchors of a Markdown text, with `-1`, `-2` suffixes for repeats. */
export function anchorsOf(markdown: string): Set<string> {
  const seen = new Map<string, number>();
  const anchors = new Set<string>();
  const withoutCode = markdown.replace(/^```[\s\S]*?^```/gm, "");
  for (const match of withoutCode.matchAll(/^#{1,6} (.+)$/gm)) {
    const base = (match[1] ?? "")
      .trim()
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\p{M}\p{Pc} -]/gu, "")
      .replace(/ /g, "-");
    const count = seen.get(base) ?? 0;
    seen.set(base, count + 1);
    anchors.add(count === 0 ? base : `${base}-${count}`);
  }
  return anchors;
}

/** A fenced code block: its info string, its code and the line numbers of its fences. */
export type CodeBlock = { code: string; endLine: number; lang: string; startLine: number };

/** Fenced code blocks of a Markdown text. */
export function codeBlocks(markdown: string): CodeBlock[] {
  const blocks: CodeBlock[] = [];
  const lines = markdown.split("\n");
  let open: { lang: string; startLine: number } | undefined;
  let body: string[] = [];
  lines.forEach((line, index) => {
    const fence = /^```(.*)$/.exec(line);
    if (!fence) {
      if (open) body.push(line);
      return;
    }
    if (open) {
      blocks.push({ ...open, code: `${body.join("\n")}\n`, endLine: index + 1 });
      open = undefined;
      body = [];
    } else {
      open = { lang: (fence[1] ?? "").trim(), startLine: index + 1 };
    }
  });
  return blocks;
}

/** Type-checks in-memory files; returns readable diagnostics for them. */
export function typeCheck(files: Map<string, string>, options: ts.CompilerOptions): string[] {
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
  return ts
    .getPreEmitDiagnostics(ts.createProgram([...files.keys()], options, host))
    .map((diagnostic) => {
      const message = `TS${diagnostic.code}: ${ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n")}`;
      if (!diagnostic.file) return message;
      const { line } = diagnostic.file.getLineAndCharacterOfPosition(diagnostic.start ?? 0);
      const text = diagnostic.file.text.split("\n")[line]?.trim();
      return `${diagnostic.file.fileName}: ${text}\n  ${message}`;
    });
}

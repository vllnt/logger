/**
 * Checks what `npm pack` would publish: the bundled agent docs ship, contributor
 * files do not, relative links and anchors in shipped docs resolve inside the
 * tarball, and docs/API.md names every public export with examples that type-check.
 */
import { existsSync } from "node:fs";
import { join } from "node:path";
import ts from "typescript";

import {
  anchorsOf,
  codeBlocks,
  entries,
  exportsOf,
  exportTargets,
  linkTarget,
  packedFiles,
  read,
  relativeLinks,
  root,
  shippedDocs,
  typeCheck,
} from "./docs-helpers.js";

const packed = packedFiles();
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
    "resolves every relative link and #anchor in %s inside the package",
    (file) => {
      for (const href of relativeLinks(file)) {
        const target = linkTarget(file, href);
        expect(packed).toContain(target);
        const anchor = /#(.+)$/.exec(href)?.[1];
        if (anchor && target.endsWith(".md")) {
          expect([...anchorsOf(read(target))], `${file}: ${href}`).toContain(anchor);
        }
      }
    },
  );
});

describe("docs/API.md", () => {
  const api = read("docs/API.md");

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
    const examples = codeBlocks(api)
      .filter((block) => block.lang === "ts" && /^import /m.test(block.code))
      .map((block) => block.code);
    expect(examples.length).toBeGreaterThan(0);
    const files = new Map(
      examples.map((code, index) => [
        join(root, `docs-example-${index}.ts`),
        `${declarations}\nexport {};\n${code}`,
      ]),
    );
    const diagnostics = typeCheck(files, {
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

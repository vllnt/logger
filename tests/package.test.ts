/**
 * Checks what `npm pack` would publish: the bundled agent docs ship, contributor
 * files do not, relative links and anchors in shipped docs resolve inside the
 * tarball, and docs/API.md names every public export with examples that type-check
 * and run against the built package.
 */
import { existsSync, rmSync } from "node:fs";
import { join } from "node:path";

import {
  anchorsOf,
  codeBlocks,
  consumerOptions,
  createConsumerProject,
  documentedOutput,
  entries,
  exportsOf,
  exportTargets,
  linkTarget,
  packedFiles,
  read,
  relativeLinks,
  root,
  runExample,
  shippedDocs,
  typeCheck,
} from "./docs-helpers.js";

const packed = packedFiles();

/** Types the docs/API.md examples' placeholders are checked with. */
const placeholderTypes: Record<string, string> = {
  apiKey: "string",
  distinctId: "string",
  expect: 'typeof import("vitest").expect',
  fetchRows: "() => Promise<unknown[]>",
  orderId: "string",
  posthog: "{ capture: (event: string, properties?: Record<string, unknown>) => void }",
};
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

  it("names every placeholder the examples use", () => {
    const note = /^Examples use[\s\S]*?(?=\n\n)/m.exec(api)?.[0] ?? "";
    const named = [...note.matchAll(/`(\w+)`/g)].map((match) => match[1]);
    expect(named.sort()).toEqual(Object.keys(placeholderTypes).sort());
  });

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

/**
 * docs/API.md examples against the built package as a consumer sees it, the same
 * way as the README examples, with the placeholders declared.
 */
describe.skipIf(!existsSync(join(root, "dist")) && !process.env.CI)("docs/API.md examples against the built package", () => {
  const blocks = codeBlocks(read("docs/API.md")).filter(
    (block) => block.lang === "ts" && /^import /m.test(block.code),
  );
  let project = "";

  beforeAll(() => {
    project = createConsumerProject("logger-api-");
  });

  afterAll(() => {
    if (project) rmSync(project, { force: true, recursive: true });
  });

  /** A full type-check takes seconds on a loaded host, hence the long timeout. */
  it("type-check", () => {
    expect(blocks.length).toBeGreaterThan(0);
    const declarations = Object.entries(placeholderTypes)
      .map(([placeholder, type]) => `declare const ${placeholder}: ${type};`)
      .join("\n");
    const files = new Map(
      blocks.map((block) => [
        join(project, `api-${block.startLine}.ts`),
        `${declarations}\nexport {};\n${block.code}`,
      ]),
    );
    expect(typeCheck(files, consumerOptions)).toEqual([]);
  }, 60_000);

  it("run and print what their // console.<method>: comments show", () => {
    const documented = blocks.filter((block) => documentedOutput(block.code).length > 0);
    expect(documented.length).toBeGreaterThan(0);
    for (const block of documented) {
      const printed = runExample(project, `api-${block.startLine}.mjs`, block.code);
      for (const expected of documentedOutput(block.code)) {
        expect(printed, `docs/API.md:${block.startLine}`).toContain(expected);
      }
    }
  }, 120_000);
});

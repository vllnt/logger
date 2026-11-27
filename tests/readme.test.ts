/**
 * Agent-first docs contract: package metadata, the README section layout shared by
 * every @vllnt package, complete code examples checked against the built package,
 * an API table and an errors table that match the code and real consumer setups,
 * the Links block, footer and llms.txt ecosystem block, descriptive link text,
 * related packages, and no mention of the retired `.ai` domain in anything shipped.
 */
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import ts from "typescript";

import {
  anchorsOf,
  codeBlocks,
  consumerOptions,
  createConsumerProject,
  docSummary,
  documentedOutput,
  entries,
  exportsOf,
  exportSymbols,
  linkTarget,
  manifest,
  packedFiles,
  read,
  root,
  runExample,
  typeCheck,
} from "./docs-helpers.js";

const readme = read("README.md");
const lines = readme.split("\n");
const name = "logger";

const requiredSections = [
  "For coding agents",
  "When to use",
  "Install",
  "Quick start",
  "API",
  "Common tasks",
  "Errors and fixes",
  "Limits and gotchas",
  "Compatibility",
];
const trailingSections = ["Testing", "Security", "Related packages", "Contributing", "Links", "License"];

const repoUrl = `https://github.com/vllnt/${name}`;

const links = [
  "## Links",
  "",
  `- Docs and changelog: [oss.vllnt.com/packages/${name}](https://oss.vllnt.com/packages/${name}) · [release feed](https://oss.vllnt.com/packages/${name}/rss.xml)`,
  "- All @vllnt packages: [oss.vllnt.com](https://oss.vllnt.com) · [search packages and docs on index.vllnt.com](https://index.vllnt.com)",
  `- Source and issues: [GitHub](${repoUrl}) · [issues](${repoUrl}/issues) · [npm](https://www.npmjs.com/package/@vllnt/${name})`,
  "- Questions and updates: [Discord](https://bntvllnt.com/discord) · [X @bntvllnt](https://x.com/bntvllnt)",
  "- Company and author: [vllnt.com](https://vllnt.com) · [bntvllnt.com](https://bntvllnt.com) · [GitHub @bntvllnt](https://github.com/bntvllnt) · [LinkedIn](https://linkedin.com/in/bntvllnt)",
  "- Sponsor: [GitHub Sponsors](https://github.com/sponsors/bntvllnt)",
  "",
].join("\n");

const footer = [
  "---",
  "",
  `Part of [vllnt open source](https://oss.vllnt.com) · [Package page](https://oss.vllnt.com/packages/${name}) · [vllnt.com](https://vllnt.com) · Built by [bntvllnt](https://bntvllnt.com)`,
  "",
].join("\n");

const llmsEcosystem = [
  "## Ecosystem",
  "",
  `- [Package page](https://oss.vllnt.com/packages/${name})`,
  `- [Release feed](https://oss.vllnt.com/packages/${name}/rss.xml)`,
  "- [All @vllnt packages](https://oss.vllnt.com/llms.txt)",
  "- [Search vllnt packages and docs](https://index.vllnt.com)",
  "- [vllnt](https://vllnt.com/llms.txt)",
  "- [Author](https://bntvllnt.com)",
  "",
].join("\n");

/** Body of a `## <title>` section of the README, without its heading. */
function section(title: string): string {
  const start = readme.indexOf(`\n## ${title}\n`);
  if (start === -1) return "";
  const bodyStart = start + title.length + 5;
  const end = readme.indexOf("\n## ", bodyStart);
  return readme.slice(bodyStart, end === -1 ? undefined : end);
}

describe("package.json metadata", () => {
  it("has a one-sentence description of at most 160 characters", () => {
    const { description } = manifest;
    expect(typeof description).toBe("string");
    const text = String(description);
    expect(text.length).toBeLessThanOrEqual(160);
    expect(text.match(/[.!?](\s|$)/g)?.length).toBe(1);
    expect(text).not.toMatch(/vllnt (projects|ecosystem)/i);
  });

  it("has 8 to 12 distinct keywords", () => {
    const keywords = Array.isArray(manifest.keywords) ? manifest.keywords : [];
    expect(keywords.length).toBeGreaterThanOrEqual(8);
    expect(keywords.length).toBeLessThanOrEqual(12);
    expect(new Set(keywords).size).toBe(keywords.length);
  });

  it("links the package page, author, funding and issues", () => {
    expect(manifest.homepage).toBe(`https://oss.vllnt.com/packages/${name}`);
    expect(manifest.author).toEqual({ name: "bntvllnt", url: "https://bntvllnt.com" });
    expect(manifest.funding).toEqual({ type: "github", url: "https://github.com/sponsors/bntvllnt" });
    expect(manifest.bugs).toEqual({ url: `https://github.com/vllnt/${name}/issues` });
  });
});

describe("README.md layout", () => {
  it("starts with the package name and the package description", () => {
    expect(lines[0]).toBe(`# ${String(manifest.name)}`);
    expect(lines.slice(1).find((line) => line.trim() !== "")).toBe(manifest.description);
  });

  it("has the shared sections in order", () => {
    const headings = [...readme.replace(/^```[\s\S]*?^```/gm, "").matchAll(/^## (.+)$/gm)].map(
      (match) => match[1],
    );
    expect(headings).toEqual([...requiredSections, ...trailingSections]);
  });

  it("keeps the coding-agents note to 3 lines", () => {
    const note = section("For coding agents").split("\n").filter((line) => line.trim() !== "");
    expect(note.length).toBeGreaterThan(0);
    expect(note.length).toBeLessThanOrEqual(3);
  });

  it("lists 2 to 4 use-it-when bullets, then 1 to 3 do-not-use bullets", () => {
    const bullets = section("When to use").split("\n").filter((line) => line.startsWith("- "));
    const use = bullets.filter((line) => line.startsWith("- Use it when "));
    const avoid = bullets.filter((line) => line.startsWith("- Do not use it "));
    expect(use.length).toBeGreaterThanOrEqual(2);
    expect(use.length).toBeLessThanOrEqual(4);
    expect(avoid.length).toBeGreaterThanOrEqual(1);
    expect(avoid.length).toBeLessThanOrEqual(3);
    expect(bullets).toEqual([...use, ...avoid]);
    for (const line of avoid) {
      expect(line, "a do-not-use bullet names the better choice").toMatch(/: use /);
    }
  });

  it("has the install command and the first complete example in the first 40 lines", () => {
    const install = lines.findIndex((line) => line === `pnpm add ${String(manifest.name)}`);
    expect(install).toBeGreaterThanOrEqual(0);
    expect(install).toBeLessThan(40);
    const quickStart = lines.indexOf("## Quick start") + 1;
    const example = codeBlocks(readme).find((block) => block.startLine > quickStart);
    expect(example?.lang).toBe("ts");
    expect(example?.endLine).toBeLessThanOrEqual(40);
  });

  it("has no badges above the quick start", () => {
    const quickStart = lines.indexOf("## Quick start");
    expect(lines.slice(0, quickStart).join("\n")).not.toMatch(/!\[|shields\.io|badge/i);
  });

  it("has the shared Links block just before License", () => {
    expect(readme).toContain(`\n${links}\n## License\n`);
  });

  it("ends with the shared footer", () => {
    expect(readme.endsWith(`\n${footer}`)).toBe(true);
  });
});

/** Links whose text does not describe the target, and images without alt text. */
function vagueLinks(markdown: string): string[] {
  const text = markdown.replace(/^```[\s\S]*?^```/gm, "");
  const vague = new Set(["here", "this", "link", "click here"]);
  const links = [...text.matchAll(/(!?)\[([^\]]*)\]\([^)\s]+\)/g)].filter(([, image, label = ""]) =>
    image ? label.trim() === "" : vague.has(label.replace(/`/g, "").trim().toLowerCase()),
  );
  const images = [...text.matchAll(/<img\b(?![^>]*\balt="[^"]+")[^>]*>/gi)];
  return [...links, ...images].map(([match]) => match);
}

describe("link text and images", () => {
  it("flags vague link text and images without alt text", () => {
    expect(
      vagueLinks('[here](https://a.example) [Click here](./b.md) ![](c.png) <img src="d.png"> [GitHub](https://e.example) ![logo](f.png)'),
    ).toEqual(["[here](https://a.example)", "[Click here](./b.md)", "![](c.png)", '<img src="d.png">']);
  });

  it.each(["README.md", "llms.txt", "docs/API.md"])("%s has descriptive link text and alt text", (file) => {
    expect(vagueLinks(read(file))).toEqual([]);
  });
});

describe("code blocks", () => {
  it.each(["README.md", "docs/API.md", "llms.txt"])("%s tags every code block", (file) => {
    const untagged = codeBlocks(read(file)).filter((block) => block.lang === "");
    expect(untagged.map((block) => `${file}:${block.startLine}`)).toEqual([]);
  });

  it.each(["README.md", "docs/API.md"])("%s has no ... gaps in code", (file) => {
    const gaps = codeBlocks(read(file)).flatMap((block) =>
      block.code
        .split("\n")
        .filter((line) => /…|\.\.\.(?![\w([{])/.test(line))
        .map((line) => `${file}:${block.startLine}: ${line.trim()}`),
    );
    expect(gaps).toEqual([]);
  });

  it("README TypeScript blocks import what they use", () => {
    for (const block of codeBlocks(readme).filter((candidate) => candidate.lang === "ts")) {
      expect(block.code, `README.md:${block.startLine}`).toMatch(/^import /m);
    }
  });
});

describe("README.md API and errors", () => {
  const apiRows = section("API")
    .split("\n")
    .filter((line) => line.startsWith("| [`"));

  it.each(entries)("lists every export of $specifier once, linked into docs/API.md", ({ source, specifier }) => {
    const apiAnchors = anchorsOf(read("docs/API.md"));
    for (const exported of exportsOf(source)) {
      const rows = apiRows.filter((row) => row.startsWith(`| [\`${exported}\`](`));
      expect(rows, `${exported} in the API table`).toHaveLength(1);
      const row = rows[0] ?? "";
      expect(row).toContain(`| \`${specifier}\` |`);
      const href = /\]\(([^)]+)\)/.exec(row)?.[1] ?? "";
      expect(linkTarget("README.md", href)).toBe("docs/API.md");
      expect([...apiAnchors]).toContain(href.split("#")[1]);
    }
  });

  it.each(["README.md", "llms.txt", "docs/API.md"])(
    "%s links every other @vllnt package to its package page",
    (file) => {
      const text = read(file);
      const mentions = [...text.matchAll(/@vllnt\/([\w-]+)/g)]
        .map((match) => match[1] ?? "")
        .filter((pkg) => pkg !== name);
      const linked = [...text.matchAll(/\[`@vllnt\/([\w-]+)`\]\(([^)]+)\)/g)].filter(
        ([, pkg]) => pkg !== name,
      );
      for (const [, pkg, url] of linked) {
        expect(url).toBe(`https://oss.vllnt.com/packages/${pkg}`);
      }
      expect(linked.map(([, pkg]) => pkg)).toEqual(mentions);
    },
  );

  it("lists in Related packages only the None line or @vllnt packages this one works with in code", () => {
    const none =
      "None. No other @vllnt package is a dependency of this one or shares code, a test or an example with it.";
    const body = section("Related packages").trim();
    const listed = body === none ? [] : body.split("\n");
    const dependencies = ["dependencies", "devDependencies", "peerDependencies"].flatMap((field) => {
      const value = manifest[field];
      return typeof value === "object" && value !== null ? Object.keys(value) : [];
    });
    const imports = [
      ...readdirSync(join(root, "tests")).map((file) => read(`tests/${file}`)),
      ...["README.md", "docs/API.md"].flatMap((file) => codeBlocks(read(file)).map((block) => block.code)),
    ].flatMap((code) => [...code.matchAll(/from "(@vllnt\/[\w-]+)/g)].map(([, pkg]) => pkg));
    const inCode = new Set([...dependencies, ...imports]);
    for (const line of listed) {
      const pkg = /^- \[`@vllnt\/([\w-]+)`\]\(https:\/\/oss\.vllnt\.com\/packages\/\1\): \S/.exec(line)?.[1];
      expect(pkg, `${line}: links https://oss.vllnt.com/packages/<other> and says how they work together`).toBeDefined();
      expect([...inCode], `${line}: shares a dependency, test or example with this package`).toContain(`@vllnt/${pkg}`);
    }
  });

  it("documents every message marker the sources can write", () => {
    const sources = entries.map((entry) => entry.source).concat("src/core.ts");
    const markers = new Set(
      sources.flatMap((file) =>
        [...read(file).matchAll(/["`](\[[^\]\s"`][^\]"`]*\])/g)].map((match) => match[1]),
      ),
    );
    expect(markers.size).toBeGreaterThan(0);
    const errors = section("Errors and fixes");
    for (const marker of markers) {
      expect(errors, `Errors and fixes lists ${marker}`).toContain(marker);
    }
  });

  it("throws no errors of its own (only rethrows a caught error)", () => {
    const ownThrows: string[] = [];
    for (const file of new Set(entries.map((entry) => entry.source).concat("src/core.ts"))) {
      const visit = (node: ts.Node, caught: Set<string>): void => {
        if (ts.isThrowStatement(node)) {
          const rethrow = ts.isIdentifier(node.expression) && caught.has(node.expression.text);
          if (!rethrow) ownThrows.push(`${file}: ${node.getText()}`);
        }
        const inner =
          ts.isCatchClause(node) && node.variableDeclaration && ts.isIdentifier(node.variableDeclaration.name)
            ? new Set([...caught, node.variableDeclaration.name.text])
            : caught;
        ts.forEachChild(node, (child) => {
          visit(child, inner);
        });
      };
      visit(ts.createSourceFile(file, read(file), ts.ScriptTarget.Latest, true), new Set());
    }
    expect(ownThrows).toEqual([]);
  });
});

describe("TSDoc", () => {
  it.each(entries)("every export of $specifier has a summary", ({ source }) => {
    const missing = exportSymbols(source)
      .filter((symbol) => docSummary(symbol).trim() === "")
      .map((symbol) => symbol.getName());
    expect(missing).toEqual([]);
  });

  it("the main entry links the package page", () => {
    expect(read("src/backend.ts")).toContain(`@see https://oss.vllnt.com/packages/${name}`);
  });
});

describe("llms.txt", () => {
  const llms = read("llms.txt");

  it("has the summary, when-to-use and links to the API reference and the errors table", () => {
    expect(llms).toContain(`> ${String(manifest.description)}`);
    expect(llms).toContain("\n## When to use\n");
    expect(llms).toContain("](./docs/API.md)");
    expect(llms).toContain("](./README.md#errors-and-fixes)");
  });

  it("ends with the ecosystem block and links the package index once", () => {
    expect(llms.endsWith(llmsEcosystem)).toBe(true);
    expect(llms.split("https://oss.vllnt.com/llms.txt").length - 1).toBe(1);
  });
});

/** The retired domain, built from parts so this repo never contains it literally. */
const retiredDomain = new RegExp(["vllnt", "ai"].join("\\."), "i");

describe("retired .ai domain", () => {
  const mentions = (files: Iterable<string>): string[] =>
    [...files]
      .filter((file) => existsSync(join(root, file)))
      .filter((file) => retiredDomain.test(readFileSync(join(root, file), "utf8")));

  it("is not mentioned in any shipped file", () => {
    expect(mentions(packedFiles())).toEqual([]);
  }, 60_000);

  it("is not mentioned in any tracked file", () => {
    const tracked = execFileSync("git", ["ls-files"], { cwd: root, encoding: "utf8" })
      .split("\n")
      .filter(Boolean);
    expect(tracked.length).toBeGreaterThan(0);
    expect(mentions(tracked)).toEqual([]);
  });
});

/**
 * README examples run against the built package as a consumer sees it: a temp
 * project whose `node_modules/@vllnt/logger` links to this repo. Type-checked
 * with strict settings; examples that import only this package and `node:`
 * modules also run.
 */
describe.skipIf(!existsSync(join(root, "dist")) && !process.env.CI)("README examples against the built package", () => {
  const blocks = codeBlocks(readme).filter((block) => block.lang === "ts");
  let project = "";

  beforeAll(() => {
    project = createConsumerProject("logger-readme-");
  });

  afterAll(() => {
    if (project) rmSync(project, { force: true, recursive: true });
  });

  it("type-check", () => {
    expect(blocks.length).toBeGreaterThan(0);
    const files = new Map(
      blocks.map((block) => [join(project, `readme-${block.startLine}.ts`), `export {};\n${block.code}`]),
    );
    expect(typeCheck(files, consumerOptions)).toEqual([]);
  }, 60_000);

  it("run and print what their // console.<method>: comments show", () => {
    const runnable = blocks.filter((block) =>
      [...block.code.matchAll(/from "([^"]+)"/g)].every(
        ([, specifier]) => specifier?.startsWith("@vllnt/logger") || specifier?.startsWith("node:"),
      ),
    );
    expect(runnable.length).toBeGreaterThan(0);
    let documented = 0;
    for (const block of runnable) {
      const printed = runExample(project, `readme-${block.startLine}.mjs`, block.code);
      for (const expected of documentedOutput(block.code)) {
        documented += 1;
        expect(printed, `README.md:${block.startLine}`).toContain(expected);
      }
    }
    expect(documented).toBeGreaterThan(0);
  }, 120_000);

  it("ship the package page link in the main entry typings", () => {
    expect(readFileSync(join(root, "dist", "index.d.ts"), "utf8")).toContain(
      `@see https://oss.vllnt.com/packages/${name}`,
    );
  });

  /** A CommonJS consumer file importing the package. */
  const consumer = (): Map<string, string> =>
    new Map([[join(project, "consumer.cts"), 'import { createLogger } from "@vllnt/logger";\nvoid createLogger;\n']]);

  it("list exactly the errors the consumer setups really produce, in both directions", () => {
    const produced = new Set<string>();
    const required = spawnSync(
      process.execPath,
      ["--input-type=commonjs", "-e", 'require("@vllnt/logger")'],
      { cwd: project, encoding: "utf8" },
    );
    const nodeCode = /\b(ERR_[A-Z_]+)\b/.exec(required.stderr)?.[1];
    expect(nodeCode, required.stderr).toBeDefined();
    produced.add(nodeCode ?? "");

    const setups: ts.CompilerOptions[] = [
      { module: ts.ModuleKind.Node16, moduleResolution: ts.ModuleResolutionKind.Node16 },
      { module: ts.ModuleKind.CommonJS, moduleResolution: ts.ModuleResolutionKind.Node10 },
      {
        ignoreDeprecations: "6.0",
        module: ts.ModuleKind.CommonJS,
        moduleResolution: ts.ModuleResolutionKind.Node10,
      },
    ];
    for (const setup of setups) {
      const codes = typeCheck(consumer(), { ...setup, noEmit: true, types: [] }).map(
        (diagnostic) => /TS\d+/.exec(diagnostic)?.[0] ?? diagnostic,
      );
      expect(codes.length, JSON.stringify(setup)).toBeGreaterThan(0);
      for (const code of codes) produced.add(code);
    }

    const listed = new Set([...section("Errors and fixes").matchAll(/\b(ERR_[A-Z_]+|TS\d+)\b/g)].map(([, code]) => code));
    expect([...produced].filter((code) => !listed.has(code)), "produced but not in Errors and fixes").toEqual([]);
    expect([...listed].filter((code) => !produced.has(code ?? "")), "in Errors and fixes but not produced").toEqual([]);
  }, 60_000);

  it("type-check a CommonJS (.cts) consumer under NodeNext with no diagnostics, as Compatibility says", () => {
    expect(section("Compatibility")).toContain("in a CommonJS project, `nodenext` type-checks");
    const diagnostics = typeCheck(consumer(), {
      module: ts.ModuleKind.NodeNext,
      moduleResolution: ts.ModuleResolutionKind.NodeNext,
      noEmit: true,
      types: [],
    });
    expect(diagnostics).toEqual([]);
  }, 60_000);
});

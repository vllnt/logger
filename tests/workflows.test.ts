/**
 * `tests/package.test.ts` skips its built-files check when `dist/` is missing, so
 * every workflow job that runs the tests must build first.
 */
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const workflowsDir = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  ".github",
  "workflows",
);

/** Ordered `pnpm build` / `pnpm test` steps of each job, by job name. */
function stepsByJob(yaml: string): Map<string, string[]> {
  const jobs = new Map<string, string[]>();
  let inJobs = false;
  let job: string[] | undefined;
  for (const line of yaml.split("\n")) {
    if (/^\S/.test(line)) {
      inJobs = line.startsWith("jobs:");
      job = undefined;
      continue;
    }
    const jobName = /^ {2}([\w-]+):\s*$/.exec(line)?.[1];
    if (inJobs && jobName) {
      job = [];
      jobs.set(jobName, job);
      continue;
    }
    const step = /^\s*-?\s*run:\s*pnpm (?:run )?(build|test)\s*$/.exec(line)?.[1];
    if (job && step) {
      job.push(step);
    }
  }
  return jobs;
}

const workflows = readdirSync(workflowsDir).filter((file) => /\.ya?ml$/.test(file));

describe("workflows", () => {
  it("finds the publish and CI test steps", () => {
    const publish = stepsByJob(readFileSync(join(workflowsDir, "publish.yml"), "utf8"));
    const ci = stepsByJob(readFileSync(join(workflowsDir, "ci.yml"), "utf8"));
    expect(publish.get("quality")).toContain("test");
    expect(ci.get("quality")).toContain("test");
  });

  it.each(workflows)("%s builds before it runs the tests", (file) => {
    const jobs = stepsByJob(readFileSync(join(workflowsDir, file), "utf8"));
    for (const [name, steps] of jobs) {
      const test = steps.indexOf("test");
      if (test === -1) continue;
      const build = steps.indexOf("build");
      expect(
        build !== -1 && build < test,
        `job "${name}" in ${file} runs pnpm test before pnpm build`,
      ).toBe(true);
    }
  });
});

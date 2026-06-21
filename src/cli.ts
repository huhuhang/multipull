#!/usr/bin/env node
import { realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { Command } from "commander";

import { DEFAULT_MAX_DEPTH } from "./defaults.js";
import { discoverRepos } from "./discover.js";
import { ok, runGit } from "./git.js";
import { renderTable } from "./table.js";
import { runRepos } from "./runner.js";

interface CliOptions {
  dryRun?: boolean;
  verbose?: boolean;
  parkToDefaultBranch?: boolean;
}

function printDetails(results: Awaited<ReturnType<typeof runRepos>>, verbose: boolean): void {
  const detailItems = results.filter((item) => {
    if (verbose) {
      return Boolean(item.output || item.detail);
    }
    return item.category === "fail" && Boolean(item.detail || item.output);
  });

  if (detailItems.length === 0) {
    return;
  }

  console.log();
  console.log("Details");
  console.log("-------");
  for (const item of detailItems) {
    console.log(`${item.repo.label}: ${item.detail || item.result}`);
    if (verbose && item.output) {
      for (const line of item.output.split(/\r?\n/)) {
        console.log(`  ${line}`);
      }
    }
  }
}

export async function main(argv = process.argv): Promise<number> {
  const program = new Command()
    .name("multipull")
    .description("Pull many Git repositories safely.")
    .argument("[paths...]", "root directories to scan", ["."])
    .option("--dry-run", "show planned actions without pulling")
    .option("--verbose", "show git output details after the summary table")
    .option(
      "--park-to-default-branch",
      "preserve dirty changes on a multipull-backup/* branch before switching to the default branch"
    )
    .showHelpAfterError();

  program.parse(argv);
  const paths = program.args.length > 0 ? program.args : ["."];
  const options = program.opts<CliOptions>();

  if (!ok(await runGit(process.cwd(), ["--version"], 10_000))) {
    console.error("multipull: git command not found");
    return 127;
  }

  const { repos, missing } = await discoverRepos(paths, { maxDepth: DEFAULT_MAX_DEPTH });
  for (const path of missing) {
    console.error(`multipull: skipped missing directory: ${path}`);
  }

  if (repos.length === 0) {
    console.log("No Git repositories found.");
    return missing.length > 0 ? 1 : 0;
  }

  const results = await runRepos(repos, {
    dryRun: options.dryRun ?? false,
    verbose: options.verbose ?? false,
    parkToDefaultBranch: options.parkToDefaultBranch ?? false
  });

  console.log(renderTable(results));

  const counts = {
    ok: results.filter((item) => item.category === "ok").length,
    skipped: results.filter((item) => item.category === "skip").length,
    failed: results.filter((item) => item.category === "fail").length,
    ready: results.filter((item) => item.category === "dry").length
  };

  console.log();
  if (options.dryRun) {
    console.log(`Summary: ready ${counts.ready}, skipped ${counts.skipped}, failed ${counts.failed}.`);
  } else {
    console.log(`Summary: ok ${counts.ok}, skipped ${counts.skipped}, failed ${counts.failed}.`);
  }

  printDetails(results, options.verbose ?? false);
  return counts.failed > 0 ? 1 : 0;
}

function isDirectExecution(): boolean {
  const entrypoint = process.argv[1];
  if (!entrypoint) {
    return false;
  }

  return realpathSync(fileURLToPath(import.meta.url)) === realpathSync(entrypoint);
}

if (isDirectExecution()) {
  main().then(
    (code) => {
      process.exitCode = code;
    },
    (error: unknown) => {
      console.error(error instanceof Error ? error.message : String(error));
      process.exitCode = 1;
    }
  );
}

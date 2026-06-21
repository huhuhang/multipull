#!/usr/bin/env node
import { realpathSync } from "node:fs";
import { relative, sep } from "node:path";
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

class SingleLineProgress {
  private readonly enabled: boolean;
  private lastLength = 0;
  private lastWriteAt = 0;
  private pendingText = "";
  private timer: ReturnType<typeof setTimeout> | undefined;

  constructor(
    private readonly stream: NodeJS.WriteStream = process.stderr,
    private readonly intervalMs = 80
  ) {
    this.enabled = stream.isTTY === true;
  }

  update(text: string): void {
    if (!this.enabled) {
      return;
    }

    this.pendingText = text;
    const elapsed = Date.now() - this.lastWriteAt;
    if (elapsed >= this.intervalMs) {
      this.flush();
      return;
    }

    if (!this.timer) {
      this.timer = setTimeout(() => {
        this.timer = undefined;
        this.flush();
      }, this.intervalMs - elapsed);
    }
  }

  finish(): void {
    if (!this.enabled) {
      return;
    }

    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = undefined;
    }

    if (this.lastLength > 0) {
      this.stream.write(`\r${" ".repeat(this.lastLength)}\r`);
    }

    this.lastLength = 0;
    this.lastWriteAt = 0;
    this.pendingText = "";
  }

  private flush(): void {
    if (!this.pendingText) {
      return;
    }

    const width = Math.max((this.stream.columns ?? 120) - 1, 20);
    const text = truncate(this.pendingText, width);
    const clear = this.lastLength > text.length ? " ".repeat(this.lastLength - text.length) : "";
    this.stream.write(`\r${text}${clear}`);
    this.lastLength = text.length;
    this.lastWriteAt = Date.now();
    this.pendingText = "";
  }
}

function truncate(text: string, width: number): string {
  if (text.length <= width) {
    return text;
  }
  if (width <= 3) {
    return text.slice(0, width);
  }
  return `${text.slice(0, width - 3)}...`;
}

function compactPath(path: string): string {
  const rel = relative(process.cwd(), path);
  if (rel === "") {
    return ".";
  }
  return rel === ".." || rel.startsWith(`..${sep}`) ? path : rel;
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

  const progress = new SingleLineProgress();
  const { repos, missing } = await discoverRepos(paths, {
    maxDepth: DEFAULT_MAX_DEPTH,
    onProgress: (event) => {
      progress.update(
        `multipull: scanning ${event.scannedDirs} dirs, found ${event.foundRepos} repos | ${compactPath(
          event.currentPath
        )}`
      );
    }
  });
  progress.finish();

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
    parkToDefaultBranch: options.parkToDefaultBranch ?? false,
    onProgress: (event) => {
      const verb = options.dryRun ? "checking" : "pulling";
      const repo = event.currentRepo ? ` | ${event.currentRepo}` : "";
      progress.update(`multipull: ${verb} ${event.completed}/${event.total}${repo}`);
    }
  });
  progress.finish();

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

import { DEFAULT_JOBS, DEFAULT_TIMEOUT_MS } from "./defaults.js";
import {
  classifyPullSuccess,
  combinedOutput,
  firstLine,
  inspectWorktree,
  ok,
  parkAndCheckoutDefaultBranch,
  resolveDefaultBranch,
  runGit
} from "./git.js";
import type { Repo, RepoResult, RunOptions } from "./types.js";

function pendingResult(repo: Repo): RepoResult {
  return {
    repo,
    branch: "-",
    upstream: "-",
    result: "PENDING",
    category: "pending"
  };
}

function failedResult(repo: Repo, error: unknown): RepoResult {
  return {
    repo,
    branch: "-",
    upstream: "-",
    result: "FAIL internal error",
    category: "fail",
    detail: error instanceof Error ? error.message : String(error)
  };
}

export async function processRepo(repo: Repo, options: RunOptions): Promise<RepoResult> {
  const result = pendingResult(repo);
  let switchTarget = "";
  let switchAction = "";
  let switchOutput = "";

  let status = await inspectWorktree(repo, options.timeoutMs);
  result.branch = status.branch;
  if (status.error) {
    return {
      ...result,
      result: "FAIL status",
      category: "fail",
      detail: status.error
    };
  }

  if (options.parkToDefaultBranch) {
    const targetBranch = await resolveDefaultBranch(repo, options.timeoutMs);
    if (!targetBranch) {
      return {
        ...result,
        result: "FAIL default branch",
        category: "fail",
        detail: "no default branch found"
      };
    }

    const shouldSwitch = status.detached || status.branch !== targetBranch;
    if (shouldSwitch) {
      switchTarget = targetBranch;
      switchAction = status.dirty ? "parked" : "switched";

      if (options.dryRun) {
        return {
          ...result,
          result: `READY ${switchAction} -> ${switchTarget}`,
          category: "dry"
        };
      }

      const switchResult = await parkAndCheckoutDefaultBranch(repo, status, targetBranch, options.timeoutMs);
      switchOutput = combinedOutput(switchResult.result);
      if (!ok(switchResult.result)) {
        return {
          ...result,
          result: `FAIL ${switchAction} -> ${switchTarget}`,
          category: "fail",
          detail: firstLine(switchOutput) || "switch failed",
          output: switchOutput
        };
      }

      status = await inspectWorktree(repo, options.timeoutMs);
      result.branch = status.branch;
      if (switchResult.backupBranch) {
        result.detail = `backup branch: ${switchResult.backupBranch}`;
      }
      if (status.error) {
        return {
          ...result,
          result: "FAIL status",
          category: "fail",
          detail: status.error,
          output: switchOutput
        };
      }
    }
  }

  if (status.detached) {
    return {
      ...result,
      result: "SKIP detached HEAD",
      category: "skip"
    };
  }

  if (status.dirty) {
    return {
      ...result,
      result: `SKIP dirty (${status.dirtyText})`,
      category: "skip"
    };
  }

  if (!status.upstream) {
    return {
      ...result,
      result: "SKIP no upstream",
      category: "skip"
    };
  }

  result.upstream = status.upstream;

  if (options.dryRun) {
    return {
      ...result,
      result: "READY pull",
      category: "dry"
    };
  }

  const before = await runGit(repo.path, ["rev-parse", "HEAD"], options.timeoutMs);
  if (!ok(before)) {
    const output = combinedOutput(before);
    return {
      ...result,
      result: "FAIL read HEAD",
      category: "fail",
      detail: firstLine(output),
      output
    };
  }

  const pull = await runGit(repo.path, ["pull", "--ff-only", "--prune"], options.timeoutMs);
  const pullOutput = [switchOutput, combinedOutput(pull)].filter(Boolean).join("\n");
  if (!ok(pull)) {
    return {
      ...result,
      result: "FAIL pull",
      category: "fail",
      detail: pull.timedOut ? `timed out after ${Math.round(options.timeoutMs / 1000)}s` : firstLine(combinedOutput(pull)),
      output: pullOutput
    };
  }

  const pullResult = await classifyPullSuccess(repo, before.stdout.trim(), options.timeoutMs);
  return {
    ...result,
    result: switchTarget ? `${pullResult} (${switchAction} -> ${switchTarget})` : pullResult,
    category: "ok",
    output: pullOutput
  };
}

export async function runRepos(
  repos: Repo[],
  options: Partial<RunOptions> = {}
): Promise<RepoResult[]> {
  const runOptions: RunOptions = {
    dryRun: options.dryRun ?? false,
    verbose: options.verbose ?? false,
    parkToDefaultBranch: options.parkToDefaultBranch ?? false,
    jobs: options.jobs ?? DEFAULT_JOBS,
    timeoutMs: options.timeoutMs ?? DEFAULT_TIMEOUT_MS
  };

  const results = new Map<string, RepoResult>();
  const queue = [...repos];

  async function worker(): Promise<void> {
    while (queue.length > 0) {
      const repo = queue.shift();
      if (!repo) {
        continue;
      }

      try {
        results.set(repo.path, await processRepo(repo, runOptions));
      } catch (error) {
        results.set(repo.path, failedResult(repo, error));
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(runOptions.jobs, repos.length) }, () => worker()));
  return repos.map((repo) => results.get(repo.path) ?? failedResult(repo, "missing result"));
}

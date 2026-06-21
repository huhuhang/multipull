import { execFile } from "node:child_process";
import { basename } from "node:path";

import { DEFAULT_TIMEOUT_MS } from "./defaults.js";
import type { GitCommandResult, Repo, RunOptions, WorktreeStatus } from "./types.js";

export function combinedOutput(result: GitCommandResult): string {
  return [result.stdout.trim(), result.stderr.trim()].filter(Boolean).join("\n");
}

export function firstLine(text: string): string {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find(Boolean) ?? "";
}

export function runGit(
  repoPath: string,
  args: string[],
  timeoutMs = DEFAULT_TIMEOUT_MS
): Promise<GitCommandResult> {
  return new Promise((resolve) => {
    execFile(
      "git",
      ["-C", repoPath, ...args],
      {
        encoding: "utf8",
        env: {
          ...process.env,
          GIT_TERMINAL_PROMPT: process.env.GIT_TERMINAL_PROMPT ?? "0"
        },
        maxBuffer: 10 * 1024 * 1024,
        timeout: timeoutMs
      },
      (error, stdout, stderr) => {
        if (!error) {
          resolve({ code: 0, stdout, stderr, timedOut: false });
          return;
        }

        const nodeError = error as NodeJS.ErrnoException & { killed?: boolean; signal?: string };
        const code = typeof nodeError.code === "number" ? nodeError.code : nodeError.killed ? 124 : 1;
        resolve({
          code,
          stdout,
          stderr,
          timedOut: nodeError.killed === true || nodeError.signal === "SIGTERM"
        });
      }
    );
  });
}

export function ok(result: GitCommandResult): boolean {
  return result.code === 0 && !result.timedOut;
}

export async function verifyRepo(candidatePath: string): Promise<string | undefined> {
  const result = await runGit(candidatePath, ["rev-parse", "--show-toplevel"], 30_000);
  if (!ok(result)) {
    return undefined;
  }

  const root = result.stdout.trim();
  return root.length > 0 ? root : undefined;
}

export function parseStatusHeader(header: string): Pick<WorktreeStatus, "branch" | "upstream" | "detached"> {
  const branchText = header.replace(/^##\s*/, "").trim();
  if (branchText.startsWith("HEAD ")) {
    return { branch: "detached", detached: true };
  }

  if (branchText.startsWith("No commits yet on ")) {
    const branch = branchText.replace(/^No commits yet on\s*/, "").trim();
    return { branch: branch || "-", detached: false };
  }

  if (branchText.includes("...")) {
    const [branch = "-", upstreamText = ""] = branchText.split("...", 2);
    const upstream = upstreamText.split(" [", 1)[0]?.trim();
    const parsed: Pick<WorktreeStatus, "branch" | "upstream" | "detached"> = {
      branch: branch.trim() || "-",
      detached: false
    };
    if (upstream) {
      parsed.upstream = upstream;
    }
    return parsed;
  }

  return {
    branch: branchText.split(" [", 1)[0]?.trim() || "-",
    detached: false
  };
}

export async function inspectWorktree(repo: Repo, timeoutMs: number): Promise<WorktreeStatus> {
  const result = await runGit(repo.path, ["status", "--porcelain=v1", "--branch"], timeoutMs);
  if (!ok(result)) {
    return {
      branch: "-",
      detached: false,
      dirty: false,
      dirtyText: "",
      error: firstLine(combinedOutput(result)) || "status failed"
    };
  }

  const lines = result.stdout.split(/\r?\n/).filter((line) => line.trim().length > 0);
  const header = lines[0];
  if (!header?.startsWith("## ")) {
    return {
      branch: "-",
      detached: false,
      dirty: false,
      dirtyText: "",
      error: "unable to read status"
    };
  }

  const parsed = parseStatusHeader(header);
  const dirtyCount = lines.length - 1;
  return {
    ...parsed,
    dirty: dirtyCount > 0,
    dirtyText: dirtyCount > 0 ? `${dirtyCount} change${dirtyCount === 1 ? "" : "s"}` : ""
  };
}

export async function localBranchExists(repo: Repo, branch: string, timeoutMs: number): Promise<boolean> {
  const result = await runGit(repo.path, ["show-ref", "--verify", "--quiet", `refs/heads/${branch}`], timeoutMs);
  return ok(result);
}

export async function remoteBranchExists(
  repo: Repo,
  remote: string,
  branch: string,
  timeoutMs: number
): Promise<boolean> {
  const result = await runGit(
    repo.path,
    ["show-ref", "--verify", "--quiet", `refs/remotes/${remote}/${branch}`],
    timeoutMs
  );
  return ok(result);
}

export async function resolveDefaultBranch(repo: Repo, timeoutMs: number): Promise<string | undefined> {
  const originHead = await runGit(repo.path, ["symbolic-ref", "--quiet", "--short", "refs/remotes/origin/HEAD"], timeoutMs);
  if (ok(originHead)) {
    const ref = originHead.stdout.trim();
    if (ref.startsWith("origin/")) {
      return ref.slice("origin/".length);
    }
  }

  for (const branch of ["main", "master"]) {
    if (await localBranchExists(repo, branch, timeoutMs)) {
      return branch;
    }
    if (await remoteBranchExists(repo, "origin", branch, timeoutMs)) {
      return branch;
    }
  }

  return undefined;
}

export async function checkoutDefaultBranch(
  repo: Repo,
  targetBranch: string,
  timeoutMs: number
): Promise<GitCommandResult> {
  if (await localBranchExists(repo, targetBranch, timeoutMs)) {
    return runGit(repo.path, ["checkout", targetBranch], timeoutMs);
  }

  if (await remoteBranchExists(repo, "origin", targetBranch, timeoutMs)) {
    return runGit(repo.path, ["checkout", "-B", targetBranch, `origin/${targetBranch}`], timeoutMs);
  }

  return {
    code: 1,
    stdout: "",
    stderr: `default branch not found: ${targetBranch}`,
    timedOut: false
  };
}

function branchNameFragment(value: string): string {
  const fragment = value.replace(/[^a-zA-Z0-9_.-]+/g, "-").replace(/^[-_.]+|[-_.]+$/g, "");
  return (fragment || "worktree").slice(0, 48);
}

export async function uniqueBackupBranch(repo: Repo, sourceBranch: string, timeoutMs: number): Promise<string> {
  const timestamp = new Date()
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\..+$/, "")
    .replace("T", "-");
  const base = `multipull-backup/${timestamp}-${branchNameFragment(sourceBranch)}`;
  let candidate = base;
  let suffix = 2;

  while (await localBranchExists(repo, candidate, timeoutMs)) {
    candidate = `${base}-${suffix}`;
    suffix += 1;
  }

  return candidate;
}

export async function commitWorktreeToBackupBranch(
  repo: Repo,
  status: WorktreeStatus,
  timeoutMs: number
): Promise<{ branch: string; result: GitCommandResult }> {
  const source = status.detached ? "detached" : status.branch;
  const branch = await uniqueBackupBranch(repo, source, timeoutMs);
  const outputs: string[] = [];

  for (const args of [
    ["checkout", "-b", branch],
    ["add", "-A"],
    ["commit", "--no-verify", "-m", `multipull backup before switching from ${source}`]
  ]) {
    const result = await runGit(repo.path, args, timeoutMs);
    outputs.push(combinedOutput(result));
    if (!ok(result)) {
      return {
        branch,
        result: {
          ...result,
          stdout: outputs.filter(Boolean).join("\n")
        }
      };
    }
  }

  return {
    branch,
    result: {
      code: 0,
      stdout: outputs.filter(Boolean).join("\n"),
      stderr: "",
      timedOut: false
    }
  };
}

export async function parkAndCheckoutDefaultBranch(
  repo: Repo,
  status: WorktreeStatus,
  targetBranch: string,
  timeoutMs: number
): Promise<{ backupBranch?: string; result: GitCommandResult }> {
  const outputs: string[] = [];
  let backupBranch: string | undefined;

  if (status.dirty) {
    const backup = await commitWorktreeToBackupBranch(repo, status, timeoutMs);
    backupBranch = backup.branch;
    outputs.push(combinedOutput(backup.result));
    if (!ok(backup.result)) {
      return {
        backupBranch,
        result: {
          ...backup.result,
          stdout: outputs.filter(Boolean).join("\n")
        }
      };
    }
  }

  const checkout = await checkoutDefaultBranch(repo, targetBranch, timeoutMs);
  outputs.push(combinedOutput(checkout));
  const parkedResult: { backupBranch?: string; result: GitCommandResult } = {
    result: {
      ...checkout,
      stdout: outputs.filter(Boolean).join("\n")
    }
  };
  if (backupBranch) {
    parkedResult.backupBranch = backupBranch;
  }
  return parkedResult;
}

export async function classifyPullSuccess(repo: Repo, beforeHead: string, timeoutMs: number): Promise<string> {
  const after = await runGit(repo.path, ["rev-parse", "HEAD"], timeoutMs);
  if (ok(after) && after.stdout.trim() !== beforeHead) {
    return "OK updated";
  }

  return "OK current";
}

export function repoName(repoPath: string): string {
  return basename(repoPath) || repoPath;
}

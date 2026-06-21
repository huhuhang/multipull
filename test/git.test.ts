import { execFileSync } from "node:child_process";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { parseStatusHeader } from "../src/git.js";
import { processRepo } from "../src/runner.js";
import type { Repo } from "../src/types.js";

function git(cwd: string, args: string[]): string {
  return execFileSync("git", args, {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"]
  });
}

async function tempDir(): Promise<string> {
  return mkdtemp(join(tmpdir(), "multipull-test-"));
}

describe("parseStatusHeader", () => {
  it("parses a branch with an upstream", () => {
    expect(parseStatusHeader("## main...origin/main")).toEqual({
      branch: "main",
      upstream: "origin/main",
      detached: false
    });
  });

  it("strips ahead and behind annotations", () => {
    expect(parseStatusHeader("## feature...origin/feature [ahead 1, behind 2]")).toEqual({
      branch: "feature",
      upstream: "origin/feature",
      detached: false
    });
  });

  it("detects detached HEAD", () => {
    expect(parseStatusHeader("## HEAD (no branch)")).toEqual({
      branch: "detached",
      detached: true
    });
  });
});

describe("processRepo", () => {
  it("parks dirty work on a backup branch before switching to the default branch", async () => {
    const root = await tempDir();
    const origin = join(root, "origin.git");
    const repoPath = join(root, "repo");

    git(root, ["init", "-q", "--bare", origin]);
    git(root, ["clone", "-q", origin, repoPath]);
    git(repoPath, ["config", "user.name", "Multipull Test"]);
    git(repoPath, ["config", "user.email", "test@example.com"]);
    git(repoPath, ["checkout", "-q", "-b", "main"]);
    await writeFile(join(repoPath, "base.txt"), "base\n");
    git(repoPath, ["add", "base.txt"]);
    git(repoPath, ["commit", "-q", "-m", "initial"]);
    git(repoPath, ["push", "-q", "-u", "origin", "main"]);
    git(repoPath, ["symbolic-ref", "refs/remotes/origin/HEAD", "refs/remotes/origin/main"]);
    git(repoPath, ["checkout", "-q", "-b", "feature"]);
    await writeFile(join(repoPath, "feature.txt"), "dirty\n");

    const repo: Repo = { path: repoPath, label: "repo" };
    const result = await processRepo(repo, {
      dryRun: false,
      verbose: false,
      parkToDefaultBranch: true,
      jobs: 1,
      timeoutMs: 30_000
    });

    expect(result.category).toBe("ok");
    expect(result.branch).toBe("main");
    expect(result.result).toContain("(parked -> main)");
    expect(git(repoPath, ["branch", "--show-current"]).trim()).toBe("main");

    const backupBranch = git(repoPath, ["branch", "--list", "multipull-backup/*", "--format=%(refname:short)"]).trim();
    expect(backupBranch).toMatch(/^multipull-backup\//);
    expect(git(repoPath, ["show", `${backupBranch}:feature.txt`])).toBe("dirty\n");
    await expect(readFile(join(repoPath, "feature.txt"), "utf8")).rejects.toThrow();
  });
});


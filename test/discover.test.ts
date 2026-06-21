import { execFileSync } from "node:child_process";
import { mkdir, mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { discoverRepos } from "../src/discover.js";

function git(cwd: string, args: string[]): string {
  return execFileSync("git", args, {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"]
  });
}

async function tempDir(): Promise<string> {
  return mkdtemp(join(tmpdir(), "multipull-discover-"));
}

async function initRepo(path: string): Promise<void> {
  await mkdir(path, { recursive: true });
  git(path, ["init", "-q"]);
}

describe("discoverRepos", () => {
  it("discovers real Git repositories and skips ignored directories", async () => {
    const root = await tempDir();
    await initRepo(join(root, "real"));
    await initRepo(join(root, "lab-skip", "repo"));
    await initRepo(join(root, "challenge-skip", "repo"));
    await initRepo(join(root, "node_modules", "repo"));

    const { repos, missing } = await discoverRepos([root], { maxDepth: 0 });

    expect(missing).toEqual([]);
    expect(repos.map((repo) => repo.label)).toEqual(["real"]);
  });

  it("honors the maximum scan depth", async () => {
    const root = await tempDir();
    await initRepo(join(root, "d1", "repo"));
    await initRepo(join(root, "d1", "d2", "d3", "d4", "d5", "repo5"));

    const { repos } = await discoverRepos([root], { maxDepth: 4 });

    expect(repos.map((repo) => repo.label)).toEqual(["d1/repo"]);
  });
});


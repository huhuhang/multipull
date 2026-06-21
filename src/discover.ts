import { opendir, realpath, stat } from "node:fs/promises";
import { relative, resolve, sep } from "node:path";

import { DEFAULT_MAX_DEPTH, SCAN_IGNORE_NAMES, SCAN_IGNORE_PREFIXES } from "./defaults.js";
import { repoName, verifyRepo } from "./git.js";
import type { DiscoverOptions, Repo } from "./types.js";

interface DiscoverState {
  scannedDirs: number;
  foundRepos: number;
}

function shouldIgnoreDir(name: string): boolean {
  return SCAN_IGNORE_NAMES.has(name) || SCAN_IGNORE_PREFIXES.some((prefix) => name.startsWith(prefix));
}

function scanDepth(root: string, dirPath: string): number {
  const rel = relative(root, dirPath);
  return rel === "" ? 0 : rel.split(sep).length;
}

function displayLabel(repoPath: string, roots: string[]): string {
  const containingRoots = roots.filter((root) => repoPath === root || repoPath.startsWith(`${root}${sep}`));
  if (containingRoots.length > 0) {
    const root = containingRoots.sort((a, b) => b.length - a.length)[0];
    if (root) {
      const rel = relative(root, repoPath);
      if (rel !== "") {
        return rel;
      }
    }
  }

  return repoName(repoPath);
}

async function isDirectory(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isDirectory();
  } catch {
    return false;
  }
}

async function walkForRepos(
  root: string,
  dirPath: string,
  options: DiscoverOptions,
  state: DiscoverState,
  seen: Set<string>,
  repoPaths: string[]
): Promise<void> {
  state.scannedDirs += 1;
  options.onProgress?.({
    phase: "scan",
    scannedDirs: state.scannedDirs,
    foundRepos: state.foundRepos,
    currentPath: dirPath
  });

  let dir;
  try {
    dir = await opendir(dirPath);
  } catch {
    return;
  }

  const childDirs: string[] = [];
  let hasGitEntry = false;

  for await (const entry of dir) {
    if (entry.name === ".git" && (entry.isDirectory() || entry.isFile())) {
      hasGitEntry = true;
      continue;
    }

    if (!entry.isDirectory() || entry.isSymbolicLink() || shouldIgnoreDir(entry.name)) {
      continue;
    }

    childDirs.push(resolve(dirPath, entry.name));
  }

  if (hasGitEntry) {
    const repoRoot = await verifyRepo(dirPath);
    if (repoRoot && !seen.has(repoRoot)) {
      seen.add(repoRoot);
      repoPaths.push(repoRoot);
      state.foundRepos += 1;
      options.onProgress?.({
        phase: "scan",
        scannedDirs: state.scannedDirs,
        foundRepos: state.foundRepos,
        currentPath: dirPath
      });
    }
  }

  if (options.maxDepth > 0 && scanDepth(root, dirPath) >= options.maxDepth) {
    return;
  }

  await Promise.all(childDirs.map((child) => walkForRepos(root, child, options, state, seen, repoPaths)));
}

export async function discoverRepos(
  rawRoots: string[],
  options: DiscoverOptions = { maxDepth: DEFAULT_MAX_DEPTH }
): Promise<{ repos: Repo[]; missing: string[] }> {
  const roots: string[] = [];
  const missing: string[] = [];

  for (const rawRoot of rawRoots) {
    const resolved = resolve(rawRoot);
    if (!(await isDirectory(resolved))) {
      missing.push(rawRoot);
      continue;
    }
    roots.push(await realpath(resolved));
  }

  const seen = new Set<string>();
  const repoPaths: string[] = [];
  const state: DiscoverState = { scannedDirs: 0, foundRepos: 0 };
  await Promise.all(roots.map((root) => walkForRepos(root, root, options, state, seen, repoPaths)));

  return {
    repos: repoPaths
      .sort((a, b) => a.localeCompare(b))
      .map((path) => ({
        path,
        label: displayLabel(path, roots)
      })),
    missing
  };
}

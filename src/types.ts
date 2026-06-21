export type ResultCategory = "ok" | "skip" | "fail" | "dry" | "pending" | "running";

export interface Repo {
  path: string;
  label: string;
}

export interface GitCommandResult {
  code: number;
  stdout: string;
  stderr: string;
  timedOut: boolean;
}

export interface WorktreeStatus {
  branch: string;
  upstream?: string;
  detached: boolean;
  dirty: boolean;
  dirtyText: string;
  error?: string;
}

export interface RepoResult {
  repo: Repo;
  branch: string;
  upstream: string;
  result: string;
  category: ResultCategory;
  detail?: string;
  output?: string;
}

export interface RunOptions {
  dryRun: boolean;
  verbose: boolean;
  parkToDefaultBranch: boolean;
  jobs: number;
  timeoutMs: number;
}

export interface DiscoverOptions {
  maxDepth: number;
}


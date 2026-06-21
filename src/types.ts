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

export interface DiscoverProgress {
  phase: "scan";
  scannedDirs: number;
  foundRepos: number;
  currentPath: string;
}

export interface RunProgress {
  phase: "run";
  completed: number;
  total: number;
  currentRepo?: string | undefined;
}

export interface RunOptions {
  dryRun: boolean;
  verbose: boolean;
  parkToDefaultBranch: boolean;
  jobs: number;
  timeoutMs: number;
  onProgress?: ((progress: RunProgress) => void) | undefined;
}

export interface DiscoverOptions {
  maxDepth: number;
  onProgress?: ((progress: DiscoverProgress) => void) | undefined;
}

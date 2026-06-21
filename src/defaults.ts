export const DEFAULT_JOBS = 4;
export const DEFAULT_MAX_DEPTH = 4;
export const DEFAULT_TIMEOUT_MS = 300_000;

export const SCAN_IGNORE_NAMES = new Set([
  ".build",
  ".cache",
  ".gradle",
  ".idea",
  ".mypy_cache",
  ".next",
  ".nuxt",
  ".parcel-cache",
  ".pytest_cache",
  ".ruff_cache",
  ".tox",
  ".turbo",
  ".venv",
  "__pycache__",
  "build",
  "coverage",
  "DerivedData",
  "dist",
  "env",
  "node_modules",
  "out",
  "Pods",
  "target",
  "vendor",
  "venv"
]);

export const SCAN_IGNORE_PREFIXES = ["lab-", "challenge-"];


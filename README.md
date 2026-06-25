# multipull

Pull many Git repositories safely from one CLI.

`multipull` scans a directory tree for real Git repositories, skips noisy generated folders, and runs a conservative pull operation for each repository.

## Features

- Discovers repository roots before running Git commands.
- Skips common heavy directories such as `node_modules`, `dist`, `build`, `target`, `vendor`, `lab-*`, and `challenge-*`.
- Uses a safe pull strategy: `git pull --ff-only --prune`.
- Skips dirty worktrees by default.
- Skips detached HEAD and branches without an upstream.
- Shows a minimal single-line progress indicator in interactive terminals.
- Shows one clear final table with repository, branch, upstream, and result.
- Optionally parks dirty work on a `multipull-backup/*` branch before switching to the default branch.

## Installation

```bash
npm install -g @huhuhang/multipull
```

Development checkout:

```bash
git clone https://github.com/huhuhang/multipull.git
cd multipull
npm install
npm run build
npm link
```

## Usage

```bash
multipull [paths...]
```

Examples:

```bash
multipull
multipull ~/GitHub
multipull ~/GitHub ~/Work
multipull --dry-run
multipull --max-depth 5 ~/GitHub
multipull --verbose
multipull --park-to-default-branch
```

## Options

```text
--dry-run                 Show planned actions without pulling.
--max-depth <depth>       Maximum directory depth to scan. Defaults to 3; use 0 for no limit.
--verbose                 Show Git output details after the summary table.
--park-to-default-branch  Preserve dirty changes before switching to the default branch.
```

Concurrency, timeout, and ignore rules are internal defaults so the command stays easy to use.

## Default Behavior

For each discovered repository, `multipull`:

1. Reads the current branch, upstream, and worktree status.
2. Skips dirty worktrees unless `--park-to-default-branch` is enabled and a default branch switch is needed.
3. Skips detached HEAD.
4. Skips branches without an upstream.
5. Runs `git pull --ff-only --prune`.
6. Prints a final summary table.

## Parking Local Work

`--park-to-default-branch` is explicit because it creates Git history and switches branches.

When enabled:

- If the repository is already on its default branch, `multipull` pulls normally.
- If the repository is on another clean branch, `multipull` switches to the default branch and pulls.
- If the repository is on another dirty branch, `multipull` creates a `multipull-backup/*` branch, commits the current worktree there, switches to the default branch, and pulls.

Ignored files are not force-added or deleted.

## Development

```bash
npm install
npm run typecheck
npm test
npm run build
npm run check
```

Run from source:

```bash
npm run dev -- ~/GitHub --dry-run
```

## License

MIT

import type { RepoResult, ResultCategory } from "./types.js";

interface RenderTableOptions {
  color?: boolean;
}

const ansi = {
  bold: ["\u001b[1m", "\u001b[22m"],
  dim: ["\u001b[2m", "\u001b[22m"],
  green: ["\u001b[32m", "\u001b[39m"],
  yellow: ["\u001b[33m", "\u001b[39m"],
  red: ["\u001b[31m", "\u001b[39m"],
  cyan: ["\u001b[36m", "\u001b[39m"]
} as const;

function style(text: string, code: keyof typeof ansi, enabled: boolean): string {
  if (!enabled) {
    return text;
  }
  const [open, close] = ansi[code];
  return `${open}${text}${close}`;
}

function shouldColor(): boolean {
  if (process.env.NO_COLOR) {
    return false;
  }
  if (process.env.FORCE_COLOR && process.env.FORCE_COLOR !== "0") {
    return true;
  }
  return process.stdout.isTTY === true;
}

function fit(text: string, width: number): string {
  if (text.length <= width) {
    return text.padEnd(width, " ");
  }
  if (width <= 3) {
    return text.slice(0, width);
  }
  return `${text.slice(0, width - 3)}...`;
}

function widths(results: RepoResult[]): [number, number, number, number] {
  const rows = [
    ["Repo", "Branch", "Upstream", "Result"],
    ...results.map((item) => [item.repo.label, item.branch, item.upstream, item.result])
  ];
  const maxes = [0, 1, 2, 3].map((index) => Math.max(...rows.map((row) => row[index]?.length ?? 0)));
  const branch = Math.min(Math.max(maxes[1] ?? 8, 8), 20);
  const upstream = Math.min(Math.max(maxes[2] ?? 12, 12), 28);
  const result = Math.min(Math.max(maxes[3] ?? 16, 16), 40);
  const terminal = process.stdout.columns ?? 120;
  const repo = Math.max(16, Math.min(maxes[0] ?? 16, terminal - branch - upstream - result - 6));
  return [repo, branch, upstream, result];
}

function resultStyle(category: ResultCategory): keyof typeof ansi | undefined {
  switch (category) {
    case "ok":
      return "green";
    case "skip":
      return "yellow";
    case "fail":
      return "red";
    case "dry":
    case "pending":
    case "running":
      return "cyan";
  }
}

export function renderTable(results: RepoResult[], options: RenderTableOptions = {}): string {
  const color = options.color ?? shouldColor();
  const headers = ["Repo", "Branch", "Upstream", "Result"];
  const columnWidths = widths(results);
  const lines = [
    style(headers.map((header, index) => fit(header, columnWidths[index] ?? header.length)).join("  "), "bold", color),
    style(columnWidths.map((width) => "-".repeat(width)).join("  "), "dim", color)
  ];

  for (const item of results) {
    const row = [item.repo.label, item.branch, item.upstream, item.result];
    const cells = row.map((cell, index) => {
      const fitted = fit(cell, columnWidths[index] ?? cell.length);
      if (index !== 3) {
        return fitted;
      }
      return style(fitted, resultStyle(item.category) ?? "dim", color);
    });
    lines.push(cells.join("  "));
  }

  return lines.join("\n");
}

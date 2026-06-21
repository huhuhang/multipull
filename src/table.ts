import type { RepoResult } from "./types.js";

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

export function renderTable(results: RepoResult[]): string {
  const headers = ["Repo", "Branch", "Upstream", "Result"];
  const columnWidths = widths(results);
  const lines = [
    headers.map((header, index) => fit(header, columnWidths[index] ?? header.length)).join("  "),
    columnWidths.map((width) => "-".repeat(width)).join("  ")
  ];

  for (const item of results) {
    const row = [item.repo.label, item.branch, item.upstream, item.result];
    lines.push(row.map((cell, index) => fit(cell, columnWidths[index] ?? cell.length)).join("  "));
  }

  return lines.join("\n");
}


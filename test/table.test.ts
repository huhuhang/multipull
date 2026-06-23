import { describe, expect, it } from "vitest";

import { renderTable } from "../src/table.js";
import type { RepoResult } from "../src/types.js";

describe("renderTable", () => {
  it("renders the expected table columns", () => {
    const rows: RepoResult[] = [
      {
        repo: { path: "/tmp/repo", label: "repo" },
        branch: "main",
        upstream: "origin/main",
        result: "OK current",
        category: "ok"
      }
    ];

    expect(renderTable(rows)).toContain("Repo");
    expect(renderTable(rows)).toContain("Branch");
    expect(renderTable(rows)).toContain("Upstream");
    expect(renderTable(rows)).toContain("Result");
    expect(renderTable(rows)).toContain("OK current");
  });

  it("can color only the structural and result cells", () => {
    const rows: RepoResult[] = [
      {
        repo: { path: "/tmp/current", label: "current" },
        branch: "main",
        upstream: "origin/main",
        result: "OK current",
        category: "ok"
      },
      {
        repo: { path: "/tmp/dirty", label: "dirty" },
        branch: "main",
        upstream: "-",
        result: "SKIP dirty",
        category: "skip"
      },
      {
        repo: { path: "/tmp/fail", label: "fail" },
        branch: "-",
        upstream: "-",
        result: "FAIL pull",
        category: "fail"
      }
    ];

    const table = renderTable(rows, { color: true });

    expect(table).toContain("\u001b[1mRepo");
    expect(table).toContain("\u001b[32mOK current");
    expect(table).toContain("\u001b[33mSKIP dirty");
    expect(table).toContain("\u001b[31mFAIL pull");
    expect(table).toMatch(/current\s+main\s+origin\/main/);
  });
});

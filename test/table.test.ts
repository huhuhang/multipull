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
});


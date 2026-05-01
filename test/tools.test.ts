import { test, expect, describe } from "bun:test";
import { executeTool, computeDiff } from "../src/tools/index.js";

describe("Tools", () => {
  test("execute_shell runs asynchronously", async () => {
    const resultPromise = executeTool("execute_shell", {
      command: "echo verification_success",
    });
    expect(resultPromise instanceof Promise).toBe(true);
    const result = await resultPromise;
    expect(result.text).toContain("verification_success");
  });

  test("execute_shell returns output for valid command", async () => {
    const result = await executeTool("execute_shell", {
      command: "echo hello_bun",
    });
    expect(result.text).toContain("hello_bun");
  });

  test("read_file returns file content", async () => {
    const result = await executeTool("read_file", {
      path: "package.json",
    });
    expect(result.text).toContain("@todlabs/tod");
  });

  test("list_directory returns directory listing", async () => {
    const result = await executeTool("list_directory", {
      path: ".",
    });
    expect(result.text).toContain("package.json");
  });

  test("write_file returns diff", async () => {
    const tmpPath = `./test-diff-${Date.now()}.txt`;
    try {
      // Create new file
      const r1 = await executeTool("write_file", {
        path: tmpPath,
        content: "hello\nworld\n",
      });
      expect(r1.diff).toBeDefined();
      expect(r1.diff!.isNewFile).toBe(true);
      expect(r1.diff!.addedCount).toBeGreaterThan(0);

      // Update existing file
      const r2 = await executeTool("write_file", {
        path: tmpPath,
        content: "hello\nchanged\n",
      });
      expect(r2.diff).toBeDefined();
      expect(r2.diff!.isNewFile).toBe(false);
      expect(r2.diff!.removedCount).toBeGreaterThan(0);
      expect(r2.diff!.addedCount).toBeGreaterThan(0);
    } finally {
      // Cleanup
      try { await require("fs").promises.unlink(tmpPath); } catch {}
    }
  });

  test("computeDiff detects additions and removals", () => {
    const diff = computeDiff(
      ["line1", "line2", "line3"],
      ["line1", "line2-modified", "line3", "line4"],
      "test.ts",
      false,
    );
    expect(diff.addedCount).toBeGreaterThan(0);
    expect(diff.removedCount).toBeGreaterThan(0);
    expect(diff.filePath).toBe("test.ts");
  });
});

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

  test("edit_file replaces a unique substring and returns diff", async () => {
    const tmpPath = `./test-edit-${Date.now()}.txt`;
    try {
      await executeTool("write_file", {
        path: tmpPath,
        content: "alpha\nbeta\ngamma\n",
      });
      const r = await executeTool("edit_file", {
        path: tmpPath,
        old_string: "beta",
        new_string: "BETA",
      });
      expect(r.diff).toBeDefined();
      expect(r.text).toContain("Edited");
      const after = await executeTool("read_file", { path: tmpPath });
      expect(after.text).toContain("BETA");
      expect(after.text).not.toContain("\nbeta\n");
    } finally {
      try { await require("fs").promises.unlink(tmpPath); } catch {}
    }
  });

  test("edit_file fails when old_string is not unique without replace_all", async () => {
    const tmpPath = `./test-edit-dup-${Date.now()}.txt`;
    try {
      await executeTool("write_file", {
        path: tmpPath,
        content: "x\nx\n",
      });
      const r = await executeTool("edit_file", {
        path: tmpPath,
        old_string: "x",
        new_string: "y",
      });
      expect(r.text.toLowerCase()).toContain("not unique");
    } finally {
      try { await require("fs").promises.unlink(tmpPath); } catch {}
    }
  });

  test("edit_file replace_all swaps every occurrence", async () => {
    const tmpPath = `./test-edit-all-${Date.now()}.txt`;
    try {
      await executeTool("write_file", {
        path: tmpPath,
        content: "x\nx\nx\n",
      });
      const r = await executeTool("edit_file", {
        path: tmpPath,
        old_string: "x",
        new_string: "y",
        replace_all: true,
      });
      expect(r.text).toContain("Edited");
      const after = await executeTool("read_file", { path: tmpPath });
      expect(after.text).toBe("y\ny\ny\n");
    } finally {
      try { await require("fs").promises.unlink(tmpPath); } catch {}
    }
  });

  test("glob finds files by pattern", async () => {
    const r = await executeTool("glob", {
      pattern: "**/package.json",
      path: ".",
    });
    expect(r.text).toContain("package.json");
  });

  test("grep finds matches in files", async () => {
    const r = await executeTool("grep", {
      pattern: "@todlabs/tod",
      path: ".",
      glob: "package.json",
    });
    expect(r.text).toContain("@todlabs/tod");
  });
});

import { test, expect, describe } from "bun:test";
import { executeTool } from "../src/tools/index.js";

describe("Tools", () => {
  test("execute_shell runs asynchronously", async () => {
    const resultPromise = executeTool("execute_shell", {
      command: "echo verification_success",
    });
    expect(resultPromise instanceof Promise).toBe(true);
    const result = await resultPromise as string;
    expect(result).toContain("verification_success");
  });

  test("execute_shell returns output for valid command", async () => {
    const result = await executeTool("execute_shell", {
      command: "echo hello_bun",
    });
    expect(result).toContain("hello_bun");
  });

  test("read_file returns file content", async () => {
    const result = await executeTool("read_file", {
      path: "package.json",
    });
    expect(result).toContain("@todlabs/tod");
  });

  test("list_directory returns directory listing", async () => {
    const result = await executeTool("list_directory", {
      path: ".",
    });
    expect(result).toContain("package.json");
  });
});

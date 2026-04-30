import { $ } from "bun";

console.log("Building with TypeScript (via Bun)...");

try {
  await $`bunx tsc -p .`.quiet(false);
  console.log("Build completed successfully!");
} catch {
  console.error("Build failed!");
  process.exit(1);
}

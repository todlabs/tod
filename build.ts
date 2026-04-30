import { build } from "bun";
import fs from "fs";
import path from "path";

// Clean old dist
const distDir = "dist";
if (fs.existsSync(distDir)) {
  fs.rmSync(distDir, { recursive: true });
}

console.log("Bundling TOD...");

const result = await build({
  entrypoints: ["src/index.ts"],
  outdir: "dist",
  target: "node",
  format: "esm",
  minify: false,
  splitting: false,
  // Bundle everything — react-devtools-core is optional and not needed at runtime
  external: ["react-devtools-core"],
  define: {
    "process.env.NODE_ENV": JSON.stringify("production"),
  },
  naming: {
    entry: "index.js",
  },
});

if (!result.success) {
  console.error("Build failed!");
  for (const log of result.logs) {
    console.error(log);
  }
  process.exit(1);
}

// Prepend shebang to the output file
const outFile = path.join("dist", "index.js");
let content = fs.readFileSync(outFile, "utf-8");
if (!content.startsWith("#!")) {
  content = "#!/usr/bin/env node\n" + content;
  fs.writeFileSync(outFile, content);
}

// Create stub for react-devtools-core (optional ink dependency, not needed at runtime)
const stubDir = path.join("dist", "node_modules", "react-devtools-core");
fs.mkdirSync(stubDir, { recursive: true });
fs.writeFileSync(
  path.join(stubDir, "package.json"),
  JSON.stringify({ name: "react-devtools-core", version: "0.0.0", type: "module", main: "index.js" }, null, 2),
);
fs.writeFileSync(
  path.join(stubDir, "index.js"),
  "export default {};\nexport const connectToDevTools = () => {};\n",
);

console.log("Build completed successfully!");
console.log(`Output: ${outFile}`);

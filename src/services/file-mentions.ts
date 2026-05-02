import { readFileSync, existsSync } from "fs";
import { resolve } from "path";

const FILE_MENTION_RE = /@([\w./\-]+\.\w+)/g;

export function expandFileMentions(text: string, cwd?: string): string {
  const base = cwd || process.cwd();
  return text.replace(FILE_MENTION_RE, (match, filePath: string) => {
    const fullPath = resolve(base, filePath);
    if (!existsSync(fullPath)) {
      return match; // leave as-is if file doesn't exist
    }
    try {
      const content = readFileSync(fullPath, "utf-8");
      return `\n--- ${filePath} ---\n${content}\n--- end of ${filePath} ---\n`;
    } catch {
      return match; // leave as-is on read error
    }
  });
}

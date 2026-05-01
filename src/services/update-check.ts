import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { logger } from "./logger.js";

const PKG_NAME = "@todlabs/tod";
const CACHE_TTL = 1000 * 60 * 60 * 24; // 24h

interface CacheEntry {
  latest: string;
  timestamp: number;
}

function getCachePath(): string {
  return path.join(os.homedir(), ".tod", ".update-cache.json");
}

function readCache(): CacheEntry | null {
  try {
    const p = getCachePath();
    if (!fs.existsSync(p)) return null;
    const data = JSON.parse(fs.readFileSync(p, "utf-8")) as CacheEntry;
    if (Date.now() - data.timestamp > CACHE_TTL) return null;
    return data;
  } catch {
    return null;
  }
}

function writeCache(latest: string): void {
  try {
    const dir = path.join(os.homedir(), ".tod");
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(
      getCachePath(),
      JSON.stringify({ latest, timestamp: Date.now() }),
      "utf-8",
    );
  } catch {
    /* ignore */
  }
}

function semverGt(a: string, b: string): boolean {
  const pa = a.split(".").map(Number);
  const pb = b.split(".").map(Number);
  for (let i = 0; i < 3; i++) {
    if ((pa[i] || 0) > (pb[i] || 0)) return true;
    if ((pa[i] || 0) < (pb[i] || 0)) return false;
  }
  return false;
}

let checked = false;
let updateAvailable: string | null = null;

export async function checkForUpdate(currentVersion: string): Promise<string | null> {
  if (checked) return updateAvailable;
  checked = true;

  // Check cache first
  const cached = readCache();
  if (cached) {
    if (semverGt(cached.latest, currentVersion)) {
      updateAvailable = cached.latest;
      return updateAvailable;
    }
    return null;
  }

  // Fetch from npm registry
  try {
    const res = await fetch(`https://registry.npmjs.org/${PKG_NAME}/latest`, {
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return null;
    const json = (await res.json()) as { version?: string };
    const latest = json.version;
    if (!latest) return null;

    writeCache(latest);

    if (semverGt(latest, currentVersion)) {
      updateAvailable = latest;
      logger.info("Update available", { current: currentVersion, latest });
      return updateAvailable;
    }
  } catch {
    /* ignore — offline is fine */
  }

  return null;
}

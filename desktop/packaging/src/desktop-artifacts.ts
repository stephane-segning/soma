import { promises as fs } from "node:fs";
import path from "node:path";
import { pathExists, resolveInputPath } from "./fs-utils.js";
import type { AppName, TargetOs } from "./types.js";

type DesktopResolveArgs = {
  repoRoot: string;
  os: TargetOs;
  appName: AppName;
  explicitPath?: string;
};

export async function resolveDesktopArtifact({
  repoRoot,
  os,
  appName,
  explicitPath,
}: DesktopResolveArgs) {
  if (explicitPath) {
    const resolved = resolveInputPath(repoRoot, explicitPath);
    if (!(await pathExists(resolved))) {
      throw new Error(`Desktop artifact not found at ${resolved}`);
    }
    return resolved;
  }

  const distDir = path.join(repoRoot, "desktop", appName, "dist");
  if (!(await pathExists(distDir))) {
    throw new Error(
      `Missing ${appName} dist directory at ${distDir}. Pass --${appName}-app to override.`
    );
  }

  const entries = await fs.readdir(distDir);
  const candidates = entries.filter((entry) =>
    isDesktopArtifact(entry, os, appName)
  );

  if (candidates.length === 0) {
    throw new Error(
      `No ${appName} desktop artifact found in ${distDir}. Pass --${appName}-app to override.`
    );
  }

  if (candidates.length > 1) {
    throw new Error(
      `Multiple ${appName} artifacts found in ${distDir}: ${candidates.join(
        ", "
      )}. Pass --${appName}-app to select one.`
    );
  }

  return path.join(distDir, candidates[0]);
}

function isDesktopArtifact(filename: string, os: TargetOs, appName: string) {
  const lower = filename.toLowerCase();
  if (!lower.startsWith(appName)) {
    return false;
  }
  if (os === "linux") {
    return lower.endsWith(".appimage");
  }
  if (lower.endsWith(".zip.blockmap")) {
    return false;
  }
  return (
    lower.endsWith(".zip") || lower.endsWith(".tar.gz") || lower.endsWith(".app")
  );
}

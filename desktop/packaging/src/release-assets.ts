import { logInfo } from "./fs-utils.js";
import type { GithubReleaseAsset } from "./types.js";

export function resolveDaemonAssets(
  assets: GithubReleaseAsset[],
  version: string,
  os: string,
  arch: string
) {
  for (const candidateArch of archAliases(arch)) {
    const daemonPattern = `soma-daemon-${escapeRegex(version)}-${escapeRegex(
      os
    )}-${escapeRegex(candidateArch)}\\.tar\\.gz`;
    const agentPattern = `soma-agentd-${escapeRegex(version)}-${escapeRegex(
      os
    )}-${escapeRegex(candidateArch)}\\.tar\\.gz`;

    const daemonAsset = findAsset(assets, daemonPattern);
    const agentAsset = findAsset(assets, agentPattern);
    if (daemonAsset && agentAsset) {
      return { daemonAsset, agentAsset, resolvedArch: candidateArch };
    }
  }
  throw new Error(
    `daemon/agent assets not found for ${os}-${arch} (aliases tried: ${archAliases(
      arch
    ).join(", ")})`
  );
}

export function resolveDesktopAsset(
  assets: GithubReleaseAsset[],
  appName: string,
  version: string,
  os: string,
  arch: string
) {
  const candidates = ["AppImage", "tar.gz", "app", "zip"];
  for (const ext of candidates) {
    const pattern =
      ext === "app"
        ? `${escapeRegex(appName)}-desktop-${escapeRegex(
            version
          )}-${escapeRegex(os)}-${escapeRegex(arch)}\\.app`
        : `${escapeRegex(appName)}-desktop-${escapeRegex(
            version
          )}-${escapeRegex(os)}-${escapeRegex(arch)}\\.${escapeRegex(ext)}`;
    const asset = findAsset(assets, pattern);
    if (asset) {
      return asset;
    }
  }
  throw new Error(
    `desktop artifact not found for ${appName} (${os}-${arch} ${version})`
  );
}

function findAsset(assets: GithubReleaseAsset[], pattern: string) {
  const anchored = new RegExp(`^(?:${pattern})$`);
  const anchoredMatch = assets.find((asset) => anchored.test(asset.name));
  if (anchoredMatch) {
    return anchoredMatch;
  }
  const fallback = new RegExp(pattern);
  const fallbackMatch = assets.find((asset) => fallback.test(asset.name));
  if (fallbackMatch) {
    logInfo(`Fallback regex match for pattern=${pattern} -> ${fallbackMatch.name}`);
    return fallbackMatch;
  }
  return null;
}

function archAliases(arch: string) {
  if (arch === "arm64") {
    return ["arm64", "aarch64"];
  }
  if (arch === "amd64") {
    return ["amd64", "x86_64"];
  }
  return [arch];
}

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

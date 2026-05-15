import { promises as fs } from "node:fs";
import path from "node:path";
import { assetHeaders, fetchGithubJson, fetchJsonUrl } from "./github-http.js";
import type {
  GithubRelease,
  GithubReleaseAsset,
  ReleaseKind,
  ReleaseManifest,
  ReleaseManifestArtifact,
  ResolvedReleaseSource,
} from "./types.js";

export async function resolveReleaseSource(options: {
  releaseKind: ReleaseKind;
  repo: string;
  versionOverride: string | null;
  manifestLocation: string | null;
  tagPrefix: string;
  repoRoot: string;
  token: string;
}): Promise<ResolvedReleaseSource> {
  if (options.manifestLocation) {
    const manifest = await loadReleaseManifest(
      options.manifestLocation,
      options.repoRoot,
      options.token
    );
    validateReleaseManifest(manifest, options.releaseKind, options.versionOverride);
    return {
      repo: manifest.repo || options.repo,
      tag: manifest.tag,
      version: manifest.version,
      manifest,
      manifestSource: options.manifestLocation,
      assets: manifest.artifacts.map(toGithubReleaseAsset),
    };
  }

  const { tag, version } = options.versionOverride
    ? {
        tag: `${options.tagPrefix}${options.versionOverride}`,
        version: options.versionOverride,
      }
    : await resolveLatestReleaseTag(options.repo, options.tagPrefix, options.token);

  const release = await fetchReleaseByTag(options.repo, tag, options.token);
  const manifestAsset = findReleaseManifestAsset(release.assets, options.releaseKind);
  if (!manifestAsset) {
    return {
      repo: options.repo,
      tag,
      version,
      manifest: null,
      manifestSource: null,
      assets: release.assets,
    };
  }

  const manifest = await loadReleaseManifestFromAsset(manifestAsset.url, options.token);
  validateReleaseManifest(manifest, options.releaseKind, version);
  return {
    repo: manifest.repo || options.repo,
    tag: manifest.tag,
    version: manifest.version,
    manifest,
    manifestSource: `${options.repo}@${manifestAsset.name}`,
    assets: manifest.artifacts.map(toGithubReleaseAsset),
  };
}

export function assetNames(assets: GithubReleaseAsset[]) {
  return assets.map((asset) => asset.name).join(", ");
}

function validateReleaseManifest(
  manifest: ReleaseManifest,
  releaseKind: ReleaseKind,
  versionOverride: string | null
) {
  if (manifest.release_type !== releaseKind) {
    throw new Error(
      `Expected ${releaseKind} release manifest, got ${manifest.release_type}`
    );
  }
  if (versionOverride && manifest.version !== versionOverride) {
    throw new Error(
      `Manifest version mismatch for ${releaseKind}: expected ${versionOverride}, got ${manifest.version}`
    );
  }
  if (!manifest.tag || !manifest.version) {
    throw new Error(`Invalid ${releaseKind} manifest: missing tag or version`);
  }
}

function findReleaseManifestAsset(
  assets: GithubReleaseAsset[],
  releaseKind: ReleaseKind
) {
  return (
    assets.find((asset) => asset.name === `${releaseKind}-release-manifest.json`) ||
    assets.find((asset) => asset.name === "release-manifest.json") ||
    null
  );
}

async function loadReleaseManifest(
  location: string,
  repoRoot: string,
  token: string
): Promise<ReleaseManifest> {
  if (/^https?:\/\//i.test(location)) {
    return fetchJsonUrl<ReleaseManifest>(location, token, false);
  }
  const manifestPath = path.isAbsolute(location)
    ? location
    : path.join(repoRoot, location);
  const text = await fs.readFile(manifestPath, "utf8");
  return JSON.parse(text) as ReleaseManifest;
}

async function loadReleaseManifestFromAsset(url: string, token: string) {
  const response = await fetch(url, {
    headers: assetHeaders(token),
  });
  if (!response.ok) {
    throw new Error(
      `Failed to load release manifest ${url}: ${response.status} ${response.statusText}`
    );
  }
  return (await response.json()) as ReleaseManifest;
}

function toGithubReleaseAsset(asset: ReleaseManifestArtifact): GithubReleaseAsset {
  return {
    name: asset.name,
    url: asset.url,
  };
}

async function resolveLatestReleaseTag(repo: string, prefix: string, token: string) {
  const releases = await fetchGithubJson<GithubRelease[]>(
    `https://api.github.com/repos/${repo}/releases?per_page=100`,
    token
  );
  for (const release of releases) {
    if (release.tag_name?.startsWith(prefix)) {
      const version = release.tag_name.slice(prefix.length);
      return { tag: release.tag_name, version };
    }
  }
  throw new Error(`No GitHub release found with tag prefix ${prefix}`);
}

async function fetchReleaseByTag(repo: string, tag: string, token: string) {
  return fetchGithubJson<GithubRelease>(
    `https://api.github.com/repos/${repo}/releases/tags/${tag}`,
    token
  );
}

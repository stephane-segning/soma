import path from "node:path";
import type { ReleaseManifest, ResolvedReleaseSource } from "./types.js";

export function buildBundleReleaseManifest(options: {
  bundleVersion: string;
  repo: string;
  daemonsSource: ResolvedReleaseSource;
  desktopSource: ResolvedReleaseSource;
  produced: string[];
}): ReleaseManifest {
  const artifactBaseUrl = `https://github.com/${options.repo}/releases/download/bundle-${options.bundleVersion}`;
  return {
    schema_version: "soma.release-manifest.v1",
    release_type: "bundle",
    version: options.bundleVersion,
    tag: `bundle-${options.bundleVersion}`,
    repo: options.repo,
    artifacts: options.produced.map((artifactPath) => ({
      name: path.basename(artifactPath),
      url: `${artifactBaseUrl}/${path.basename(artifactPath)}`,
      kind: path.extname(artifactPath).replace(/^\./, "") || "file",
    })),
    source_releases: [
      {
        release_type: "daemons",
        repo: options.daemonsSource.repo,
        tag: options.daemonsSource.tag,
        version: options.daemonsSource.version,
        manifest: options.daemonsSource.manifestSource,
      },
      {
        release_type: "desktop",
        repo: options.desktopSource.repo,
        tag: options.desktopSource.tag,
        version: options.desktopSource.version,
        manifest: options.desktopSource.manifestSource,
      },
    ],
  };
}

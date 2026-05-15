import fse from "fs-extra";
import { promises as fs } from "node:fs";
import path from "node:path";
import { buildBundleReleaseManifest } from "./bundle-manifest.js";
import type { ResolvedReleaseSource } from "./types.js";

type ReleaseOutputsArgs = {
  platformOut: string;
  staging: string;
  produced: string[];
  pagesUrl: string;
  bundleVersion: string;
  repo: string;
  daemonsSource: ResolvedReleaseSource;
  desktopSource: ResolvedReleaseSource;
};

export async function writeReleaseOutputs(args: ReleaseOutputsArgs) {
  const outputs = {
    bundle_version: args.bundleVersion,
    bundle_repo: args.repo,
    daemons_tag: args.daemonsSource.tag,
    daemons_version: args.daemonsSource.version,
    daemons_repo: args.daemonsSource.repo,
    daemons_manifest: args.daemonsSource.manifestSource,
    desktop_tag: args.desktopSource.tag,
    desktop_version: args.desktopSource.version,
    desktop_repo: args.desktopSource.repo,
    desktop_manifest: args.desktopSource.manifestSource,
    platform_out: args.platformOut,
    staging_dir: args.staging,
    produced: args.produced,
    pages_url: args.pagesUrl,
  };

  const outputsPath = path.join(args.platformOut, "outputs.json");
  await fse.ensureDir(path.dirname(outputsPath));
  await fs.writeFile(outputsPath, JSON.stringify(outputs, null, 2), "utf8");

  const bundleManifestPath = path.join(
    args.platformOut,
    "bundle-release-manifest.json"
  );
  await fs.writeFile(
    bundleManifestPath,
    JSON.stringify(
      buildBundleReleaseManifest({
        bundleVersion: args.bundleVersion,
        repo: args.repo,
        daemonsSource: args.daemonsSource,
        desktopSource: args.desktopSource,
        produced: args.produced,
      }),
      null,
      2
    ),
    "utf8"
  );

  return outputs;
}

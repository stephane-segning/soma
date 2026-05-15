import fse from "fs-extra";
import path from "node:path";
import {
  DEFAULT_SERVICE_LABEL_AGENT,
  DEFAULT_SERVICE_LABEL_DAEMON,
} from "../constants.js";
import { copyToOutput, findRepoRoot, logInfo, stageBinary } from "../fs-utils.js";
import { downloadReleaseAsset } from "../github-download.js";
import { assetNames, resolveReleaseSource } from "../github.js";
import { buildLinuxBundle } from "../platform/linux-bundle.js";
import { buildMacosBundle } from "../platform/macos-bundle.js";
import { resolveDaemonAssets, resolveDesktopAsset } from "../release-assets.js";
import { writeReleaseOutputs } from "../release-outputs.js";
import { currentTimestampLabel, pagesUrlFromRepo } from "../repo-utils.js";
import { buildTemplateContext, renderTemplates } from "../templates.js";
import type { ReleaseBundleArgs } from "../types.js";

export async function runReleaseBundle(args: ReleaseBundleArgs) {
  const repoRoot = args.repoRoot
    ? path.resolve(args.repoRoot)
    : await findRepoRoot(process.cwd());
  const outDir = path.resolve(repoRoot, args.outDir);
  const templateRoot = path.resolve(repoRoot, args.templates);
  const adhocSignMacos = args.adhocSignMacos ?? false;

  const repo = args.repo || process.env.GITHUB_REPOSITORY;
  if (!repo) {
    throw new Error("GITHUB_REPOSITORY or --repo is required");
  }
  const token = args.token || process.env.GITHUB_TOKEN;
  if (!token) {
    throw new Error("GITHUB_TOKEN or --token is required");
  }

  const bundleVersion =
    args.bundleVersion && args.bundleVersion.trim().length > 0
      ? args.bundleVersion.trim()
      : currentTimestampLabel();
  const daemonsRepo = args.daemonsRepo?.trim() || repo;
  const desktopRepo = args.desktopRepo?.trim() || repo;
  const daemonsSource = await resolveReleaseSource({
    releaseKind: "daemons",
    repo: daemonsRepo,
    versionOverride: args.daemonsVersion?.trim() || null,
    manifestLocation: args.daemonsManifest?.trim() || null,
    tagPrefix: "daemons-v",
    repoRoot,
    token,
  });
  const desktopSource = await resolveReleaseSource({
    releaseKind: "desktop",
    repo: desktopRepo,
    versionOverride: args.desktopVersion?.trim() || null,
    manifestLocation: args.desktopManifest?.trim() || null,
    tagPrefix: "desktop-v",
    repoRoot,
    token,
  });

  logInfo(
    `Using daemons=${daemonsSource.tag} desktop=${desktopSource.tag} bundle_version=${bundleVersion}`
  );
  logInfo(
    `Release assets: daemons=${assetNames(
      daemonsSource.assets
    )} desktop=${assetNames(desktopSource.assets)}`
  );

  const { daemonAsset, agentAsset, resolvedArch } = resolveDaemonAssets(
    daemonsSource.assets,
    daemonsSource.version,
    args.os,
    args.arch
  );
  const somaDesktopAsset = resolveDesktopAsset(
    desktopSource.assets,
    "soma",
    desktopSource.version,
    args.os,
    resolvedArch
  );
  const tapiaDesktopAsset = resolveDesktopAsset(
    desktopSource.assets,
    "tapia",
    desktopSource.version,
    args.os,
    resolvedArch
  );

  const platformOut = path.join(outDir, `${args.os}-${resolvedArch}`);
  const staging = path.join(platformOut, "staging");
  await fse.remove(platformOut);
  await fse.ensureDir(staging);

  const daemonArchive = path.join(staging, daemonAsset.name);
  const agentArchive = path.join(staging, agentAsset.name);
  await downloadReleaseAsset(daemonAsset.url, daemonArchive, token);
  await downloadReleaseAsset(agentAsset.url, agentArchive, token);
  await stageBinary("soma-daemon", daemonArchive, staging);
  await stageBinary("soma-agentd", agentArchive, staging);

  const somaDesktopPath = path.join(staging, somaDesktopAsset.name);
  const tapiaDesktopPath = path.join(staging, tapiaDesktopAsset.name);
  await downloadReleaseAsset(somaDesktopAsset.url, somaDesktopPath, token);
  await downloadReleaseAsset(tapiaDesktopAsset.url, tapiaDesktopPath, token);

  const pagesUrl = pagesUrlFromRepo(repo);
  const rendered = await renderTemplates(
    templateRoot,
    staging,
    buildTemplateContext({
      name: "soma-daemon",
      version: daemonsSource.version,
      desktopVersion: desktopSource.version,
      bundleVersion,
      os: args.os,
      arch: resolvedArch,
      installPrefix: args.installPrefix,
      serviceLabelDaemon: DEFAULT_SERVICE_LABEL_DAEMON,
      serviceLabelAgent: DEFAULT_SERVICE_LABEL_AGENT,
      homepage: pagesUrl,
      docsUrl: pagesUrl,
      dockerImages: args.dockerImages,
      repo,
      daemonsRepo: daemonsSource.repo,
      daemonsTag: daemonsSource.tag,
      desktopRepo: desktopSource.repo,
      desktopTag: desktopSource.tag,
      daemonsManifestSource: daemonsSource.manifestSource,
      desktopManifestSource: desktopSource.manifestSource,
    })
  );

  const produced: string[] = [];
  produced.push(await copyToOutput(platformOut, rendered.installScript, "install.sh"));
  produced.push(
    await copyToOutput(platformOut, rendered.uninstallScript, "uninstall.sh")
  );

  if (args.os === "linux") {
    produced.push(
      ...(await buildLinuxBundle({
        platformOut,
        staging,
        systemdDaemon: rendered.systemdDaemon,
        systemdAgent: rendered.systemdAgent,
        somaDesktopPath,
        tapiaDesktopPath,
        bundleVersion,
        arch: resolvedArch,
        docsUrl: pagesUrl,
      }))
    );
  } else {
    produced.push(
      ...(await buildMacosBundle({
        platformOut,
        staging,
        plistDaemon: rendered.plistDaemon,
        plistAgent: rendered.plistAgent,
        somaDesktopPath,
        tapiaDesktopPath,
        bundleVersion,
        arch: resolvedArch,
        docsUrl: pagesUrl,
        adhocSign: adhocSignMacos,
      }))
    );
  }

  const outputs = await writeReleaseOutputs({
    platformOut,
    staging,
    produced,
    pagesUrl,
    bundleVersion,
    repo,
    daemonsSource,
    desktopSource,
  });
  console.log(JSON.stringify(outputs));
}

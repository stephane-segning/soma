import fse from "fs-extra";
import path from "node:path";
import {
  DEFAULT_SERVICE_LABEL_AGENT,
  DEFAULT_SERVICE_LABEL_DAEMON,
} from "../constants.js";
import { resolveDesktopArtifact } from "../desktop-artifacts.js";
import {
  copyToOutput,
  findRepoRoot,
  resolveInputPath,
  stageBinary,
} from "../fs-utils.js";
import { buildMacosBundle } from "../platform/macos-bundle.js";
import { buildLinuxBundle } from "../platform/linux-bundle.js";
import {
  currentTimestampLabel,
  pagesUrlFromRepo,
  readWorkspaceVersion,
  resolveDesktopVersion,
} from "../repo-utils.js";
import { buildTemplateContext, renderTemplates } from "../templates.js";
import type { BundleArgs } from "../types.js";

export async function runBundle(args: BundleArgs) {
  const repoRoot = args.repoRoot
    ? path.resolve(args.repoRoot)
    : await findRepoRoot(process.cwd());
  const outDir = path.resolve(repoRoot, args.outDir);
  const templateRoot = path.resolve(repoRoot, args.templates);
  const adhocSignMacos = args.adhocSignMacos ?? true;

  const bundleVersion =
    args.bundleVersion && args.bundleVersion.trim().length > 0
      ? args.bundleVersion.trim()
      : currentTimestampLabel();
  const daemonsVersion =
    args.daemonsVersion && args.daemonsVersion.trim().length > 0
      ? args.daemonsVersion.trim()
      : await readWorkspaceVersion(path.join(repoRoot, "Cargo.toml"));
  const desktopVersion = await resolveDesktopVersion(
    repoRoot,
    args.desktopVersion?.trim() || null
  );

  const repo = args.repo || process.env.GITHUB_REPOSITORY || "local/soma";
  const homepage = args.homepage || `https://github.com/${repo}`;
  const docsUrl = args.docsUrl || pagesUrlFromRepo(repo);
  const daemonPath = resolveInputPath(
    repoRoot,
    args.daemonPath || "target/release/soma-daemon"
  );
  const agentPath = resolveInputPath(
    repoRoot,
    args.agentPath || "target/release/soma-agentd"
  );

  const somaAppPath = await resolveDesktopArtifact({
    repoRoot,
    os: args.os,
    appName: "soma",
    explicitPath: args.somaApp,
  });
  const tapiaAppPath = await resolveDesktopArtifact({
    repoRoot,
    os: args.os,
    appName: "tapia",
    explicitPath: args.tapiaApp,
  });

  const platformOut = path.join(outDir, `${args.os}-${args.arch}`);
  const staging = path.join(platformOut, "staging");
  await fse.remove(platformOut);
  await fse.ensureDir(staging);

  await stageBinary("soma-daemon", daemonPath, staging);
  await stageBinary("soma-agentd", agentPath, staging);

  const rendered = await renderTemplates(
    templateRoot,
    staging,
    buildTemplateContext({
      name: "soma-daemon",
      version: daemonsVersion,
      desktopVersion,
      bundleVersion,
      os: args.os,
      arch: args.arch,
      installPrefix: args.installPrefix,
      serviceLabelDaemon: DEFAULT_SERVICE_LABEL_DAEMON,
      serviceLabelAgent: DEFAULT_SERVICE_LABEL_AGENT,
      homepage,
      docsUrl,
      dockerImages: args.dockerImages,
      repo,
      daemonsRepo: repo,
      daemonsTag: `local-daemons-${daemonsVersion}`,
      desktopRepo: repo,
      desktopTag: `local-desktop-${desktopVersion}`,
    })
  );

  await copyToOutput(platformOut, rendered.installScript, "install.sh");
  await copyToOutput(platformOut, rendered.uninstallScript, "uninstall.sh");

  if (args.os === "linux") {
    await buildLinuxBundle({
      platformOut,
      staging,
      systemdDaemon: rendered.systemdDaemon,
      systemdAgent: rendered.systemdAgent,
      somaDesktopPath: somaAppPath,
      tapiaDesktopPath: tapiaAppPath,
      bundleVersion,
      arch: args.arch,
      docsUrl,
    });
  } else {
    await buildMacosBundle({
      platformOut,
      staging,
      plistDaemon: rendered.plistDaemon,
      plistAgent: rendered.plistAgent,
      somaDesktopPath: somaAppPath,
      tapiaDesktopPath: tapiaAppPath,
      bundleVersion,
      arch: args.arch,
      docsUrl,
      adhocSign: adhocSignMacos,
    });
  }

  console.log(
    `Bundle ready: ${path.join(platformOut, "install.sh")} (version ${bundleVersion})`
  );
}

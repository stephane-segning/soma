import { execa } from "execa";
import fse from "fs-extra";
import nunjucks from "nunjucks";
import { createWriteStream, promises as fs } from "node:fs";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import yargs from "yargs/yargs";
import { hideBin } from "yargs/helpers";

const DEFAULT_OUT_DIR = "artifacts/bundle-local";
const DEFAULT_INSTALL_PREFIX = "/usr/local";
const DEFAULT_TEMPLATE_ROOT = "desktop/packaging/templates";
const DEFAULT_SERVICE_LABEL_DAEMON = "digital.camer.soma.daemon";
const DEFAULT_SERVICE_LABEL_AGENT = "digital.camer.soma.agentd";

const nunjucksEnv = new nunjucks.Environment(null, {
  autoescape: false,
  throwOnUndefined: true,
});

type BundleArgs = {
  os: "linux" | "macos";
  arch: "amd64" | "arm64";
  outDir: string;
  adhocSignMacos: boolean;
  bundleVersion?: string;
  daemonsVersion?: string;
  desktopVersion?: string;
  repo?: string;
  docsUrl?: string;
  homepage?: string;
  dockerImages?: string;
  installPrefix: string;
  templates: string;
  repoRoot?: string;
  daemonPath?: string;
  agentPath?: string;
  somaApp?: string;
  tapiaApp?: string;
};

type ReleaseBundleArgs = {
  os: "linux" | "macos";
  arch: "amd64" | "arm64";
  outDir: string;
  adhocSignMacos: boolean;
  bundleVersion?: string;
  daemonsVersion?: string;
  desktopVersion?: string;
  repo?: string;
  daemonsRepo?: string;
  desktopRepo?: string;
  daemonsManifest?: string;
  desktopManifest?: string;
  token?: string;
  dockerImages?: string;
  installPrefix: string;
  templates: string;
  repoRoot?: string;
};

type ReleaseKind = "daemons" | "desktop";

type ReleaseManifest = {
  schema_version?: string;
  release_type: ReleaseKind | "bundle";
  version: string;
  tag: string;
  repo?: string;
  artifacts: ReleaseManifestArtifact[];
  source_releases?: Array<{
    release_type: ReleaseKind;
    repo: string;
    tag: string;
    version: string;
    manifest: string | null;
  }>;
};

type ReleaseManifestArtifact = {
  name: string;
  url: string;
  os?: string;
  arch?: string;
  kind?: string;
  app?: string;
  sha256?: string;
};

type ResolvedReleaseSource = {
  repo: string;
  tag: string;
  version: string;
  manifest: ReleaseManifest | null;
  manifestSource: string | null;
  assets: GithubReleaseAsset[];
};

async function main() {
  const argv = hideBin(process.argv);
  if (argv[0] === "--") {
    argv.shift();
  }
  await yargs(argv)
    .scriptName("soma-packaging")
    .command<ReleaseBundleArgs>(
      "release",
      "Build a release Soma + Tapia bundle from GitHub assets",
      (command) =>
        command
          .option("os", {
            choices: ["linux", "macos"] as const,
            demandOption: true,
            describe: "Target OS",
            type: "string",
          })
          .option("arch", {
            choices: ["amd64", "arm64"] as const,
            demandOption: true,
            describe: "Target arch",
            type: "string",
          })
          .option("out-dir", {
            default: "artifacts/bundle",
            describe: "Output directory",
            type: "string",
          })
          .option("adhoc-sign-macos", {
            default: false,
            describe: "Ad-hoc sign macOS app bundles after unpacking",
            type: "boolean",
          })
          .option("bundle-version", {
            describe: "Bundle version label (default: timestamp)",
            type: "string",
          })
          .option("daemons-version", {
            describe: "Daemons release version (default: latest daemons-v*)",
            type: "string",
          })
          .option("desktop-version", {
            describe: "Desktop release version (default: latest desktop-v*)",
            type: "string",
          })
          .option("repo", {
            describe: "Bundle release repo (owner/name); also the default source repo",
            type: "string",
          })
          .option("daemons-repo", {
            describe: "GitHub repo that publishes daemon assets/manifests",
            type: "string",
          })
          .option("desktop-repo", {
            describe: "GitHub repo that publishes desktop assets/manifests",
            type: "string",
          })
          .option("daemons-manifest", {
            describe: "Daemon release manifest path or URL",
            type: "string",
          })
          .option("desktop-manifest", {
            describe: "Desktop release manifest path or URL",
            type: "string",
          })
          .option("token", {
            describe: "GitHub token (defaults to env:GITHUB_TOKEN)",
            type: "string",
          })
          .option("docker-images", {
            describe: "Docker images to embed in README",
            type: "string",
          })
          .option("install-prefix", {
            default: DEFAULT_INSTALL_PREFIX,
            describe: "Install prefix",
            type: "string",
          })
          .option("templates", {
            default: DEFAULT_TEMPLATE_ROOT,
            describe: "Templates root",
            type: "string",
          })
          .option("repo-root", {
            describe: "Repo root (default: auto-detect)",
            type: "string",
          }),
      async (commandArgs) => {
        await runReleaseBundle(commandArgs);
      }
    )
    .command<BundleArgs>(
      "$0",
      "Build a local Soma + Tapia bundle from local build artifacts",
      (command) =>
        command
          .option("os", {
            choices: ["linux", "macos"] as const,
            demandOption: true,
            describe: "Target OS",
            type: "string",
          })
          .option("arch", {
            choices: ["amd64", "arm64"] as const,
            demandOption: true,
            describe: "Target arch",
            type: "string",
          })
          .option("out-dir", {
            default: DEFAULT_OUT_DIR,
            describe: "Output directory",
            type: "string",
          })
          .option("adhoc-sign-macos", {
            default: true,
            describe: "Ad-hoc sign macOS app bundles after unpacking",
            type: "boolean",
          })
          .option("bundle-version", {
            describe: "Bundle version label",
            type: "string",
          })
          .option("daemons-version", {
            describe: "Daemon + agent version (default: workspace version)",
            type: "string",
          })
          .option("desktop-version", {
            describe: "Desktop version (default: soma/tapia package.json)",
            type: "string",
          })
          .option("repo", {
            describe: "GitHub repo (owner/name)",
            type: "string",
          })
          .option("docs-url", {
            describe: "Docs URL override",
            type: "string",
          })
          .option("homepage", {
            describe: "Homepage URL override",
            type: "string",
          })
          .option("docker-images", {
            describe: "Docker images to embed in README",
            type: "string",
          })
          .option("install-prefix", {
            default: DEFAULT_INSTALL_PREFIX,
            describe: "Install prefix",
            type: "string",
          })
          .option("templates", {
            default: DEFAULT_TEMPLATE_ROOT,
            describe: "Templates root",
            type: "string",
          })
          .option("repo-root", {
            describe: "Repo root (default: auto-detect)",
            type: "string",
          })
          .option("daemon-path", {
            describe: "Path to soma-daemon binary or tar.gz",
            type: "string",
          })
          .option("agent-path", {
            describe: "Path to soma-agentd binary or tar.gz",
            type: "string",
          })
          .option("soma-app", {
            describe: "Path to Soma desktop artifact",
            type: "string",
          })
          .option("tapia-app", {
            describe: "Path to Tapia desktop artifact",
            type: "string",
          }),
      async (commandArgs) => {
        await runBundle(commandArgs);
      }
    )
    .strict()
    .help()
    .parseAsync();
}

async function runBundle(args: BundleArgs) {
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

  const templateCtx = buildTemplateContext({
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
  });

  const rendered = await renderTemplates(templateRoot, staging, templateCtx);

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

async function runReleaseBundle(args: ReleaseBundleArgs) {
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

  const daemonsTag = daemonsSource.tag;
  const daemonsVersion = daemonsSource.version;
  const desktopTag = desktopSource.tag;
  const desktopVersion = desktopSource.version;

  logInfo(
    `Using daemons=${daemonsTag} desktop=${desktopTag} bundle_version=${bundleVersion}`
  );
  logInfo(
    `Release assets: daemons=${assetNames(
      daemonsSource.assets
    )} desktop=${assetNames(desktopSource.assets)}`
  );

  const {
    daemonAsset,
    agentAsset,
    resolvedArch,
  } = resolveDaemonAssets(
    daemonsSource.assets,
    daemonsVersion,
    args.os,
    args.arch
  );
  const somaDesktopAsset = resolveDesktopAsset(
    desktopSource.assets,
    "soma",
    desktopVersion,
    args.os,
    resolvedArch
  );
  const tapiaDesktopAsset = resolveDesktopAsset(
    desktopSource.assets,
    "tapia",
    desktopVersion,
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
  const templateCtx = buildTemplateContext({
    name: "soma-daemon",
    version: daemonsVersion,
    desktopVersion,
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
  });

  const rendered = await renderTemplates(templateRoot, staging, templateCtx);

  const produced: string[] = [];
  produced.push(await copyToOutput(platformOut, rendered.installScript, "install.sh"));
  produced.push(
    await copyToOutput(platformOut, rendered.uninstallScript, "uninstall.sh")
  );

  if (args.os === "linux") {
    const linuxArtifacts = await buildLinuxBundle({
      platformOut,
      staging,
      systemdDaemon: rendered.systemdDaemon,
      systemdAgent: rendered.systemdAgent,
      somaDesktopPath,
      tapiaDesktopPath,
      bundleVersion,
      arch: resolvedArch,
      docsUrl: pagesUrl,
    });
    produced.push(...linuxArtifacts);
  } else {
    const macArtifacts = await buildMacosBundle({
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
    });
    produced.push(...macArtifacts);
  }

  const outputs = {
    bundle_version: bundleVersion,
    bundle_repo: repo,
    daemons_tag: daemonsTag,
    daemons_version: daemonsVersion,
    daemons_repo: daemonsSource.repo,
    daemons_manifest: daemonsSource.manifestSource,
    desktop_tag: desktopTag,
    desktop_version: desktopVersion,
    desktop_repo: desktopSource.repo,
    desktop_manifest: desktopSource.manifestSource,
    platform_out: platformOut,
    staging_dir: staging,
    produced,
    pages_url: pagesUrl,
  };

  const outputsPath = path.join(platformOut, "outputs.json");
  await fse.ensureDir(path.dirname(outputsPath));
  await fs.writeFile(outputsPath, JSON.stringify(outputs, null, 2), "utf8");
  const bundleManifestPath = path.join(platformOut, "bundle-release-manifest.json");
  await fs.writeFile(
    bundleManifestPath,
    JSON.stringify(
      buildBundleReleaseManifest({
        bundleVersion,
        repo,
        daemonsSource,
        desktopSource,
        produced,
      }),
      null,
      2
    ),
    "utf8"
  );
  console.log(JSON.stringify(outputs));
}

async function findRepoRoot(startDir: string) {
  let current = path.resolve(startDir);
  while (true) {
    const pnpmWorkspace = path.join(current, "pnpm-workspace.yaml");
    const packagingPackage = path.join(current, "desktop", "packaging", "package.json");
    if ((await pathExists(pnpmWorkspace)) || (await pathExists(packagingPackage))) {
      return current;
    }
    const parent = path.dirname(current);
    if (parent === current) {
      return startDir;
    }
    current = parent;
  }
}

async function pathExists(target: string) {
  try {
    await fs.access(target);
    return true;
  } catch {
    return false;
  }
}

function resolveInputPath(repoRoot: string, inputPath: string) {
  return path.isAbsolute(inputPath) ? inputPath : path.join(repoRoot, inputPath);
}

async function readWorkspaceVersion(cargoPath: string) {
  const text = await fs.readFile(cargoPath, "utf8");
  const workspaceIndex = text.indexOf("[workspace.package]");
  if (workspaceIndex === -1) {
    throw new Error(`workspace.package not found in ${cargoPath}`);
  }
  const slice = text.slice(workspaceIndex);
  const match = slice.match(/version\s*=\s*"([^"]+)"/);
  if (!match) {
    throw new Error(`workspace.package version not found in ${cargoPath}`);
  }
  return match[1];
}

async function resolveDesktopVersion(repoRoot: string, override: string | null) {
  if (override) {
    return override;
  }
  const somaVersion = await readPackageVersion(
    path.join(repoRoot, "desktop", "soma", "package.json")
  );
  const tapiaVersion = await readPackageVersion(
    path.join(repoRoot, "desktop", "tapia", "package.json")
  );
  if (somaVersion !== tapiaVersion) {
    throw new Error(
      `Desktop versions differ (soma=${somaVersion}, tapia=${tapiaVersion}). Pass --desktop-version to override.`
    );
  }
  return somaVersion;
}

async function readPackageVersion(packagePath: string) {
  const text = await fs.readFile(packagePath, "utf8");
  const data = JSON.parse(text) as { version?: string };
  if (!data.version) {
    throw new Error(`version missing in ${packagePath}`);
  }
  return data.version;
}

function pagesUrlFromRepo(repo: string) {
  const [owner, name] = repo.split("/");
  if (!owner || !name) {
    return "https://github.com";
  }
  return `https://${owner}.github.io/${name}/`;
}

function currentTimestampLabel() {
  const now = new Date();
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${now.getUTCFullYear()}${pad(now.getUTCMonth() + 1)}${pad(
    now.getUTCDate()
  )}-${pad(now.getUTCHours())}${pad(now.getUTCMinutes())}${pad(
    now.getUTCSeconds()
  )}`;
}

function buildTemplateContext(options: {
  name: string;
  version: string;
  desktopVersion: string;
  bundleVersion: string;
  os: string;
  arch: string;
  installPrefix: string;
  serviceLabelDaemon: string;
  serviceLabelAgent: string;
  homepage: string;
  docsUrl: string;
  dockerImages?: string;
  repo: string;
  daemonsRepo?: string;
  daemonsTag?: string;
  desktopRepo?: string;
  desktopTag?: string;
  daemonsManifestSource?: string | null;
  desktopManifestSource?: string | null;
}) {
  return {
    name: options.name,
    version: options.version,
    desktop_version: options.desktopVersion,
    bundle_version: options.bundleVersion,
    os: options.os,
    arch: options.arch,
    install_prefix: options.installPrefix,
    service_label_daemon: options.serviceLabelDaemon,
    service_label_agent: options.serviceLabelAgent,
    homepage: options.homepage,
    docs_url: options.docsUrl,
    docker_images: options.dockerImages && options.dockerImages.trim().length > 0
      ? options.dockerImages
      : "None specified.",
    repo: options.repo,
    daemons_repo: options.daemonsRepo || options.repo,
    daemons_tag: options.daemonsTag || `daemons-v${options.version}`,
    desktop_repo: options.desktopRepo || options.repo,
    desktop_tag: options.desktopTag || `desktop-v${options.desktopVersion}`,
    daemons_manifest_source: options.daemonsManifestSource || "not used",
    desktop_manifest_source: options.desktopManifestSource || "not used",
  };
}

async function renderTemplates(
  templateRoot: string,
  staging: string,
  ctx: Record<string, string>
) {
  const readmePath = path.join(staging, "README.md");
  await renderTemplate(
    path.join(templateRoot, "readme", "README.md.j2"),
    readmePath,
    ctx
  );

  const installPath = path.join(staging, "install.sh");
  await renderTemplate(
    path.join(templateRoot, "install", "install.sh.j2"),
    installPath,
    ctx
  );
  await makeExecutable(installPath);

  const uninstallPath = path.join(staging, "uninstall.sh");
  await renderTemplate(
    path.join(templateRoot, "install", "uninstall.sh.j2"),
    uninstallPath,
    ctx
  );
  await makeExecutable(uninstallPath);

  const systemdDaemon = path.join(staging, "soma-daemon.service");
  await renderTemplate(
    path.join(templateRoot, "systemd", "soma-daemon.service.j2"),
    systemdDaemon,
    ctx
  );
  const systemdAgent = path.join(staging, "soma-agentd.service");
  await renderTemplate(
    path.join(templateRoot, "systemd", "soma-agentd.service.j2"),
    systemdAgent,
    ctx
  );

  const plistDaemon = path.join(staging, "soma-daemon.plist");
  await renderTemplate(
    path.join(templateRoot, "launchd", "digital.camer.soma.daemon.plist.j2"),
    plistDaemon,
    ctx
  );
  const plistAgent = path.join(staging, "soma-agentd.plist");
  await renderTemplate(
    path.join(templateRoot, "launchd", "digital.camer.soma.agentd.plist.j2"),
    plistAgent,
    ctx
  );

  return {
    readme: readmePath,
    installScript: installPath,
    uninstallScript: uninstallPath,
    systemdDaemon,
    systemdAgent,
    plistDaemon,
    plistAgent,
  };
}

async function renderTemplate(
  templatePath: string,
  dest: string,
  ctx: Record<string, string>
) {
  const text = await fs.readFile(templatePath, "utf8");
  const rendered = nunjucksEnv.renderString(text, ctx);
  await fse.ensureDir(path.dirname(dest));
  await fs.writeFile(dest, rendered, "utf8");
}

async function makeExecutable(filePath: string) {
  if (process.platform === "win32") {
    return;
  }
  await fs.chmod(filePath, 0o755);
}

async function stageBinary(name: string, sourcePath: string, staging: string) {
  if (!(await pathExists(sourcePath))) {
    throw new Error(`Missing ${name} at ${sourcePath}`);
  }
  const stagedPath = path.join(staging, name);
  if (sourcePath.endsWith(".tar.gz") || sourcePath.endsWith(".tgz")) {
    await execa("tar", ["-xzf", sourcePath, "-C", staging], {
      stdio: "inherit",
    });
    if (!(await pathExists(stagedPath))) {
      throw new Error(`Expected ${name} in archive ${sourcePath}`);
    }
  } else {
    await fse.copy(sourcePath, stagedPath);
  }
  await makeExecutable(stagedPath);
}

async function copyToOutput(outputDir: string, source: string, name: string) {
  const target = path.join(outputDir, name);
  await fse.ensureDir(outputDir);
  await fse.copy(source, target);
  return target;
}

type GithubRelease = {
  tag_name?: string;
  assets: GithubReleaseAsset[];
};

type GithubReleaseAsset = {
  name: string;
  url: string;
};

async function resolveReleaseSource(options: {
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
    headers: {
      Accept: "application/octet-stream",
      Authorization: `Bearer ${token}`,
      "User-Agent": "soma-packaging",
    },
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

async function resolveLatestReleaseTag(
  repo: string,
  prefix: string,
  token: string
) {
  const releases = await githubGetJson<GithubRelease[]>(
    `https://api.github.com/repos/${repo}/releases?per_page=100`,
    token
  );
  for (const release of releases) {
    if (release.tag_name && release.tag_name.startsWith(prefix)) {
      const version = release.tag_name.slice(prefix.length);
      return { tag: release.tag_name, version };
    }
  }
  throw new Error(`No GitHub release found with tag prefix ${prefix}`);
}

async function fetchReleaseByTag(repo: string, tag: string, token: string) {
  return githubGetJson<GithubRelease>(
    `https://api.github.com/repos/${repo}/releases/tags/${tag}`,
    token
  );
}

async function githubGetJson<T>(url: string, token: string): Promise<T> {
  return fetchJsonUrl<T>(url, token, true);
}

async function fetchJsonUrl<T>(
  url: string,
  token: string,
  forceGithubAuth: boolean
): Promise<T> {
  const target = new URL(url);
  const headers: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "User-Agent": "soma-packaging",
  };
  if (forceGithubAuth || target.hostname === "api.github.com") {
    headers.Authorization = `Bearer ${token}`;
  }
  const response = await fetch(url, {
    headers,
  });
  if (!response.ok) {
    throw new Error(`Request failed for ${url}: ${response.status} ${response.statusText}`);
  }
  return (await response.json()) as T;
}

async function downloadReleaseAsset(
  url: string,
  dest: string,
  token: string
) {
  await fse.ensureDir(path.dirname(dest));
  if (await pathExists(dest)) {
    await fs.unlink(dest);
  }
  logInfo(`Downloading ${url} -> ${dest}`);
  const response = await fetch(url, {
    headers: {
      Accept: "application/octet-stream",
      Authorization: `Bearer ${token}`,
      "User-Agent": "soma-packaging",
    },
  });
  if (!response.ok) {
    throw new Error(
      `Failed to download asset ${url}: ${response.status} ${response.statusText}`
    );
  }
  if (!response.body) {
    throw new Error(`Missing response body for asset ${url}`);
  }
  await pipeline(
    Readable.fromWeb(response.body as unknown as any),
    createWriteStream(dest)
  );
}

function resolveDaemonAssets(
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

function resolveDesktopAsset(
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

function assetNames(assets: GithubReleaseAsset[]) {
  return assets.map((asset) => asset.name).join(", ");
}

type DesktopResolveArgs = {
  repoRoot: string;
  os: "linux" | "macos";
  appName: "soma" | "tapia";
  explicitPath?: string;
};

async function resolveDesktopArtifact({
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

function isDesktopArtifact(
  filename: string,
  os: "linux" | "macos",
  appName: string
) {
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

function buildBundleReleaseManifest(options: {
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

type LinuxBundleArgs = {
  platformOut: string;
  staging: string;
  systemdDaemon: string;
  systemdAgent: string;
  somaDesktopPath: string;
  tapiaDesktopPath: string;
  bundleVersion: string;
  arch: string;
  docsUrl: string;
};

async function buildLinuxBundle(args: LinuxBundleArgs): Promise<string[]> {
  const pkgroot = path.join(args.platformOut, "pkgroot");
  await fse.remove(pkgroot);

  await fse.ensureDir(path.join(pkgroot, "usr/local/bin"));
  await fse.ensureDir(path.join(pkgroot, "usr/local/share/soma"));
  await fse.ensureDir(path.join(pkgroot, "usr/lib/systemd/user"));

  await fse.copy(
    path.join(args.staging, "soma-daemon"),
    path.join(pkgroot, "usr/local/bin/soma-daemon")
  );
  await fse.copy(
    path.join(args.staging, "soma-agentd"),
    path.join(pkgroot, "usr/local/bin/soma-agentd")
  );
  await fse.copy(
    path.join(args.staging, "README.md"),
    path.join(pkgroot, "usr/local/share/soma/README.md")
  );
  await fse.copy(
    args.systemdDaemon,
    path.join(pkgroot, "usr/lib/systemd/user/soma-daemon.service")
  );
  await fse.copy(
    args.systemdAgent,
    path.join(pkgroot, "usr/lib/systemd/user/soma-agentd.service")
  );

  await stageLinuxAppImage(pkgroot, "soma", args.somaDesktopPath);
  await stageLinuxAppImage(pkgroot, "tapia", args.tapiaDesktopPath);

  const rpmArch = args.arch === "amd64" ? "x86_64" : "aarch64";
  const debOut = path.join(
    args.platformOut,
    `soma-bundle-${args.bundleVersion}-linux-${args.arch}.deb`
  );
  const rpmOut = path.join(
    args.platformOut,
    `soma-bundle-${args.bundleVersion}-linux-${args.arch}.rpm`
  );

  await runCommand("fpm", [
    "-s",
    "dir",
    "-t",
    "deb",
    "-n",
    "soma-bundle",
    "-v",
    args.bundleVersion,
    "-a",
    args.arch,
    "--description",
    "Soma bundle (daemon + agentd + desktop apps)",
    "--url",
    args.docsUrl,
    "--prefix",
    "/",
    "-C",
    pkgroot,
    "-p",
    debOut,
    ".",
  ]);

  await runCommand("fpm", [
    "-s",
    "dir",
    "-t",
    "rpm",
    "-n",
    "soma-bundle",
    "-v",
    args.bundleVersion,
    "-a",
    rpmArch,
    "--description",
    "Soma bundle (daemon + agentd + desktop apps)",
    "--url",
    args.docsUrl,
    "--prefix",
    "/",
    "-C",
    pkgroot,
    "-p",
    rpmOut,
    ".",
  ]);

  return [debOut, rpmOut];
}

async function stageLinuxAppImage(
  pkgroot: string,
  appName: string,
  artifactPath: string
) {
  const lower = path.basename(artifactPath).toLowerCase();
  if (!lower.endsWith(".appimage")) {
    throw new Error(
      `Expected ${appName} AppImage, got ${path.basename(artifactPath)}`
    );
  }

  const appImageTarget = path.join(
    pkgroot,
    "usr/local/bin",
    `${appName}.AppImage`
  );
  await fse.copy(artifactPath, appImageTarget);

  const symlinkTarget = path.join(pkgroot, "usr/local/bin", appName);
  await fse.remove(symlinkTarget);
  await createSymlink(`${appName}.AppImage`, symlinkTarget);
}

type MacBundleArgs = {
  platformOut: string;
  staging: string;
  plistDaemon: string;
  plistAgent: string;
  somaDesktopPath: string;
  tapiaDesktopPath: string;
  bundleVersion: string;
  arch: string;
  docsUrl: string;
  adhocSign: boolean;
};

async function buildMacosBundle(args: MacBundleArgs): Promise<string[]> {
  const pkgroot = path.join(args.platformOut, "pkgroot");
  await fse.remove(pkgroot);

  await fse.ensureDir(path.join(pkgroot, "usr/local/bin"));
  await fse.ensureDir(path.join(pkgroot, "usr/local/share/soma"));
  await fse.ensureDir(path.join(pkgroot, "Library/LaunchAgents"));
  await fse.ensureDir(path.join(pkgroot, "Applications", "Soma"));

  await fse.copy(
    path.join(args.staging, "soma-daemon"),
    path.join(pkgroot, "usr/local/bin/soma-daemon")
  );
  await fse.copy(
    path.join(args.staging, "soma-agentd"),
    path.join(pkgroot, "usr/local/bin/soma-agentd")
  );
  await fse.copy(
    path.join(args.staging, "README.md"),
    path.join(pkgroot, "usr/local/share/soma/README.md")
  );
  await fse.copy(
    args.plistDaemon,
    path.join(pkgroot, "Library/LaunchAgents/digital.camer.soma.daemon.plist")
  );
  await fse.copy(
    args.plistAgent,
    path.join(pkgroot, "Library/LaunchAgents/digital.camer.soma.agentd.plist")
  );

  const somaApp = await stageMacosApp(
    args.staging,
    "soma",
    args.somaDesktopPath,
    args.adhocSign
  );
  const tapiaApp = await stageMacosApp(
    args.staging,
    "tapia",
    args.tapiaDesktopPath,
    args.adhocSign
  );

  await fse.copy(somaApp, path.join(pkgroot, "Applications", "Soma", "soma.app"));
  await fse.copy(tapiaApp, path.join(pkgroot, "Applications", "Soma", "tapia.app"));

  const pkgOut = path.join(
    args.platformOut,
    `soma-bundle-${args.bundleVersion}-macos-${args.arch}.pkg`
  );
  await runCommand("pkgbuild", [
    "--identifier",
    "digital.camer.soma.bundle",
    "--version",
    args.bundleVersion,
    "--root",
    pkgroot,
    "--install-location",
    "/",
    pkgOut,
  ]);

  console.log(`Package built: ${pkgOut} (docs at ${args.docsUrl})`);
  return [pkgOut];
}

async function stageMacosApp(
  staging: string,
  appName: string,
  artifactPath: string,
  adhocSign: boolean
) {
  const lower = path.basename(artifactPath).toLowerCase();
  if (lower.endsWith(".app")) {
    if (adhocSign) {
      await adhocSignApp(artifactPath);
    }
    return artifactPath;
  }

  if (lower.endsWith(".tar.gz")) {
    await runCommand("tar", ["-xzf", artifactPath, "-C", staging]);
  } else if (lower.endsWith(".zip")) {
    await runCommand("unzip", ["-q", artifactPath, "-d", staging]);
  } else {
    throw new Error(
      `Unexpected macOS artifact for ${appName}: ${path.basename(artifactPath)}`
    );
  }

  const appBundle = await findStagedAppBundle(staging, appName);
  if (adhocSign) {
    await adhocSignApp(appBundle);
  }
  return appBundle;
}

async function findStagedAppBundle(staging: string, appName: string) {
  const matches: string[] = [];
  const targetPrefix = appName.toLowerCase();

  const walk = async (dir: string, depth: number) => {
    if (depth > 3) {
      return;
    }
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) {
        continue;
      }
      const lowerName = entry.name.toLowerCase();
      const entryPath = path.join(dir, entry.name);
      if (lowerName.endsWith(".app")) {
        if (lowerName.startsWith(targetPrefix)) {
          matches.push(entryPath);
        }
        continue;
      }
      await walk(entryPath, depth + 1);
    }
  };

  await walk(staging, 0);

  if (matches.length === 1) {
    return matches[0];
  }

  if (matches.length === 0) {
    throw new Error(
      `No ${appName} app bundle found in ${staging}. Pass --${appName}-app to override.`
    );
  }

  const names = matches.map((match) => path.basename(match)).join(", ");
  throw new Error(
    `Multiple ${appName} app bundles found in ${staging}: ${names}. Pass --${appName}-app to select one.`
  );
}

async function adhocSignApp(appPath: string) {
  if (process.platform !== "darwin") {
    throw new Error("Ad-hoc signing requires macOS (codesign)");
  }
  await runCommand("codesign", ["--force", "--deep", "--sign", "-", appPath]);
}

async function createSymlink(source: string, target: string) {
  if (process.platform === "win32") {
    await fse.copy(source, target);
    return;
  }
  await fs.symlink(source, target);
}

async function runCommand(command: string, args: string[]) {
  await execa(command, args, { stdio: "inherit" });
}

function logInfo(message: string) {
  console.error(message);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});

import { execa } from "execa";
import fse from "fs-extra";
import nunjucks from "nunjucks";
import { promises as fs } from "node:fs";
import path from "node:path";
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

async function main() {
  const argv = hideBin(process.argv);
  if (argv[0] === "--") {
    argv.shift();
  }
  await yargs(argv)
    .scriptName("soma-packaging")
    .command<BundleArgs>(
      "$0",
      "Build a local Soma + Tapia bundle",
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
    });
  }

  console.log(
    `Bundle ready: ${path.join(platformOut, "install.sh")} (version ${bundleVersion})`
  );
}

async function findRepoRoot(startDir: string) {
  let current = path.resolve(startDir);
  while (true) {
    const cargo = path.join(current, "Cargo.toml");
    const workspace = path.join(current, "pnpm-workspace.yaml");
    if ((await pathExists(cargo)) && (await pathExists(workspace))) {
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

type LinuxBundleArgs = {
  platformOut: string;
  staging: string;
  systemdDaemon: string;
  systemdAgent: string;
  somaDesktopPath: string;
  tapiaDesktopPath: string;
  bundleVersion: string;
  arch: "amd64" | "arm64";
  docsUrl: string;
};

async function buildLinuxBundle(args: LinuxBundleArgs) {
  const pkgroot = path.join(args.platformOut, "pkgroot");
  await fse.remove(pkgroot);

  await fse.ensureDir(path.join(pkgroot, "usr/local/bin"));
  await fse.ensureDir(path.join(pkgroot, "usr/local/share/soma"));
  await fse.ensureDir(path.join(pkgroot, "usr/lib/systemd/system"));

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
    path.join(pkgroot, "usr/lib/systemd/system/soma-daemon.service")
  );
  await fse.copy(
    args.systemdAgent,
    path.join(pkgroot, "usr/lib/systemd/system/soma-agentd.service")
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
  arch: "amd64" | "arm64";
  docsUrl: string;
};

async function buildMacosBundle(args: MacBundleArgs) {
  const pkgroot = path.join(args.platformOut, "pkgroot");
  await fse.remove(pkgroot);

  await fse.ensureDir(path.join(pkgroot, "usr/local/bin"));
  await fse.ensureDir(path.join(pkgroot, "usr/local/share/soma"));
  await fse.ensureDir(path.join(pkgroot, "Library/LaunchDaemons"));
  await fse.ensureDir(path.join(pkgroot, "Applications"));

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
    path.join(pkgroot, "Library/LaunchDaemons/digital.camer.soma.daemon.plist")
  );
  await fse.copy(
    args.plistAgent,
    path.join(pkgroot, "Library/LaunchDaemons/digital.camer.soma.agentd.plist")
  );

  const somaApp = await stageMacosApp(args.staging, "soma", args.somaDesktopPath);
  const tapiaApp = await stageMacosApp(args.staging, "tapia", args.tapiaDesktopPath);

  await fse.copy(somaApp, path.join(pkgroot, "Applications", "soma.app"));
  await fse.copy(tapiaApp, path.join(pkgroot, "Applications", "tapia.app"));

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
}

async function stageMacosApp(
  staging: string,
  appName: string,
  artifactPath: string
) {
  const lower = path.basename(artifactPath).toLowerCase();
  if (lower.endsWith(".app")) {
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

  const appBundle = path.join(staging, `${appName}.app`);
  if (!(await pathExists(appBundle))) {
    throw new Error(`Expected ${appName}.app in ${staging}`);
  }
  return appBundle;
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

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});

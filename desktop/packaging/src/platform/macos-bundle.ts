import fse from "fs-extra";
import { promises as fs } from "node:fs";
import path from "node:path";
import { createSymlink, makeExecutable, runCommand } from "../fs-utils.js";

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

export async function buildMacosBundle(args: MacBundleArgs): Promise<string[]> {
  const pkgroot = path.join(args.platformOut, "pkgroot");
  await fse.remove(pkgroot);

  await fse.ensureDir(path.join(pkgroot, "usr/local/bin"));
  await fse.ensureDir(path.join(pkgroot, "usr/local/share/soma"));
  await fse.ensureDir(path.join(pkgroot, "Library/LaunchAgents"));
  await fse.ensureDir(path.join(pkgroot, "Applications", "Soma"));

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
  const daemonAppPath = path.join(
    pkgroot,
    "Applications",
    "Soma",
    "soma-daemon.app"
  );

  await fse.copy(somaApp, path.join(pkgroot, "Applications", "Soma", "soma.app"));
  await fse.copy(tapiaApp, path.join(pkgroot, "Applications", "Soma", "tapia.app"));
  await stageDaemonApp({
    appPath: daemonAppPath,
    daemonBinaryPath: path.join(args.staging, "soma-daemon"),
    iconPath: await findAppIcon(somaApp),
    bundleVersion: args.bundleVersion,
    adhocSign: args.adhocSign,
  });
  await createSymlink(
    "/Applications/Soma/soma-daemon.app/Contents/MacOS/soma-daemon",
    path.join(pkgroot, "usr/local/bin/soma-daemon")
  );

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

type DaemonAppArgs = {
  appPath: string;
  daemonBinaryPath: string;
  iconPath: string;
  bundleVersion: string;
  adhocSign: boolean;
};

async function stageDaemonApp(args: DaemonAppArgs) {
  const contentsPath = path.join(args.appPath, "Contents");
  const macosPath = path.join(contentsPath, "MacOS");
  const resourcesPath = path.join(contentsPath, "Resources");
  await fse.ensureDir(macosPath);
  await fse.ensureDir(resourcesPath);

  const executablePath = path.join(macosPath, "soma-daemon");
  await fse.copy(args.daemonBinaryPath, executablePath);
  await makeExecutable(executablePath);
  await fse.copy(args.iconPath, path.join(resourcesPath, "icon.icns"));
  await fs.writeFile(
    path.join(contentsPath, "Info.plist"),
    daemonInfoPlist(args.bundleVersion),
    "utf8"
  );

  if (args.adhocSign) {
    await adhocSignApp(args.appPath);
  }
}

async function findAppIcon(appPath: string) {
  const resourcesPath = path.join(appPath, "Contents", "Resources");
  const entries = await fs.readdir(resourcesPath, { withFileTypes: true });
  const icon = entries.find(
    (entry) => entry.isFile() && entry.name.toLowerCase().endsWith(".icns")
  );
  if (!icon) {
    throw new Error(`No .icns icon found in ${resourcesPath}`);
  }
  return path.join(resourcesPath, icon.name);
}

function daemonInfoPlist(bundleVersion: string) {
  const plistVersion = escapePlistValue(normalizePlistVersion(bundleVersion));
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleDevelopmentRegion</key>
  <string>en</string>
  <key>CFBundleExecutable</key>
  <string>soma-daemon</string>
  <key>CFBundleIconFile</key>
  <string>icon.icns</string>
  <key>CFBundleIdentifier</key>
  <string>digital.camer.soma.daemon</string>
  <key>CFBundleInfoDictionaryVersion</key>
  <string>6.0</string>
  <key>CFBundleName</key>
  <string>Soma Daemon</string>
  <key>CFBundlePackageType</key>
  <string>APPL</string>
  <key>CFBundleShortVersionString</key>
  <string>${plistVersion}</string>
  <key>CFBundleVersion</key>
  <string>${plistVersion}</string>
  <key>LSBackgroundOnly</key>
  <true/>
  <key>LSUIElement</key>
  <true/>
</dict>
</plist>
`;
}

function normalizePlistVersion(value: string) {
  const normalized = value
    .trim()
    .replaceAll(/[^0-9.]+/g, ".")
    .replaceAll(/\.{2,}/g, ".")
    .replaceAll(/^\.|\.$/g, "");
  return normalized.length > 0 ? normalized : "1";
}

function escapePlistValue(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
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
      if (entry.name === "__MACOSX") {
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

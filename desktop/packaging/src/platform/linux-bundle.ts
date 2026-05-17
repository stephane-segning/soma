import fse from "fs-extra";
import path from "node:path";
import { createSymlink, runCommand } from "../fs-utils.js";

type LinuxBundleArgs = {
  platformOut: string;
  staging: string;
  systemdDaemon: string;
  systemdAgent: string;
  somaDesktopPath: string;
  bundleVersion: string;
  arch: string;
  docsUrl: string;
};

export async function buildLinuxBundle(args: LinuxBundleArgs): Promise<string[]> {
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

  const rpmArch = args.arch === "amd64" ? "x86_64" : "aarch64";
  const debOut = path.join(
    args.platformOut,
    `soma-bundle-${args.bundleVersion}-linux-${args.arch}.deb`
  );
  const rpmOut = path.join(
    args.platformOut,
    `soma-bundle-${args.bundleVersion}-linux-${args.arch}.rpm`
  );

  await runFpm(args, pkgroot, debOut, "deb", args.arch);
  await runFpm(args, pkgroot, rpmOut, "rpm", rpmArch);

  return [debOut, rpmOut];
}

async function runFpm(
  args: LinuxBundleArgs,
  pkgroot: string,
  output: string,
  packageType: "deb" | "rpm",
  packageArch: string
) {
  await runCommand("fpm", [
    "-s",
    "dir",
    "-t",
    packageType,
    "-n",
    "soma-bundle",
    "-v",
    args.bundleVersion,
    "-a",
    packageArch,
    "--description",
    "Soma bundle (daemon + agentd + desktop apps)",
    "--url",
    args.docsUrl,
    "--prefix",
    "/",
    "-C",
    pkgroot,
    "-p",
    output,
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

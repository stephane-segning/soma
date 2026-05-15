import { execa } from "execa";
import fse from "fs-extra";
import { promises as fs } from "node:fs";
import path from "node:path";

export async function findRepoRoot(startDir: string) {
  let current = path.resolve(startDir);
  while (true) {
    const pnpmWorkspace = path.join(current, "pnpm-workspace.yaml");
    const packagingPackage = path.join(
      current,
      "desktop",
      "packaging",
      "package.json"
    );
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

export async function pathExists(target: string) {
  try {
    await fs.access(target);
    return true;
  } catch {
    return false;
  }
}

export function resolveInputPath(repoRoot: string, inputPath: string) {
  return path.isAbsolute(inputPath) ? inputPath : path.join(repoRoot, inputPath);
}

export async function makeExecutable(filePath: string) {
  if (process.platform === "win32") {
    return;
  }
  await fs.chmod(filePath, 0o755);
}

export async function stageBinary(name: string, sourcePath: string, staging: string) {
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

export async function copyToOutput(outputDir: string, source: string, name: string) {
  const target = path.join(outputDir, name);
  await fse.ensureDir(outputDir);
  await fse.copy(source, target);
  return target;
}

export async function createSymlink(source: string, target: string) {
  if (process.platform === "win32") {
    await fse.copy(source, target);
    return;
  }
  await fs.symlink(source, target);
}

export async function runCommand(command: string, args: string[]) {
  await execa(command, args, { stdio: "inherit" });
}

export function logInfo(message: string) {
  console.error(message);
}

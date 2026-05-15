import { promises as fs } from "node:fs";
import path from "node:path";

export async function readWorkspaceVersion(cargoPath: string) {
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

export async function resolveDesktopVersion(
  repoRoot: string,
  override: string | null
) {
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

export async function readPackageVersion(packagePath: string) {
  const text = await fs.readFile(packagePath, "utf8");
  const data = JSON.parse(text) as { version?: string };
  if (!data.version) {
    throw new Error(`version missing in ${packagePath}`);
  }
  return data.version;
}

export function pagesUrlFromRepo(repo: string) {
  const [owner, name] = repo.split("/");
  if (!owner || !name) {
    return "https://github.com";
  }
  return `https://${owner}.github.io/${name}/`;
}

export function currentTimestampLabel() {
  const now = new Date();
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${now.getUTCFullYear()}${pad(now.getUTCMonth() + 1)}${pad(
    now.getUTCDate()
  )}-${pad(now.getUTCHours())}${pad(now.getUTCMinutes())}${pad(
    now.getUTCSeconds()
  )}`;
}

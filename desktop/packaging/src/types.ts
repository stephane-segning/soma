export type TargetOs = "linux" | "macos";
export type TargetArch = "amd64" | "arm64";
export type AppName = "soma";

export type BundleArgs = {
  os: TargetOs;
  arch: TargetArch;
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
};

export type ReleaseBundleArgs = {
  os: TargetOs;
  arch: TargetArch;
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

export type ReleaseKind = "daemons" | "desktop";

export type ReleaseManifest = {
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

export type ReleaseManifestArtifact = {
  name: string;
  url: string;
  os?: string;
  arch?: string;
  kind?: string;
  app?: string;
  sha256?: string;
};

export type GithubRelease = {
  tag_name?: string;
  assets: GithubReleaseAsset[];
};

export type GithubReleaseAsset = {
  name: string;
  url: string;
};

export type ResolvedReleaseSource = {
  repo: string;
  tag: string;
  version: string;
  manifest: ReleaseManifest | null;
  manifestSource: string | null;
  assets: GithubReleaseAsset[];
};

export type TemplateContextOptions = {
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
};

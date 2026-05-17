import type { Argv } from "yargs";
import {
  DEFAULT_INSTALL_PREFIX,
  DEFAULT_TEMPLATE_ROOT,
} from "./constants.js";
import type { ReleaseBundleArgs } from "./types.js";

export function configureReleaseCommand(command: Argv): Argv<ReleaseBundleArgs> {
  return command
    .option("os", {
      choices: ["linux", "macos"] as const,
      demandOption: true,
      describe: "Target OS",
      type: "string",
    })
    .option("arch", {
      choices: ["amd64", "arm64"] as const,
      demandOption: true,
      describe: "Target arch (macOS supports arm64 only)",
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
    }) as unknown as Argv<ReleaseBundleArgs>;
}

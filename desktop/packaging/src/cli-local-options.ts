import type { Argv } from "yargs";
import {
  DEFAULT_INSTALL_PREFIX,
  DEFAULT_OUT_DIR,
  DEFAULT_TEMPLATE_ROOT,
} from "./constants.js";
import type { BundleArgs } from "./types.js";

export function configureBundleCommand(command: Argv): Argv<BundleArgs> {
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
    }) as unknown as Argv<BundleArgs>;
}

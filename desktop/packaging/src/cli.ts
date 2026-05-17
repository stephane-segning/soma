import yargs from "yargs/yargs";
import { hideBin } from "yargs/helpers";
import { runBundle } from "./commands/bundle.js";
import { runReleaseBundle } from "./commands/release-bundle.js";
import { configureBundleCommand } from "./cli-local-options.js";
import { configureReleaseCommand } from "./cli-release-options.js";
import type { BundleArgs, ReleaseBundleArgs } from "./types.js";

export async function main() {
  const argv = hideBin(process.argv);
  if (argv[0] === "--") {
    argv.shift();
  }

  await yargs(argv)
    .scriptName("soma-packaging")
    .command<ReleaseBundleArgs>(
      "release",
      "Build a release Soma bundle from GitHub assets",
      configureReleaseCommand,
      async (commandArgs) => {
        await runReleaseBundle(commandArgs);
      }
    )
    .command<BundleArgs>(
      "$0",
      "Build a local Soma bundle from local build artifacts",
      configureBundleCommand,
      async (commandArgs) => {
        await runBundle(commandArgs);
      }
    )
    .strict()
    .help()
    .parseAsync();
}

const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const packageRoot = path.resolve(__dirname, "..");
const defaultProtoRoot = path.resolve(packageRoot, "../../proto");
const protoRoot = path.resolve(process.env.SOMA_PROTO_ROOT || defaultProtoRoot);
const generatedRoot = path.join(packageRoot, "src", "gen");
const tsProtoPlugin = path.join(
  packageRoot,
  "node_modules",
  ".bin",
  process.platform === "win32" ? "protoc-gen-ts_proto.cmd" : "protoc-gen-ts_proto",
);
const protocBin = path.join(
  packageRoot,
  "node_modules",
  ".bin",
  process.platform === "win32" ? "grpc_tools_node_protoc.cmd" : "grpc_tools_node_protoc",
);
const protoFiles = process.argv.slice(2);
const entrypoints = protoFiles.length > 0
  ? protoFiles
  : ["daemon/v1/daemon.proto", "agent/v1/agent.proto", "space/v1/membership.proto"];
const isFullGenerate = protoFiles.length === 0;

const tsProtoOptions = [
  "env=node",
  "esModuleInterop=true",
  "forceLong=long",
  "useOptionals=messages",
  "outputServices=grpc-js",
  "outputJsonMethods=false",
].join(",");

if (isFullGenerate) {
  fs.rmSync(generatedRoot, { recursive: true, force: true });
}

fs.mkdirSync(generatedRoot, { recursive: true });

for (const entrypoint of entrypoints) {
  const command = spawnSync(
    protocBin,
    [
      `--plugin=protoc-gen-ts_proto=${tsProtoPlugin}`,
      `--ts_proto_out=${generatedRoot}`,
      `--ts_proto_opt=${tsProtoOptions}`,
      `--proto_path=${protoRoot}`,
      path.join(protoRoot, entrypoint),
    ],
    {
      cwd: packageRoot,
      stdio: "inherit",
      env: process.env,
    },
  );

  if (command.status !== 0) {
    process.exit(command.status ?? 1);
  }
}

if (isFullGenerate) {
  const indexFile = path.join(generatedRoot, "index.ts");
  fs.writeFileSync(
    indexFile,
    [
      'export * as daemonV1 from "./daemon/v1/daemon";',
      'export * as agentV1 from "./agent/v1/agent";',
      'export * as spaceV1 from "./space/v1/membership";',
      "",
    ].join("\n"),
  );
}

use std::env;
use std::path::{Path, PathBuf};

const PROTO_FILES: &[&str] = &[
    "space/v1/membership.proto",
    "daemon/v1/daemon.proto",
    "agent/v1/agent.proto",
];

fn workspace_proto_root() -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR"))
        .join("..")
        .join("..")
        .join("..")
        .join("proto")
}

fn proto_root() -> PathBuf {
    env::var_os("SOMA_PROTO_ROOT")
        .map(PathBuf::from)
        .unwrap_or_else(workspace_proto_root)
}

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let proto_root = proto_root();
    let proto_files = PROTO_FILES
        .iter()
        .map(|path| proto_root.join(path))
        .collect::<Vec<_>>();

    println!("cargo:rerun-if-env-changed=SOMA_PROTO_ROOT");
    println!("cargo:rerun-if-changed={}", proto_root.display());

    for proto_file in &proto_files {
        println!("cargo:rerun-if-changed={}", proto_file.display());
    }

    tonic_prost_build::configure().compile_protos(&proto_files, &[proto_root])?;
    Ok(())
}

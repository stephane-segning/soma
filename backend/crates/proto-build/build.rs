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

    tonic_prost_build::configure()
        // `large_enum_variant`: both oneofs mix a small notification/event
        // payload with one variant that embeds a full domain message
        // (JoinDecision / JoinDecisionEvent), so the enum's own size is
        // dominated by its biggest member (~672-696 bytes vs ~128-272 for
        // the others). Boxing the variant would fix that, but it also
        // reshapes the generated Rust API (`Foo(T)` -> `Foo(Box<T>)`) for
        // every construction/match site — several of which live in crates
        // this change does not own and must not edit (backend/crates/daemon,
        // backend/crates/peer). These are wire DTOs decoded rarely (a join
        // decision, a bot status change), never in a hot loop, so the extra
        // few hundred stack bytes per value is immaterial; a scoped allow is
        // the honest fix here, not a workspace-wide one.
        .enum_attribute(
            ".space.v1.MailboxItem.payload",
            "#[allow(clippy::large_enum_variant)]",
        )
        .enum_attribute(
            ".daemon.v1.DaemonEvent.event",
            "#[allow(clippy::large_enum_variant)]",
        )
        .compile_protos(&proto_files, &[proto_root])?;
    Ok(())
}

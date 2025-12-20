fn main() -> Result<(), Box<dyn std::error::Error>> {
    println!("cargo:rerun-if-changed=../../../proto/spaceroom/v1/membership.proto");
    println!("cargo:rerun-if-changed=../../../proto/daemon/v1/daemon.proto");
    println!("cargo:rerun-if-changed=../../../proto");

    tonic_prost_build::configure().compile_protos(
        &[
            "../../../proto/spaceroom/v1/membership.proto",
            "../../../proto/daemon/v1/daemon.proto",
        ],
        &["../../../proto"],
    )?;
    Ok(())
}

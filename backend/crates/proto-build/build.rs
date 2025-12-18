fn main() -> Result<(), Box<dyn std::error::Error>> {
    tonic_prost_build::configure().compile_protos(
        &[
            "../../../proto/classroom/v1/membership.proto",
            "../../../proto/daemon/v1/daemon.proto",
        ],
        &["../../../proto"],
    )?;
    Ok(())
}

fn main() -> Result<(), Box<dyn std::error::Error>> {
    tonic_prost_build::compile_protos("proto/classroom/v1/membership.proto")?;
    Ok(())
}
use std::path::Path;
use walkdir::WalkDir;

/// Compile protobuf files in `proto_root` into the provided `out_dir`.
/// This is intended to be invoked from build.rs scripts in crates that consume the API protos.
pub fn compile_protos(proto_root: &str, out_dir: &str) {
    let proto_files: Vec<String> = WalkDir::new(proto_root)
        .into_iter()
        .filter_map(Result::ok)
        .filter(|e| e.file_type().is_file() && e.path().extension().map(|ext| ext == "proto").unwrap_or(false))
        .map(|e| e.path().display().to_string())
        .collect();

    tonic_build::configure()
        .out_dir(out_dir)
        .compile(&proto_files, &[proto_root])
        .expect("failed to compile protos");
}

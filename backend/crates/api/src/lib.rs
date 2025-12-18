#[cfg(test)]
mod tests {
    use std::fs;

    use soma_net::{default_identity_path, generate_identity, NetIdentity};

    #[test]
    fn identity_roundtrip_generate_and_load() {
        let tmp = tempfile::tempdir().expect("temp dir");
        let path = tmp.path().join("id.key");

        let generated = generate_identity(&path).expect("generate");
        assert!(path.exists());

        let loaded = NetIdentity::load_or_generate(&path).expect("load");
        assert_eq!(generated.peer_id(), loaded.peer_id());

        // Ensure file content remains readable.
        let bytes = fs::read(path).expect("read");
        assert!(!bytes.is_empty());
    }

    #[test]
    fn default_identity_path_is_service_scoped() {
        let a = default_identity_path("svc-a");
        let b = default_identity_path("svc-b");
        assert_ne!(a, b);
    }
}

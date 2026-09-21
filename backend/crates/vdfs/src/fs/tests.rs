use super::*;
use crate::{BlobProvider, BlobWriteInit};

fn store() -> (tempfile::TempDir, FsBlobStore) {
    let dir = tempfile::tempdir().expect("tempdir");
    let store = FsBlobStore::new(dir.path().to_path_buf());
    (dir, store)
}

#[tokio::test]
async fn put_rejects_cid_mismatch() {
    let (_dir, store) = store();
    let bytes = b"hello world";
    let wrong_cid = cid_for(b"not the right bytes");

    let accepted = store
        .put(&wrong_cid, Some("space-1"), bytes, "text/plain")
        .await
        .expect("put should not error, just reject");

    assert!(!accepted, "put must reject bytes that don't hash to the claimed CID");
    assert!(
        store
            .read("space-1", &wrong_cid)
            .await
            .expect("read should not error")
            .is_none(),
        "rejected bytes must not be persisted"
    );
}

#[tokio::test]
async fn put_accepts_matching_cid_and_is_idempotent() {
    let (_dir, store) = store();
    let bytes = b"hello world";
    let cid = cid_for(bytes);

    let accepted = store
        .put(&cid, Some("space-1"), bytes, "text/plain")
        .await
        .expect("put should not error");
    assert!(accepted);

    let read_back = store
        .read("space-1", &cid)
        .await
        .expect("read should not error")
        .expect("bytes should be present after a successful put");
    assert_eq!(read_back, bytes);

    // Idempotent: a second put with the same (correct) bytes is a no-op success.
    let accepted_again = store
        .put(&cid, Some("space-1"), bytes, "text/plain")
        .await
        .expect("put should not error");
    assert!(accepted_again);
}

#[tokio::test]
async fn streaming_write_rejects_cid_mismatch_and_cleans_up_temp_file() {
    let (_dir, store) = store();
    let real_bytes = b"streamed payload bytes";
    let wrong_cid = cid_for(b"totally different content");

    let init = store
        .open_streaming_put(&wrong_cid, Some("space-1"), real_bytes.len() as u64)
        .await
        .expect("open_streaming_put should not error")
        .expect("streaming should be supported");

    let BlobWriteInit::Started(mut writer) = init else {
        panic!("expected a fresh streaming write to start, not AlreadyPresent");
    };

    writer
        .write_chunk(0, real_bytes)
        .await
        .expect("write_chunk should not error");

    let stored = writer.finish().await.expect("finish should not error");
    assert!(!stored, "finish must reject bytes that don't hash to the claimed CID");

    // Nothing observable was persisted: no final file, and the temp `.part`
    // file was cleaned up (verified indirectly: the space directory has no
    // leftover entries besides what the test itself will assert below).
    assert!(
        store
            .read("space-1", &wrong_cid)
            .await
            .expect("read should not error")
            .is_none()
    );
    let space_dir = store.root.join("space-1");
    let mut leftovers = tokio::fs::read_dir(&space_dir)
        .await
        .expect("space dir should exist (created for the temp file)");
    let mut names = Vec::new();
    while let Some(entry) = leftovers.next_entry().await.expect("read_dir entry") {
        names.push(entry.file_name());
    }
    assert!(
        names.iter().all(|n| !n.to_string_lossy().ends_with(".part")),
        "temp .part file must be cleaned up on CID-mismatch abort, found: {names:?}"
    );
}

#[tokio::test]
async fn streaming_write_commits_atomically_on_success() {
    let (_dir, store) = store();
    let bytes = b"a slightly longer streamed payload, split into two chunks";
    let cid = cid_for(bytes);
    let mid = bytes.len() / 2;

    let init = store
        .open_streaming_put(&cid, Some("space-1"), bytes.len() as u64)
        .await
        .expect("open_streaming_put should not error")
        .expect("streaming should be supported");

    let BlobWriteInit::Started(mut writer) = init else {
        panic!("expected a fresh streaming write to start, not AlreadyPresent");
    };

    writer
        .write_chunk(0, &bytes[..mid])
        .await
        .expect("first chunk should write");
    writer
        .write_chunk(mid as u64, &bytes[mid..])
        .await
        .expect("second chunk should write");

    let stored = writer.finish().await.expect("finish should not error");
    assert!(stored, "finish must succeed when the accumulated bytes match the claimed CID");

    let read_back = store
        .read("space-1", &cid)
        .await
        .expect("read should not error")
        .expect("bytes should be present after a successful streaming finish");
    assert_eq!(read_back, bytes);
}

#[tokio::test]
async fn streaming_write_rejects_out_of_order_chunks() {
    let (_dir, store) = store();
    let bytes = b"order matters here";
    let cid = cid_for(bytes);

    let init = store
        .open_streaming_put(&cid, Some("space-1"), bytes.len() as u64)
        .await
        .expect("open_streaming_put should not error")
        .expect("streaming should be supported");

    let BlobWriteInit::Started(mut writer) = init else {
        panic!("expected a fresh streaming write to start, not AlreadyPresent");
    };

    let err = writer
        .write_chunk(4, &bytes[4..])
        .await
        .expect_err("writing at a non-zero offset first must be rejected");
    assert!(err.to_string().contains("out-of-order"));
}

#[tokio::test]
async fn open_streaming_put_rejects_declared_size_over_the_cap() {
    let (_dir, store) = store();
    let cid = cid_for(b"irrelevant, rejected before any bytes arrive");

    let err = store
        .open_streaming_put(&cid, Some("space-1"), MAX_BLOB_TOTAL_BYTES + 1)
        .await
        .expect_err("a declared size over the cap must be rejected before allocating anything");

    assert!(err.to_string().contains("exceeds max"));
}

#[tokio::test]
async fn cache_only_store_refuses_local_writes_but_still_accepts_network_writes() {
    let dir = tempfile::tempdir().expect("tempdir");
    let store = FsBlobStore::new_cache_only(dir.path().to_path_buf());
    assert_eq!(store.role(), BlobStoreRole::CacheOnly);

    let bytes = b"a VDF should never source this";
    let write_err = store
        .write_local("space-1", bytes)
        .await
        .expect_err("cache-only store must refuse write_local");
    assert!(write_err.to_string().contains("cache-only"));

    // Network-verified writes (the actual point of a cache) still work.
    let cid = cid_for(bytes);
    let accepted = store
        .put(&cid, Some("space-1"), bytes, "text/plain")
        .await
        .expect("put should not error on a cache-only store");
    assert!(accepted, "cache-only stores must still accept CID-verified network writes");
}

#[tokio::test]
async fn source_of_truth_store_accepts_local_writes() {
    let (_dir, store) = store();
    assert_eq!(store.role(), BlobStoreRole::SourceOfTruth);

    let result = store
        .write_local("space-1", b"a real upload")
        .await
        .expect("source-of-truth store must accept write_local");
    assert_eq!(result.cid, cid_for(b"a real upload"));
}

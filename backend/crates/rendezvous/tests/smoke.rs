use std::{net::SocketAddr, time::Duration};

use soma_rendezvous::{RendezvousConfig, RendezvousMetrics};
use tokio::{io::AsyncWriteExt, net::TcpStream, sync::oneshot, time};

async fn http_get(addr: SocketAddr, path: &str) -> String {
    let mut stream = TcpStream::connect(addr).await.expect("connect");
    let req = format!(
        "GET {} HTTP/1.1\r\nHost: localhost\r\nConnection: close\r\n\r\n",
        path
    );
    stream.write_all(req.as_bytes()).await.expect("write");
    let mut buf = Vec::new();
    tokio::io::AsyncReadExt::read_to_end(&mut stream, &mut buf)
        .await
        .expect("read");
    String::from_utf8_lossy(&buf).to_string()
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
#[ignore = "requires local network sockets (bind/connect)"]
async fn rendezvous_smoke_health_and_metrics() {
    let tmp = tempfile::tempdir().expect("temp dir");
    let identity_path = tmp.path().join("rendezvous.key");

    let cfg = RendezvousConfig {
        identity_path,
        listen_addrs: vec![
            "/ip4/127.0.0.1/tcp/0".parse().unwrap(),
            "/ip4/127.0.0.1/udp/0/quic-v1".parse().unwrap(),
            "/ip4/127.0.0.1/tcp/0/ws".parse().unwrap(),
        ],
    };

    let metrics = RendezvousMetrics::new();

    let http_addr: SocketAddr = "127.0.0.1:0".parse().unwrap();
    let listener = tokio::net::TcpListener::bind(http_addr).await.unwrap();
    let http_addr = listener.local_addr().unwrap();
    let app = soma_rendezvous::metrics_router(&metrics);
    let http = tokio::spawn(async move { axum::serve(listener, app).await });

    let (shutdown_tx, shutdown_rx) = oneshot::channel::<()>();
    let svc = tokio::spawn(async move {
        soma_rendezvous::run_with_shutdown(cfg, metrics, async move {
            let _ = shutdown_rx.await;
        })
        .await
    });

    time::sleep(Duration::from_millis(150)).await;

    let health = http_get(http_addr, "/healthz").await;
    assert!(health.contains("200"), "health response: {health}");
    assert!(health.contains("ok"), "health response: {health}");

    let metrics_body = http_get(http_addr, "/metrics").await;
    assert!(metrics_body.contains("rendezvous_discover_total"));
    assert!(metrics_body.contains("rendezvous_registrations_total"));

    let _ = shutdown_tx.send(());
    let _ = svc.await.unwrap();
    let _ = http.abort();
}

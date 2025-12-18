use std::{net::SocketAddr, time::Duration};

use soma_relay::{RelayConfig, RelayMetrics};
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
async fn relay_smoke_health_and_metrics() {
    let tmp = tempfile::tempdir().expect("temp dir");
    let identity_path = tmp.path().join("relay.key");

    let relay_cfg = RelayConfig {
        identity_path,
        listen_addrs: vec![
            "/ip4/127.0.0.1/tcp/0".parse().unwrap(),
            "/ip4/127.0.0.1/udp/0/quic-v1".parse().unwrap(),
            "/ip4/127.0.0.1/tcp/0/ws".parse().unwrap(),
        ],
    };

    let metrics = RelayMetrics::new();

    // Serve HTTP metrics on an ephemeral port.
    let http_addr: SocketAddr = "127.0.0.1:0".parse().unwrap();
    let listener = tokio::net::TcpListener::bind(http_addr).await.unwrap();
    let http_addr = listener.local_addr().unwrap();
    let app = soma_relay::metrics_router(&metrics);
    let http = tokio::spawn(async move { axum::serve(listener, app).await });

    let (shutdown_tx, shutdown_rx) = oneshot::channel::<()>();
    let relay = tokio::spawn(async move {
        soma_relay::run_with_shutdown(relay_cfg, metrics, async move {
            let _ = shutdown_rx.await;
        })
        .await
    });

    // Give the swarm a moment to bind and increment counters.
    time::sleep(Duration::from_millis(150)).await;

    let health = http_get(http_addr, "/healthz").await;
    assert!(health.contains("200"), "health response: {health}");
    assert!(health.contains("ok"), "health response: {health}");

    let metrics_body = http_get(http_addr, "/metrics").await;
    assert!(metrics_body.contains("relay_reservations_total"));
    assert!(metrics_body.contains("relay_circuits_total"));

    let _ = shutdown_tx.send(());
    let _ = relay.await.unwrap();
    let _ = http.abort();
}

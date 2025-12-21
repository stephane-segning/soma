# syntax=docker/dockerfile:1.5

FROM rust:1.85-bookworm AS base

ENV CARGO_TERM_COLOR=always

WORKDIR /app

FROM base AS builder

ARG TARGETARCH

RUN \
  --mount=type=cache,target=/var/cache/apt,sharing=locked \
  --mount=type=cache,target=/var/lib/apt,sharing=locked \
  apt-get update && \
  apt-get install -y --no-install-recommends \
    musl-tools \
    build-essential \
    pkg-config \
    perl \
    protobuf-compiler \
    ca-certificates \
  && rustup target add x86_64-unknown-linux-musl aarch64-unknown-linux-musl

COPY backend ./backend
COPY proto ./proto

RUN \
  --mount=type=cache,target=/app/backend/target \
  --mount=type=cache,target=/usr/local/cargo/registry/cache \
  --mount=type=cache,target=/usr/local/cargo/registry/index \
  --mount=type=cache,target=/usr/local/cargo/git/db \
  case "${TARGETARCH:-amd64}" in \
    "amd64") \
      export RUST_TARGET=x86_64-unknown-linux-musl; \
      export CARGO_TARGET_X86_64_UNKNOWN_LINUX_MUSL_LINKER=musl-gcc; \
      ;; \
    "arm64") \
      export RUST_TARGET=aarch64-unknown-linux-musl; \
      export CARGO_TARGET_AARCH64_UNKNOWN_LINUX_MUSL_LINKER=musl-gcc; \
      ;; \
    *) \
      echo "Unsupported TARGETARCH: $TARGETARCH"; \
      exit 1; \
      ;; \
  esac; \
  cd /app/backend; \
  cargo build --profile prod --locked --target "${RUST_TARGET}" \
    -p soma-botd \
    -p soma-relayd \
    -p soma-rendezvousd \
    -p soma-bffd \
    -p soma-serverd \
  ; \
  mkdir -p /out; \
  cp "/app/backend/target/${RUST_TARGET}/prod/soma-botd" /out/soma-botd; \
  cp "/app/backend/target/${RUST_TARGET}/prod/soma-relayd" /out/soma-relayd; \
  cp "/app/backend/target/${RUST_TARGET}/prod/soma-rendezvousd" /out/soma-rendezvousd; \
  cp "/app/backend/target/${RUST_TARGET}/prod/soma-bffd" /out/soma-bffd; \
  cp "/app/backend/target/${RUST_TARGET}/prod/soma-serverd" /out/soma-serverd

FROM gcr.io/distroless/static-debian12:nonroot AS botd

ENV RUST_LOG=info
ENV HTTP_ADDR=0.0.0.0:8080
ENV SOMA_DATA_DIR=/data
ENV SOMA_BLOB_DIR=/blobs

WORKDIR /app

COPY --from=builder /out/soma-botd /app/soma-botd

USER nonroot:nonroot

EXPOSE 8080
EXPOSE 14005 14105
EXPOSE 14205/udp

ENTRYPOINT ["/app/soma-botd"]

FROM gcr.io/distroless/static-debian12:nonroot AS relayd

ENV RUST_LOG=info
ENV HTTP_ADDR=0.0.0.0:8081
ENV SOMA_DATA_DIR=/data

WORKDIR /app

COPY --from=builder /out/soma-relayd /app/soma-relayd

USER nonroot:nonroot

EXPOSE 8081
EXPOSE 14003 14103
EXPOSE 14203/udp

ENTRYPOINT ["/app/soma-relayd"]

FROM gcr.io/distroless/static-debian12:nonroot AS rendezvousd

ENV RUST_LOG=info
ENV HTTP_ADDR=0.0.0.0:8082
ENV SOMA_DATA_DIR=/data

WORKDIR /app

COPY --from=builder /out/soma-rendezvousd /app/soma-rendezvousd

USER nonroot:nonroot

EXPOSE 8082
EXPOSE 14004 14104
EXPOSE 4204/udp

ENTRYPOINT ["/app/soma-rendezvousd"]

FROM gcr.io/distroless/static-debian12:nonroot AS bffd

ENV RUST_LOG=info
ENV HTTP_ADDR=0.0.0.0:8083
ENV SOMA_DATA_DIR=/data

WORKDIR /app

COPY --from=builder /out/soma-bffd /app/soma-bffd

USER nonroot:nonroot

EXPOSE 8083
EXPOSE 14010 14110
EXPOSE 14210/udp

ENTRYPOINT ["/app/soma-bffd"]

FROM gcr.io/distroless/static-debian12:nonroot AS serverd

ENV RUST_LOG=info
ENV HTTP_ADDR=0.0.0.0:8081
ENV SOMA_DATA_DIR=/data

WORKDIR /app

COPY --from=builder /out/soma-serverd /app/soma-serverd

USER nonroot:nonroot

EXPOSE 8081 8082 8083
EXPOSE 14003 14103 14004 14104 14010 14110
EXPOSE 14203/udp 4204/udp 14210/udp

ENTRYPOINT ["/app/soma-serverd"]

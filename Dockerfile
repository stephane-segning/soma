# syntax=docker/dockerfile:1.5

# Images are now built from precompiled binaries produced in CI:
# dist/backend/linux-amd64/soma-* and dist/backend/linux-arm64/soma-* must be present in context.

FROM gcr.io/distroless/static-debian12:nonroot AS botd
ARG TARGETARCH

ENV RUST_LOG=info
ENV HTTP_ADDR=0.0.0.0:8080
ENV SOMA_DATA_DIR=/data
ENV SOMA_BLOB_DIR=/blobs

WORKDIR /app

COPY dist/backend/linux-${TARGETARCH}/soma-botd /app/soma-botd

USER nonroot:nonroot

EXPOSE 8080
EXPOSE 14005 14105
EXPOSE 14205/udp

ENTRYPOINT ["/app/soma-botd"]

FROM gcr.io/distroless/static-debian12:nonroot AS relayd
ARG TARGETARCH

ENV RUST_LOG=info
ENV HTTP_ADDR=0.0.0.0:8081
ENV SOMA_DATA_DIR=/data

WORKDIR /app

COPY dist/backend/linux-${TARGETARCH}/soma-relayd /app/soma-relayd

USER nonroot:nonroot

EXPOSE 8081
EXPOSE 14003 14103
EXPOSE 14203/udp

ENTRYPOINT ["/app/soma-relayd"]

FROM gcr.io/distroless/static-debian12:nonroot AS rendezvousd
ARG TARGETARCH

ENV RUST_LOG=info
ENV HTTP_ADDR=0.0.0.0:8082
ENV SOMA_DATA_DIR=/data

WORKDIR /app

COPY dist/backend/linux-${TARGETARCH}/soma-rendezvousd /app/soma-rendezvousd

USER nonroot:nonroot

EXPOSE 8082
EXPOSE 14004 14104
EXPOSE 4204/udp

ENTRYPOINT ["/app/soma-rendezvousd"]

FROM gcr.io/distroless/static-debian12:nonroot AS bffd
ARG TARGETARCH

ENV RUST_LOG=info
ENV HTTP_ADDR=0.0.0.0:8083
ENV SOMA_DATA_DIR=/data

WORKDIR /app

COPY dist/backend/linux-${TARGETARCH}/soma-bffd /app/soma-bffd

USER nonroot:nonroot

EXPOSE 8083
EXPOSE 14010 14110
EXPOSE 14210/udp

ENTRYPOINT ["/app/soma-bffd"]

FROM gcr.io/distroless/static-debian12:nonroot AS serverd
ARG TARGETARCH

ENV RUST_LOG=info
ENV HTTP_ADDR=0.0.0.0:8081
ENV SOMA_DATA_DIR=/data

WORKDIR /app

COPY dist/backend/linux-${TARGETARCH}/soma-serverd /app/soma-serverd

USER nonroot:nonroot

EXPOSE 8081 8082 8083
EXPOSE 14003 14103 14004 14104 14010 14110
EXPOSE 14203/udp 4204/udp 14210/udp

ENTRYPOINT ["/app/soma-serverd"]

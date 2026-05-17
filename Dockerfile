# syntax=docker/dockerfile:1.5
#
# One image, one binary: `somad`. Mode is selected at runtime via subcommand:
#   docker run ghcr.io/.../somad bot --http-addr 0.0.0.0:8080 ...
#   docker run ghcr.io/.../somad relay --http-addr 0.0.0.0:8081 ...
#   docker run ghcr.io/.../somad rendezvous --http-addr 0.0.0.0:8082 ...
#   docker run ghcr.io/.../somad bff --http-addr 0.0.0.0:8083 ...
#   docker run ghcr.io/.../somad all --config /etc/soma/server.toml
#
# Built from precompiled MUSL binaries produced in CI:
# dist/backend/linux-${TARGETARCH}/somad must be present in the build context.

FROM gcr.io/distroless/static-debian12:nonroot
ARG TARGETARCH

ENV RUST_LOG=info
ENV SOMA_DATA_DIR=/data
ENV SOMA_BLOB_DIR=/blobs

WORKDIR /app

COPY dist/backend/linux-${TARGETARCH}/somad /app/somad

USER nonroot:nonroot

# Document the ports each subcommand uses. Forward whichever subset matches
# the subcommand you actually run.
#
#   somad bot:         8080 + 14005/tcp + 14105/tcp + 14205/udp
#   somad relay:       8081 + 14003/tcp + 14103/tcp + 14203/udp
#   somad rendezvous:  8082 + 14004/tcp + 14104/tcp + 4204/udp
#   somad bff:         8083 (+ optional 14010/tcp + 14110/tcp + 14210/udp if --p2p-enable)
#   somad all:         union of the modes declared in its config
EXPOSE 8080 8081 8082 8083
EXPOSE 14003 14004 14005 14010 14103 14104 14105 14110
EXPOSE 14203/udp 14205/udp 14210/udp 4204/udp

ENTRYPOINT ["/app/somad"]

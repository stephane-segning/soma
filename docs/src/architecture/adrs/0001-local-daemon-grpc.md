# ADR-0001: Local daemon with gRPC over Unix Domain Socket

## Context
The desktop UI must interact with networking, storage, and cryptography
without exposing network services.

## Decision
Use a **local daemon** communicating with the UI via **gRPC over Unix Domain Socket**.

- No TCP ports exposed
- Authenticated via IPC token
- High performance
- Small attack surface

## Consequences
+ Secure by default
+ Easy to reason about
− Requires IPC support in Electron


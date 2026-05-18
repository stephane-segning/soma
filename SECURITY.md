# Security Policy

Thanks for helping keep Soma safe.

## Reporting a vulnerability

Please **do not** open a public GitHub issue for security reports.

Instead, use one of:

1. **GitHub private vulnerability reporting** (preferred, if enabled for this repo):  
   `https://github.com/stephane-segning/soma/security/advisories/new`
2. **Email**: `selastlambou@gmail.com`

Include, when possible:

- A clear description of the issue and impact.
- Steps to reproduce or a proof-of-concept.
- Affected component(s) (e.g. `soma-daemon`, `soma-botd`, `desktop/soma`) and version/commit.
- Any relevant logs, configs, or payloads (sanitize secrets).

## Scope

In scope:

- Desktop apps: `desktop/soma`
- Desktop runtime libraries (linked into the `@soma/node` napi addon and run in-process inside Electron main): `backend/crates/daemon` (`soma-daemon`), `backend/crates/agentd` (`soma-agentd`), `backend/crates/soma-node` (the napi cdylib)
- Server binary: `backend/bins/somad` with subcommands `bot` / `relay` / `rendezvous` / `bff` / `all`
- Protocols and storage: `proto/`, `backend/crates/*`
- Packaging and release artifacts under `.github/` and `deploy/` when they affect produced binaries/images

Out of scope:

- Vulnerabilities in third-party dependencies without a concrete exploit path in Soma.
- Reports that require physical access to an unlocked device without a realistic threat model.

## Coordinated disclosure

- We’ll acknowledge receipt and aim to provide an initial assessment within **7 days**.
- We may ask for clarification, logs, or environment details to reproduce.
- If confirmed, we’ll work on a fix and coordinate a disclosure timeline with you.

## Security design references

- Threat model (repo docs): `docs/src/security/threat-model.md`
- SBOM notes (repo docs): `docs/src/security/sbom.md`

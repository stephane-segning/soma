# SBOM

Soma generates Software Bills of Materials (SBOMs) in CI to improve supply-chain visibility for desktop artifacts, backend binaries, and container images.

## What is generated

- Output format: **SPDX JSON** (`*.spdx.json`).
- Generator: **Syft** via `anchore/sbom-action`.

## Where SBOMs are produced

SBOMs are generated as part of the release and build workflows in `.github/workflows/`:

- `release-daemons.yml`: produces `sbom-daemons-<version>-<os>-<arch>.spdx.json` alongside daemon/agent release assets.
- `release.yml`: produces `sbom-bundle-<bundle_version>-<os>-<arch>.spdx.json` alongside bundle release assets.
- `docker-backend.yml`: produces `sbom-image-<name>.spdx.json` for built backend images (and uploads it as an artifact).
- `release-desktop.yml`: produces desktop release assets for Soma (with the built-in `/practice` Tapia surface; no SBOM step yet).

## How to consume

Recommended review practices:

- Treat SBOMs as **inputs** to vulnerability scanning and dependency review, not as proof of safety.
- When investigating a CVE, use the SBOM to confirm whether a vulnerable component is present and at what version.
- Prefer diffing SBOMs between releases to identify unexpected dependency changes.

## Notes

- SBOMs are generated in CI; the repo does not maintain a checked-in `sbom/` scripts directory.
- If you add new release artifacts (new binaries/images), ensure the workflow uploads an SBOM for them as well.

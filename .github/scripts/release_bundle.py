#!/usr/bin/env python3
import json
import os
import re
import shutil
import subprocess
import sys
import time
import urllib.request
from pathlib import Path


def log(msg: str) -> None:
    print(msg, file=sys.stderr)


def gh_api_get(url: str, token: str) -> object:
    req = urllib.request.Request(
        url,
        headers={
            "Accept": "application/vnd.github+json",
            "Authorization": f"Bearer {token}",
            "User-Agent": "soma-release-bundle",
            "X-GitHub-Api-Version": "2022-11-28",
        },
    )
    with urllib.request.urlopen(req) as resp:
        return json.loads(resp.read().decode("utf-8"))


def download(url: str, token: str, dest: str) -> None:
    req = urllib.request.Request(
        url,
        headers={
            "Accept": "application/octet-stream",
            "Authorization": f"Bearer {token}",
            "User-Agent": "soma-release-bundle",
        },
    )
    with urllib.request.urlopen(req) as resp, open(dest, "wb") as f:
        shutil.copyfileobj(resp, f)


def resolve_latest_tag(repo: str, token: str, prefix: str) -> tuple[str, str]:
    releases = gh_api_get(f"https://api.github.com/repos/{repo}/releases?per_page=100", token)
    for rel in releases:
        tag = rel.get("tag_name", "")
        if tag.startswith(prefix):
            version = tag[len(prefix) :]
            return tag, version
    raise RuntimeError(f"no GitHub release found with tag prefix {prefix!r}")


def find_asset(release: dict, pattern: str) -> dict:
    rx = re.compile(pattern)
    assets = release.get("assets", [])
    # Prefer exact/full match, but allow fallback to regex search to handle minor naming variants.
    for asset in assets:
        name = asset.get("name", "")
        if rx.fullmatch(name):
            return asset
    for asset in assets:
        name = asset.get("name", "")
        if rx.search(name):
            log(f"[find_asset] fallback regex match for pattern={pattern!r} -> {name!r}")
            return asset
    raise RuntimeError(f"asset not found: pattern={pattern}; available={[a.get('name','') for a in assets]}")


def write_text(path: str, content: str) -> None:
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        f.write(content)


def render_template(template_path: str, dest: str, ctx: dict) -> None:
    from string import Template

    text = Path(template_path).read_text(encoding="utf-8")
    rendered = Template(text).safe_substitute(ctx)
    write_text(dest, rendered)


def run(cmd: list[str], cwd: str | None = None) -> None:
    log("+ " + " ".join(cmd))
    # Send child stdout/stderr to our stderr so redirected stdout stays clean JSON.
    subprocess.run(cmd, cwd=cwd, check=True, stdout=sys.stderr, stderr=sys.stderr)


def main() -> int:
    repo = os.environ["GITHUB_REPOSITORY"]
    token = os.environ["GITHUB_TOKEN"]
    out_dir = os.environ.get("OUT_DIR", "artifacts/bundle")
    platform_os = os.environ["BUNDLE_OS"]  # linux|macos
    platform_arch = os.environ["BUNDLE_ARCH"]  # amd64|arm64

    daemons_version = os.environ.get("DAEMONS_VERSION", "").strip()
    desktop_version = os.environ.get("DESKTOP_VERSION", "").strip()
    bundle_version = os.environ.get("BUNDLE_VERSION", "").strip() or time.strftime("%Y%m%d-%H%M%S")

    if daemons_version:
        daemons_tag = f"daemons-v{daemons_version}"
    else:
        daemons_tag, daemons_version = resolve_latest_tag(repo, token, "daemons-v")

    if desktop_version:
        desktop_tag = f"desktop-v{desktop_version}"
    else:
        desktop_tag, desktop_version = resolve_latest_tag(repo, token, "desktop-v")

    log(f"Using daemons={daemons_tag} desktop={desktop_tag} bundle_version={bundle_version}")

    def fetch_release(tag: str) -> dict:
        return gh_api_get(f"https://api.github.com/repos/{repo}/releases/tags/{tag}", token)

    rel_daemons = fetch_release(daemons_tag)
    rel_desktop = fetch_release(desktop_tag)
    log(f"[release] daemons assets: {[a.get('name','') for a in rel_daemons.get('assets', [])]}")
    log(f"[release] desktop assets: {[a.get('name','') for a in rel_desktop.get('assets', [])]}")

    # Download daemon+agent tarballs for this OS/arch (allow common arch aliases).
    def arch_aliases(arch: str) -> list[str]:
        if arch == "arm64":
            return ["arm64", "aarch64"]
        if arch == "amd64":
            return ["amd64", "x86_64"]
        return [arch]

    def resolve_assets() -> tuple[dict, dict, str]:
        for arch in arch_aliases(platform_arch):
            pat_daemon = rf"soma-daemon-{re.escape(daemons_version)}-{platform_os}-{arch}\.tar\.gz"
            pat_agent = rf"soma-agentd-{re.escape(daemons_version)}-{platform_os}-{arch}\.tar\.gz"
            try:
                return find_asset(rel_daemons, pat_daemon), find_asset(rel_daemons, pat_agent), arch
            except Exception:
                continue
        return None, None, platform_arch

    attempts = 0
    daemon_asset = agent_asset = None
    while attempts < 5 and (daemon_asset is None or agent_asset is None):
        daemon_asset, agent_asset, matched_arch = resolve_assets()
        if daemon_asset and agent_asset:
            platform_arch = matched_arch
            break
        attempts += 1
        time.sleep(10)
        rel_daemons = fetch_release(daemons_tag)  # refresh assets and retry
    if daemon_asset is None or agent_asset is None:
        raise RuntimeError(
            f"daemon/agent assets not found for {platform_os}-{platform_arch} after retries (aliases tried: {arch_aliases(platform_arch)})"
        )

    platform_out = os.path.join(out_dir, f"{platform_os}-{platform_arch}")
    staging = os.path.join(platform_out, "staging")
    os.makedirs(staging, exist_ok=True)

    daemon_tgz = os.path.join(staging, daemon_asset["name"])
    agent_tgz = os.path.join(staging, agent_asset["name"])
    download(daemon_asset["url"], token, daemon_tgz)
    download(agent_asset["url"], token, agent_tgz)

    run(["tar", "-xzf", daemon_tgz, "-C", staging])
    run(["tar", "-xzf", agent_tgz, "-C", staging])

    # Resolve desktop artifact name for this OS/arch (Linux AppImage; macOS tar.gz containing a .app).
    desktop_asset = None
    for ext in ("AppImage", "tar.gz", "app", "zip"):
        try:
            desktop_asset = find_asset(
                rel_desktop,
                rf"soma-desktop-{re.escape(desktop_version)}-{platform_os}-{platform_arch}\.{re.escape(ext)}"
                if ext != "app"
                else rf"soma-desktop-{re.escape(desktop_version)}-{platform_os}-{platform_arch}\.app",
            )
            break
        except Exception:
            continue
    if desktop_asset is None:
        raise RuntimeError(
            f"desktop artifact not found for {platform_os}-{platform_arch} ({desktop_version}); expected .AppImage (linux) or .app/.tar.gz bundle (macOS)"
        )

    # Download desktop artifact into staging so we can embed it into the bundle OS package.
    desktop_path = os.path.join(staging, desktop_asset["name"])
    download(desktop_asset["url"], token, desktop_path)

    docker_images = os.environ.get("DOCKER_IMAGES", "").strip()

    pages_url = f"https://{repo.split('/')[0]}.github.io/{repo.split('/')[1]}/"

    template_root = Path(".github/packaging/templates")
    ctx = {
        "name": "soma-daemon",
        "version": daemons_version,
        "desktop_version": desktop_version,
        "bundle_version": bundle_version,
        "os": platform_os,
        "arch": platform_arch,
        "install_prefix": "/usr/local",
        "service_label_daemon": "digital.camer.soma.daemon",
        "service_label_agent": "digital.camer.soma.agentd",
        "homepage": pages_url,
        "docs_url": pages_url,
        "docker_images": docker_images or "None specified.",
        "repo": repo,
    }

    render_template(
        template_root / "readme" / "README.md.j2",
        os.path.join(staging, "README.md"),
        ctx,
    )
    install_path = os.path.join(staging, "install.sh")
    render_template(
        template_root / "install" / "install.sh.j2",
        install_path,
        ctx,
    )
    os.chmod(install_path, 0o755)
    # Keep install.sh alongside artifacts (do not embed in packages).
    produced: list[str] = []
    install_out = os.path.join(platform_out, "install.sh")
    shutil.copy2(install_path, install_out)
    produced.append(install_out)

    # Service definitions.
    systemd_path = os.path.join(staging, "soma-daemon.service")
    render_template(
        template_root / "systemd" / "soma-daemon.service.j2",
        systemd_path,
        ctx,
    )
    systemd_agent_path = os.path.join(staging, "soma-agentd.service")
    render_template(
        template_root / "systemd" / "soma-agentd.service.j2",
        systemd_agent_path,
        ctx,
    )

    plist_path = os.path.join(staging, "soma-daemon.plist")
    render_template(
        template_root / "launchd" / "digital.camer.soma.daemon.plist.j2",
        plist_path,
        ctx,
    )
    plist_agent_path = os.path.join(staging, "soma-agentd.plist")
    render_template(
        template_root / "launchd" / "digital.camer.soma.agentd.plist.j2",
        plist_agent_path,
        ctx,
    )

    name_base = f"soma-bundle-{bundle_version}-{platform_os}-{platform_arch}"

    if platform_os == "linux":
        # Build both .deb and .rpm on Ubuntu runners (fpm).
        rpm_arch = {"amd64": "x86_64", "arm64": "aarch64"}.get(platform_arch, platform_arch)
        pkgroot = os.path.join(platform_out, "pkgroot")
        if os.path.exists(pkgroot):
            shutil.rmtree(pkgroot)
        os.makedirs(os.path.join(pkgroot, "usr", "local", "bin"), exist_ok=True)
        os.makedirs(os.path.join(pkgroot, "usr", "local", "share", "soma"), exist_ok=True)
        os.makedirs(os.path.join(pkgroot, "usr", "lib", "systemd", "system"), exist_ok=True)

        shutil.copy2(os.path.join(staging, "soma-daemon"), os.path.join(pkgroot, "usr/local/bin/soma-daemon"))
        shutil.copy2(os.path.join(staging, "soma-agentd"), os.path.join(pkgroot, "usr/local/bin/soma-agentd"))
        shutil.copy2(os.path.join(staging, "README.md"), os.path.join(pkgroot, "usr/local/share/soma/README.md"))
        shutil.copy2(systemd_path, os.path.join(pkgroot, "usr", "lib", "systemd", "system", "soma-daemon.service"))
        shutil.copy2(systemd_agent_path, os.path.join(pkgroot, "usr", "lib", "systemd", "system", "soma-agentd.service"))

        # Embed the desktop AppImage.
        if not desktop_asset["name"].endswith(".AppImage"):
            raise RuntimeError(f"unexpected linux desktop artifact (expected .AppImage): {desktop_asset['name']}")
        desktop_dst = os.path.join(pkgroot, "usr", "local", "bin", "soma-app.AppImage")
        shutil.copy2(desktop_path, desktop_dst)
        link_path = os.path.join(pkgroot, "usr", "local", "bin", "soma-app")
        if os.path.lexists(link_path):
            os.remove(link_path)
        os.symlink("soma-app.AppImage", link_path)

        deb_out = os.path.join(platform_out, f"{name_base}.deb")
        rpm_out = os.path.join(platform_out, f"{name_base}.rpm")
        for fmt, outp, arch in (("deb", deb_out, platform_arch), ("rpm", rpm_out, rpm_arch)):
            run(
                [
                    "fpm",
                    "-s",
                    "dir",
                    "-t",
                    fmt,
                    "-n",
                    "soma-bundle",
                    "-v",
                    bundle_version,
                    "-a",
                    arch,
                    "--description",
                    "Soma bundle (daemon + agentd + desktop app)",
                    "--url",
                    pages_url,
                    "--prefix",
                    "/",
                    "-C",
                    pkgroot,
                    "-p",
                    outp,
                    ".",
                ]
            )
            produced.append(outp)

    else:
        pkg_root = os.path.join(platform_out, "pkgroot")
        if os.path.exists(pkg_root):
            shutil.rmtree(pkg_root)
        os.makedirs(os.path.join(pkg_root, "usr", "local", "bin"), exist_ok=True)
        os.makedirs(os.path.join(pkg_root, "usr", "local", "share", "soma"), exist_ok=True)
        os.makedirs(os.path.join(pkg_root, "Library", "LaunchDaemons"), exist_ok=True)
        os.makedirs(os.path.join(pkg_root, "Applications"), exist_ok=True)

        shutil.copy2(os.path.join(staging, "soma-daemon"), os.path.join(pkg_root, "usr", "local", "bin", "soma-daemon"))
        shutil.copy2(os.path.join(staging, "soma-agentd"), os.path.join(pkg_root, "usr", "local", "bin", "soma-agentd"))
        shutil.copy2(os.path.join(staging, "README.md"), os.path.join(pkg_root, "usr", "local", "share", "soma", "README.md"))
        shutil.copy2(plist_path, os.path.join(pkg_root, "Library", "LaunchDaemons", "digital.camer.soma.daemon.plist"))
        shutil.copy2(plist_agent_path, os.path.join(pkg_root, "Library", "LaunchDaemons", "digital.camer.soma.agentd.plist"))

        # Embed the desktop .app (downloaded as a tar.gz in the desktop release).
        app_name = "soma-app.app"
        if desktop_asset["name"].endswith(".tar.gz"):
            run(["tar", "-xzf", desktop_path, "-C", staging])
            staged_app = os.path.join(staging, app_name)
        elif desktop_asset["name"].endswith(".app"):
            staged_app = desktop_path
        else:
            raise RuntimeError(f"unexpected macOS desktop artifact (expected .tar.gz or .app): {desktop_asset['name']}")

        if not os.path.isdir(staged_app):
            raise RuntimeError(f"expected .app bundle not found after extract: {staged_app}")
        shutil.copytree(staged_app, os.path.join(pkg_root, "Applications", app_name), dirs_exist_ok=True)

        pkg_out = os.path.join(platform_out, f"{name_base}.pkg")
        run(
            [
                "pkgbuild",
                "--identifier",
                "digital.camer.soma.bundle",
                "--version",
                bundle_version,
                "--root",
                pkg_root,
                "--install-location",
                "/",
                pkg_out,
            ]
        )
        produced.append(pkg_out)

    # Desktop is embedded into the OS package; do not ship a standalone desktop artifact as part of the bundle release.

    outputs = {
        "bundle_version": bundle_version,
        "daemons_tag": daemons_tag,
        "daemons_version": daemons_version,
        "desktop_tag": desktop_tag,
        "desktop_version": desktop_version,
        "platform_out": platform_out,
        "staging_dir": staging,
        "produced": produced,
        "pages_url": pages_url,
    }
    out_json = os.path.join(platform_out, "outputs.json")
    write_text(out_json, json.dumps(outputs, indent=2))
    print(json.dumps(outputs))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

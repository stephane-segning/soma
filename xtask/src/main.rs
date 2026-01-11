use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;

use anyhow::{Context, Result, anyhow, bail};
use clap::{Args, Parser, Subcommand, ValueEnum};
use handlebars::{Handlebars, no_escape};
use regex::Regex;
use reqwest::blocking::Client;
use reqwest::header::{ACCEPT, AUTHORIZATION, USER_AGENT};
use serde::Deserialize;
use serde::Serialize;
use time::{OffsetDateTime, macros::format_description};
use tracing::{info, warn};

#[derive(Parser)]
#[command(name = "xtask", version, about = "Repo automation tasks for Soma")]
struct Cli {
    /// Enable verbose logging (repeat for debug).
    #[arg(long, global = true, action = clap::ArgAction::Count)]
    verbose: u8,

    /// Print commands without executing them.
    #[arg(long, global = true)]
    dry_run: bool,

    #[command(subcommand)]
    command: CommandKind,
}

#[derive(Subcommand)]
enum CommandKind {
    Version(VersionCmd),
    Release(ReleaseCmd),
}

#[derive(Args)]
struct VersionCmd {
    #[command(subcommand)]
    kind: VersionKind,
}

#[derive(Subcommand)]
enum VersionKind {
    /// Read workspace version from Cargo.toml workspace.package.version.
    Workspace {
        #[arg(long, default_value = "Cargo.toml")]
        path: PathBuf,
    },
    /// Read desktop app version from package.json.
    Desktop {
        #[arg(long, default_value = "desktop/soma-app/package.json")]
        path: PathBuf,
    },
}

#[derive(Args)]
struct ReleaseCmd {
    #[command(subcommand)]
    kind: ReleaseKind,
}

#[derive(Subcommand)]
enum ReleaseKind {
    Bundle(BundleArgs),
}

#[derive(Clone, Debug, ValueEnum)]
enum PlatformOs {
    Linux,
    Macos,
}

impl PlatformOs {
    fn as_str(&self) -> &'static str {
        match self {
            PlatformOs::Linux => "linux",
            PlatformOs::Macos => "macos",
        }
    }
}

#[derive(Clone, Debug, ValueEnum)]
enum PlatformArch {
    Amd64,
    Arm64,
}

impl PlatformArch {
    fn as_str(&self) -> &'static str {
        match self {
            PlatformArch::Amd64 => "amd64",
            PlatformArch::Arm64 => "arm64",
        }
    }
}

#[derive(Args)]
struct BundleArgs {
    /// Target OS (linux|macos). Defaults to env:BUNDLE_OS.
    #[arg(long, env = "BUNDLE_OS", value_enum)]
    os: PlatformOs,
    /// Target arch (amd64|arm64). Defaults to env:BUNDLE_ARCH.
    #[arg(long, env = "BUNDLE_ARCH", value_enum)]
    arch: PlatformArch,
    /// Output directory (per-OS/arch subdir created). Defaults to env:OUT_DIR or artifacts/bundle.
    #[arg(long, env = "OUT_DIR", default_value = "artifacts/bundle")]
    out_dir: PathBuf,
    /// Bundle version label. Defaults to env:BUNDLE_VERSION or timestamp.
    #[arg(long, env = "BUNDLE_VERSION")]
    bundle_version: Option<String>,
    /// Daemons release version (no leading v). Defaults to env:DAEMONS_VERSION or latest daemons-v*.
    #[arg(long, env = "DAEMONS_VERSION")]
    daemons_version: Option<String>,
    /// Desktop release version (no leading v). Defaults to env:DESKTOP_VERSION or latest desktop-v*.
    #[arg(long, env = "DESKTOP_VERSION")]
    desktop_version: Option<String>,
    /// Optional docker refs to embed in README.
    #[arg(long, env = "DOCKER_IMAGES")]
    docker_images: Option<String>,
    /// GitHub repo owner/name (defaults to env:GITHUB_REPOSITORY).
    #[arg(long, env = "GITHUB_REPOSITORY")]
    repo: Option<String>,
    /// GitHub token (defaults to env:GITHUB_TOKEN).
    #[arg(long, env = "GITHUB_TOKEN")]
    token: Option<String>,
}

#[derive(Clone)]
struct ExecContext {
    dry_run: bool,
}

fn main() -> Result<()> {
    let cli = Cli::parse();
    init_tracing(cli.verbose);

    let ctx = ExecContext {
        dry_run: cli.dry_run,
    };

    match cli.command {
        CommandKind::Version(cmd) => cmd.run(),
        CommandKind::Release(cmd) => cmd.run(&ctx),
    }
}

impl VersionCmd {
    fn run(&self) -> Result<()> {
        match &self.kind {
            VersionKind::Workspace { path } => {
                let version = read_workspace_version(path)?;
                println!("{version}");
            }
            VersionKind::Desktop { path } => {
                let version = read_desktop_version(path)?;
                println!("{version}");
            }
        }
        Ok(())
    }
}

impl ReleaseCmd {
    fn run(&self, ctx: &ExecContext) -> Result<()> {
        match &self.kind {
            ReleaseKind::Bundle(args) => args.run(ctx),
        }
    }
}

impl BundleArgs {
    fn run(&self, ctx: &ExecContext) -> Result<()> {
        let repo = self
            .repo
            .clone()
            .or_else(|| std::env::var("GITHUB_REPOSITORY").ok())
            .context("GITHUB_REPOSITORY or --repo is required")?;
        let token = self
            .token
            .clone()
            .or_else(|| std::env::var("GITHUB_TOKEN").ok())
            .context("GITHUB_TOKEN or --token is required")?;

        let client = GithubClient::new(token)?;

        let bundle_version = self
            .bundle_version
            .clone()
            .filter(|s| !s.trim().is_empty())
            .unwrap_or_else(|| current_timestamp_label());

        let (daemons_tag, daemons_version) = match self.daemons_version.clone() {
            Some(v) if !v.trim().is_empty() => (format!("daemons-v{v}"), v),
            _ => client.resolve_latest_tag(&repo, "daemons-v")?,
        };
        let (desktop_tag, desktop_version) = match self.desktop_version.clone() {
            Some(v) if !v.trim().is_empty() => (format!("desktop-v{v}"), v),
            _ => client.resolve_latest_tag(&repo, "desktop-v")?,
        };

        info!(
            "Using daemons={} desktop={} bundle_version={}",
            daemons_tag, desktop_tag, bundle_version
        );

        let rel_daemons = client.release_by_tag(&repo, &daemons_tag)?;
        let rel_desktop = client.release_by_tag(&repo, &desktop_tag)?;
        info!(
            "Release assets: daemons={:?} desktop={:?}",
            asset_names(&rel_daemons.assets),
            asset_names(&rel_desktop.assets)
        );

        let (daemon_asset, agent_asset, resolved_arch) = resolve_daemon_assets(
            &rel_daemons.assets,
            &daemons_version,
            self.os.as_str(),
            self.arch.as_str(),
        )?;
        let desktop_asset = resolve_desktop_asset(
            &rel_desktop.assets,
            &desktop_version,
            self.os.as_str(),
            &resolved_arch,
        )?;

        let platform_out = self
            .out_dir
            .join(format!("{}-{}", self.os.as_str(), resolved_arch));
        let staging = platform_out.join("staging");
        fs::create_dir_all(&staging)?;

        let daemon_tgz = staging.join(&daemon_asset.name);
        let agent_tgz = staging.join(&agent_asset.name);
        client.download_asset(&daemon_asset.url, &daemon_tgz)?;
        client.download_asset(&agent_asset.url, &agent_tgz)?;

        run_command(
            ctx,
            Command::new("tar")
                .arg("-xzf")
                .arg(&daemon_tgz)
                .arg("-C")
                .arg(&staging),
        )?;
        run_command(
            ctx,
            Command::new("tar")
                .arg("-xzf")
                .arg(&agent_tgz)
                .arg("-C")
                .arg(&staging),
        )?;

        let desktop_path = staging.join(&desktop_asset.name);
        client.download_asset(&desktop_asset.url, &desktop_path)?;

        let template_root = PathBuf::from(".github/packaging/templates");
        let pages_url = pages_url_from_repo(&repo);
        let ctx_map = build_template_ctx(
            "soma-daemon",
            &daemons_version,
            &desktop_version,
            &bundle_version,
            self.os.as_str(),
            &resolved_arch,
            "/usr/local",
            "digital.camer.soma.daemon",
            "digital.camer.soma.agentd",
            &pages_url,
            &pages_url,
            self.docker_images.clone(),
            &repo,
        );

        let readme_out = staging.join("README.md");
        render_template(
            &template_root.join("readme/README.md.j2"),
            &readme_out,
            &ctx_map,
        )?;

        let install_path = staging.join("install.sh");
        render_template(
            &template_root.join("install/install.sh.j2"),
            &install_path,
            &ctx_map,
        )?;
        make_executable(&install_path)?;
        let uninstall_path = staging.join("uninstall.sh");
        render_template(
            &template_root.join("install/uninstall.sh.j2"),
            &uninstall_path,
            &ctx_map,
        )?;
        make_executable(&uninstall_path)?;

        let mut produced = Vec::new();
        let install_out = platform_out.join("install.sh");
        copy_file(&install_path, &install_out)?;
        produced.push(path_string(&install_out));
        let uninstall_out = platform_out.join("uninstall.sh");
        copy_file(&uninstall_path, &uninstall_out)?;
        produced.push(path_string(&uninstall_out));

        // Service definitions.
        let systemd_path = staging.join("soma-daemon.service");
        render_template(
            &template_root.join("systemd/soma-daemon.service.j2"),
            &systemd_path,
            &ctx_map,
        )?;
        let systemd_agent_path = staging.join("soma-agentd.service");
        render_template(
            &template_root.join("systemd/soma-agentd.service.j2"),
            &systemd_agent_path,
            &ctx_map,
        )?;
        let plist_path = staging.join("soma-daemon.plist");
        render_template(
            &template_root.join("launchd/digital.camer.soma.daemon.plist.j2"),
            &plist_path,
            &ctx_map,
        )?;
        let plist_agent_path = staging.join("soma-agentd.plist");
        render_template(
            &template_root.join("launchd/digital.camer.soma.agentd.plist.j2"),
            &plist_agent_path,
            &ctx_map,
        )?;

        if matches!(self.os, PlatformOs::Linux) {
            build_linux_packages(
                ctx,
                &platform_out,
                &staging,
                &systemd_path,
                &systemd_agent_path,
                &desktop_path,
                &bundle_version,
                &resolved_arch,
                &pages_url,
                &mut produced,
            )?;
        } else {
            build_macos_package(
                ctx,
                &platform_out,
                &staging,
                &plist_path,
                &plist_agent_path,
                &desktop_asset.name,
                &desktop_path,
                &bundle_version,
                &resolved_arch,
                &pages_url,
                &mut produced,
            )?;
        }

        let outputs = BundleOutputs {
            bundle_version,
            daemons_tag,
            daemons_version,
            desktop_tag,
            desktop_version,
            platform_out: path_string(&platform_out),
            staging_dir: path_string(&staging),
            produced: produced.clone(),
            pages_url,
        };

        let outputs_json = serde_json::to_string_pretty(&outputs)?;
        let outputs_path = platform_out.join("outputs.json");
        fs::create_dir_all(outputs_path.parent().unwrap())?;
        fs::write(&outputs_path, &outputs_json)?;

        println!("{}", serde_json::to_string(&outputs)?);
        Ok(())
    }
}

fn init_tracing(verbose: u8) {
    let level = match verbose {
        0 => "info",
        1 => "debug",
        _ => "trace",
    };
    let filter = std::env::var("RUST_LOG").unwrap_or_else(|_| level.to_string());
    tracing_subscriber::fmt()
        .with_env_filter(filter)
        .with_writer(std::io::stderr)
        .init();
}

fn read_workspace_version(path: &Path) -> Result<String> {
    let text =
        fs::read_to_string(path).with_context(|| format!("reading {}", path_string(path)))?;
    let value: toml::Value =
        toml::from_str(&text).with_context(|| format!("parsing TOML at {}", path_string(path)))?;
    value
        .get("workspace")
        .and_then(|w| w.get("package"))
        .and_then(|p| p.get("version"))
        .and_then(|v| v.as_str())
        .map(|s| s.to_owned())
        .ok_or_else(|| {
            anyhow!(
                "workspace.package.version not found in {}",
                path_string(path)
            )
        })
}

fn read_desktop_version(path: &Path) -> Result<String> {
    let text =
        fs::read_to_string(path).with_context(|| format!("reading {}", path_string(path)))?;
    let value: serde_json::Value = serde_json::from_str(&text)
        .with_context(|| format!("parsing JSON at {}", path_string(path)))?;
    value
        .get("version")
        .and_then(|v| v.as_str())
        .map(|s| s.to_owned())
        .ok_or_else(|| anyhow!("version not found in {}", path_string(path)))
}

#[derive(Serialize)]
struct BundleOutputs {
    bundle_version: String,
    daemons_tag: String,
    daemons_version: String,
    desktop_tag: String,
    desktop_version: String,
    platform_out: String,
    staging_dir: String,
    produced: Vec<String>,
    pages_url: String,
}

#[derive(Clone, Debug, Deserialize)]
struct Release {
    tag_name: Option<String>,
    assets: Vec<Asset>,
}

#[derive(Clone, Debug, Deserialize)]
struct Asset {
    name: String,
    url: String,
}

struct GithubClient {
    client: Client,
    token: String,
}

impl GithubClient {
    fn new(token: String) -> Result<Self> {
        let client = Client::builder()
            .user_agent("soma-xtask")
            .build()
            .context("building HTTP client")?;
        Ok(Self { client, token })
    }

    fn resolve_latest_tag(&self, repo: &str, prefix: &str) -> Result<(String, String)> {
        let releases: Vec<Release> = self.get_json(&format!(
            "https://api.github.com/repos/{repo}/releases?per_page=100"
        ))?;
        for rel in releases {
            if let Some(tag) = rel.tag_name {
                if tag.starts_with(prefix) {
                    let version = tag
                        .strip_prefix(prefix)
                        .map(str::to_owned)
                        .unwrap_or(tag.clone());
                    return Ok((tag, version));
                }
            }
        }
        bail!("no GitHub release found with tag prefix {prefix}");
    }

    fn release_by_tag(&self, repo: &str, tag: &str) -> Result<Release> {
        self.get_json(&format!(
            "https://api.github.com/repos/{repo}/releases/tags/{tag}"
        ))
    }

    fn download_asset(&self, url: &str, dest: &Path) -> Result<()> {
        fs::create_dir_all(
            dest.parent()
                .ok_or_else(|| anyhow!("missing parent for {}", path_string(dest)))?,
        )?;
        info!("Downloading {} -> {}", url, path_string(dest));
        if dest.exists() && dest.is_file() {
            fs::remove_file(dest)?;
        }
        let mut resp = self
            .client
            .get(url)
            .header(USER_AGENT, "soma-xtask")
            .header(ACCEPT, "application/octet-stream")
            .header(AUTHORIZATION, format!("Bearer {}", self.token))
            .send()
            .with_context(|| format!("downloading asset {url}"))?
            .error_for_status()
            .with_context(|| format!("HTTP error downloading asset {url}"))?;
        let mut file = fs::File::create(dest)?;
        std::io::copy(&mut resp, &mut file)?;
        Ok(())
    }

    fn get_json<T: for<'de> Deserialize<'de>>(&self, url: &str) -> Result<T> {
        let resp = self
            .client
            .get(url)
            .header(USER_AGENT, "soma-xtask")
            .header(ACCEPT, "application/vnd.github+json")
            .header(AUTHORIZATION, format!("Bearer {}", self.token))
            .send()
            .with_context(|| format!("GET {url}"))?
            .error_for_status()
            .with_context(|| format!("HTTP error from {url}"))?;
        Ok(resp
            .json()
            .with_context(|| format!("parsing JSON from {url}"))?)
    }
}

fn resolve_daemon_assets(
    assets: &[Asset],
    version: &str,
    os: &str,
    arch: &str,
) -> Result<(Asset, Asset, String)> {
    for candidate_arch in arch_aliases(arch) {
        let pat_daemon = format!(
            "soma-daemon-{}-{}-{}\\.tar\\.gz",
            regex::escape(version),
            regex::escape(os),
            regex::escape(&candidate_arch)
        );
        let pat_agent = format!(
            "soma-agentd-{}-{}-{}\\.tar\\.gz",
            regex::escape(version),
            regex::escape(os),
            regex::escape(&candidate_arch)
        );

        let daemon = find_asset(assets, &pat_daemon);
        let agent = find_asset(assets, &pat_agent);
        if let (Ok(d), Ok(a)) = (daemon, agent) {
            return Ok((d.clone(), a.clone(), candidate_arch));
        }
    }
    bail!(
        "daemon/agent assets not found for {}-{} (aliases tried: {:?})",
        os,
        arch,
        arch_aliases(arch)
    )
}

fn resolve_desktop_asset(assets: &[Asset], version: &str, os: &str, arch: &str) -> Result<Asset> {
    let candidates = ["AppImage", "tar.gz", "app", "zip"];
    for ext in candidates {
        let pat = if ext == "app" {
            format!(
                "soma-desktop-{}-{}-{}\\.app",
                regex::escape(version),
                regex::escape(os),
                regex::escape(arch)
            )
        } else {
            format!(
                "soma-desktop-{}-{}-{}\\.{}",
                regex::escape(version),
                regex::escape(os),
                regex::escape(arch),
                regex::escape(ext)
            )
        };
        if let Ok(asset) = find_asset(assets, &pat) {
            return Ok(asset.clone());
        }
    }
    bail!(
        "desktop artifact not found for {}-{} ({})",
        os,
        arch,
        version
    )
}

fn find_asset(assets: &[Asset], pattern: &str) -> Result<Asset> {
    let anchored = Regex::new(&format!("^(?:{pattern})$"))?;
    if let Some(asset) = assets.iter().find(|a| anchored.is_match(&a.name)) {
        return Ok(asset.clone());
    }
    let rx = Regex::new(pattern)?;
    if let Some(asset) = assets.iter().find(|a| rx.is_match(&a.name)) {
        warn!(
            "Fallback regex match for pattern={} -> {}",
            pattern, asset.name
        );
        return Ok(asset.clone());
    }
    bail!(
        "asset not found: pattern={} available={:?}",
        pattern,
        asset_names(assets)
    )
}

fn arch_aliases(arch: &str) -> Vec<String> {
    match arch {
        "arm64" => vec!["arm64".into(), "aarch64".into()],
        "amd64" => vec!["amd64".into(), "x86_64".into()],
        other => vec![other.into()],
    }
}

fn pages_url_from_repo(repo: &str) -> String {
    let mut parts = repo.splitn(2, '/');
    let owner = parts.next().unwrap_or("unknown");
    let name = parts.next().unwrap_or("repo");
    format!("https://{owner}.github.io/{name}/")
}

fn build_linux_packages(
    ctx: &ExecContext,
    platform_out: &Path,
    staging: &Path,
    systemd_daemon: &Path,
    systemd_agent: &Path,
    desktop_path: &Path,
    bundle_version: &str,
    arch: &str,
    pages_url: &str,
    produced: &mut Vec<String>,
) -> Result<()> {
    let rpm_arch = match arch {
        "amd64" => "x86_64",
        "arm64" => "aarch64",
        other => other,
    };
    let pkgroot = platform_out.join("pkgroot");
    if pkgroot.exists() {
        fs::remove_dir_all(&pkgroot)?;
    }
    fs::create_dir_all(pkgroot.join("usr/local/bin"))?;
    fs::create_dir_all(pkgroot.join("usr/local/share/soma"))?;
    fs::create_dir_all(pkgroot.join("usr/lib/systemd/system"))?;

    copy_file(
        &staging.join("soma-daemon"),
        &pkgroot.join("usr/local/bin/soma-daemon"),
    )?;
    copy_file(
        &staging.join("soma-agentd"),
        &pkgroot.join("usr/local/bin/soma-agentd"),
    )?;
    copy_file(
        &staging.join("README.md"),
        &pkgroot.join("usr/local/share/soma/README.md"),
    )?;
    copy_file(
        systemd_daemon,
        &pkgroot.join("usr/lib/systemd/system/soma-daemon.service"),
    )?;
    copy_file(
        systemd_agent,
        &pkgroot.join("usr/lib/systemd/system/soma-agentd.service"),
    )?;

    if !desktop_path
        .file_name()
        .and_then(|n| n.to_str())
        .map(|n| n.ends_with(".AppImage"))
        .unwrap_or(false)
    {
        bail!(
            "unexpected linux desktop artifact (expected .AppImage): {}",
            path_string(desktop_path)
        );
    }
    let appimage_dst = pkgroot.join("usr/local/bin/soma-app.AppImage");
    copy_file(desktop_path, &appimage_dst)?;
    let app_symlink = pkgroot.join("usr/local/bin/soma-app");
    if app_symlink.exists() || app_symlink.is_symlink() {
        fs::remove_file(&app_symlink)?;
    }
    create_symlink(Path::new("soma-app.AppImage"), &app_symlink)?;

    let deb_out = platform_out.join(format!("soma-bundle-{bundle_version}-linux-{arch}.deb"));
    let rpm_out = platform_out.join(format!("soma-bundle-{bundle_version}-linux-{arch}.rpm"));
    for (fmt, outp, fmt_arch) in [
        ("deb", deb_out.as_path(), arch),
        ("rpm", rpm_out.as_path(), rpm_arch),
    ] {
        run_command(
            ctx,
            Command::new("fpm")
                .arg("-s")
                .arg("dir")
                .arg("-t")
                .arg(fmt)
                .arg("-n")
                .arg("soma-bundle")
                .arg("-v")
                .arg(bundle_version)
                .arg("-a")
                .arg(fmt_arch)
                .arg("--description")
                .arg("Soma bundle (daemon + agentd + desktop app)")
                .arg("--url")
                .arg(pages_url)
                .arg("--prefix")
                .arg("/")
                .arg("-C")
                .arg(&pkgroot)
                .arg("-p")
                .arg(outp)
                .arg("."),
        )?;
        produced.push(path_string(outp));
    }

    Ok(())
}

fn build_macos_package(
    ctx: &ExecContext,
    platform_out: &Path,
    staging: &Path,
    plist_daemon: &Path,
    plist_agent: &Path,
    desktop_asset_name: &str,
    desktop_path: &Path,
    bundle_version: &str,
    arch: &str,
    pages_url: &str,
    produced: &mut Vec<String>,
) -> Result<()> {
    let pkg_root = platform_out.join("pkgroot");
    if pkg_root.exists() {
        fs::remove_dir_all(&pkg_root)?;
    }
    fs::create_dir_all(pkg_root.join("usr/local/bin"))?;
    fs::create_dir_all(pkg_root.join("usr/local/share/soma"))?;
    fs::create_dir_all(pkg_root.join("Library/LaunchDaemons"))?;
    fs::create_dir_all(pkg_root.join("Applications"))?;

    copy_file(
        &staging.join("soma-daemon"),
        &pkg_root.join("usr/local/bin/soma-daemon"),
    )?;
    copy_file(
        &staging.join("soma-agentd"),
        &pkg_root.join("usr/local/bin/soma-agentd"),
    )?;
    copy_file(
        &staging.join("README.md"),
        &pkg_root.join("usr/local/share/soma/README.md"),
    )?;
    copy_file(
        plist_daemon,
        &pkg_root.join("Library/LaunchDaemons/digital.camer.soma.daemon.plist"),
    )?;
    copy_file(
        plist_agent,
        &pkg_root.join("Library/LaunchDaemons/digital.camer.soma.agentd.plist"),
    )?;

    let app_name = "soma-app.app";
    let staged_app = if desktop_asset_name.ends_with(".tar.gz") {
        run_command(
            ctx,
            Command::new("tar")
                .arg("-xzf")
                .arg(desktop_path)
                .arg("-C")
                .arg(staging),
        )?;
        staging.join(app_name)
    } else if desktop_asset_name.ends_with(".app") {
        desktop_path.to_path_buf()
    } else {
        bail!(
            "unexpected macOS desktop artifact (expected .tar.gz or .app): {}",
            desktop_asset_name
        );
    };
    if !staged_app.is_dir() {
        bail!(
            "expected .app bundle not found after extract: {}",
            path_string(&staged_app)
        );
    }
    let app_dst = pkg_root.join("Applications").join(app_name);
    if app_dst.exists() {
        fs::remove_dir_all(&app_dst)?;
    }
    copy_dir(&staged_app, &app_dst)?;

    let pkg_out = platform_out.join(format!("soma-bundle-{bundle_version}-macos-{arch}.pkg"));
    run_command(
        ctx,
        Command::new("pkgbuild")
            .arg("--identifier")
            .arg("digital.camer.soma.bundle")
            .arg("--version")
            .arg(bundle_version)
            .arg("--root")
            .arg(&pkg_root)
            .arg("--install-location")
            .arg("/")
            .arg(&pkg_out),
    )?;
    produced.push(path_string(&pkg_out));

    info!(
        "Package built (macOS): {} (docs at {})",
        path_string(&pkg_out),
        pages_url
    );
    Ok(())
}

fn render_template(template_path: &Path, dest: &Path, ctx: &HashMap<String, String>) -> Result<()> {
    let text = fs::read_to_string(template_path)
        .with_context(|| format!("reading template {}", path_string(template_path)))?;
    let rendered = render_template_text(&text, ctx)
        .with_context(|| format!("rendering template {}", path_string(template_path)))?;
    if let Some(parent) = dest.parent() {
        fs::create_dir_all(parent)?;
    }
    fs::write(dest, rendered)
        .with_context(|| format!("writing rendered template {}", path_string(dest)))?;
    Ok(())
}

fn render_template_text(text: &str, ctx: &HashMap<String, String>) -> Result<String> {
    let mut handlebars = Handlebars::new();
    handlebars.register_escape_fn(no_escape);
    handlebars.set_strict_mode(true);

    handlebars
        .render_template(text, ctx)
        .map_err(|err| anyhow!(err))
}

fn run_command(ctx: &ExecContext, cmd: &mut Command) -> Result<()> {
    let cmd_str = format!("{:?}", cmd);
    if ctx.dry_run {
        info!("[dry-run] {}", cmd_str);
        return Ok(());
    }
    info!("+ {}", cmd_str);
    let status = cmd
        .status()
        .with_context(|| format!("running {}", cmd_str))?;
    if !status.success() {
        bail!("command failed: {} (status {:?})", cmd_str, status.code());
    }
    Ok(())
}

fn make_executable(path: &Path) -> Result<()> {
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let mut perms = fs::metadata(path)?.permissions();
        perms.set_mode(0o755);
        fs::set_permissions(path, perms)?;
    }
    Ok(())
}

fn copy_file(src: &Path, dst: &Path) -> Result<()> {
    if let Some(parent) = dst.parent() {
        fs::create_dir_all(parent)?;
    }
    fs::copy(src, dst)
        .with_context(|| format!("copying {} -> {}", path_string(src), path_string(dst)))?;
    Ok(())
}

fn copy_dir(src: &Path, dst: &Path) -> Result<()> {
    fs::create_dir_all(dst)?;
    for entry in fs::read_dir(src)? {
        let entry = entry?;
        let entry_path = entry.path();
        let target = dst.join(entry.file_name());
        if entry_path.is_dir() {
            copy_dir(&entry_path, &target)?;
        } else {
            copy_file(&entry_path, &target)?;
        }
    }
    Ok(())
}

fn create_symlink(src: &Path, dst: &Path) -> Result<()> {
    #[cfg(unix)]
    {
        std::os::unix::fs::symlink(src, dst).with_context(|| {
            format!(
                "creating symlink {} -> {}",
                path_string(dst),
                path_string(src)
            )
        })?;
    }
    #[cfg(not(unix))]
    {
        // Fallback: copy to keep behavior similar on non-Unix hosts.
        copy_file(src, dst)?;
    }
    Ok(())
}

fn current_timestamp_label() -> String {
    let fmt = format_description!("[year][month][day]-[hour][minute][second]");
    OffsetDateTime::now_utc()
        .format(fmt)
        .unwrap_or_else(|_| "00000000-000000".to_string())
}

fn asset_names(assets: &[Asset]) -> Vec<String> {
    assets.iter().map(|a| a.name.clone()).collect()
}

fn path_string(path: &Path) -> String {
    path.to_string_lossy().into_owned()
}

#[allow(clippy::too_many_arguments)]
fn build_template_ctx(
    name: &str,
    version: &str,
    desktop_version: &str,
    bundle_version: &str,
    os: &str,
    arch: &str,
    install_prefix: &str,
    service_label_daemon: &str,
    service_label_agent: &str,
    homepage: &str,
    docs_url: &str,
    docker_images: Option<String>,
    repo: &str,
) -> HashMap<String, String> {
    let mut map = HashMap::new();
    map.insert("name".into(), name.to_string());
    map.insert("version".into(), version.to_string());
    map.insert("desktop_version".into(), desktop_version.to_string());
    map.insert("bundle_version".into(), bundle_version.to_string());
    map.insert("os".into(), os.to_string());
    map.insert("arch".into(), arch.to_string());
    map.insert("install_prefix".into(), install_prefix.to_string());
    map.insert(
        "service_label_daemon".into(),
        service_label_daemon.to_string(),
    );
    map.insert(
        "service_label_agent".into(),
        service_label_agent.to_string(),
    );
    map.insert("homepage".into(), homepage.to_string());
    map.insert("docs_url".into(), docs_url.to_string());
    map.insert(
        "docker_images".into(),
        docker_images
            .filter(|s| !s.trim().is_empty())
            .unwrap_or_else(|| "None specified.".to_string()),
    );
    map.insert("repo".into(), repo.to_string());
    map
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    #[test]
    fn workspace_version_is_read() {
        let dir = tempdir().unwrap();
        let path = dir.path().join("Cargo.toml");
        fs::write(
            &path,
            r#"
[workspace]
[workspace.package]
version = "1.2.3"
        "#,
        )
        .unwrap();
        let v = read_workspace_version(&path).unwrap();
        assert_eq!(v, "1.2.3");
    }

    #[test]
    fn desktop_version_is_read() {
        let dir = tempdir().unwrap();
        let path = dir.path().join("package.json");
        fs::write(&path, r#"{ "version": "9.9.9" }"#).unwrap();
        let v = read_desktop_version(&path).unwrap();
        assert_eq!(v, "9.9.9");
    }

    #[test]
    fn template_rendering_uses_handlebars() {
        let mut ctx = HashMap::new();
        ctx.insert("name".into(), "soma".into());
        ctx.insert("arch".into(), "amd64".into());
        let rendered = render_template_text("hello {{name}} {{arch}}", &ctx).unwrap();
        assert_eq!(rendered, "hello soma amd64");
    }

    #[test]
    fn template_rendering_fails_on_missing_vars() {
        let ctx = HashMap::<String, String>::new();
        let err = render_template_text("hello {{missing}}", &ctx).unwrap_err();
        assert!(err.to_string().contains("missing"));
    }
}

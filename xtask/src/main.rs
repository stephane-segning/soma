use std::fs;
use std::path::{Path, PathBuf};

use anyhow::{Context, Result, anyhow};
use clap::{Parser, Subcommand};

#[derive(Parser)]
#[command(name = "xtask", version, about = "Repo automation tasks for Soma")]
struct Cli {
    #[command(subcommand)]
    command: CommandKind,
}

#[derive(Subcommand)]
enum CommandKind {
    Version {
        #[command(subcommand)]
        command: VersionCmd,
    },
}

#[derive(Subcommand)]
enum VersionCmd {
    /// Read workspace version from Cargo.toml workspace.package.version.
    Workspace {
        #[arg(long, default_value = "Cargo.toml")]
        path: PathBuf,
    },
}

fn main() -> Result<()> {
    let cli = Cli::parse();
    match cli.command {
        CommandKind::Version { command } => command.run(),
    }
}

impl VersionCmd {
    fn run(&self) -> Result<()> {
        match self {
            VersionCmd::Workspace { path } => {
                let version = read_workspace_version(path)?;
                println!("{version}");
            }
        }
        Ok(())
    }
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

fn path_string(path: &Path) -> String {
    path.to_string_lossy().into_owned()
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
}

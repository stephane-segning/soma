use crate::{icns::create_icns, ico::create_ico, paths::resolve_path, png::create_pngs};
use anyhow::{Context, Result};
use clap::Parser;
use std::path::PathBuf;

#[derive(Parser)]
#[command(name = "desktp-icons", about = "Generate electron icon assets")]
pub struct Cli {
    #[arg(short, long, default_value = "./icon.png", help = "Input PNG or SVG file.")]
    input: PathBuf,
    #[arg(short, long, default_value = "./")]
    output: PathBuf,
    #[arg(short, long, default_value_t = false)]
    flatten: bool,
}

pub fn run(cli: Cli) -> Result<()> {
    let cwd = std::env::current_dir().context("read current directory")?;
    let input_path = resolve_path(&cwd, &cli.input);
    let output_path = resolve_path(&cwd, &cli.output);

    let icons_root = output_path.join("icons");
    let png_output_dir = if cli.flatten {
        icons_root.clone()
    } else {
        icons_root.join("png")
    };
    let mac_output_dir = if cli.flatten {
        icons_root.clone()
    } else {
        icons_root.join("mac")
    };
    let win_output_dir = if cli.flatten {
        icons_root
    } else {
        icons_root.join("win")
    };

    create_pngs(&input_path, &png_output_dir)?;
    create_icns(&png_output_dir, &mac_output_dir)?;
    create_ico(&png_output_dir, &win_output_dir)?;

    println!("Renaming PNGs to Electron Format");
    crate::png::rename_pngs(&png_output_dir)?;
    println!("\n ALL DONE");

    Ok(())
}

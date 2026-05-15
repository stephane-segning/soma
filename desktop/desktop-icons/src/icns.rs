use crate::png::PNG_SIZES;
use anyhow::{Context, Result};
use icns::{IconFamily, IconType, Image};
use std::{
    fs,
    fs::File,
    io::{BufReader, BufWriter},
    path::Path,
    process::Command,
};

pub fn create_icns(png_output_dir: &Path, mac_output_dir: &Path) -> Result<()> {
    fs::create_dir_all(mac_output_dir)
        .with_context(|| format!("create output directory {}", mac_output_dir.display()))?;

    let mut iconutil_ok = false;
    if cfg!(target_os = "macos") {
        match create_icns_with_iconutil(png_output_dir, mac_output_dir) {
            Ok(()) => iconutil_ok = true,
            Err(error) => eprintln!("iconutil failed: {error}; falling back to Rust icns"),
        }
    }

    if !iconutil_ok {
        create_icns_with_rust(png_output_dir, mac_output_dir)?;
    }

    create_legacy_icns(png_output_dir, mac_output_dir)
}

fn create_icns_with_rust(png_output_dir: &Path, mac_output_dir: &Path) -> Result<()> {
    write_icon_family(
        png_output_dir,
        &mac_output_dir.join("icon.icns"),
        icon_type_for_size,
    )
}

fn create_legacy_icns(png_output_dir: &Path, mac_output_dir: &Path) -> Result<()> {
    write_icon_family(
        png_output_dir,
        &mac_output_dir.join("icon-legacy.icns"),
        legacy_icon_type_for_size,
    )
}

fn write_icon_family(
    png_output_dir: &Path,
    icns_path: &Path,
    icon_type_for_size: fn(u32) -> Option<IconType>,
) -> Result<()> {
    let mut icon_family = IconFamily::new();
    for size in PNG_SIZES {
        let Some(icon_type) = icon_type_for_size(size) else {
            continue;
        };
        let file_path = png_output_dir.join(format!("{size}.png"));
        let file = BufReader::new(
            File::open(&file_path).with_context(|| format!("open {}", file_path.display()))?,
        );
        let image =
            Image::read_png(file).with_context(|| format!("read png {}", file_path.display()))?;
        icon_family
            .add_icon_with_type(&image, icon_type)
            .with_context(|| format!("add png {} as {:?}", file_path.display(), icon_type))?;
    }

    let file = BufWriter::new(
        File::create(icns_path).with_context(|| format!("create {}", icns_path.display()))?,
    );
    icon_family
        .write(file)
        .with_context(|| format!("write {}", icns_path.display()))
}

fn create_icns_with_iconutil(png_output_dir: &Path, mac_output_dir: &Path) -> Result<()> {
    let iconset_dir = mac_output_dir.join("icon.iconset");
    fs::create_dir_all(&iconset_dir)
        .with_context(|| format!("create iconset {}", iconset_dir.display()))?;

    for (size, name) in iconutil_mappings() {
        let source = png_output_dir.join(format!("{size}.png"));
        let dest = iconset_dir.join(name);
        fs::copy(&source, &dest)
            .with_context(|| format!("copy {} to {}", source.display(), dest.display()))?;
    }

    let icns_path = mac_output_dir.join("icon.icns");
    let output = Command::new("iconutil")
        .arg("-c")
        .arg("icns")
        .arg("-o")
        .arg(&icns_path)
        .arg(&iconset_dir)
        .output()
        .context("spawn iconutil")?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        anyhow::bail!("iconutil failed: {stderr}");
    }

    let _ = fs::remove_dir_all(&iconset_dir);
    Ok(())
}

fn iconutil_mappings() -> [(u32, &'static str); 10] {
    [
        (16, "icon_16x16.png"),
        (32, "icon_16x16@2x.png"),
        (32, "icon_32x32.png"),
        (64, "icon_32x32@2x.png"),
        (128, "icon_128x128.png"),
        (256, "icon_128x128@2x.png"),
        (256, "icon_256x256.png"),
        (512, "icon_256x256@2x.png"),
        (512, "icon_512x512.png"),
        (1024, "icon_512x512@2x.png"),
    ]
}

fn icon_type_for_size(size: u32) -> Option<IconType> {
    match size {
        16 => Some(IconType::RGBA32_16x16),
        32 => Some(IconType::RGBA32_32x32),
        64 => Some(IconType::RGBA32_64x64),
        128 => Some(IconType::RGBA32_128x128),
        256 => Some(IconType::RGBA32_256x256),
        512 => Some(IconType::RGBA32_512x512),
        1024 => Some(IconType::RGBA32_512x512_2x),
        _ => None,
    }
}

fn legacy_icon_type_for_size(size: u32) -> Option<IconType> {
    match size {
        16 => Some(IconType::RGB24_16x16),
        32 => Some(IconType::RGB24_32x32),
        48 => Some(IconType::RGB24_48x48),
        128 => Some(IconType::RGB24_128x128),
        _ => None,
    }
}

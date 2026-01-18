use anyhow::{Context, Result};
use clap::Parser;
use ico::{IconDir, IconDirEntry, IconImage, ResourceType};
use icns::{IconFamily, IconType, Image};
use image::ImageFormat;
use resvg::{tiny_skia, usvg};
use std::fs;
use std::fs::File;
use std::io::{BufReader, BufWriter};
use std::path::{Path, PathBuf};
use std::process::Command;

const PNG_SIZES: [u32; 9] = [16, 24, 32, 48, 64, 128, 256, 512, 1024];

#[derive(Parser)]
#[command(name = "desktp-icons", about = "Generate electron icon assets")]
struct Cli {
    #[arg(short, long, default_value = "./icon.png", help = "Input PNG or SVG file.")]
    input: PathBuf,
    #[arg(short, long, default_value = "./")]
    output: PathBuf,
    #[arg(short, long, default_value_t = false)]
    flatten: bool,
}

fn main() -> Result<()> {
    let cli = Cli::parse();
    run(cli)
}

fn run(cli: Cli) -> Result<()> {
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
        icons_root.clone()
    } else {
        icons_root.join("win")
    };

    create_pngs(&input_path, &png_output_dir)?;
    create_icns(&png_output_dir, &mac_output_dir)?;
    create_ico(&png_output_dir, &win_output_dir)?;

    println!("Renaming PNGs to Electron Format");
    rename_pngs(&png_output_dir)?;
    println!("\n ALL DONE");

    Ok(())
}

fn create_pngs(input_path: &Path, png_output_dir: &Path) -> Result<()> {
    fs::create_dir_all(png_output_dir)
        .with_context(|| format!("create output directory {}", png_output_dir.display()))?;

    let extension = input_path
        .extension()
        .and_then(|ext| ext.to_str())
        .unwrap_or_default()
        .to_ascii_lowercase();

    if extension == "svg" || extension == "svgz" {
        create_pngs_from_svg(input_path, png_output_dir)
    } else {
        create_pngs_from_raster(input_path, png_output_dir)
    }
}

fn create_pngs_from_raster(input_path: &Path, png_output_dir: &Path) -> Result<()> {
    let base_image = image::open(input_path)
        .with_context(|| format!("read input image {}", input_path.display()))?;

    for size in PNG_SIZES {
        let file_name = format!("{size}.png");
        let output_path = png_output_dir.join(file_name);
        let resized = base_image.resize_exact(size, size, image::imageops::FilterType::Lanczos3);
        resized
            .save_with_format(&output_path, ImageFormat::Png)
            .with_context(|| format!("write png {}", output_path.display()))?;
        println!("Created {}", output_path.display());
    }

    Ok(())
}

fn create_pngs_from_svg(input_path: &Path, png_output_dir: &Path) -> Result<()> {
    let mut svg_data = fs::read(input_path)
        .with_context(|| format!("read input svg {}", input_path.display()))?;

    if svg_data.starts_with(&[0x1f, 0x8b]) {
        svg_data = usvg::decompress_svgz(&svg_data)
            .context("decompress svgz payload")?;
    }

    let svg_string =
        std::str::from_utf8(&svg_data).context("svg content is not valid UTF-8")?;

    let xml_options = usvg::roxmltree::ParsingOptions {
        allow_dtd: true,
        ..Default::default()
    };
    let xml_tree = usvg::roxmltree::Document::parse_with_options(svg_string, xml_options)
        .context("parse svg xml")?;

    let mut options = usvg::Options::default();
    options.fontdb_mut().load_system_fonts();

    let tree = usvg::Tree::from_xmltree(&xml_tree, &options).context("parse svg tree")?;
    let tree_size = tree.size();
    let width = tree_size.width();
    let height = tree_size.height();

    if width <= 0.0 || height <= 0.0 {
        anyhow::bail!("svg has invalid size: {width}x{height}");
    }

    for size in PNG_SIZES {
        let file_name = format!("{size}.png");
        let output_path = png_output_dir.join(file_name);
        let mut pixmap = tiny_skia::Pixmap::new(size, size)
            .context("create svg render surface")?;
        let scale_x = size as f32 / width;
        let scale_y = size as f32 / height;
        let transform = tiny_skia::Transform::from_scale(scale_x, scale_y);
        resvg::render(&tree, transform, &mut pixmap.as_mut());
        let png = image::RgbaImage::from_raw(size, size, pixmap.data().to_vec())
            .context("convert svg render to rgba image")?;
        png.save_with_format(&output_path, ImageFormat::Png)
            .with_context(|| format!("write png {}", output_path.display()))?;
        println!("Created {}", output_path.display());
    }

    Ok(())
}

fn create_icns(png_output_dir: &Path, mac_output_dir: &Path) -> Result<()> {
    fs::create_dir_all(mac_output_dir)
        .with_context(|| format!("create output directory {}", mac_output_dir.display()))?;

    if cfg!(target_os = "macos") {
        match create_icns_with_iconutil(png_output_dir, mac_output_dir) {
            Ok(()) => return Ok(()),
            Err(error) => {
                eprintln!("iconutil failed: {error}; falling back to Rust icns");
            }
        }
    }

    create_icns_with_rust(png_output_dir, mac_output_dir)
}

fn create_icns_with_rust(png_output_dir: &Path, mac_output_dir: &Path) -> Result<()> {
    let mut icon_family = IconFamily::new();
    for size in PNG_SIZES {
        let Some(icon_type) = icon_type_for_size(size) else {
            println!("Skipping ICNS size {size}x{size} (unsupported)");
            continue;
        };
        let file_path = png_output_dir.join(format!("{size}.png"));
        let file = BufReader::new(
            File::open(&file_path).with_context(|| format!("open {}", file_path.display()))?,
        );
        let image = Image::read_png(file)
            .with_context(|| format!("read png {}", file_path.display()))?;
        icon_family
            .add_icon_with_type(&image, icon_type)
            .with_context(|| format!("add png {} as {:?}", file_path.display(), icon_type))?;
    }

    let icns_path = mac_output_dir.join("icon.icns");
    let file = BufWriter::new(
        File::create(&icns_path).with_context(|| format!("create {}", icns_path.display()))?,
    );
    icon_family
        .write(file)
        .with_context(|| format!("write {}", icns_path.display()))?;

    Ok(())
}

fn create_icns_with_iconutil(png_output_dir: &Path, mac_output_dir: &Path) -> Result<()> {
    let iconset_dir = mac_output_dir.join("icon.iconset");
    fs::create_dir_all(&iconset_dir)
        .with_context(|| format!("create iconset {}", iconset_dir.display()))?;

    let mappings = [
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
    ];

    for (size, name) in mappings {
        let source = png_output_dir.join(format!("{size}.png"));
        let dest = iconset_dir.join(name);
        fs::copy(&source, &dest).with_context(|| {
            format!(
                "copy {} to {}",
                source.display(),
                dest.display()
            )
        })?;
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

fn create_ico(png_output_dir: &Path, win_output_dir: &Path) -> Result<()> {
    fs::create_dir_all(win_output_dir)
        .with_context(|| format!("create output directory {}", win_output_dir.display()))?;

    let mut icon_dir = IconDir::new(ResourceType::Icon);
    for size in PNG_SIZES {
        let file_path = png_output_dir.join(format!("{size}.png"));
        let file = BufReader::new(
            File::open(&file_path).with_context(|| format!("open {}", file_path.display()))?,
        );
        let image = IconImage::read_png(file)
            .with_context(|| format!("read png {}", file_path.display()))?;
        let entry = IconDirEntry::encode(&image)
            .with_context(|| format!("encode png {}", file_path.display()))?;
        icon_dir.add_entry(entry);
    }

    let ico_path = win_output_dir.join("icon.ico");
    let file = File::create(&ico_path).with_context(|| format!("create {}", ico_path.display()))?;
    icon_dir
        .write(file)
        .with_context(|| format!("write {}", ico_path.display()))?;

    Ok(())
}

fn rename_pngs(png_output_dir: &Path) -> Result<()> {
    for size in PNG_SIZES {
        let start_name = format!("{size}.png");
        let end_name = format!("{size}x{size}.png");
        let start_path = png_output_dir.join(&start_name);
        let end_path = png_output_dir.join(&end_name);
        fs::rename(&start_path, &end_path).with_context(|| {
            format!("rename {} to {}", start_path.display(), end_path.display())
        })?;
        println!("Renamed {start_name} to {end_name}");
    }

    Ok(())
}

fn resolve_path(cwd: &Path, path: &Path) -> PathBuf {
    if path.is_absolute() {
        path.to_path_buf()
    } else {
        cwd.join(path)
    }
}

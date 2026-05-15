use anyhow::{Context, Result};
use image::ImageFormat;
use resvg::{tiny_skia, usvg};
use std::{fs, path::Path};

pub const PNG_SIZES: [u32; 9] = [16, 24, 32, 48, 64, 128, 256, 512, 1024];

pub fn create_pngs(input_path: &Path, png_output_dir: &Path) -> Result<()> {
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
        let output_path = png_output_dir.join(format!("{size}.png"));
        let resized = base_image.resize_exact(size, size, image::imageops::FilterType::Lanczos3);
        resized
            .save_with_format(&output_path, ImageFormat::Png)
            .with_context(|| format!("write png {}", output_path.display()))?;
        println!("Created {}", output_path.display());
    }

    Ok(())
}

fn create_pngs_from_svg(input_path: &Path, png_output_dir: &Path) -> Result<()> {
    let mut svg_data =
        fs::read(input_path).with_context(|| format!("read input svg {}", input_path.display()))?;

    if svg_data.starts_with(&[0x1f, 0x8b]) {
        svg_data = usvg::decompress_svgz(&svg_data).context("decompress svgz payload")?;
    }

    let svg_string = std::str::from_utf8(&svg_data).context("svg content is not valid UTF-8")?;
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
        let output_path = png_output_dir.join(format!("{size}.png"));
        let mut pixmap = tiny_skia::Pixmap::new(size, size).context("create svg render surface")?;
        let transform = tiny_skia::Transform::from_scale(size as f32 / width, size as f32 / height);
        resvg::render(&tree, transform, &mut pixmap.as_mut());
        let png = image::RgbaImage::from_raw(size, size, pixmap.data().to_vec())
            .context("convert svg render to rgba image")?;
        png.save_with_format(&output_path, ImageFormat::Png)
            .with_context(|| format!("write png {}", output_path.display()))?;
        println!("Created {}", output_path.display());
    }

    Ok(())
}

pub fn rename_pngs(png_output_dir: &Path) -> Result<()> {
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

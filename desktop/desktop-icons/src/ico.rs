use crate::png::PNG_SIZES;
use anyhow::{Context, Result};
use ico::{IconDir, IconDirEntry, IconImage, ResourceType};
use std::{fs, fs::File, io::BufReader, path::Path};

pub fn create_ico(png_output_dir: &Path, win_output_dir: &Path) -> Result<()> {
    fs::create_dir_all(win_output_dir)
        .with_context(|| format!("create output directory {}", win_output_dir.display()))?;

    let mut icon_dir = IconDir::new(ResourceType::Icon);
    for size in PNG_SIZES {
        let file_path = png_output_dir.join(format!("{size}.png"));
        let file =
            BufReader::new(File::open(&file_path).with_context(|| format!("open {}", file_path.display()))?);
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
        .with_context(|| format!("write {}", ico_path.display()))
}

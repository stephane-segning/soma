//! Mirrors `desktop/soma/src/main/services/blob-processing.ts`. Wraps a
//! single file into a deflate-compressed ZIP archive for export. Pure
//! function; no I/O outside the in-memory `zip` writer.

use std::io::{Cursor, Write};

use desktop_core::error::{DesktopError, DesktopResult};
use zip::write::SimpleFileOptions;

#[derive(Debug, Clone)]
pub struct ZippedBlob {
    pub name: String,
    pub data: Vec<u8>,
}

pub fn zip_single_file(file_name: &str, bytes: &[u8]) -> DesktopResult<ZippedBlob> {
    let mut buf = Vec::with_capacity(bytes.len() + 256);
    {
        let cursor = Cursor::new(&mut buf);
        let mut writer = zip::ZipWriter::new(cursor);
        let opts = SimpleFileOptions::default().compression_method(zip::CompressionMethod::Deflated);
        writer.start_file(file_name, opts).map_err(DesktopError::other)?;
        writer.write_all(bytes)?;
        writer.finish().map_err(DesktopError::other)?;
    }
    Ok(ZippedBlob {
        name: to_zip_name(file_name),
        data: buf,
    })
}

fn to_zip_name(file_name: &str) -> String {
    if file_name.to_lowercase().ends_with(".zip") {
        return file_name.to_string();
    }
    match file_name.rfind('.') {
        Some(idx) if idx > 0 => format!("{}.zip", &file_name[..idx]),
        _ if file_name.is_empty() => "file.zip".to_string(),
        _ => format!("{file_name}.zip"),
    }
}

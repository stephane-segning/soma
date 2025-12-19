pub mod error;
#[cfg(feature = "db")]
pub mod db;

pub use error::{Error, SomaResult};

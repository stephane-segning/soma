use soma_core::SomaResult;

use crate::services::space::SpaceRecord as ServiceSpaceRecord;

use super::{DaemonHandle, types::DiscoveredSpace};

impl DaemonHandle {
    /// Enumerate every space known locally. Mirrors the gRPC implementation,
    /// which today is just a paginated dump of local spaces. Network discovery
    /// is future work.
    pub async fn discover_spaces(&self) -> SomaResult<Vec<DiscoveredSpace>> {
        let mut spaces = Vec::new();
        let mut offset = 0u32;
        let limit = 200u32;
        loop {
            let (page, next_offset) = self
                .state
                .space_manager
                .list_spaces(None, limit, offset)
                .await?;

            spaces.extend(page.into_iter().map(to_discovered_space));

            let Some(next_offset) = next_offset else {
                break;
            };
            if next_offset <= offset {
                break;
            }
            offset = next_offset;
        }

        Ok(spaces)
    }
}

fn to_discovered_space(space: ServiceSpaceRecord) -> DiscoveredSpace {
    DiscoveredSpace {
        space_id: space.space_id,
        display_name: space.display_name.unwrap_or_default(),
        tags: Vec::new(),
    }
}

use crate::error::AppResult;
use derive_builder::Builder;
use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize, Debug, Clone, Eq, PartialEq, Builder)]
pub struct RememberRouteParams {
    pub route: String,
}

pub trait RememberHandler : Send + Sync + 'static {
    fn remember_route(&self, route: RememberRouteParams) -> AppResult<()>;
}

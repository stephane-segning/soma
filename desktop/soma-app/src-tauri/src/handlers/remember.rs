use crate::{error::AppResult, state::ManagedState};
use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize, Debug, Clone, Eq, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct RememberRouteParams {
    pub route: String,
}

#[derive(Clone)]
pub struct RememberController {
    state: ManagedState,
}

impl RememberController {
    pub fn new(state: ManagedState) -> Self {
        Self { state }
    }

    pub fn remember_route(&self, params: RememberRouteParams) -> AppResult<()> {
        self.state
            .store
            .persist_route(&self.state.app, params.route)
    }
}

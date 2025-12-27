use crate::handlers::remember::{RememberHandler, RememberRouteParams};
use crate::state::ManagedState;
use derive_builder::Builder;
use crate::error::AppResult;

#[derive(Clone, Builder)]
pub struct SomaHandler {
    state: ManagedState,
}

impl RememberHandler for SomaHandler {
    fn remember_route(&self, params: RememberRouteParams) -> AppResult<()> {
        self.state
            .store
            .persist_route(&self.state.app, params.route)
    }
}

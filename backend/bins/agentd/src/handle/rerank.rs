use soma_core::SomaResult;

use super::{
    AgentHandle, invalid,
    types::{RerankCandidate, RerankResult},
};

impl AgentHandle {
    /// Re-rank a candidate set against `query`.
    ///
    /// The local engine currently has no model-backed reranking — this mirrors
    /// the gRPC behaviour and always returns a `Service` error. Once a model
    /// provider is wired into the engine this method will start returning real
    /// scores; the signature is forward-compatible.
    pub async fn rerank(
        &self,
        query: String,
        candidates: Vec<RerankCandidate>,
        _top_n: i32,
    ) -> SomaResult<RerankResult> {
        if query.is_empty() {
            return Err(invalid("query required"));
        }
        if candidates.is_empty() {
            return Err(invalid("candidates required"));
        }
        Err(invalid(
            "soma-agentd no longer provides model-backed RPCs; use an explicit model provider instead",
        ))
    }
}

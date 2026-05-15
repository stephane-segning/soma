use std::cmp::Ordering;

use soma_proto_build::agent;
use tonic::{Request, Response, Status};

use crate::engine::EmbedRequest;

use super::{chat::optional_model, AgentdService};

pub(super) async fn rerank(
    service: &AgentdService,
    request: Request<agent::RerankRequest>,
) -> Result<Response<agent::RerankResponse>, Status> {
    let payload = request.into_inner();
    if payload.query.trim().is_empty() {
        return Err(Status::invalid_argument("query is required"));
    }
    if payload.candidates.is_empty() {
        return Err(Status::invalid_argument("candidates are required"));
    }

    let model = optional_model(&payload.model);
    let inputs = rerank_inputs(&payload.query, &payload.candidates)?;
    let embeddings = service
        .state
        .engine
        .embed(EmbedRequest {
            model: model.clone(),
            input: inputs,
        })
        .await
        .map_err(|err| Status::internal(err.to_string()))?;

    if embeddings.len() != payload.candidates.len() + 1 {
        return Err(Status::internal("embed returned unexpected vector count"));
    }

    let results = rank_candidates(payload.candidates, embeddings, payload.top_n);
    Ok(Response::new(agent::RerankResponse {
        model: model.unwrap_or_default(),
        results,
    }))
}

fn rerank_inputs(
    query: &str,
    candidates: &[agent::RerankCandidate],
) -> Result<Vec<String>, Status> {
    let mut inputs = Vec::with_capacity(candidates.len() + 1);
    inputs.push(query.to_string());
    for candidate in candidates {
        if candidate.content.trim().is_empty() {
            return Err(Status::invalid_argument("candidate content is required"));
        }
        inputs.push(candidate.content.clone());
    }
    Ok(inputs)
}

fn rank_candidates(
    candidates: Vec<agent::RerankCandidate>,
    embeddings: Vec<Vec<f32>>,
    top_n: u32,
) -> Vec<agent::RerankResult> {
    let mut embeddings_iter = embeddings.into_iter();
    let query_vec = embeddings_iter.next().unwrap_or_default();
    let mut scored = candidates
        .into_iter()
        .zip(embeddings_iter)
        .map(|(candidate, embedding)| ScoredCandidate {
            id: candidate.id,
            score: cosine_similarity(&query_vec, &embedding),
        })
        .collect::<Vec<_>>();

    scored.sort_by(|a, b| b.score.partial_cmp(&a.score).unwrap_or(Ordering::Equal));
    let limit = if top_n == 0 { scored.len() } else { top_n as usize };

    scored
        .into_iter()
        .take(limit)
        .enumerate()
        .map(|(idx, candidate)| agent::RerankResult {
            id: candidate.id,
            score: candidate.score,
            rank: (idx + 1) as u32,
        })
        .collect()
}

struct ScoredCandidate {
    id: String,
    score: f64,
}

fn cosine_similarity(a: &[f32], b: &[f32]) -> f64 {
    if a.is_empty() || b.is_empty() || a.len() != b.len() {
        return 0.0;
    }

    let mut dot = 0.0_f64;
    let mut norm_a = 0.0_f64;
    let mut norm_b = 0.0_f64;
    for (ai, bi) in a.iter().zip(b.iter()) {
        let a = f64::from(*ai);
        let b = f64::from(*bi);
        dot += a * b;
        norm_a += a * a;
        norm_b += b * b;
    }

    if norm_a == 0.0 || norm_b == 0.0 {
        return 0.0;
    }
    dot / (norm_a.sqrt() * norm_b.sqrt())
}

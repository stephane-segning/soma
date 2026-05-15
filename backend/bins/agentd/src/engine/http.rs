use anyhow::{Context as AnyhowContext, anyhow};
use serde::{Deserialize, Serialize};

use super::handle::EngineHandle;

impl EngineHandle {
    pub(super) async fn get_json<T>(&self, path: &str) -> anyhow::Result<T>
    where
        T: for<'de> Deserialize<'de>,
    {
        let url = format!("{}{}", self.config.provider_base_url, path);
        let response = self
            .client
            .get(&url)
            .send()
            .await
            .with_context(|| format!("provider request failed: GET {url}"))?;

        if !response.status().is_success() {
            let status = response.status();
            let body = response.text().await.unwrap_or_default();
            return Err(anyhow!(
                "provider request failed: GET {url} -> {status}: {body}"
            ));
        }

        response
            .json::<T>()
            .await
            .with_context(|| format!("provider response decode failed: GET {url}"))
    }

    pub(super) async fn post_json<B, T>(&self, path: &str, body: &B) -> anyhow::Result<T>
    where
        B: Serialize + ?Sized,
        T: for<'de> Deserialize<'de>,
    {
        let url = format!("{}{}", self.config.provider_base_url, path);
        let response = self
            .client
            .post(&url)
            .json(body)
            .send()
            .await
            .with_context(|| format!("provider request failed: POST {url}"))?;

        if !response.status().is_success() {
            let status = response.status();
            let body = response.text().await.unwrap_or_default();
            return Err(anyhow!(
                "provider request failed: POST {url} -> {status}: {body}"
            ));
        }

        response
            .json::<T>()
            .await
            .with_context(|| format!("provider response decode failed: POST {url}"))
    }
}

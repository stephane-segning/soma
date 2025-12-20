//! Simple in-memory cache with optional TTL. Intended as a thin abstraction so we can swap
//! implementations (Redis, SQLx) later without rewriting callers.

use std::{
    collections::HashMap,
    hash::Hash,
    sync::Arc,
    time::{Duration, Instant},
};

use async_trait::async_trait;
use tokio::sync::RwLock;

#[async_trait]
pub trait Cache<K, V>: Send + Sync
where
    K: Send + Sync + Eq + Hash,
    V: Send + Sync,
{
    async fn set(&self, key: K, value: V, ttl: Option<Duration>);
    async fn get(&self, key: &K) -> Option<V>;
    async fn purge_expired(&self);
}

#[derive(Debug, Clone)]
pub struct MemoryCache<K, V> {
    inner: Arc<RwLock<HashMap<K, Entry<V>>>>,
    default_ttl: Option<Duration>,
}

#[derive(Debug, Clone)]
struct Entry<V> {
    value: V,
    expires_at: Option<Instant>,
}

impl<K, V> MemoryCache<K, V>
where
    K: Eq + Hash + Clone + Send + Sync + 'static,
    V: Clone + Send + Sync + 'static,
{
    pub fn new(default_ttl: Option<Duration>) -> Self {
        Self {
            inner: Arc::new(RwLock::new(HashMap::new())),
            default_ttl,
        }
    }

    fn expiry(&self, ttl: Option<Duration>) -> Option<Instant> {
        ttl.or(self.default_ttl).map(|d| Instant::now() + d)
    }
}

#[async_trait]
impl<K, V> Cache<K, V> for MemoryCache<K, V>
where
    K: Eq + Hash + Clone + Send + Sync + 'static,
    V: Clone + Send + Sync + 'static,
{
    async fn set(&self, key: K, value: V, ttl: Option<Duration>) {
        let expires_at = self.expiry(ttl);
        let mut guard = self.inner.write().await;
        guard.insert(key, Entry { value, expires_at });
    }

    async fn get(&self, key: &K) -> Option<V> {
        let mut guard = self.inner.write().await;
        if let Some(entry) = guard.get(key) {
            if let Some(exp) = entry.expires_at {
                if Instant::now() >= exp {
                    guard.remove(key);
                    return None;
                }
            }
            return Some(entry.value.clone());
        }
        None
    }

    async fn purge_expired(&self) {
        let now = Instant::now();
        let mut guard = self.inner.write().await;
        guard.retain(|_, entry| entry.expires_at.map(|t| t > now).unwrap_or(true));
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn ttl_expires() {
        let cache = MemoryCache::new(Some(Duration::from_millis(50)));
        cache.set("k", 42, None).await;
        assert_eq!(cache.get(&"k").await, Some(42));
        tokio::time::sleep(Duration::from_millis(60)).await;
        assert_eq!(cache.get(&"k").await, None);
    }

    #[tokio::test]
    async fn override_ttl() {
        let cache = MemoryCache::new(Some(Duration::from_secs(10)));
        cache.set("k", 1, Some(Duration::from_millis(10))).await;
        tokio::time::sleep(Duration::from_millis(15)).await;
        assert!(cache.get(&"k").await.is_none());
    }
}


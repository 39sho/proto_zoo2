use std::sync::Arc;
use std::time::Instant;

use jsonwebtoken::jwk::Jwk;
use sqlx::PgPool;
use tokio::sync::RwLock;

use crate::config::Config;

/// Cloning `AppState` is cheap: the pool, HTTP client and JWKS cache are all
/// shared behind `Arc`.
pub type SharedState = AppState;

#[derive(Clone)]
pub struct AppState {
    pub config: Config,
    pub pool: PgPool,
    pub http: reqwest::Client,
    pub jwks: Arc<RwLock<JwksCache>>,
}

#[derive(Default)]
pub struct JwksCache {
    pub keys: Vec<Jwk>,
    pub fetched_at: Option<Instant>,
}

impl JwksCache {
    pub fn is_fresh(&self) -> bool {
        match self.fetched_at {
            Some(at) => at.elapsed().as_secs() < 300,
            None => false,
        }
    }
}

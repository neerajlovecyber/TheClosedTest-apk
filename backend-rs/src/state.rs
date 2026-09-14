use std::sync::atomic::AtomicU32;
use std::sync::Arc;
use std::time::Duration;
use moka::future::Cache;
use sqlx::PgPool;
use time::OffsetDateTime;

use crate::config::Config;
use crate::db::models::User;

#[derive(Clone)]
pub struct AppState {
    pub pool: PgPool,
    pub http_client: reqwest::Client,
    pub config: Config,
    pub user_cache: Cache<String, User>,
    pub presence_cache: Cache<String, OffsetDateTime>,
    pub rate_limiter: Cache<String, Arc<AtomicU32>>,
}

pub type SharedState = Arc<AppState>;

impl AppState {
    pub fn new(pool: PgPool, config: Config) -> Self {
        let http_client = reqwest::Client::builder()
            .timeout(Duration::from_secs(10))
            .build()
            .unwrap_or_default();

        let user_cache = Cache::builder()
            .time_to_live(Duration::from_secs(60))
            .max_capacity(5000)
            .build();

        let presence_cache = Cache::builder()
            .time_to_idle(Duration::from_secs(300))
            .max_capacity(10000)
            .build();

        let rate_limiter = Cache::builder()
            .time_to_live(Duration::from_secs(120))
            .max_capacity(50000)
            .build();

        Self {
            pool,
            http_client,
            config,
            user_cache,
            presence_cache,
            rate_limiter,
        }
    }
}

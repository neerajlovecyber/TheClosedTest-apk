use sqlx::postgres::PgPoolOptions;
use sqlx::{Executor, PgPool};
use tokio::sync::OnceCell;
use backend_rs::config::Config;
use backend_rs::state::AppState;

#[allow(dead_code)]
pub struct TestContext {
    pub pool: PgPool,
    pub state: AppState,
    pub is_live_db: bool,
}

static TEST_POOL: OnceCell<PgPool> = OnceCell::const_new();
static IS_LIVE: OnceCell<bool> = OnceCell::const_new();

pub async fn get_test_pool() -> (PgPool, bool) {
    let pool = TEST_POOL.get_or_init(|| async {
        let _ = dotenvy::dotenv();

        // 1. Check if an explicit TEST_DATABASE_URL or DATABASE_URL is configured
        if let Ok(url) = std::env::var("TEST_DATABASE_URL").or_else(|_| std::env::var("DATABASE_URL")) {
            println!("[test] Connecting to test database...");
            match PgPoolOptions::new().max_connections(5).connect(&url).await {
                Ok(p) => {
                    println!("[test] Connected to test database! Applying schema migrations...");
                    let sql = include_str!("../../migrations/0001_init.sql");
                    if let Err(e) = p.execute(sql).await {
                        eprintln!("[test] Warning during migration: {e}");
                    }
                    let _ = IS_LIVE.set(true);
                    println!("[test] Live database ready for integration tests.");
                    return p;
                }
                Err(e) => {
                    eprintln!("[test] Failed to connect to database URL: {e}");
                }
            }
        }

        // 2. Fallback: connect_lazy for contract/mock testing
        let _ = IS_LIVE.set(false);
        PgPoolOptions::new()
            .connect_lazy("postgres://postgres:postgres@localhost:5432/theclosedtest_test")
            .unwrap()
    }).await;

    let is_live = *IS_LIVE.get().unwrap_or(&false);
    (pool.clone(), is_live)
}

pub async fn create_test_context() -> TestContext {
    let (pool, is_live) = get_test_pool().await;
    let config = Config {
        database_url: "postgres://localhost:5432/theclosedtest_test".to_string(),
        port: 9000,
        clerk_secret_key: None,
        clerk_jwt_key: None,
        clerk_frontend_api: "clerk.theclosedtest.com".to_string(),
        app_env: "test".to_string(),
        rate_limit_per_minute: 300,
        rate_limit_enabled: false,
        r2_access_key_id: None,
        r2_secret_access_key: None,
        r2_bucket_name: "test-bucket".to_string(),
        r2_account_id: None,
        r2_public_url: "https://test.example.com".to_string(),
    };
    let state = AppState::new(pool.clone(), config);
    TestContext {
        pool,
        state,
        is_live_db: is_live,
    }
}

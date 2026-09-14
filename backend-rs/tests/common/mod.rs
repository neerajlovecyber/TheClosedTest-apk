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
        // 1. Check if an explicit TEST_DATABASE_URL or DATABASE_URL is configured
        if let Ok(url) = std::env::var("TEST_DATABASE_URL") {
            if let Ok(p) = PgPoolOptions::new().max_connections(5).connect(&url).await {
                // Apply migration
                let sql = include_str!("../../migrations/0001_init.sql");
                let _ = p.execute(sql).await;
                let _ = IS_LIVE.set(true);
                return p;
            }
        }

        // 2. Try launching postgresql_embedded with a 5-second timeout
        let mut pg = postgresql_embedded::PostgreSQL::default();
        let setup_fut = tokio::time::timeout(std::time::Duration::from_secs(5), pg.setup());
        match setup_fut.await {
            Ok(Ok(_)) => {
                if let Ok(_) = pg.start().await {
                    let db_name = "theclosedtest_test";
                    let _ = pg.create_database(db_name).await;
                    let url = pg.settings().url(db_name);
                    if let Ok(p) = PgPoolOptions::new().max_connections(5).connect(&url).await {
                        let sql = include_str!("../../migrations/0001_init.sql");
                        let _ = p.execute(sql).await;
                        // Keep server alive by leaking or storing
                        Box::leak(Box::new(pg));
                        let _ = IS_LIVE.set(true);
                        return p;
                    }
                }
            }
            Ok(Err(e)) => {
                eprintln!("[test] postgresql_embedded setup note: {e}");
            }
            Err(_) => {
                eprintln!("[test] postgresql_embedded download timed out after 5s; falling back to contract mode or TEST_DATABASE_URL");
            }
        }

        // 3. Fallback: connect_lazy for contract/mock testing
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
        clerk_frontend_api: "clerk.theclosedtest.com".to_string(),
        app_env: "test".to_string(),
        rate_limit_per_minute: 300,
        rate_limit_enabled: false,
    };
    let state = AppState::new(pool.clone(), config);
    TestContext {
        pool,
        state,
        is_live_db: is_live,
    }
}

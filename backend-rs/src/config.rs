use std::env;

#[derive(Debug, Clone)]
pub struct Config {
    pub database_url: String,
    pub port: u16,
    pub clerk_secret_key: Option<String>,
    pub app_env: String,
}

impl Config {
    pub fn from_env() -> Result<Self, String> {
        let database_url = env::var("DATABASE_URL")
            .unwrap_or_else(|_| "postgres://postgres:postgres@localhost:5432/theclosedtest".to_string());

        let port = env::var("PORT")
            .ok()
            .and_then(|p| p.parse().ok())
            .unwrap_or(9000);

        let clerk_secret_key = env::var("CLERK_SECRET_KEY").ok();
        let app_env = env::var("APP_ENV").unwrap_or_else(|_| "development".to_string());

        Ok(Self {
            database_url,
            port,
            clerk_secret_key,
            app_env,
        })
    }
}

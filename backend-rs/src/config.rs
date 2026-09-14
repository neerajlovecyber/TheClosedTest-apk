use std::env;

pub const ADMIN_EMAILS: &[&str] = &[
    "neerajlovecyber@gmail.com",
    "futureaistudio41@gmail.com",
    "theneerajsec@gmail.com",
];

#[derive(Debug, Clone)]
pub struct Config {
    pub database_url: String,
    pub port: u16,
    pub clerk_secret_key: Option<String>,
    pub clerk_frontend_api: String,
    pub app_env: String,
    pub rate_limit_per_minute: u32,
    pub rate_limit_enabled: bool,
    pub r2_access_key_id: Option<String>,
    pub r2_secret_access_key: Option<String>,
    pub r2_bucket_name: String,
    pub r2_account_id: Option<String>,
    pub r2_public_url: String,
}

impl Config {
    pub fn from_env() -> Result<Self, String> {
        let database_url = env::var("DATABASE_URL")
            .or_else(|_| env::var("NF_TESTERDB_POSTGRES_URI"))
            .or_else(|_| env::var("NF_TESTERDB_EXTERNAL_POSTGRES_URI"))
            .unwrap_or_else(|_| "postgres://postgres:postgres@localhost:5432/closedtest".to_string());

        let port = env::var("PORT")
            .ok()
            .and_then(|p| p.parse().ok())
            .unwrap_or(9000);

        let clerk_secret_key = env::var("CLERK_SECRET_KEY").ok();
        let clerk_frontend_api = env::var("CLERK_FRONTEND_API_URL")
            .unwrap_or_else(|_| "clerk.theclosedtest.neerajlovecyber.com".to_string());
        let app_env = env::var("NODE_ENV")
            .or_else(|_| env::var("APP_ENV"))
            .unwrap_or_else(|_| "development".to_string());

        let rate_limit_per_minute = env::var("RATE_LIMIT_PER_MINUTE")
            .ok()
            .and_then(|v| v.parse().ok())
            .unwrap_or(300);

        let rate_limit_enabled = env::var("RATE_LIMIT_ENABLED")
            .map(|v| v != "false" && v != "0")
            .unwrap_or_else(|_| app_env != "test");

        let r2_access_key_id = env::var("CLOUDFLARE_R2_ACCESS_KEY_ID").ok();
        let r2_secret_access_key = env::var("CLOUDFLARE_R2_SECRET_ACCESS_KEY").ok();
        let r2_bucket_name = env::var("CLOUDFLARE_R2_BUCKET_NAME")
            .unwrap_or_else(|_| "theclosedtest".to_string());
        let r2_account_id = env::var("CLOUDFLARE_R2_ACCOUNT_ID").ok();
        let r2_public_url = env::var("CLOUDFLARE_R2_PUBLIC_URL")
            .unwrap_or_else(|_| "https://theclosedtest.neerajlovecyber.com".to_string());

        Ok(Self {
            database_url,
            port,
            clerk_secret_key,
            clerk_frontend_api,
            app_env,
            rate_limit_per_minute,
            rate_limit_enabled,
            r2_access_key_id,
            r2_secret_access_key,
            r2_bucket_name,
            r2_account_id,
            r2_public_url,
        })
    }

    pub fn is_user_admin(&self, email: Option<&str>, is_db_admin: bool) -> bool {
        if is_db_admin {
            return true;
        }
        if let Some(e) = email {
            let normalized = e.trim().to_lowercase();
            return ADMIN_EMAILS.iter().any(|admin| admin.eq_ignore_ascii_case(&normalized));
        }
        false
    }
}

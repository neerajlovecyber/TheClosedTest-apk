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

        Ok(Self {
            database_url,
            port,
            clerk_secret_key,
            clerk_frontend_api,
            app_env,
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

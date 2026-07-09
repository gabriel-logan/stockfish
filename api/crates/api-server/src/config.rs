#[derive(Clone)]
pub struct Config {
    pub host: String,
    pub port: u16,
    pub database_url: String,
    pub database_max_connections: u32,
    pub jwt_secret: String,
    pub access_token_ttl_seconds: i64,
    pub refresh_token_ttl_seconds: i64,
    pub cors_allowed_origin: String,
}

impl Config {
    pub fn from_env() -> Self {
        Self {
            host: env_or("HOST", "0.0.0.0"),
            port: env_or("PORT", "6090").parse().expect("PORT must be a u16"),
            database_url: std::env::var("DATABASE_URL").expect("DATABASE_URL is required"),
            database_max_connections: env_or("DATABASE_MAX_CONNECTIONS", "10")
                .parse()
                .expect("DATABASE_MAX_CONNECTIONS must be a u32"),
            jwt_secret: std::env::var("JWT_SECRET").expect("JWT_SECRET is required"),
            access_token_ttl_seconds: env_or("ACCESS_TOKEN_TTL_SECONDS", "900")
                .parse()
                .expect("ACCESS_TOKEN_TTL_SECONDS must be an i64"),
            refresh_token_ttl_seconds: env_or("REFRESH_TOKEN_TTL_SECONDS", "2592000")
                .parse()
                .expect("REFRESH_TOKEN_TTL_SECONDS must be an i64"),
            cors_allowed_origin: env_or("CORS_ALLOWED_ORIGIN", "*"),
        }
    }
}

fn env_or(name: &str, default: &str) -> String {
    std::env::var(name).unwrap_or_else(|_| default.to_owned())
}

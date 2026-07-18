use actix_cors::Cors;
use actix_web::body::MessageBody;
use actix_web::dev::{ServiceRequest, ServiceResponse};
use actix_web::middleware::{Next, from_fn};
use actix_web::{App, Error, HttpServer, web};
use sqlx::postgres::PgPoolOptions;
use tracing_subscriber::EnvFilter;

mod auth;
mod config;
mod error;
mod games;
mod hub;
mod models;
mod rooms;
mod routes;
mod users;
mod ws;

use config::Config;
use hub::Hub;

#[derive(Clone)]
struct AppState {
    db: sqlx::PgPool,
    config: Config,
    hub: Hub,
}

fn cors_from_config(config: &Config) -> Cors {
    if config
        .cors_allowed_origins
        .iter()
        .any(|origin| origin == "*")
    {
        return Cors::permissive();
    }

    let mut cors = Cors::default().allow_any_method().allow_any_header();

    for origin in &config.cors_allowed_origins {
        cors = cors.allowed_origin(origin);
    }

    cors
}

async fn log_request(
    request: ServiceRequest,
    next: Next<impl MessageBody>,
) -> Result<ServiceResponse<impl MessageBody>, Error> {
    let method = request.method().clone();
    let path = request.path().to_owned();
    let started_at = std::time::Instant::now();

    let response = next.call(request).await?;

    let status = response.status();
    let duration_ms = started_at.elapsed().as_millis() as u64;

    if status.is_server_error() {
        tracing::error!(%method, %path, status = status.as_u16(), duration_ms, "http request completed");
    } else {
        tracing::info!(%method, %path, status = status.as_u16(), duration_ms, "http request completed");
    }

    Ok(response)
}

#[actix_web::main]
async fn main() -> std::io::Result<()> {
    tracing_subscriber::fmt()
        .json()
        .with_env_filter(
            EnvFilter::try_from_default_env().unwrap_or_else(|_| EnvFilter::new("info")),
        )
        .init();

    let config = Config::from_env();
    let db = PgPoolOptions::new()
        .max_connections(config.database_max_connections)
        .connect(&config.database_url)
        .await
        .expect("DATABASE_URL must point to a reachable PostgreSQL database");

    let bind_addr = format!("{}:{}", config.host, config.port);
    let state = AppState {
        db,
        config: config.clone(),
        hub: Hub::default(),
    };

    tracing::info!(%bind_addr, "starting api-server");

    HttpServer::new(move || {
        let cors = cors_from_config(&config);

        App::new()
            .wrap(from_fn(log_request))
            .wrap(cors)
            .app_data(web::Data::new(state.clone()))
            .configure(routes::configure)
    })
    .bind(bind_addr)?
    .run()
    .await
}

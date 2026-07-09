use actix_cors::Cors;
use actix_web::middleware::Logger;
use actix_web::{App, HttpServer, web};
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

#[actix_web::main]
async fn main() -> std::io::Result<()> {
    tracing_subscriber::fmt()
        .with_env_filter(EnvFilter::from_default_env())
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
        let cors = if config.cors_allowed_origin == "*" {
            Cors::permissive()
        } else {
            Cors::default()
                .allowed_origin(&config.cors_allowed_origin)
                .allow_any_method()
                .allow_any_header()
        };

        App::new()
            .wrap(Logger::default())
            .wrap(cors)
            .app_data(web::Data::new(state.clone()))
            .configure(routes::configure)
    })
    .bind(bind_addr)?
    .run()
    .await
}

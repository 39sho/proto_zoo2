mod auth;
mod config;
mod error;
mod models;
mod routes;
mod state;

use std::sync::Arc;

use anyhow::Context;
use tokio::sync::RwLock;
use tracing_subscriber::layer::SubscriberExt;
use tracing_subscriber::util::SubscriberInitExt;

use crate::state::{AppState, JwksCache};

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    dotenvy::dotenv().ok();

    tracing_subscriber::registry()
        .with(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| "info,sqlx=warn,tower_http=info".into()),
        )
        .with(tracing_subscriber::fmt::layer())
        .init();

    let config = config::Config::from_env()?;

    let pool = sqlx::postgres::PgPoolOptions::new()
        .max_connections(10)
        .connect(&config.database_url)
        .await
        .context("failed to connect to Postgres (is docker compose up?)")?;

    sqlx::migrate!("./migrations")
        .run(&pool)
        .await
        .context("failed to run migrations")?;

    let http = reqwest::Client::builder()
        .build()
        .context("failed to build http client")?;

    let bind_addr = config.bind_addr.clone();
    let state = AppState {
        config,
        pool,
        http,
        jwks: Arc::new(RwLock::new(JwksCache::default())),
    };

    let app = routes::router(state);
    let listener = tokio::net::TcpListener::bind(&bind_addr)
        .await
        .with_context(|| format!("failed to bind {bind_addr}"))?;

    tracing::info!("chat-server listening on http://{bind_addr}");
    axum::serve(listener, app).await?;

    Ok(())
}

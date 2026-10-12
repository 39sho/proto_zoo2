use axum::http::HeaderValue;
use axum::routing::{delete, get, patch, post};
use axum::Router;
use tower_http::cors::{Any, CorsLayer};
use tower_http::trace::TraceLayer;
use uuid::Uuid;

use crate::error::AppError;
use crate::state::SharedState;

pub mod channels;
pub mod me;
pub mod messages;
pub mod reactions;
pub mod shapes;
pub mod workspaces;

pub fn router(state: SharedState) -> Router {
    let allow_origin = state
        .config
        .cors_origin
        .parse::<HeaderValue>()
        .unwrap_or_else(|_| HeaderValue::from_static("*"));

    let cors = CorsLayer::new()
        .allow_origin(allow_origin)
        .allow_methods(Any)
        .allow_headers(Any);

    Router::new()
        .route("/health", get(health))
        .route("/api/me", get(me::get_me))
        .route("/api/me/sync", post(me::sync_me))
        .route(
            "/api/workspaces",
            get(workspaces::list_workspaces).post(workspaces::create_workspace),
        )
        .route(
            "/api/workspaces/{workspace_id}/members",
            get(workspaces::list_members),
        )
        .route(
            "/api/workspaces/{workspace_id}/members/{user_id}",
            patch(workspaces::update_member_role),
        )
        .route(
            "/api/workspaces/{workspace_id}/channels",
            get(channels::list_channels).post(channels::create_channel),
        )
        .route(
            "/api/channels/{channel_id}/messages",
            get(messages::list_messages).post(messages::create_message),
        )
        .route(
            "/api/messages/{message_id}",
            patch(messages::update_message).delete(messages::delete_message),
        )
        .route(
            "/api/messages/{message_id}/reactions",
            post(reactions::add_reaction),
        )
        .route(
            "/api/messages/{message_id}/reactions/{emoji}",
            delete(reactions::remove_reaction),
        )
        .route(
            "/api/channels/{channel_id}/members",
            get(channels::list_members).post(channels::add_member),
        )
        .route(
            "/api/channels/{channel_id}/members/{user_id}",
            delete(channels::remove_member),
        )
        // Electric shape proxy: the client only ever talks to these routes.
        .route("/api/shapes/channels", get(shapes::channels_shape))
        .route("/api/shapes/messages", get(shapes::messages_shape))
        .route("/api/shapes/reactions", get(shapes::reactions_shape))
        .with_state(state)
        .layer(cors)
        .layer(TraceLayer::new_for_http())
}

async fn health() -> &'static str {
    "ok"
}

/// Transaction id of the current write transaction, formatted the way Electric
/// emits it in change headers so clients can await the matching sync.
pub(crate) async fn current_txid(
    tx: &mut sqlx::Transaction<'_, sqlx::Postgres>,
) -> Result<i64, AppError> {
    let (text,): (String,) = sqlx::query_as("select pg_current_xact_id()::xid::text")
        .fetch_one(&mut **tx)
        .await?;
    Ok(text.parse::<i64>().unwrap_or(0))
}

/// Role of `user_id` within a workspace, or `None` when not a member.
pub(crate) async fn workspace_role(
    pool: &sqlx::PgPool,
    workspace_id: Uuid,
    user_id: Uuid,
) -> Result<Option<String>, AppError> {
    let row: Option<(String,)> = sqlx::query_as(
        "select role from workspace_members where workspace_id = $1 and user_id = $2",
    )
    .bind(workspace_id)
    .bind(user_id)
    .fetch_optional(pool)
    .await?;
    Ok(row.map(|(role,)| role))
}

pub(crate) async fn require_workspace_member(
    pool: &sqlx::PgPool,
    workspace_id: Uuid,
    user_id: Uuid,
) -> Result<(), AppError> {
    workspace_role(pool, workspace_id, user_id)
        .await?
        .map(|_| ())
        .ok_or(AppError::Forbidden)
}

pub(crate) async fn require_workspace_admin(
    pool: &sqlx::PgPool,
    workspace_id: Uuid,
    user_id: Uuid,
) -> Result<(), AppError> {
    match workspace_role(pool, workspace_id, user_id).await? {
        Some(role) if role == "owner" || role == "admin" => Ok(()),
        Some(_) => Err(AppError::Forbidden),
        None => Err(AppError::Forbidden),
    }
}

pub(crate) struct ChannelAccess {
    pub workspace_id: Uuid,
    pub visibility: String,
}

/// Ensures the user may read the channel: workspace membership for public
/// channels, plus an explicit `channel_members` row for private ones.
pub(crate) async fn channel_access(
    pool: &sqlx::PgPool,
    channel_id: Uuid,
    user_id: Uuid,
) -> Result<ChannelAccess, AppError> {
    let row: Option<(Uuid, String)> =
        sqlx::query_as("select workspace_id, visibility from channels where id = $1")
            .bind(channel_id)
            .fetch_optional(pool)
            .await?;

    let (workspace_id, visibility) = row.ok_or(AppError::NotFound)?;
    require_workspace_member(pool, workspace_id, user_id).await?;

    if visibility == "private" {
        let member: Option<(i32,)> = sqlx::query_as(
            "select 1 from channel_members where channel_id = $1 and user_id = $2",
        )
        .bind(channel_id)
        .bind(user_id)
        .fetch_optional(pool)
        .await?;
        if member.is_none() {
            return Err(AppError::Forbidden);
        }
    }

    Ok(ChannelAccess {
        workspace_id,
        visibility,
    })
}

/// Channel administration: workspace owner/admin, or a channel admin.
pub(crate) async fn require_channel_admin(
    pool: &sqlx::PgPool,
    channel_id: Uuid,
    user_id: Uuid,
) -> Result<ChannelAccess, AppError> {
    let access = channel_access(pool, channel_id, user_id).await?;

    if let Some(role) = workspace_role(pool, access.workspace_id, user_id).await? {
        if role == "owner" || role == "admin" {
            return Ok(access);
        }
    }

    let channel_role: Option<(String,)> = sqlx::query_as(
        "select role from channel_members where channel_id = $1 and user_id = $2",
    )
    .bind(channel_id)
    .bind(user_id)
    .fetch_optional(pool)
    .await?;

    match channel_role {
        Some((role,)) if role == "admin" => Ok(access),
        _ => Err(AppError::Forbidden),
    }
}

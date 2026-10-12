use std::collections::HashMap;

use axum::body::Body;
use axum::extract::{Query, State};
use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};
use uuid::Uuid;

use crate::auth::AuthUser;
use crate::error::AppError;
use crate::routes::{channel_access, require_workspace_member};
use crate::state::AppState;

/// Query params owned by the Electric sync protocol that we pass through
/// unchanged so pagination, long-polling and live mode keep working.
const FORWARDED_PARAMS: &[&str] = &[
    "live",
    "live_sse",
    "experimental_live_sse",
    "handle",
    "offset",
    "cursor",
    "expired_handle",
    "log",
    "replica",
    "subset__where",
    "subset__limit",
    "subset__offset",
    "subset__order_by",
    "subset__params",
    "subset__where_expr",
    "subset__order_by_expr",
    "cache-buster",
];

pub async fn channels_shape(
    State(state): State<AppState>,
    user: AuthUser,
    Query(params): Query<HashMap<String, String>>,
) -> Result<Response, AppError> {
    let workspace_id = params
        .get("workspace_id")
        .and_then(|s| Uuid::parse_str(s).ok())
        .ok_or_else(|| AppError::BadRequest("workspace_id is required".into()))?;

    require_workspace_member(&state.pool, workspace_id, user.id).await?;

    // Public channels are visible to the whole workspace; private channels only
    // to their explicit members. Electric 1.7.10+ supports subqueries in WHERE.
    //
    // Both ids are server-validated UUIDs, so they are inlined as literals. This
    // also sidesteps the known bug where a `$n` param used *inside* a subquery
    // is reported as "parameter value was not used" (electric#3143).
    let where_clause = format!(
        "workspace_id = '{workspace_id}' \
         AND (visibility = 'public' \
         OR id IN (SELECT channel_id FROM channel_members WHERE user_id = '{user_id}'))",
        workspace_id = workspace_id,
        user_id = user.id
    );

    proxy_shape(&state, "channels", &where_clause, None, &params).await
}

pub async fn messages_shape(
    State(state): State<AppState>,
    user: AuthUser,
    Query(params): Query<HashMap<String, String>>,
) -> Result<Response, AppError> {
    let channel_id = params
        .get("channel_id")
        .and_then(|s| Uuid::parse_str(s).ok())
        .ok_or_else(|| AppError::BadRequest("channel_id is required".into()))?;

    // Verifies workspace membership and private-channel membership before the
    // rows for this channel are ever streamed to the client.
    channel_access(&state.pool, channel_id, user.id).await?;

    // The channel shape carries both top-level messages and replies; the client
    // splits them with live-query filters (and on-demand subsets narrow the
    // fetch), so we don't filter replies out here.
    proxy_shape(
        &state,
        "messages",
        "channel_id = $1",
        Some(channel_id),
        &params,
    )
    .await
}

pub async fn reactions_shape(
    State(state): State<AppState>,
    user: AuthUser,
    Query(params): Query<HashMap<String, String>>,
) -> Result<Response, AppError> {
    let channel_id = params
        .get("channel_id")
        .and_then(|s| Uuid::parse_str(s).ok())
        .ok_or_else(|| AppError::BadRequest("channel_id is required".into()))?;

    channel_access(&state.pool, channel_id, user.id).await?;

    proxy_shape(
        &state,
        "reactions",
        "channel_id = $1",
        Some(channel_id),
        &params,
    )
    .await
}

async fn proxy_shape(
    state: &AppState,
    table: &str,
    where_clause: &str,
    param: Option<Uuid>,
    incoming: &HashMap<String, String>,
) -> Result<Response, AppError> {
    let mut url = reqwest::Url::parse(&state.config.electric_url)
        .map_err(|e| AppError::Internal(format!("invalid ELECTRIC_URL: {e}")))?;

    {
        let mut query = url.query_pairs_mut();
        // The server decides the table and the row filter. The client can never
        // widen the shape it is allowed to read.
        query.append_pair("table", table);
        query.append_pair("where", where_clause);
        if let Some(value) = param {
            query.append_pair("params[1]", &value.to_string());
        }

        for key in FORWARDED_PARAMS {
            if let Some(value) = incoming.get(*key) {
                query.append_pair(key, value);
            }
        }

        if let Some(secret) = &state.config.electric_secret {
            query.append_pair("secret", secret);
        }
    }

    // DX: with RUST_LOG=debug this shows exactly which shape (table + filter)
    // the client asked for, and how Electric answered — invaluable when a row
    // doesn't show up.
    tracing::debug!(table, where_clause, param = ?param, "electric shape request");

    let upstream = state.http.get(url).send().await?;
    let status = upstream.status();
    let headers = upstream.headers().clone();
    tracing::debug!(
        table,
        status = status.as_u16(),
        handle = headers
            .get("electric-handle")
            .and_then(|v| v.to_str().ok()),
        offset = headers
            .get("electric-offset")
            .and_then(|v| v.to_str().ok()),
        "electric shape response"
    );
    let body = upstream.bytes().await?;

    let mut builder = Response::builder()
        .status(StatusCode::from_u16(status.as_u16()).unwrap_or(StatusCode::BAD_GATEWAY));

    for (name, value) in headers.iter() {
        // reqwest transparently decompresses the body, so the original
        // encoding/length headers no longer describe what we forward.
        if matches!(
            name.as_str(),
            "content-encoding" | "content-length" | "transfer-encoding" | "connection"
        ) {
            continue;
        }
        builder = builder.header(name.as_str(), value.as_bytes());
    }

    builder
        .body(Body::from(body))
        .map_err(|e| AppError::Internal(e.to_string()))
        .map(IntoResponse::into_response)
}

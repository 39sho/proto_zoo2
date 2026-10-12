use axum::extract::{Path, State};
use axum::Json;
use uuid::Uuid;

use crate::auth::AuthUser;
use crate::error::AppError;
use crate::models::{AddReaction, Reaction, WithTxid};
use crate::routes::{channel_access, current_txid};
use crate::state::AppState;

const REACTION_COLUMNS: &str = "message_id, user_id, channel_id, emoji, created_at";

fn validate_emoji(raw: &str) -> Result<String, AppError> {
    let emoji = raw.trim();
    if emoji.is_empty() {
        return Err(AppError::BadRequest("emoji is required".into()));
    }
    // Guard against abuse; a single (optionally composed) emoji is plenty.
    if emoji.chars().count() > 8 || emoji.len() > 32 {
        return Err(AppError::BadRequest("emoji is too long".into()));
    }
    Ok(emoji.to_string())
}

async fn channel_of_message(
    pool: &sqlx::PgPool,
    message_id: Uuid,
) -> Result<Uuid, AppError> {
    let row: Option<(Uuid,)> = sqlx::query_as(
        "select channel_id from messages where id = $1 and deleted_at is null",
    )
    .bind(message_id)
    .fetch_optional(pool)
    .await?;
    row.map(|(channel_id,)| channel_id).ok_or(AppError::NotFound)
}

pub async fn add_reaction(
    State(state): State<AppState>,
    user: AuthUser,
    Path(message_id): Path<Uuid>,
    Json(body): Json<AddReaction>,
) -> Result<Json<WithTxid<Reaction>>, AppError> {
    let emoji = validate_emoji(&body.emoji)?;
    let channel_id = channel_of_message(&state.pool, message_id).await?;
    channel_access(&state.pool, channel_id, user.id).await?;

    let mut tx = state.pool.begin().await?;

    // Idempotent: re-reacting returns the existing row (and always a row, so the
    // response carries the txid even when the reaction already existed).
    let row: Reaction = sqlx::query_as(&format!(
        r#"
        insert into reactions (message_id, user_id, channel_id, emoji)
        values ($1, $2, $3, $4)
        on conflict (message_id, user_id, emoji) do update set emoji = excluded.emoji
        returning {REACTION_COLUMNS}
        "#
    ))
    .bind(message_id)
    .bind(user.id)
    .bind(channel_id)
    .bind(&emoji)
    .fetch_one(&mut *tx)
    .await?;

    let txid = current_txid(&mut tx).await?;
    tx.commit().await?;

    Ok(Json(WithTxid { item: row, txid }))
}

pub async fn remove_reaction(
    State(state): State<AppState>,
    user: AuthUser,
    Path((message_id, emoji)): Path<(Uuid, String)>,
) -> Result<Json<WithTxid<Reaction>>, AppError> {
    let emoji = validate_emoji(&emoji)?;
    let channel_id = channel_of_message(&state.pool, message_id).await?;
    channel_access(&state.pool, channel_id, user.id).await?;

    let mut tx = state.pool.begin().await?;

    let row: Option<Reaction> = sqlx::query_as(&format!(
        "delete from reactions where message_id = $1 and user_id = $2 and emoji = $3 returning {REACTION_COLUMNS}"
    ))
    .bind(message_id)
    .bind(user.id)
    .bind(&emoji)
    .fetch_optional(&mut *tx)
    .await?;

    let txid = current_txid(&mut tx).await?;
    tx.commit().await?;

    let item = row.ok_or(AppError::NotFound)?;
    Ok(Json(WithTxid { item, txid }))
}

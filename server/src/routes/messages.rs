use axum::extract::{Path, State};
use axum::Json;
use uuid::Uuid;

use crate::auth::AuthUser;
use crate::error::AppError;
use crate::models::{CreateMessage, Message, UpdateMessage, WithTxid};
use crate::routes::{channel_access, current_txid, require_workspace_admin};
use crate::state::AppState;

const MESSAGE_COLUMNS: &str = "id, channel_id, author_id, author_name, author_avatar_url, \
     content, parent_id, is_reply, reply_count, created_at, edited_at, deleted_at";

pub async fn list_messages(
    State(state): State<AppState>,
    user: AuthUser,
    Path(channel_id): Path<Uuid>,
) -> Result<Json<Vec<Message>>, AppError> {
    channel_access(&state.pool, channel_id, user.id).await?;

    let rows: Vec<Message> = sqlx::query_as(&format!(
        r#"
        select {MESSAGE_COLUMNS}
        from messages
        where channel_id = $1 and deleted_at is null and is_reply = false
        order by created_at asc
        limit 200
        "#
    ))
    .bind(channel_id)
    .fetch_all(&state.pool)
    .await?;

    Ok(Json(rows))
}

pub async fn create_message(
    State(state): State<AppState>,
    user: AuthUser,
    Path(channel_id): Path<Uuid>,
    Json(body): Json<CreateMessage>,
) -> Result<Json<WithTxid<Message>>, AppError> {
    channel_access(&state.pool, channel_id, user.id).await?;

    let content = body.content.trim();
    if content.is_empty() {
        return Err(AppError::BadRequest("content is required".into()));
    }

    let mut tx = state.pool.begin().await?;

    // Threads are one level deep: replying to a reply attaches to the root.
    let mut root_id: Option<Uuid> = None;
    if let Some(parent_id) = body.parent_id {
        let parent: Option<(Uuid, bool, Option<Uuid>)> = sqlx::query_as(
            "select channel_id, is_reply, parent_id from messages where id = $1 and deleted_at is null",
        )
        .bind(parent_id)
        .fetch_optional(&mut *tx)
        .await?;

        let (parent_channel, parent_is_reply, parent_parent) =
            parent.ok_or(AppError::NotFound)?;
        if parent_channel != channel_id {
            return Err(AppError::BadRequest(
                "parent message is in another channel".into(),
            ));
        }
        root_id = if parent_is_reply {
            parent_parent
        } else {
            Some(parent_id)
        };
    }

    let (author_name, author_avatar_url): (String, Option<String>) =
        sqlx::query_as("select display_name, avatar_url from users where id = $1")
            .bind(user.id)
            .fetch_one(&mut *tx)
            .await?;

    let row: Message = sqlx::query_as(&format!(
        r#"
        insert into messages
            (id, channel_id, author_id, author_name, author_avatar_url, content, parent_id, is_reply)
        values ($1, $2, $3, $4, $5, $6, $7, $8)
        returning {MESSAGE_COLUMNS}
        "#
    ))
    .bind(body.id.unwrap_or_else(Uuid::new_v4))
    .bind(channel_id)
    .bind(user.id)
    .bind(author_name)
    .bind(author_avatar_url)
    .bind(content)
    .bind(root_id)
    .bind(root_id.is_some())
    .fetch_one(&mut *tx)
    .await?;

    let txid = current_txid(&mut tx).await?;
    tx.commit().await?;

    // Bump the root's reply count in its own transaction. Keeping it separate
    // from the reply's insert means the two changes carry distinct txids, so the
    // main-channel shape reliably observes the count update even while another
    // collection is awaiting the reply's txid.
    if let Some(root) = root_id {
        sqlx::query("update messages set reply_count = reply_count + 1 where id = $1")
            .bind(root)
            .execute(&state.pool)
            .await?;
    }

    Ok(Json(WithTxid { item: row, txid }))
}

/// Reads (channel_id, author_id, parent_id, already_deleted) for a message.
async fn message_meta(
    tx: &mut sqlx::Transaction<'_, sqlx::Postgres>,
    message_id: Uuid,
) -> Result<(Uuid, Uuid, Option<Uuid>, bool), AppError> {
    let row: Option<(Uuid, Uuid, Option<Uuid>, bool)> = sqlx::query_as(
        "select channel_id, author_id, parent_id, (deleted_at is not null) from messages where id = $1",
    )
    .bind(message_id)
    .fetch_optional(&mut **tx)
    .await?;

    let (channel_id, author_id, parent_id, deleted) = row.ok_or(AppError::NotFound)?;
    if deleted {
        return Err(AppError::NotFound);
    }
    Ok((channel_id, author_id, parent_id, deleted))
}

/// Edit a message. Only the author may edit.
pub async fn update_message(
    State(state): State<AppState>,
    user: AuthUser,
    Path(message_id): Path<Uuid>,
    Json(body): Json<UpdateMessage>,
) -> Result<Json<WithTxid<Message>>, AppError> {
    let content = body.content.trim();
    if content.is_empty() {
        return Err(AppError::BadRequest("content is required".into()));
    }

    let mut tx = state.pool.begin().await?;
    let (channel_id, author_id, _, _) = message_meta(&mut tx, message_id).await?;

    channel_access(&state.pool, channel_id, user.id).await?;
    if author_id != user.id {
        return Err(AppError::Forbidden);
    }

    let row: Message = sqlx::query_as(&format!(
        "update messages set content = $2, edited_at = now() where id = $1 returning {MESSAGE_COLUMNS}"
    ))
    .bind(message_id)
    .bind(content)
    .fetch_one(&mut *tx)
    .await?;

    let txid = current_txid(&mut tx).await?;
    tx.commit().await?;

    Ok(Json(WithTxid { item: row, txid }))
}

/// Soft-delete a message. The author or a workspace admin may delete.
pub async fn delete_message(
    State(state): State<AppState>,
    user: AuthUser,
    Path(message_id): Path<Uuid>,
) -> Result<Json<WithTxid<Message>>, AppError> {
    let mut tx = state.pool.begin().await?;
    let (channel_id, author_id, parent_id, _) = message_meta(&mut tx, message_id).await?;

    let access = channel_access(&state.pool, channel_id, user.id).await?;
    if author_id != user.id {
        require_workspace_admin(&state.pool, access.workspace_id, user.id).await?;
    }

    let row: Message = sqlx::query_as(&format!(
        "update messages set deleted_at = now() where id = $1 returning {MESSAGE_COLUMNS}"
    ))
    .bind(message_id)
    .fetch_one(&mut *tx)
    .await?;

    if let Some(root) = parent_id {
        sqlx::query("update messages set reply_count = greatest(reply_count - 1, 0) where id = $1")
            .bind(root)
            .execute(&mut *tx)
            .await?;
    }

    let txid = current_txid(&mut tx).await?;
    tx.commit().await?;

    Ok(Json(WithTxid { item: row, txid }))
}

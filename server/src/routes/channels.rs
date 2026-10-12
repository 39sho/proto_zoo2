use axum::extract::{Path, State};
use axum::http::StatusCode;
use axum::Json;
use uuid::Uuid;

use crate::auth::AuthUser;
use crate::error::AppError;
use crate::models::{AddChannelMember, Channel, CreateChannel, Member};
use crate::routes::{channel_access, require_channel_admin, require_workspace_member};
use crate::state::AppState;

const CHANNEL_COLUMNS: &str = "id, workspace_id, name, topic, visibility, created_at";

pub async fn list_channels(
    State(state): State<AppState>,
    user: AuthUser,
    Path(workspace_id): Path<Uuid>,
) -> Result<Json<Vec<Channel>>, AppError> {
    require_workspace_member(&state.pool, workspace_id, user.id).await?;

    let rows: Vec<Channel> = sqlx::query_as(&format!(
        r#"
        select {CHANNEL_COLUMNS}
        from channels
        where workspace_id = $1
          and (
            visibility = 'public'
            or id in (select channel_id from channel_members where user_id = $2)
          )
        order by created_at asc
        "#
    ))
    .bind(workspace_id)
    .bind(user.id)
    .fetch_all(&state.pool)
    .await?;

    Ok(Json(rows))
}

pub async fn create_channel(
    State(state): State<AppState>,
    user: AuthUser,
    Path(workspace_id): Path<Uuid>,
    Json(body): Json<CreateChannel>,
) -> Result<Json<Channel>, AppError> {
    require_workspace_member(&state.pool, workspace_id, user.id).await?;

    let name = body.name.trim().to_lowercase().replace(' ', "-");
    if name.is_empty() {
        return Err(AppError::BadRequest("name is required".into()));
    }

    let visibility = body.visibility.unwrap_or_else(|| "public".to_string());
    if visibility != "public" && visibility != "private" {
        return Err(AppError::BadRequest(
            "visibility must be 'public' or 'private'".into(),
        ));
    }

    let mut tx = state.pool.begin().await?;

    let channel: Result<Channel, sqlx::Error> = sqlx::query_as(&format!(
        r#"
        insert into channels (workspace_id, name, topic, visibility)
        values ($1, $2, $3, $4)
        returning {CHANNEL_COLUMNS}
        "#
    ))
    .bind(workspace_id)
    .bind(&name)
    .bind(&body.topic)
    .bind(&visibility)
    .fetch_one(&mut *tx)
    .await;

    let channel = match channel {
        Ok(channel) => channel,
        Err(sqlx::Error::Database(e)) if e.code().as_deref() == Some("23505") => {
            return Err(AppError::BadRequest("channel already exists".into()));
        }
        Err(e) => return Err(e.into()),
    };

    // The creator administers a private channel via an explicit membership row.
    if visibility == "private" {
        sqlx::query(
            "insert into channel_members (channel_id, user_id, role) values ($1, $2, 'admin')",
        )
        .bind(channel.id)
        .bind(user.id)
        .execute(&mut *tx)
        .await?;
    }

    tx.commit().await?;

    Ok(Json(channel))
}

pub async fn list_members(
    State(state): State<AppState>,
    user: AuthUser,
    Path(channel_id): Path<Uuid>,
) -> Result<Json<Vec<Member>>, AppError> {
    channel_access(&state.pool, channel_id, user.id).await?;

    let rows: Vec<Member> = sqlx::query_as(
        r#"
        select u.id as user_id, u.display_name, u.avatar_url, cm.role
        from channel_members cm
        join users u on u.id = cm.user_id
        where cm.channel_id = $1
        order by cm.created_at asc
        "#,
    )
    .bind(channel_id)
    .fetch_all(&state.pool)
    .await?;

    Ok(Json(rows))
}

pub async fn add_member(
    State(state): State<AppState>,
    user: AuthUser,
    Path(channel_id): Path<Uuid>,
    Json(body): Json<AddChannelMember>,
) -> Result<Json<Member>, AppError> {
    let access = require_channel_admin(&state.pool, channel_id, user.id).await?;
    if access.visibility != "private" {
        return Err(AppError::BadRequest(
            "channel members only apply to private channels".into(),
        ));
    }

    require_workspace_member(&state.pool, access.workspace_id, body.user_id).await?;

    let role = body.role.unwrap_or_else(|| "member".to_string());
    if role != "admin" && role != "member" {
        return Err(AppError::BadRequest(
            "role must be 'admin' or 'member'".into(),
        ));
    }

    sqlx::query(
        r#"
        insert into channel_members (channel_id, user_id, role)
        values ($1, $2, $3)
        on conflict (channel_id, user_id) do update set role = excluded.role
        "#,
    )
    .bind(channel_id)
    .bind(body.user_id)
    .bind(&role)
    .execute(&state.pool)
    .await?;

    let member: Member = sqlx::query_as(
        r#"
        select u.id as user_id, u.display_name, u.avatar_url, cm.role
        from channel_members cm
        join users u on u.id = cm.user_id
        where cm.channel_id = $1 and cm.user_id = $2
        "#,
    )
    .bind(channel_id)
    .bind(body.user_id)
    .fetch_one(&state.pool)
    .await?;

    Ok(Json(member))
}

pub async fn remove_member(
    State(state): State<AppState>,
    user: AuthUser,
    Path((channel_id, member_id)): Path<(Uuid, Uuid)>,
) -> Result<StatusCode, AppError> {
    require_channel_admin(&state.pool, channel_id, user.id).await?;

    let affected = sqlx::query("delete from channel_members where channel_id = $1 and user_id = $2")
        .bind(channel_id)
        .bind(member_id)
        .execute(&state.pool)
        .await?
        .rows_affected();

    if affected == 0 {
        return Err(AppError::NotFound);
    }

    Ok(StatusCode::NO_CONTENT)
}

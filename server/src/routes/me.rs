use axum::extract::State;
use axum::Json;

use crate::auth::AuthUser;
use crate::error::AppError;
use crate::models::{SyncMe, User};
use crate::state::AppState;

pub async fn get_me(
    State(state): State<AppState>,
    user: AuthUser,
) -> Result<Json<User>, AppError> {
    let row: User = sqlx::query_as(
        "select id, external_id, display_name, email, avatar_url, created_at from users where id = $1",
    )
    .bind(user.id)
    .fetch_one(&state.pool)
    .await?;
    Ok(Json(row))
}

/// Optional profile sync for identity providers that do not embed a display
/// name in the token (e.g. Clerk's default session token). Providers that do
/// (most OIDC IdPs) already populate the profile during authentication, and
/// this call is then a no-op for those fields.
pub async fn sync_me(
    State(state): State<AppState>,
    user: AuthUser,
    Json(body): Json<SyncMe>,
) -> Result<Json<User>, AppError> {
    let display_name = body.display_name.filter(|s| !s.trim().is_empty());

    let row: User = sqlx::query_as(
        r#"
        insert into users (external_id, display_name, avatar_url)
        values ($1, coalesce($2, $1), $3)
        on conflict (external_id) do update
            set display_name = coalesce($2, users.display_name),
                avatar_url = coalesce($3, users.avatar_url)
        returning id, external_id, display_name, email, avatar_url, created_at
        "#,
    )
    .bind(&user.external_id)
    .bind(&display_name)
    .bind(&body.avatar_url)
    .fetch_one(&state.pool)
    .await?;

    Ok(Json(row))
}

use axum::extract::{Path, State};
use axum::Json;
use uuid::Uuid;

use crate::auth::AuthUser;
use crate::error::AppError;
use crate::models::{CreateWorkspace, Member, UpdateMemberRole, Workspace};
use crate::routes::{require_workspace_admin, require_workspace_member};
use crate::state::AppState;

pub async fn list_workspaces(
    State(state): State<AppState>,
    user: AuthUser,
) -> Result<Json<Vec<Workspace>>, AppError> {
    let rows: Vec<Workspace> = sqlx::query_as(
        r#"
        select w.id, w.name, w.slug, w.created_by, w.created_at
        from workspaces w
        join workspace_members m on m.workspace_id = w.id
        where m.user_id = $1
        order by w.created_at asc
        "#,
    )
    .bind(user.id)
    .fetch_all(&state.pool)
    .await?;

    Ok(Json(rows))
}

pub async fn list_members(
    State(state): State<AppState>,
    user: AuthUser,
    Path(workspace_id): Path<Uuid>,
) -> Result<Json<Vec<Member>>, AppError> {
    require_workspace_member(&state.pool, workspace_id, user.id).await?;

    let rows: Vec<Member> = sqlx::query_as(
        r#"
        select u.id as user_id, u.display_name, u.avatar_url, m.role
        from workspace_members m
        join users u on u.id = m.user_id
        where m.workspace_id = $1
        order by m.created_at asc
        "#,
    )
    .bind(workspace_id)
    .fetch_all(&state.pool)
    .await?;

    Ok(Json(rows))
}

pub async fn update_member_role(
    State(state): State<AppState>,
    user: AuthUser,
    Path((workspace_id, member_id)): Path<(Uuid, Uuid)>,
    Json(body): Json<UpdateMemberRole>,
) -> Result<Json<Member>, AppError> {
    require_workspace_admin(&state.pool, workspace_id, user.id).await?;

    if body.role != "admin" && body.role != "member" {
        return Err(AppError::BadRequest(
            "role must be 'admin' or 'member'".into(),
        ));
    }

    let target: Option<(String,)> = sqlx::query_as(
        "select role from workspace_members where workspace_id = $1 and user_id = $2",
    )
    .bind(workspace_id)
    .bind(member_id)
    .fetch_optional(&state.pool)
    .await?;

    match target {
        None => return Err(AppError::NotFound),
        Some((role,)) if role == "owner" => {
            return Err(AppError::BadRequest(
                "cannot change the owner's role".into(),
            ))
        }
        _ => {}
    }

    sqlx::query("update workspace_members set role = $3 where workspace_id = $1 and user_id = $2")
        .bind(workspace_id)
        .bind(member_id)
        .bind(&body.role)
        .execute(&state.pool)
        .await?;

    let member: Member = sqlx::query_as(
        r#"
        select u.id as user_id, u.display_name, u.avatar_url, m.role
        from workspace_members m
        join users u on u.id = m.user_id
        where m.workspace_id = $1 and m.user_id = $2
        "#,
    )
    .bind(workspace_id)
    .bind(member_id)
    .fetch_one(&state.pool)
    .await?;

    Ok(Json(member))
}

pub async fn create_workspace(
    State(state): State<AppState>,
    user: AuthUser,
    Json(body): Json<CreateWorkspace>,
) -> Result<Json<Workspace>, AppError> {
    let name = body.name.trim();
    if name.is_empty() {
        return Err(AppError::BadRequest("name is required".into()));
    }

    let mut tx = state.pool.begin().await?;

    let slug = unique_slug(&mut tx, name).await?;

    let workspace: Workspace = sqlx::query_as(
        r#"
        insert into workspaces (name, slug, created_by)
        values ($1, $2, $3)
        returning id, name, slug, created_by, created_at
        "#,
    )
    .bind(name)
    .bind(&slug)
    .bind(user.id)
    .fetch_one(&mut *tx)
    .await?;

    sqlx::query("insert into workspace_members (workspace_id, user_id, role) values ($1, $2, 'owner')")
        .bind(workspace.id)
        .bind(user.id)
        .execute(&mut *tx)
        .await?;

    sqlx::query("insert into channels (workspace_id, name, topic) values ($1, 'general', 'Welcome!')")
        .bind(workspace.id)
        .execute(&mut *tx)
        .await?;

    tx.commit().await?;

    Ok(Json(workspace))
}

async fn unique_slug(
    tx: &mut sqlx::Transaction<'_, sqlx::Postgres>,
    name: &str,
) -> Result<String, AppError> {
    let base = slugify(name);
    let mut candidate = base.clone();
    let mut n = 1;

    loop {
        let exists: Option<(i32,)> =
            sqlx::query_as("select 1 from workspaces where slug = $1")
                .bind(&candidate)
                .fetch_optional(&mut **tx)
                .await?;
        if exists.is_none() {
            return Ok(candidate);
        }
        n += 1;
        candidate = format!("{base}-{n}");
    }
}

fn slugify(name: &str) -> String {
    let slug: String = name
        .to_lowercase()
        .chars()
        .map(|c| if c.is_ascii_alphanumeric() { c } else { '-' })
        .collect();
    let slug = slug.trim_matches('-').replace("--", "-");
    if slug.is_empty() {
        "workspace".to_string()
    } else {
        slug
    }
}

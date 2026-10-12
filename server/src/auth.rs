use axum::extract::FromRequestParts;
use axum::http::header::AUTHORIZATION;
use axum::http::request::Parts;
use jsonwebtoken::jwk::JwkSet;
use jsonwebtoken::{decode, decode_header, Algorithm, DecodingKey, Validation};
use serde::Deserialize;
use uuid::Uuid;

use crate::config::AuthConfig;
use crate::error::AppError;
use crate::state::AppState;

/// The authenticated caller, resolved to a local `users.id`.
#[derive(Debug, Clone)]
pub struct AuthUser {
    pub id: Uuid,
    pub external_id: String,
}

/// Provider-neutral view of the authenticated subject. Whatever identity
/// provider we use is reduced to this before touching the database.
struct Identity {
    external_id: String,
    display_name: Option<String>,
    email: Option<String>,
    avatar_url: Option<String>,
}

#[derive(Debug, Deserialize)]
struct Claims {
    sub: String,
    #[allow(dead_code)]
    exp: usize,
    // Best-effort profile claims. Different OIDC providers populate different
    // subsets, so everything here is optional.
    name: Option<String>,
    preferred_username: Option<String>,
    nickname: Option<String>,
    email: Option<String>,
    picture: Option<String>,
    avatar_url: Option<String>,
}

impl FromRequestParts<AppState> for AuthUser {
    type Rejection = AppError;

    async fn from_request_parts(
        parts: &mut Parts,
        state: &AppState,
    ) -> Result<Self, Self::Rejection> {
        let identity = authenticate(parts, state).await?;
        let id = ensure_user(&state.pool, &identity).await?;
        Ok(AuthUser {
            id,
            external_id: identity.external_id,
        })
    }
}

/// Insert the user on first sight, refreshing profile fields from the identity
/// provider when it supplies them. Returns the stable local id.
async fn ensure_user(pool: &sqlx::PgPool, identity: &Identity) -> Result<Uuid, AppError> {
    let display_name = identity
        .display_name
        .clone()
        .unwrap_or_else(|| identity.external_id.clone());

    let row: (Uuid,) = sqlx::query_as(
        r#"
        insert into users (external_id, display_name, email, avatar_url)
        values ($1, $2, $3, $4)
        on conflict (external_id) do update
            set display_name = coalesce($2, users.display_name),
                email = coalesce($3, users.email),
                avatar_url = coalesce($4, users.avatar_url)
        returning id
        "#,
    )
    .bind(&identity.external_id)
    .bind(&display_name)
    .bind(&identity.email)
    .bind(&identity.avatar_url)
    .fetch_one(pool)
    .await?;

    Ok(row.0)
}

async fn authenticate(parts: &Parts, state: &AppState) -> Result<Identity, AppError> {
    match &state.config.auth {
        AuthConfig::Dev { external_id } => {
            // A dev header lets you impersonate different users locally.
            let external_id = parts
                .headers
                .get("x-dev-user")
                .and_then(|value| value.to_str().ok())
                .filter(|value| !value.is_empty())
                .map(|value| value.to_string())
                .unwrap_or_else(|| external_id.clone());

            Ok(Identity {
                external_id,
                display_name: None,
                email: None,
                avatar_url: None,
            })
        }
        AuthConfig::Oidc { .. } => verify_oidc_token(parts, state).await,
    }
}

async fn verify_oidc_token(parts: &Parts, state: &AppState) -> Result<Identity, AppError> {
    let (jwks_url, issuer, audience) = match &state.config.auth {
        AuthConfig::Oidc {
            jwks_url,
            issuer,
            audience,
        } => (jwks_url.clone(), issuer.clone(), audience.clone()),
        AuthConfig::Dev { .. } => unreachable!(),
    };

    let token = parts
        .headers
        .get(AUTHORIZATION)
        .and_then(|v| v.to_str().ok())
        .and_then(|v| v.strip_prefix("Bearer "))
        .ok_or(AppError::Unauthorized)?
        .trim()
        .to_string();

    let kid = decode_header(&token)
        .map_err(|_| AppError::Unauthorized)?
        .kid
        .ok_or(AppError::Unauthorized)?;

    let jwk = get_jwk(state, &jwks_url, &kid).await?;
    let key = DecodingKey::from_jwk(&jwk).map_err(|_| AppError::Unauthorized)?;

    let mut validation = Validation::new(Algorithm::RS256);
    validation.set_issuer(&[issuer]);
    if let Some(aud) = audience {
        validation.set_audience(&[aud]);
    } else {
        validation.validate_aud = false;
    }

    let data = decode::<Claims>(&token, &key, &validation).map_err(|e| {
        tracing::warn!(error = %e, "oidc token verification failed");
        AppError::Unauthorized
    })?;

    let claims = data.claims;
    let display_name = claims
        .name
        .or(claims.preferred_username)
        .or(claims.nickname);

    Ok(Identity {
        external_id: claims.sub,
        display_name,
        email: claims.email,
        avatar_url: claims.picture.or(claims.avatar_url),
    })
}

async fn get_jwk(
    state: &AppState,
    jwks_url: &str,
    kid: &str,
) -> Result<jsonwebtoken::jwk::Jwk, AppError> {
    {
        let cache = state.jwks.read().await;
        if cache.is_fresh() {
            if let Some(jwk) = cache
                .keys
                .iter()
                .find(|k| k.common.key_id.as_deref() == Some(kid))
            {
                return Ok(jwk.clone());
            }
        }
    }

    let set: JwkSet = state
        .http
        .get(jwks_url)
        .send()
        .await?
        .error_for_status()
        .map_err(|e| AppError::Upstream(e.to_string()))?
        .json()
        .await?;

    let found = set
        .keys
        .iter()
        .find(|k| k.common.key_id.as_deref() == Some(kid))
        .cloned();

    {
        let mut cache = state.jwks.write().await;
        cache.keys = set.keys;
        cache.fetched_at = Some(std::time::Instant::now());
    }

    found.ok_or(AppError::Unauthorized)
}

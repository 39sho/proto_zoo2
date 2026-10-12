use std::env;

#[derive(Clone, Debug)]
pub struct Config {
    pub database_url: String,
    pub bind_addr: String,
    pub electric_url: String,
    pub electric_secret: Option<String>,
    pub cors_origin: String,
    pub auth: AuthConfig,
}

/// Authentication is intentionally provider-agnostic. Anything that exposes an
/// OpenID Connect style JWKS endpoint (Keycloak, Zitadel, Kanidm, Authentik,
/// Ory, Clerk, ...) plugs straight in here. Swap to a custom auth service by
/// giving it a JWKS endpoint too, or by adding a new `AuthConfig` variant +
/// `authenticate` implementation.
#[derive(Clone, Debug)]
pub enum AuthConfig {
    /// No identity provider. Every request maps to a single local dev user.
    Dev { external_id: String },
    /// Verify RS256 bearer JWTs against an OIDC provider's JWKS endpoint.
    Oidc {
        jwks_url: String,
        issuer: String,
        audience: Option<String>,
    },
}

impl Config {
    pub fn from_env() -> anyhow::Result<Self> {
        let database_url = env::var("DATABASE_URL")
            .unwrap_or_else(|_| "postgresql://postgres:password@localhost:54321/electric".to_string());
        let bind_addr = env::var("BIND_ADDR").unwrap_or_else(|_| "0.0.0.0:8080".to_string());
        let electric_url = env::var("ELECTRIC_URL")
            .unwrap_or_else(|_| "http://localhost:3001/v1/shape".to_string());
        let electric_secret = env::var("ELECTRIC_SECRET").ok().filter(|s| !s.is_empty());
        let cors_origin =
            env::var("CORS_ORIGIN").unwrap_or_else(|_| "http://localhost:3000".to_string());

        // OIDC_* are the canonical names; CLERK_* are accepted for backwards
        // compatibility with earlier setups.
        let issuer = env_first(&["OIDC_ISSUER", "CLERK_ISSUER"]);
        let jwks_url = env_first(&["OIDC_JWKS_URL", "CLERK_JWKS_URL"]);
        let audience = env_first(&["OIDC_AUDIENCE", "CLERK_AUDIENCE"]);

        let auth = match issuer {
            Some(issuer) => {
                let jwks_url = jwks_url
                    .unwrap_or_else(|| format!("{}/.well-known/jwks.json", issuer.trim_end_matches('/')));
                AuthConfig::Oidc {
                    jwks_url,
                    issuer,
                    audience,
                }
            }
            None => {
                let external_id =
                    env::var("DEV_EXTERNAL_ID").unwrap_or_else(|_| "dev-user".to_string());
                tracing::warn!(
                    "OIDC_ISSUER is not set — running in DEV AUTH mode as `{}`",
                    external_id
                );
                AuthConfig::Dev { external_id }
            }
        };

        Ok(Self {
            database_url,
            bind_addr,
            electric_url,
            electric_secret,
            cors_origin,
            auth,
        })
    }
}

fn env_first(keys: &[&str]) -> Option<String> {
    keys.iter()
        .find_map(|key| env::var(key).ok().filter(|value| !value.is_empty()))
}

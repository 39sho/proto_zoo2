use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

#[derive(Debug, Serialize, sqlx::FromRow)]
pub struct User {
    pub id: Uuid,
    pub external_id: String,
    pub display_name: String,
    pub email: Option<String>,
    pub avatar_url: Option<String>,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Serialize, sqlx::FromRow)]
pub struct Workspace {
    pub id: Uuid,
    pub name: String,
    pub slug: String,
    pub created_by: Uuid,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Serialize, sqlx::FromRow)]
pub struct Channel {
    pub id: Uuid,
    pub workspace_id: Uuid,
    pub name: String,
    pub topic: Option<String>,
    pub visibility: String,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Serialize, sqlx::FromRow)]
pub struct Message {
    pub id: Uuid,
    pub channel_id: Uuid,
    pub author_id: Uuid,
    pub author_name: String,
    pub author_avatar_url: Option<String>,
    pub content: String,
    pub parent_id: Option<Uuid>,
    pub is_reply: bool,
    pub reply_count: i32,
    pub created_at: DateTime<Utc>,
    pub edited_at: Option<DateTime<Utc>>,
    pub deleted_at: Option<DateTime<Utc>>,
}

/// A workspace/channel member joined with their public profile.
#[derive(Debug, Serialize, sqlx::FromRow)]
pub struct Member {
    pub user_id: Uuid,
    pub display_name: String,
    pub avatar_url: Option<String>,
    pub role: String,
}

#[derive(Debug, Deserialize)]
pub struct SyncMe {
    pub display_name: Option<String>,
    pub avatar_url: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct CreateWorkspace {
    pub name: String,
}

#[derive(Debug, Deserialize)]
pub struct CreateChannel {
    pub name: String,
    pub topic: Option<String>,
    #[serde(default)]
    pub visibility: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct CreateMessage {
    /// Client-generated id so optimistic inserts keep a stable key.
    #[serde(default)]
    pub id: Option<Uuid>,
    pub content: String,
    /// When set, the message is posted as a reply in that message's thread.
    #[serde(default)]
    pub parent_id: Option<Uuid>,
}

/// Flattens an entity with the Postgres transaction id of the write, so an
/// Electric/TanStack DB client can wait for the exact change to sync back.
#[derive(Debug, Serialize)]
pub struct WithTxid<T> {
    #[serde(flatten)]
    pub item: T,
    pub txid: i64,
}

#[derive(Debug, Deserialize)]
pub struct UpdateMessage {
    pub content: String,
}

#[derive(Debug, Serialize, sqlx::FromRow)]
pub struct Reaction {
    pub message_id: Uuid,
    pub user_id: Uuid,
    pub channel_id: Uuid,
    pub emoji: String,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Deserialize)]
pub struct AddReaction {
    pub emoji: String,
}

#[derive(Debug, Deserialize)]
pub struct AddChannelMember {
    pub user_id: Uuid,
    #[serde(default)]
    pub role: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct UpdateMemberRole {
    pub role: String,
}

-- Users are keyed by their external identity provider id (Clerk `sub`).
create table if not exists users (
    id uuid primary key default gen_random_uuid(),
    external_id text not null unique,
    display_name text not null,
    avatar_url text,
    created_at timestamptz not null default now()
);

create table if not exists workspaces (
    id uuid primary key default gen_random_uuid(),
    name text not null,
    slug text not null unique,
    created_by uuid not null references users (id),
    created_at timestamptz not null default now()
);

create table if not exists workspace_members (
    workspace_id uuid not null references workspaces (id) on delete cascade,
    user_id uuid not null references users (id) on delete cascade,
    role text not null default 'member',
    created_at timestamptz not null default now(),
    primary key (workspace_id, user_id)
);

create table if not exists channels (
    id uuid primary key default gen_random_uuid(),
    workspace_id uuid not null references workspaces (id) on delete cascade,
    name text not null,
    topic text,
    created_at timestamptz not null default now(),
    unique (workspace_id, name)
);

create table if not exists messages (
    id uuid primary key default gen_random_uuid(),
    channel_id uuid not null references channels (id) on delete cascade,
    author_id uuid not null references users (id),
    -- Denormalised so a single Electric shape carries everything the UI needs
    -- (Electric shapes are per-table and do not join).
    author_name text not null,
    author_avatar_url text,
    content text not null,
    created_at timestamptz not null default now(),
    edited_at timestamptz,
    deleted_at timestamptz
);

create index if not exists messages_channel_created_idx
    on messages (channel_id, created_at);

-- Electric needs the full old row on update/delete to emit correct changes.
alter table users replica identity full;
alter table workspaces replica identity full;
alter table workspace_members replica identity full;
alter table channels replica identity full;
alter table messages replica identity full;

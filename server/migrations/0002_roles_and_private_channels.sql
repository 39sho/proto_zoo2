-- Optional email captured from the identity provider's claims.
alter table users add column if not exists email text;

-- Channel visibility: public channels are readable by every workspace member,
-- private channels only by the users listed in channel_members.
alter table channels
    add column if not exists visibility text not null default 'public'
        check (visibility in ('public', 'private'));

create table if not exists channel_members (
    channel_id uuid not null references channels (id) on delete cascade,
    user_id uuid not null references users (id) on delete cascade,
    role text not null default 'member' check (role in ('admin', 'member')),
    created_at timestamptz not null default now(),
    primary key (channel_id, user_id)
);

create index if not exists channel_members_user_idx on channel_members (user_id);

-- channel_members is read inside the channels shape's WHERE subquery, so
-- Electric needs the full old row to react correctly to membership changes.
alter table channel_members replica identity full;

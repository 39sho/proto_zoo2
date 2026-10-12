-- Reactions are individual (message, user, emoji) rows. channel_id is
-- denormalised from the message so a single Electric shape can be scoped to a
-- channel without a join.
create table if not exists reactions (
    message_id uuid not null references messages (id) on delete cascade,
    user_id uuid not null references users (id) on delete cascade,
    channel_id uuid not null references channels (id) on delete cascade,
    emoji text not null,
    created_at timestamptz not null default now(),
    primary key (message_id, user_id, emoji)
);

create index if not exists reactions_channel_idx on reactions (channel_id);

alter table reactions replica identity full;

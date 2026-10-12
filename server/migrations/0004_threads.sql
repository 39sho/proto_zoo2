-- Threads: a reply is a normal message with parent_id set. `is_reply` is a
-- denormalised boolean so the main channel shape can exclude replies with a
-- simple equality filter (avoids NULL comparisons in Electric where clauses).
-- `reply_count` is kept on the root so the main list can show live counts.
alter table messages
    add column if not exists parent_id uuid references messages (id) on delete cascade;

alter table messages
    add column if not exists is_reply boolean not null default false;

alter table messages
    add column if not exists reply_count integer not null default 0;

create index if not exists messages_parent_idx on messages (parent_id);

create index if not exists messages_channel_root_idx
    on messages (channel_id) where is_reply = false;

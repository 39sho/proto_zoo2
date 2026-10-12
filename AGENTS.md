# AGENTS.md

Conventions and hard-won lessons for this repo. Read this before changing the
sync layer — most of these cost real debugging time.

## Stack

- `server/` — Rust (axum + sqlx). REST writes, auth, and the **Electric shape
  proxy** with per-request authorization.
- `apps/web/` — TanStack Start + React + Tailwind v4 + shadcn/ui (**Base UI**) +
  TanStack DB (`@tanstack/electric-db-collection`).
- `docker-compose.yml` — Postgres + Electric. Postgres needs `wal_level=logical`.

## Run

```bash
docker compose up -d                     # Postgres + Electric
cargo run --manifest-path server/Cargo.toml   # API on :8080
npm run dev                              # web on :3000
npm run test:sync                        # HTTP-level sync regression tests
npm run typecheck
```

## Electric / TanStack DB rules (read these)

1. **One collection per table + scope.** Do not create two collections over the
   same table that write to each other. Threads are modeled as a single
   per-channel `messages` collection with live-query filters, *not* a separate
   `replies` shape. Symptom of breaking this: a write on one collection causes
   updates on the other to be silently dropped.

2. **Keep aggregate updates in a separate transaction from the row write.** When
   a write also bumps a denormalised counter on another row (e.g. a reply
   incrementing the root's `reply_count`), commit the row first, then update the
   counter in its own transaction. Same-txid changes are not reliably delivered
   to a second consumer.

3. **`offset=-1` returns the shape's snapshot at creation time**, not "current
   rows". To observe deltas use `handle` + `offset` + `live=true` (that's what the
   client does). Do not assert on `offset=-1` to mean "up to date".

4. **Don't put `$n` parameters inside WHERE subqueries.** Electric misreports
   them ("parameter value was not used", electric#3143). Inline server-validated
   UUIDs as literals instead (see `channels_shape`).

5. **Updates arrive as partial rows and numbers may be strings.** Electric sends
   only changed columns on update, and `integer` columns can arrive as strings
   (`"reply_count":"1"`). Coerce with `Number(...)`.

6. **Writes go through the txid handshake.** Every mutation endpoint returns
   `{ ...row, txid }` read from `pg_current_xact_id()::xid::text` **in the same
   transaction**. The collection's `onInsert/onUpdate/onDelete` must
   `await collection.utils.awaitTxId(txid)` so optimistic state is only dropped
   after the change syncs back.

7. **Writes are REST + optimistic; reads are Electric shapes.** Electric is
   read-only. Never write to Postgres expecting the client to reconcile without
   the txid handshake.

8. **Number-ish columns in shapes:** because of (5), prefer checking with
   `Number()`/`String()` rather than strict equality in tests.

## Debugging sync

- **In-app shape inspector:** `npm run dev`, then click the floating **shapes**
  button (bottom-right). Shows each collection's id, scope, status, ready, rows.
  It mounts in its **own React root** (`components/devPanelMount.tsx`) — keep it
  out of the app tree; adding components there has been observed to perturb
  on-demand sync timing.
- **Electric client logs:** in the browser console run
  `localStorage.debug = 'ts/db:electric'` then reload.
- **Electric server logs:** `ELECTRIC_LOG_LEVEL=debug docker compose up -d electric`
  (`ELECTRIC_OTEL_DEBUG` and the Phoenix LiveDashboard are also available).
- **Rust shape proxy logs:** run the server with
  `RUST_LOG=info,chat_server=debug cargo run -p chat-server`. Logs the resolved
  `table`/`where` per request and the upstream status/handle/offset per response.
- **HTTP-level truth:** `scripts/sync-test.mjs` (`npm run test:sync`) asserts the
  exact streaming semantics (insert delivery, reply_count on its own txid,
  private-channel 403, reactions). Add a case here when you touch sync.

## Data model notes

- Soft delete (`messages.deleted_at`); UI filters deleted rows.
- `messages.is_reply` is a denormalised boolean so the main list can filter with
  simple equality (avoid `IS NULL` in Electric where clauses).
- `reactions.channel_id` and `messages.author_*` are denormalised because Electric
  shapes cannot join.
- Authorization is enforced in the shape proxy (`server/src/routes/shapes.rs`) and
  in REST handlers (`channel_access` / `require_channel_admin` / `require_workspace_admin`).

## Auth

Provider-agnostic OIDC (JWKS + issuer) in `server/src/auth.rs`; `AuthConfig` is
`Dev | Oidc`. The client seam is `AuthAdapter` in `apps/web/src/lib/session.tsx`.
`OIDC_ISSUER` unset ⇒ dev mode (`X-Dev-User` header switches users).

## UI conventions

- New UI uses Tailwind + shadcn/ui components from `@/components/ui/*`. Primitives
  are **Base UI** (`@base-ui/react`), not Radix. Add components with
  `cd apps/web && npx shadcn@latest add <name>` (config: `apps/web/components.json`,
  style `base-nova`).
- Theme tokens live in `apps/web/src/styles.css` (`--background`, `--foreground`,
  `--primary`, `--muted`, `--accent`, `--border`, `--ring`, ...). The hand-written
  legacy styles use `--bg`/`--text`/`--brand`/`--danger`. **The brand colour is
  `--brand`** — do not use `--accent` for it (that name belongs to shadcn).
- Dark-first. The app is dark; light/dark switching is planned (Phase 2).
- Keep the dev inspector mounted in its own React root (`devPanelMount.tsx`); do not
  add it to the app tree.

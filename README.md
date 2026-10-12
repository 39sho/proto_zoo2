# proto zoo

Slack / Discord 風のコミュニケーションツールの MVP。

- **同期**: [Electric SQL](https://electric-sql.com)（Postgres → クライアントへリアルタイム配信）
- **API サーバ**: Rust（axum + sqlx）。書き込み・認証・認可・shape プロキシを担当
- **フロント**: TanStack Start + React + **Tailwind CSS v4 + shadcn/ui（Base UI）** +
  [TanStack DB](https://tanstack.com/db)（`@tanstack/electric-db-collection` の collection を
  live query で購読、楽観的更新・on-demand 同期・仮想スクロール対応）
- **認証**: OIDC（プロバイダ非依存）。Keycloak / Zitadel / Kanidm / Authentik / Ory / Clerk など
  任意の JWKS を出す IdP に接続可能。未設定なら単一のローカル開発ユーザーで動作

## アーキテクチャ

```
┌────────────┐   write (REST)    ┌──────────────┐   SQL   ┌────────────┐
│  Browser   │ ────────────────► │  Rust API    │ ──────► │  Postgres  │
│ TanStack   │                   │  (axum)      │         │            │
│ Start      │   shape (HTTP)    │              │         └─────┬──────┘
│            │ ────────────────► │ /api/shapes  │               │ WAL (logical)
│            │                   │  proxy       │               ▼
│            │                   └──────┬───────┘         ┌────────────┐
│            │ ◄──── 変更をストリーム ────┘                 │  Electric  │
└────────────┘        (server-side secret)  ◄─────────────│   sync     │
        ▲                                                  └────────────┘
        └─────────────── クライアントは Electric に直接触れない
```

クライアントは Electric を直接叩かず、必ず Rust API の shape プロキシ
(`/api/shapes/channels`, `/api/shapes/messages`) 経由で読みます。これにより:

- Electric の secret をサーバ側に隠せる
- リクエストごとに「そのユーザーがそのデータにアクセスできるか」を検証できる
- クライアントは `table` や `where` を指定できず、サーバが確定させる

## 認証（認証 = 誰か）

**プロバイダ非依存**です。Rust サーバは次の環境変数で任意の OIDC IdP を受け付けます。

```env
OIDC_ISSUER=https://id.example.com/realms/acme
OIDC_JWKS_URL=https://id.example.com/realms/acme/protocol/openid-connect/certs  # 省略時は <issuer>/.well-known/jwks.json
OIDC_AUDIENCE=            # 任意
```

- ベアラ JWT を **RS256 / JWKS / issuer** で検証し、`sub` を外部IDとして `users` に upsert。
- `name` / `preferred_username` / `email` / `picture` などのクレームがあればプロフィールに反映。
- `OIDC_ISSUER` 未設定なら **dev 認証**（全リクエストが単一のローカルユーザー。`X-Dev-User`
  ヘッダでユーザーを切り替え可）。ローカル開発はこれだけで動きます。
- 後方互換で `CLERK_ISSUER` / `CLERK_JWKS_URL` / `CLERK_AUDIENCE` も受理します。

フロントエンド側は `apps/web/src/lib/session.tsx` の **`AuthAdapter`** が唯一の結合点です。
`getToken()` を提供するアダプタを書けば任意の IdP に対応でき、Rust 側も Electric も変更不要です。
現状は Clerk アダプタと dev アダプタを実装済み（未設定時は自動で dev）。

> 自前実装の認証サービスに切り替える場合も、そのサービスが JWKS を出せば設定だけで接続できます。
> 出せない場合は `AuthConfig` に変種を追加し `authenticate` を実装します。

## 認可（認可 = 何にアクセスできるか）

**ここは我々の責務**で、認証方式とは独立です。REST と shape プロキシの両方で強制します。

| 概念 | テーブル / カラム | ルール |
| --- | --- | --- |
| ワークスペースロール | `workspace_members.role` = `owner` / `admin` / `member` | owner は不変。owner/admin のみロール変更可 |
| チャンネル公開範囲 | `channels.visibility` = `public` / `private` | public はワークスペース全員が閲覧可 |
| チャンネルメンバー | `channel_members`(channel_id, user_id, role) | private は明示メンバーのみ閲覧可。作成者は `admin` |

- **REST**: すべてのハンドラが `channel_access()` / `require_channel_admin()` /
  `require_workspace_admin()`（`server/src/routes/mod.rs`）で検証。
- **shape**: `channels` shape の `where` で可視性を表現し、`messages` shape は
  チャンネルアクセスを検証してから配信します。

```
channels の where:
  workspace_id = '<ws>'
  AND (visibility = 'public'
       OR id IN (SELECT channel_id FROM channel_members WHERE user_id = '<user>'))
```

> Electric `@core/sync-service` 1.7.10+ でサブクエリが GA・常時有効です。
> サーバ側で検証済みの UUID をリテラル埋め込みしています（サブクエリ内 `$n` の既知バグ
> electric#3143 の回避と、注入防止を兼ねる）。メンバー追加時は Electric が move-in を
> ストリームし、開いているクライアントに即反映されます。

## UI（Tailwind v4 + shadcn / Base UI）

UI は Tailwind v4 + shadcn/ui で構築し、プリミティブは **Base UI**（`@base-ui/react`）です
（Radix ではなく Base UI を選択）。

- 設定は `apps/web/components.json`（`"style": "base-nova"` = Base UI + Nova プリセット）。
- コンポーネント追加: `cd apps/web && npx shadcn@latest add <name>`
  （例: `dialog alert-dialog popover dropdown-menu tooltip input textarea avatar skeleton sonner`）。
  `ui/*` は `src/components/ui/` に生成されます。
- テーマトークンは `src/styles.css` の `:root` に定義（`--background`/`--foreground`/`--primary`/
  `--muted`/`--accent`/`--border`/`--ring` …）。既存の手書きスタイルは `--bg`/`--text`/`--brand`
  系を引き続き使用します。**ブランド色は `--brand`**（shadcn の `--accent` と衝突するため改名済み）。
- ダーク固定（dark-first）。ライト/ダーク切替は Phase 2 で追加予定。

### リファクタ進行状況

- **Phase 0（完了）**: Tailwind v4 + shadcn(Base UI) の土台、トークン移植、`ui/*` 導入。
- **Phase 1（完了）**: `routes/index.tsx`（約1,100行）を分割。
  - `hooks/` がデータ層を所有（`useBootstrap` / `useWorkspaceChannels` / `useMessages` / `useReactions` / `useThread` / `useMembers`）。
  - `components/chat/` が表示（`ChannelRail` / `ChannelSidebar` / `ChatView` / `MessageList` / `MessageRow` / `Composer` / `ThreadPane` / `MembersDialog` / `Create*Dialog`）。
  - `routes/index.tsx` は 63 行の薄いオーケストレータ。方針は「feature が自分の hook を持つ／再利用される行だけ純表示」。
- **Phase 2（完了）**: レスポンシブ（`md` 境界。狭幅はサイドバー/チャットを切替＋戻るボタン、スレッドはオーバーレイ）とライト/ダーク切替（`ThemeProvider` + `ModeToggle`、`<html class="dark">`、FOUC 防止のインラインスクリプト）。
- **Phase 3（完了）**: `Skeleton`（読み込み）、`sonner` トースト（書き込み失敗）、`AlertDialog`（削除確認）。
- **Phase 4（完了）**: Base UI の `Dialog` / `AlertDialog` を採用（フォーカストラップ・Escape・aria は標準）。削除確認・メンバー管理がキーボードで操作可能。主要要素に `data-testid` を付与し回帰テストを安定化。

主要な e2e（ヘッドレス）検証: 送信・編集・削除（確認付き）・リアクション・スレッド・メンバー管理・テーマ切替・ページング・モバイル表示がすべてパス。

## ディレクトリ構成

```
proto_zoo2/
├── docker-compose.yml     # Postgres + Electric
├── package.json           # npm workspaces (apps/web)
├── server/                # Rust API (axum)
│   ├── migrations/        # SQL（起動時に自動適用）
│   └── src/
│       ├── auth.rs        # OIDC(JWKS) 検証 / dev モード / Principal 抽象
│       ├── config.rs      # AuthConfig（Dev | Oidc）
│       └── routes/
│           ├── mod.rs     # 認可ヘルパ（roles / channel_access）
│           ├── shapes.rs  # Electric shape 認可プロキシ
│           └── ...
└── apps/web/              # TanStack Start + React + Tailwind + shadcn(Base UI)
    └── src/
        ├── components/
        │   ├── chat/          # ChannelRail / ChannelSidebar / ChatView / MessageList /
        │   │                  # MessageRow / Composer / ThreadPane / MembersDialog / ...
        │   ├── theme/         # ThemeProvider / ModeToggle
        │   ├── ui/            # shadcn (Base UI) コンポーネント
        │   └── EmojiPicker.tsx / DevPanel.tsx / devPanelMount.tsx
        ├── hooks/             # useBootstrap / useWorkspaceChannels / useMessages /
        │                      # useReactions / useThread / useMembers（データ層）
        ├── lib/session.tsx    # AuthAdapter（Clerk / dev）
        ├── lib/collections.ts # Electric 由来の TanStack DB collection
        ├── lib/api.ts         # REST クライアント
        └── routes/index.tsx   # 薄いオーケストレータ
```

## 書き込みと楽観的更新（txid ハンドシェイク）

読み取りは collection、書き込みは Rust API + **楽観的更新**です。Electric は読み取り専用なので、
クライアントは先にローカルで行を操作し、サーバ確定後に Electric が同じ行をストリームして置換します。
メッセージの**送信・編集・削除**（削除はソフトデリート）と**リアクションの追加/削除**がこの方式です。

```
collection.insert / update / delete     # 即時ローカル反映
  └─ onInsert/onUpdate/onDelete → API   # サーバが同一トランザクションで書き込み
       └─ レスポンス { txid }            # SELECT pg_current_xact_id()::xid::text
            └─ awaitTxId(txid)           # Electric の change ヘッダ txids と突き合わせ
```

- サーバは書き込みと **同じトランザクション内**で `pg_current_xact_id()::xid::text` を取得して `txid`
  を返します（別トランザクションだと値が一致せず `awaitTxId` がタイムアウトします）。
- 一致が確認できるまで楽観行を保持するため、UI がちらつきません。失敗時は TanStack DB がロールバックします。
- collection は workspace / channel ごとに生成しキャッシュしています（`lib/collections.ts`）。

### リアクション

`reactions(message_id, user_id, emoji)` の行単位で保持し、UI 側で集計して絵文字チップに
まとめます（自分の分はハイライト、クリックでトグル）。

- `channel_id` を messages から非正規化してあり、`/api/shapes/reactions?channel_id=...` の
  shape でチャンネル単位に同期できます（Electric は join 不可のため）。
- 追加/削除は他の書き込みと同じ txid ハンドシェイクで楽観的更新。
- 認可はメッセージのチャンネルアクセスを検証（`channel_access`）。
- 絵文字ピッカーは **frimousse**（ヘッドレス）を自前 CSS でダークテーマに合わせています
  （`apps/web/src/components/EmojiPicker.tsx`）。「最近使った絵文字」は localStorage に保存。
- 絵文字データは CDN を使わず **`apps/web/public/emojibase-data/en/` に自前配信**
  （emojibase-data 17 の `data.json` / `messages.json`）。`frimousse` の `emojibaseUrl`
  でそこを指しています。

### スレッド

`messages` に `parent_id` / `is_reply` / `reply_count` を追加し、返信は 1 階層
（返信への返信は root にぶら下げる）。

- メイン一覧とスレッドは **同じ channel の messages collection** を別々の live query で参照
  します（メイン: `is_reply = false`、スレッド: `parent_id = root`）。on-demand 同期なので
  各クエリが必要な範囲だけ subset 取得します。
- 送信は他と同じ txid ハンドシェイクで楽観的更新。メイン一覧には返信を出さず、
  root に `reply_count` を非正規化して「N replies」を表示します。
- 重要な設計メモ: 返信の**挿入と root の reply_count 加算は別トランザクション**にしています。
  同一トランザクション（同一 txid）だと、別 collection の楽観 mutation 中にメイン一覧側の
  更新が取りこぼされる事象があったためです。加えて、**1 チャンネル = 1 collection** に
  統合し、スレッドを別 shape/collection にしない構成にしています（cross-collection の同期
  干渉を避けるため）。
- 認可はチャンネルアクセス（`channel_access`）で検証。

## 大量履歴のページングと仮想スクロール

チャンネル履歴を全件同期・全行描画すると重くなるため、2段構えで対処しています。

**データの窓化（本命）**
- messages collection は `syncMode: 'on-demand'`。クエリが必要とする範囲だけ Electric の
  subset（`subset__order_by/limit/offset`）で取得します（Rust プロキシは subset パラメータを
  そのまま転送するので**サーバ変更なし**）。
- `useLiveInfiniteQuery`（`@tanstack/react-db`）で `orderBy(created_at, 'desc')` + `pageSize`。
  上端スクロールで `fetchNextPage()` が `setWindow()` で窓を広げ、古いページを追加ロード。

**描画の仮想化**
- `@tanstack/react-virtual` の `useVirtualizer` で可視行だけ DOM 化（`measureElement` で動的高さ）。
- 最下部への追従は「ユーザーが上を読んでいる間は飛ばさない」判定付き（`atBottom`）。
- 古いページを先頭に足すときは、追加前後の `scrollHeight` 差で `scrollTop` を補正して位置維持。

> 検証: 120件のチャンネルで 61→13→0 と3ページに分けて全ロードしつつ、DOM 行は常に約19行。

## 前提

- Docker + Docker Compose
- Rust（stable / edition 2021）
- Node.js 20.9+

## セットアップ手順

### 1. Postgres と Electric を起動

```bash
docker compose up -d
docker compose ps        # postgres が healthy になるまで待つ
```

- Postgres: `localhost:54321`（user/pass = `postgres` / `password`, db = `electric`）
- Electric: `localhost:3001`

### 2. Rust API サーバ

```bash
cp server/.env.example server/.env
cargo run --manifest-path server/Cargo.toml
```

起動時にマイグレーションが自動適用されます。`http://localhost:8080` で待ち受けます。
`OIDC_ISSUER` 未設定なら dev モードで起動します。

### 3. フロントエンド

```bash
cp apps/web/.env.example apps/web/.env
npm install          # 初回のみ（リポジトリ直下）
npm run dev          # http://localhost:3000
```

dev モードでは「Dev User」として動きます。ワークスペース作成 → チャンネル作成
（Public / Private を選択）→ 送信。別ウィンドウで同じチャンネルを開くとリアルタイム反映。
private チャンネルは鍵アイコンで表示され、ヘッダの **Members** から
メンバー追加・ロール変更ができます。

## IdP を接続する（例: Keycloak）

1. Keycloak を起動し realm / client を作成（クライアントは public + PKCE 推奨）。
2. `server/.env` に `OIDC_ISSUER`（realm の URL）と必要なら `OIDC_AUDIENCE` を設定。
3. フロントは `session.tsx` に OIDC アダプタを追加して選択（`oidc-client-ts` + PKCE など）。
   Clerk を使う場合は `VITE_CLERK_PUBLISHABLE_KEY` / `CLERK_SECRET_KEY` を設定すれば
   既存の Clerk アダプタがそのまま動きます。

## ポート一覧

| サービス   | ポート |
| ---------- | ------ |
| Web (Vite) | 3000   |
| Rust API   | 8080   |
| Electric   | 3001   |
| Postgres   | 54321  |

## よく使うコマンド

```bash
docker compose up -d
docker compose logs -f electric
docker compose down         # 停止（データは volume に残る）
docker compose down -v      # データも削除

docker compose exec postgres psql -U postgres -d electric -c 'select * from messages;'

cargo run --manifest-path server/Cargo.toml   # API
npm run dev                                    # Web
npm run build                                  # Web ビルド
npm run typecheck                              # 型チェック
npm run test:sync                              # 同期の回帰テスト（HTTP レベル）
```

## DX / デバッグ

同期まわりは層が厚く、ハマりやすいので道具を用意しています。**規約と落とし穴は
`AGENTS.md` に必須事項としてまとめてあります**（変更前に一読）。

- **同期の回帰テスト**: `npm run test:sync`（`scripts/sync-test.mjs`）。ブラウザ不要で、
  insert の配信・`reply_count` が別 txid で流れること・private shape の 403・リアクションの
  txid 往復を HTTP で検証します。同期に触ったらここにケースを足す。
- **アプリ内 shape インスペクタ**: dev 限定で右下の **shapes** ボタン。各 collection の
  id / scope / status / ready / rows を一覧（`apps/web/src/components/DevPanel.tsx`）。
- **Electric クライアントログ**: ブラウザで `localStorage.debug = 'ts/db:electric'` → リロード。
- **Electric サーバログ**: `ELECTRIC_LOG_LEVEL=debug docker compose up -d electric`
  （LiveDashboard も利用可。`docker-compose.yml` のコメント参照）。
- **Rust shape プロキシログ**: `RUST_LOG=info,chat_server=debug cargo run --manifest-path server/Cargo.toml`
  。リクエストごとの `table`/`where` と、Electric の status/handle/offset を出力します。

## 本番向けの注意

- Electric の secret を有効化（root `.env` の `ELECTRIC_SECRET` と `server/.env` を一致）。
- `ELECTRIC_INSECURE=true` はローカルの平文 HTTP 用。本番は TLS を有効化。
- CORS は `server/.env` の `CORS_ORIGIN` で実際のフロントドメインを指定。
- shape の `where` はサーバ側で確定しているため、クライアントからフィルタを広げられません。
- サブクエリを含む shape は Electric の再起動時に破棄されます（再取得され整合は保たれます）。

## トラブルシューティング

- **`failed to connect to Postgres`**: `docker compose ps` で healthy か確認。
- **Electric が 400**: テーブル未作成の可能性。Rust API を起動してマイグレーションを流す。
- **private チャンネルが見えない/見える**: `channel_members` の行と、`channels.visibility` を確認。
- **リアルタイムに来ない**: `docker compose logs -f electric` と `wal_level=logical` を確認。

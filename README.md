# game-portal

Godot の Web エクスポートをアップロードして配信するサイト。Cloudflare Workers 上で動く。

- **サイト / 管理画面**: Astro（`@astrojs/cloudflare`）、管理画面は Svelte のアイランド
- **API**: Hono（`/api/*`）
- **バンドル置き場**: R2（`games/<slug>/<version>/...`）
- **メタデータ**: D1（ゲーム、バージョン、公開中バージョン）
- **認証**: Cloudflare Access（`/admin` と `/api/*`）

Godot の `.wasm` はそのままだと Workers の静的アセット上限（1ファイル 25 MiB）を超えるため、
エクスポート結果は R2 に置き、Worker 経由で同一オリジンから配信する。

## URL

| パス | 内容 |
| --- | --- |
| `/` | 公開中のゲーム一覧 |
| `/play/<slug>` | ゲームを iframe で埋め込んだ公開ページ |
| `/games/<slug>/` | 公開中バージョンへリダイレクト（キャッシュしない） |
| `/games/<slug>/<version>/...` | バンドルの配信（不変、長期キャッシュ、Range 対応） |
| `/admin` | 管理画面（登録、アップロード、プレビュー、公開切り替え、削除） |
| `/api/*` | 管理 API |

## バージョンの状態

1. `POST /api/games/:slug/versions` で作成 → `uploading`
2. `PUT /api/games/:slug/versions/:version/files/<path>` でファイルを1つずつ送信（R2 へストリーム）
3. `POST .../complete` で検証（`index.html`、`*.wasm`、`*.pck` が必要）→ `ready` または `failed`
4. `POST /api/games/:slug/publish` に `{"version": "..."}` → 公開（`null` で非公開）

`ready` 以外のバージョンは配信されない。公開していない `ready` のバージョンは、
URL を知っていれば `/games/<slug>/<version>/` で開ける（管理画面のプレビューに使う）。

## ローカル開発

```sh
npm install
npm run db:migrate:local
npm run dev
```

http://localhost:4321/admin を開く。ローカルの D1 と R2 は `.wrangler/` に保存される。
開発サーバーでは Access の設定がなければ認証を素通しにする。

## デプロイ

```sh
npx wrangler d1 create game-portal          # 出力の database_id を wrangler.jsonc に書く
npx wrangler r2 bucket create game-portal-bundles
npm run db:migrate:remote
npm run deploy
```

### Cloudflare Access

`/admin` と `/api/*` は Access の JWT を検証する。**本番で未設定の場合はすべて拒否する。**

1. Zero Trust で Self-hosted アプリケーションを作り、対象パスを `/admin` と `/api` にする
2. `wrangler.jsonc` の `vars` に設定する
   - `ACCESS_TEAM_DOMAIN`: `https://<team>.cloudflareaccess.com`
   - `ACCESS_AUD`: アプリケーションの Application Audience (AUD) タグ

CI などからアップロードする場合は、Access のサービストークンで同じ API を呼べる。

## 制限と注意

- アップロードは Worker を経由するため、1ファイルのサイズは Cloudflare のリクエストボディ上限
  （Free / Pro プランは 100 MB）まで。超える場合は R2 への署名付き URL 直接アップロードに切り替える。
- Godot のエクスポートはシングルスレッド前提。スレッド版を使う場合は COOP / COEP ヘッダーの追加が必要。
- アダプターがセッション用の KV（`SESSION` バインディング）を自動で用意する。このプロジェクトでは使っていない。

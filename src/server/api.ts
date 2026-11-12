// 管理用 API。/api/* にマウントされ、すべて Cloudflare Access の認証を通った後に呼ばれる
// （認証は src/middleware.ts）。

import { Hono } from 'hono';
import {
  SLUG_RE,
  VERSION_RE,
  bundleKey,
  contentTypeFor,
  deleteBundle,
  findMissingFiles,
  listBundle,
  normalizeFilePath,
} from './bundles';

type Bindings = { DB: D1Database; BUNDLES: R2Bucket };

interface GameRow {
  slug: string;
  title: string;
  active_version: string | null;
  created_at: string;
}

interface VersionRow {
  game_slug: string;
  version: string;
  status: 'uploading' | 'ready' | 'failed';
  godot_version: string | null;
  total_bytes: number | null;
  file_count: number | null;
  created_at: string;
}

export const api = new Hono<{ Bindings: Bindings }>().basePath('/api');

api.onError((error, c) => {
  console.error(error);
  return c.json({ error: 'Internal error.' }, 500);
});

async function readJson(request: Request): Promise<Record<string, unknown>> {
  try {
    const body: unknown = await request.json();
    return body !== null && typeof body === 'object' ? (body as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

function findGame(db: D1Database, slug: string) {
  return db.prepare('SELECT * FROM games WHERE slug = ?').bind(slug).first<GameRow>();
}

function findVersion(db: D1Database, slug: string, version: string) {
  return db
    .prepare('SELECT * FROM versions WHERE game_slug = ? AND version = ?')
    .bind(slug, version)
    .first<VersionRow>();
}

// ゲーム -------------------------------------------------------------------

api.get('/games', async (c) => {
  const { results } = await c.env.DB.prepare(
    `SELECT g.*, (SELECT COUNT(*) FROM versions v WHERE v.game_slug = g.slug) AS version_count
     FROM games g ORDER BY g.created_at DESC`,
  ).all<GameRow & { version_count: number }>();
  return c.json({ games: results });
});

api.post('/games', async (c) => {
  const body = await readJson(c.req.raw);
  const slug = typeof body.slug === 'string' ? body.slug.trim() : '';
  const title = typeof body.title === 'string' ? body.title.trim() : '';
  if (!SLUG_RE.test(slug)) {
    return c.json({ error: 'slug は英小文字・数字・ハイフンで指定してください。' }, 400);
  }
  if (title.length === 0 || title.length > 200) {
    return c.json({ error: 'title は1〜200文字で指定してください。' }, 400);
  }
  if (await findGame(c.env.DB, slug)) {
    return c.json({ error: `"${slug}" は既に存在します。` }, 409);
  }
  await c.env.DB.prepare('INSERT INTO games (slug, title) VALUES (?, ?)').bind(slug, title).run();
  return c.json({ game: await findGame(c.env.DB, slug) }, 201);
});

api.get('/games/:slug', async (c) => {
  const game = await findGame(c.env.DB, c.req.param('slug'));
  if (!game) return c.json({ error: 'ゲームが見つかりません。' }, 404);
  const { results } = await c.env.DB.prepare(
    'SELECT * FROM versions WHERE game_slug = ? ORDER BY created_at DESC, version DESC',
  )
    .bind(game.slug)
    .all<VersionRow>();
  return c.json({ game, versions: results });
});

api.delete('/games/:slug', async (c) => {
  const game = await findGame(c.env.DB, c.req.param('slug'));
  if (!game) return c.json({ error: 'ゲームが見つかりません。' }, 404);
  const { results } = await c.env.DB.prepare('SELECT version FROM versions WHERE game_slug = ?')
    .bind(game.slug)
    .all<{ version: string }>();
  for (const row of results) {
    await deleteBundle(c.env.BUNDLES, game.slug, row.version);
  }
  await c.env.DB.batch([
    c.env.DB.prepare('DELETE FROM versions WHERE game_slug = ?').bind(game.slug),
    c.env.DB.prepare('DELETE FROM games WHERE slug = ?').bind(game.slug),
  ]);
  return c.body(null, 204);
});

// 公開切り替え ---------------------------------------------------------------

api.post('/games/:slug/publish', async (c) => {
  const game = await findGame(c.env.DB, c.req.param('slug'));
  if (!game) return c.json({ error: 'ゲームが見つかりません。' }, 404);
  const body = await readJson(c.req.raw);

  // version: null で非公開に戻す
  if (body.version === null) {
    await c.env.DB.prepare('UPDATE games SET active_version = NULL WHERE slug = ?')
      .bind(game.slug)
      .run();
    return c.json({ game: await findGame(c.env.DB, game.slug) });
  }

  const version = typeof body.version === 'string' ? body.version : '';
  const row = await findVersion(c.env.DB, game.slug, version);
  if (!row) return c.json({ error: 'バージョンが見つかりません。' }, 404);
  if (row.status !== 'ready') {
    return c.json({ error: 'アップロードが完了したバージョンだけ公開できます。' }, 409);
  }
  await c.env.DB.prepare('UPDATE games SET active_version = ? WHERE slug = ?')
    .bind(version, game.slug)
    .run();
  return c.json({ game: await findGame(c.env.DB, game.slug) });
});

// バージョン -----------------------------------------------------------------

api.post('/games/:slug/versions', async (c) => {
  const game = await findGame(c.env.DB, c.req.param('slug'));
  if (!game) return c.json({ error: 'ゲームが見つかりません。' }, 404);
  const body = await readJson(c.req.raw);
  const version = typeof body.version === 'string' ? body.version.trim() : '';
  const godotVersion =
    typeof body.godotVersion === 'string' && body.godotVersion.trim().length > 0
      ? body.godotVersion.trim().slice(0, 50)
      : null;
  if (!VERSION_RE.test(version)) {
    return c.json({ error: 'version は英数字と . _ - で指定してください。' }, 400);
  }
  if (await findVersion(c.env.DB, game.slug, version)) {
    return c.json({ error: `バージョン "${version}" は既に存在します。` }, 409);
  }
  await c.env.DB.prepare(
    "INSERT INTO versions (game_slug, version, status, godot_version) VALUES (?, ?, 'uploading', ?)",
  )
    .bind(game.slug, version, godotVersion)
    .run();
  return c.json({ version: await findVersion(c.env.DB, game.slug, version) }, 201);
});

api.put('/games/:slug/versions/:version/files/:path{.+}', async (c) => {
  const { slug, version } = c.req.param();
  const row = await findVersion(c.env.DB, slug, version);
  if (!row) return c.json({ error: 'バージョンが見つかりません。' }, 404);
  if (row.status !== 'uploading') {
    return c.json({ error: 'このバージョンは確定済みのため、ファイルを追加できません。' }, 409);
  }
  const path = normalizeFilePath(c.req.param('path'));
  if (!path) return c.json({ error: 'ファイルパスが不正です。' }, 400);
  if (!c.req.raw.body) return c.json({ error: 'ボディが空です。' }, 400);

  // ボディはメモリに載せず、そのまま R2 へ流す
  const object = await c.env.BUNDLES.put(bundleKey(slug, version, path), c.req.raw.body, {
    httpMetadata: { contentType: contentTypeFor(path) },
  });
  return c.json({ path, size: object.size }, 201);
});

api.post('/games/:slug/versions/:version/complete', async (c) => {
  const { slug, version } = c.req.param();
  const row = await findVersion(c.env.DB, slug, version);
  if (!row) return c.json({ error: 'バージョンが見つかりません。' }, 404);
  if (row.status === 'ready') return c.json({ version: row });

  const bundle = await listBundle(c.env.BUNDLES, slug, version);
  const missing = findMissingFiles(bundle.files);
  const status = missing.length === 0 ? 'ready' : 'failed';
  await c.env.DB.prepare(
    'UPDATE versions SET status = ?, total_bytes = ?, file_count = ? WHERE game_slug = ? AND version = ?',
  )
    .bind(status, bundle.totalBytes, bundle.files.length, slug, version)
    .run();

  const updated = await findVersion(c.env.DB, slug, version);
  if (missing.length > 0) {
    return c.json(
      { error: `必要なファイルが足りません: ${missing.join(', ')}`, missing, version: updated },
      422,
    );
  }
  return c.json({ version: updated });
});

api.delete('/games/:slug/versions/:version', async (c) => {
  const { slug, version } = c.req.param();
  const game = await findGame(c.env.DB, slug);
  const row = await findVersion(c.env.DB, slug, version);
  if (!game || !row) return c.json({ error: 'バージョンが見つかりません。' }, 404);
  if (game.active_version === version) {
    return c.json({ error: '公開中のバージョンは削除できません。' }, 409);
  }
  await deleteBundle(c.env.BUNDLES, slug, version);
  await c.env.DB.prepare('DELETE FROM versions WHERE game_slug = ? AND version = ?')
    .bind(slug, version)
    .run();
  return c.body(null, 204);
});

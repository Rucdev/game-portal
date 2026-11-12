// ゲームバンドルの配信。
//   /games/<slug>/                 → 公開中バージョンへリダイレクト（キャッシュしない）
//   /games/<slug>/<version>/<path> → R2 から配信（不変なので長期キャッシュ）

import { SLUG_RE, VERSION_RE, bundleKey, contentTypeFor, normalizeFilePath } from './bundles';

type Bindings = { DB: D1Database; BUNDLES: R2Bucket };

const IMMUTABLE = 'public, max-age=31536000, immutable';

function notFound(): Response {
  return new Response('Not found', { status: 404, headers: { 'Cache-Control': 'no-store' } });
}

export async function serveGame(request: Request, env: Bindings): Promise<Response> {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return new Response('Method not allowed', { status: 405, headers: { Allow: 'GET, HEAD' } });
  }

  // 末尾スラッシュの有無を区別したいので、ルートのパラメータではなく URL から直接取り出す
  const rest = decodeURIComponent(new URL(request.url).pathname).replace(/^\/games\/?/, '');
  const [slug = '', version, ...pathSegments] = rest.split('/');
  if (!SLUG_RE.test(slug)) return notFound();

  // /games/<slug> または /games/<slug>/ → 公開中バージョンへ
  if (version === undefined || version === '') {
    const game = await env.DB.prepare('SELECT active_version FROM games WHERE slug = ?')
      .bind(slug)
      .first<{ active_version: string | null }>();
    if (!game?.active_version) return notFound();
    const target = new URL(`/games/${slug}/${game.active_version}/`, request.url);
    return new Response(null, {
      status: 302,
      headers: { Location: target.toString(), 'Cache-Control': 'no-cache' },
    });
  }

  if (!VERSION_RE.test(version)) return notFound();

  // /games/<slug>/<version> は相対パス解決のために末尾スラッシュ付きへ寄せる
  if (pathSegments.length === 0) {
    return new Response(null, {
      status: 301,
      headers: { Location: new URL(`/games/${slug}/${version}/`, request.url).toString() },
    });
  }

  const rawPath = pathSegments.join('/');
  const path = rawPath === '' ? 'index.html' : normalizeFilePath(rawPath);
  if (!path) return notFound();

  // アップロード途中・検証失敗のバージョンは配信しない
  const row = await env.DB.prepare(
    'SELECT status FROM versions WHERE game_slug = ? AND version = ?',
  )
    .bind(slug, version)
    .first<{ status: string }>();
  if (row?.status !== 'ready') return notFound();

  const key = bundleKey(slug, version, path);
  const headers = new Headers({
    'Content-Type': contentTypeFor(path),
    'Cache-Control': IMMUTABLE,
    'Accept-Ranges': 'bytes',
    'X-Content-Type-Options': 'nosniff',
  });

  if (request.method === 'HEAD') {
    const head = await env.BUNDLES.head(key);
    if (!head) return notFound();
    headers.set('ETag', head.httpEtag);
    headers.set('Content-Length', String(head.size));
    return new Response(null, { headers });
  }

  const range = parseRange(request.headers.get('Range'));
  let object: R2ObjectBody | R2Object | null;
  try {
    object = await env.BUNDLES.get(key, { onlyIf: request.headers, range });
  } catch {
    // 範囲がファイルサイズを超えている場合など
    return new Response('Range not satisfiable', { status: 416 });
  }
  if (!object) return notFound();
  headers.set('ETag', object.httpEtag);

  // onlyIf の条件に合わなかった場合（If-None-Match 一致）は body が無い
  if (!('body' in object)) {
    return new Response(null, { status: 304, headers });
  }

  if (range) {
    const size = object.size;
    const offset = 'suffix' in range ? Math.max(size - range.suffix, 0) : range.offset;
    const end =
      'suffix' in range || range.length === undefined
        ? size - 1
        : Math.min(offset + range.length - 1, size - 1);
    headers.set('Content-Range', `bytes ${offset}-${end}/${size}`);
    headers.set('Content-Length', String(end - offset + 1));
    return new Response(object.body, { status: 206, headers });
  }

  return new Response(object.body, { headers });
}

type ByteRange = { offset: number; length?: number } | { suffix: number };

/** 単一範囲の Range ヘッダーだけを解釈する。複数範囲や不正な形式は無視して全体を返す。 */
function parseRange(header: string | null): ByteRange | undefined {
  if (!header) return undefined;
  const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!match) return undefined;
  const [, start = '', end = ''] = match;
  if (start === '' && end === '') return undefined;
  if (start === '') {
    const suffix = Number(end);
    return suffix > 0 ? { suffix } : undefined;
  }
  const offset = Number(start);
  if (end === '') return { offset };
  const last = Number(end);
  return last >= offset ? { offset, length: last - offset + 1 } : undefined;
}

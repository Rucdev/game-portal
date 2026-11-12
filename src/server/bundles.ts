// R2 上のバンドル配置と、パス・名前の検証をまとめたモジュール。
// キーは games/<slug>/<version>/<エクスポート内の相対パス>

export const SLUG_RE = /^[a-z0-9][a-z0-9-]{0,62}$/;
export const VERSION_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,62}$/;

const SEGMENT_RE = /^[A-Za-z0-9._ -]+$/;

/** エクスポート内の相対パスを検証して正規化する。不正なら null。 */
export function normalizeFilePath(raw: string): string | null {
  if (raw.length === 0 || raw.length > 512) return null;
  const segments = raw.split('/');
  for (const segment of segments) {
    if (segment === '' || segment === '.' || segment === '..') return null;
    if (!SEGMENT_RE.test(segment)) return null;
  }
  return segments.join('/');
}

export function bundlePrefix(slug: string, version: string): string {
  return `games/${slug}/${version}/`;
}

export function bundleKey(slug: string, version: string, path: string): string {
  return bundlePrefix(slug, version) + path;
}

const CONTENT_TYPES: Record<string, string> = {
  html: 'text/html; charset=utf-8',
  js: 'text/javascript; charset=utf-8',
  mjs: 'text/javascript; charset=utf-8',
  css: 'text/css; charset=utf-8',
  json: 'application/json',
  wasm: 'application/wasm',
  pck: 'application/octet-stream',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  svg: 'image/svg+xml',
  ico: 'image/x-icon',
  txt: 'text/plain; charset=utf-8',
};

export function contentTypeFor(path: string): string {
  const ext = path.slice(path.lastIndexOf('.') + 1).toLowerCase();
  return CONTENT_TYPES[ext] ?? 'application/octet-stream';
}

export interface BundleSummary {
  files: { path: string; size: number }[];
  totalBytes: number;
}

/** あるバージョンのバンドルに含まれるファイルを R2 から列挙する。 */
export async function listBundle(
  bucket: R2Bucket,
  slug: string,
  version: string,
): Promise<BundleSummary> {
  const prefix = bundlePrefix(slug, version);
  const files: BundleSummary['files'] = [];
  let cursor: string | undefined;
  do {
    const page = await bucket.list({ prefix, cursor });
    for (const object of page.objects) {
      files.push({ path: object.key.slice(prefix.length), size: object.size });
    }
    cursor = page.truncated ? page.cursor : undefined;
  } while (cursor);
  const totalBytes = files.reduce((sum, file) => sum + file.size, 0);
  return { files, totalBytes };
}

/** バンドルを丸ごと削除する。 */
export async function deleteBundle(
  bucket: R2Bucket,
  slug: string,
  version: string,
): Promise<void> {
  const { files } = await listBundle(bucket, slug, version);
  const keys = files.map((file) => bundleKey(slug, version, file.path));
  for (let i = 0; i < keys.length; i += 1000) {
    await bucket.delete(keys.slice(i, i + 1000));
  }
}

/** Godot の Web エクスポートとして最低限必要なファイルが揃っているか調べる。 */
export function findMissingFiles(files: { path: string }[]): string[] {
  const paths = files.map((file) => file.path);
  const missing: string[] = [];
  if (!paths.includes('index.html')) missing.push('index.html');
  if (!paths.some((path) => path.endsWith('.wasm'))) missing.push('*.wasm');
  if (!paths.some((path) => path.endsWith('.pck'))) missing.push('*.pck');
  return missing;
}

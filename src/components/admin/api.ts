// 管理 API のクライアント。ブラウザから同一オリジンの /api/* を呼ぶ。

export interface Game {
  slug: string;
  title: string;
  active_version: string | null;
  created_at: string;
  version_count?: number;
}

export interface Version {
  game_slug: string;
  version: string;
  status: 'uploading' | 'ready' | 'failed';
  godot_version: string | null;
  total_bytes: number | null;
  file_count: number | null;
  created_at: string;
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const response = await fetch(`/api${path}`, {
    method,
    headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (response.status === 204) return undefined as T;
  const data = (await response.json().catch(() => ({}))) as { error?: string };
  if (!response.ok) throw new Error(data.error ?? `リクエストに失敗しました (${response.status})`);
  return data as T;
}

export const listGames = () => request<{ games: Game[] }>('GET', '/games');

export const createGame = (slug: string, title: string) =>
  request<{ game: Game }>('POST', '/games', { slug, title });

export const getGame = (slug: string) =>
  request<{ game: Game; versions: Version[] }>('GET', `/games/${slug}`);

export const deleteGame = (slug: string) => request<void>('DELETE', `/games/${slug}`);

export const publish = (slug: string, version: string | null) =>
  request<{ game: Game }>('POST', `/games/${slug}/publish`, { version });

export const createVersion = (slug: string, version: string, godotVersion: string) =>
  request<{ version: Version }>('POST', `/games/${slug}/versions`, { version, godotVersion });

export const completeVersion = (slug: string, version: string) =>
  request<{ version: Version }>('POST', `/games/${slug}/versions/${version}/complete`);

export const deleteVersion = (slug: string, version: string) =>
  request<void>('DELETE', `/games/${slug}/versions/${version}`);

/** 1ファイルをアップロードする。進捗を取るために XMLHttpRequest を使う。 */
export function uploadFile(
  slug: string,
  version: string,
  path: string,
  file: File,
  onProgress: (loaded: number) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const encodedPath = path.split('/').map(encodeURIComponent).join('/');
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', `/api/games/${slug}/versions/${version}/files/${encodedPath}`);
    xhr.setRequestHeader('Content-Type', 'application/octet-stream');
    xhr.upload.onprogress = (event) => onProgress(event.loaded);
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        onProgress(file.size);
        resolve();
        return;
      }
      let message = `${path} のアップロードに失敗しました (${xhr.status})`;
      try {
        const data = JSON.parse(xhr.responseText) as { error?: string };
        if (data.error) message = `${path}: ${data.error}`;
      } catch {
        // JSON でないエラー応答はそのままのメッセージを使う
      }
      reject(new Error(message));
    };
    xhr.onerror = () => reject(new Error(`${path} のアップロード中に通信エラーが発生しました`));
    xhr.send(file);
  });
}

export function formatBytes(bytes: number | null): string {
  if (bytes === null) return '-';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

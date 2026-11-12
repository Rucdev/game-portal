<script lang="ts">
  import {
    deleteGame,
    deleteVersion,
    formatBytes,
    getGame,
    publish,
    type Game,
    type Version,
  } from './api';
  import Uploader from './Uploader.svelte';

  let { slug }: { slug: string } = $props();

  let game = $state<Game | null>(null);
  let versions = $state<Version[]>([]);
  let loading = $state(true);
  let error = $state('');
  let busy = $state(false);
  let preview = $state<string | null>(null);

  const STATUS_LABEL: Record<Version['status'], string> = {
    uploading: 'アップロード中',
    ready: '準備完了',
    failed: '検証失敗',
  };

  async function load() {
    try {
      const data = await getGame(slug);
      game = data.game;
      versions = data.versions;
      error = '';
    } catch (cause) {
      error = (cause as Error).message;
    } finally {
      loading = false;
    }
  }

  async function run(action: () => Promise<unknown>) {
    busy = true;
    error = '';
    try {
      await action();
      await load();
    } catch (cause) {
      error = (cause as Error).message;
    } finally {
      busy = false;
    }
  }

  function removeVersion(version: string) {
    if (!window.confirm(`バージョン ${version} を削除します。元に戻せません。`)) return;
    if (preview === version) preview = null;
    void run(() => deleteVersion(slug, version));
  }

  async function removeGame() {
    if (!window.confirm(`ゲーム "${slug}" と全バージョンを削除します。元に戻せません。`)) return;
    busy = true;
    try {
      await deleteGame(slug);
      window.location.hash = '';
    } catch (cause) {
      error = (cause as Error).message;
      busy = false;
    }
  }

  $effect(() => {
    void load();
  });
</script>

<p><a href="#/">← 一覧へ</a></p>

{#if loading}
  <p class="muted">読み込み中…</p>
{:else if !game}
  <p class="error">{error || 'ゲームが見つかりません。'}</p>
{:else}
  <header class="head">
    <div>
      <h1>{game.title}</h1>
      <p class="muted">
        <code>{game.slug}</code>
        ·
        {#if game.active_version}
          公開中: <strong>{game.active_version}</strong>
          （<a href={`/play/${game.slug}`} target="_blank" rel="noreferrer">公開ページ</a>）
        {:else}
          非公開
        {/if}
      </p>
    </div>
    <div class="head-actions">
      {#if game.active_version}
        <button disabled={busy} onclick={() => run(() => publish(slug, null))}>非公開にする</button>
      {/if}
      <button class="danger" disabled={busy} onclick={removeGame}>ゲームを削除</button>
    </div>
  </header>

  {#if error}<p class="error">{error}</p>{/if}

  <Uploader {slug} existing={versions.map((v) => v.version)} onDone={load} />

  <section class="card">
    <h2>バージョン</h2>
    {#if versions.length === 0}
      <p class="muted">まだバージョンがありません。</p>
    {:else}
      <table>
        <thead>
          <tr>
            <th>バージョン</th>
            <th>状態</th>
            <th>Godot</th>
            <th class="num">サイズ</th>
            <th>作成</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {#each versions as v (v.version)}
            {@const active = game.active_version === v.version}
            <tr class:active>
              <td>
                <code>{v.version}</code>
                {#if active}<span class="badge">公開中</span>{/if}
              </td>
              <td class={`status ${v.status}`}>{STATUS_LABEL[v.status]}</td>
              <td>{v.godot_version ?? '-'}</td>
              <td class="num">{formatBytes(v.total_bytes)}</td>
              <td class="muted">{v.created_at.slice(0, 16).replace('T', ' ')}</td>
              <td>
                <div class="actions">
                {#if v.status === 'ready'}
                  <button onclick={() => (preview = preview === v.version ? null : v.version)}>
                    {preview === v.version ? 'プレビューを閉じる' : 'プレビュー'}
                  </button>
                  {#if !active}
                    <button
                      class="primary"
                      disabled={busy}
                      onclick={() => run(() => publish(slug, v.version))}
                    >
                      公開
                    </button>
                  {/if}
                {/if}
                {#if !active}
                  <button class="danger" disabled={busy} onclick={() => removeVersion(v.version)}>
                    削除
                  </button>
                {/if}
                </div>
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    {/if}
  </section>

  {#if preview}
    <section class="card">
      <h2>プレビュー: <code>{preview}</code></h2>
      <div class="frame">
        <iframe
          src={`/games/${slug}/${preview}/`}
          title={`${game.title} ${preview}`}
          allow="fullscreen; gamepad; autoplay"
        ></iframe>
      </div>
    </section>
  {/if}
{/if}

<style>
  .head {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 1rem;
    flex-wrap: wrap;
    margin-bottom: 1.25rem;
  }
  .head h1 {
    margin-bottom: 0.25rem;
  }
  .head p {
    margin: 0;
  }
  .head-actions {
    display: flex;
    gap: 0.5rem;
  }
  table {
    width: 100%;
    border-collapse: collapse;
    font-size: 0.9rem;
  }
  th {
    text-align: left;
    font-weight: 500;
    color: var(--muted);
    font-size: 0.8rem;
    padding: 0 0.5rem 0.4rem 0;
  }
  td {
    padding: 0.55rem 0.5rem 0.55rem 0;
    border-top: 1px solid var(--line);
    vertical-align: middle;
  }
  .num {
    text-align: right;
    font-variant-numeric: tabular-nums;
  }
  .actions {
    display: flex;
    gap: 0.4rem;
    justify-content: flex-end;
    flex-wrap: wrap;
  }
  .badge {
    margin-left: 0.4rem;
    font-size: 0.75rem;
    font-weight: 600;
    color: var(--accent);
    border: 1px solid var(--accent);
    border-radius: 999px;
    padding: 0.05rem 0.5rem;
  }
  .status.ready {
    color: var(--accent);
  }
  .status.failed {
    color: var(--danger);
  }
  .status.uploading {
    color: var(--warn);
  }
  .frame {
    aspect-ratio: 16 / 9;
    background: #000;
    border-radius: 6px;
    overflow: hidden;
  }
  iframe {
    width: 100%;
    height: 100%;
    border: 0;
    display: block;
  }
  @media (max-width: 44rem) {
    table,
    tbody,
    tr,
    td {
      display: block;
    }
    thead {
      display: none;
    }
    tr {
      border-top: 1px solid var(--line);
      padding: 0.6rem 0;
    }
    td {
      border: 0;
      padding: 0.15rem 0;
    }
    .num {
      text-align: left;
    }
    .actions {
      justify-content: flex-start;
      margin-top: 0.4rem;
    }
  }
</style>

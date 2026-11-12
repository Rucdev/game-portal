<script lang="ts">
  import { completeVersion, createVersion, formatBytes, uploadFile } from './api';
  import { fromDrop, fromInput, missingFiles, type PickedFile } from './files';

  let {
    slug,
    existing,
    onDone,
  }: { slug: string; existing: string[]; onDone: () => void | Promise<void> } = $props();

  let version = $state('');
  let godotVersion = $state('');
  let files = $state<PickedFile[]>([]);
  let dragging = $state(false);
  let error = $state('');

  // アップロードの進行状況
  let phase = $state<'idle' | 'uploading' | 'done'>('idle');
  let loaded = $state<Record<string, number>>({});
  let current = $state('');

  const totalBytes = $derived(files.reduce((sum, entry) => sum + entry.file.size, 0));
  const loadedBytes = $derived(Object.values(loaded).reduce((sum, value) => sum + value, 0));
  const percent = $derived(totalBytes === 0 ? 0 : Math.floor((loadedBytes / totalBytes) * 100));
  const missing = $derived(files.length > 0 ? missingFiles(files) : []);
  const duplicate = $derived(existing.includes(version.trim()));
  const canUpload = $derived(
    phase !== 'uploading' &&
      files.length > 0 &&
      missing.length === 0 &&
      version.trim().length > 0 &&
      !duplicate,
  );

  function setFiles(picked: PickedFile[]) {
    files = picked;
    loaded = {};
    error = '';
    phase = 'idle';
  }

  function onInput(event: Event) {
    const input = event.currentTarget as HTMLInputElement;
    if (input.files) setFiles(fromInput(input.files));
    input.value = '';
  }

  async function onDrop(event: DragEvent) {
    event.preventDefault();
    dragging = false;
    if (phase === 'uploading' || !event.dataTransfer) return;
    setFiles(await fromDrop(event.dataTransfer));
  }

  async function upload() {
    const target = version.trim();
    phase = 'uploading';
    error = '';
    loaded = {};
    try {
      await createVersion(slug, target, godotVersion.trim());
      // 1ファイルずつ順番に送る（失敗箇所が分かりやすく、進捗も単純になる）
      for (const entry of files) {
        current = entry.path;
        await uploadFile(slug, target, entry.path, entry.file, (bytes) => {
          loaded[entry.path] = bytes;
        });
      }
      current = '';
      await completeVersion(slug, target);
      phase = 'done';
      files = [];
      version = '';
      await onDone();
    } catch (cause) {
      // 途中で失敗したバージョンは uploading / failed のまま残り、公開も配信もされない。
      // 一覧から削除して、同じバージョン名でやり直せる。
      error = (cause as Error).message;
      phase = 'idle';
      current = '';
      await onDone();
    }
  }
</script>

<section class="card">
  <h2>新しいバージョンをアップロード</h2>

  <div class="fields">
    <label>
      バージョン
      <input type="text" bind:value={version} placeholder="1.0.0" disabled={phase === 'uploading'} />
    </label>
    <label>
      Godot のバージョン（任意）
      <input
        type="text"
        bind:value={godotVersion}
        placeholder="4.5"
        disabled={phase === 'uploading'}
      />
    </label>
  </div>
  {#if duplicate}<p class="error">このバージョンは既に存在します。</p>{/if}

  <div
    class="drop"
    class:dragging
    role="group"
    aria-label="エクスポート先フォルダのドロップ領域"
    ondragover={(event) => {
      event.preventDefault();
      dragging = true;
    }}
    ondragleave={() => (dragging = false)}
    ondrop={onDrop}
  >
    <p>Godot の Web エクスポート先フォルダをここにドロップ</p>
    <label class="button pick">
      フォルダを選択
      <input
        type="file"
        webkitdirectory
        multiple
        onchange={onInput}
        disabled={phase === 'uploading'}
      />
    </label>
  </div>

  {#if files.length > 0}
    <ul class="files">
      {#each files as entry (entry.path)}
        {@const done = (loaded[entry.path] ?? 0) >= entry.file.size && phase !== 'idle'}
        <li class:done class:current={current === entry.path}>
          <code>{entry.path}</code>
          <span class="muted">{formatBytes(entry.file.size)}</span>
        </li>
      {/each}
    </ul>
    <p class="muted summary">{files.length} ファイル · {formatBytes(totalBytes)}</p>
  {/if}

  {#if missing.length > 0}
    <p class="error">
      Godot の Web エクスポートに必要なファイルが見つかりません: {missing.join(', ')}
    </p>
  {/if}

  {#if phase === 'uploading'}
    <div class="progress" role="progressbar" aria-valuenow={percent} aria-valuemin="0" aria-valuemax="100">
      <div class="bar" style={`width: ${percent}%`}></div>
    </div>
    <p class="muted summary">
      {percent}% · {formatBytes(loadedBytes)} / {formatBytes(totalBytes)}
      {#if current}· <code>{current}</code>{/if}
    </p>
  {/if}

  {#if phase === 'done'}
    <p class="ok">アップロードが完了しました。下の一覧からプレビューして公開できます。</p>
  {/if}
  {#if error}<p class="error">{error}</p>{/if}

  <div class="submit">
    <button class="primary" disabled={!canUpload} onclick={upload}>
      {phase === 'uploading' ? 'アップロード中…' : 'アップロード'}
    </button>
  </div>
</section>

<style>
  .fields {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 0.75rem;
    margin-bottom: 0.75rem;
  }
  @media (max-width: 40rem) {
    .fields {
      grid-template-columns: 1fr;
    }
  }
  .drop {
    border: 2px dashed var(--line);
    border-radius: var(--radius);
    padding: 1.5rem 1rem;
    text-align: center;
    color: var(--muted);
    transition: border-color 0.15s;
  }
  .drop.dragging {
    border-color: var(--accent);
    color: var(--ink);
  }
  .drop p {
    margin: 0 0 0.75rem;
  }
  .pick {
    color: var(--ink);
  }
  .pick input {
    position: absolute;
    width: 1px;
    height: 1px;
    opacity: 0;
    pointer-events: none;
  }
  .pick:focus-within {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }
  .files {
    list-style: none;
    margin: 0.9rem 0 0;
    padding: 0;
    max-height: 14rem;
    overflow: auto;
    border: 1px solid var(--line);
    border-radius: 6px;
    font-size: 0.85rem;
  }
  .files li {
    display: flex;
    justify-content: space-between;
    gap: 1rem;
    padding: 0.3rem 0.6rem;
    border-top: 1px solid var(--line);
  }
  .files li:first-child {
    border-top: 0;
  }
  .files li code {
    overflow-wrap: anywhere;
  }
  .files li.done code::before {
    content: '✓ ';
    color: var(--accent);
  }
  .files li.current {
    background: color-mix(in srgb, var(--accent) 12%, transparent);
  }
  .summary {
    font-size: 0.85rem;
    margin: 0.4rem 0 0;
  }
  .progress {
    height: 8px;
    background: var(--line);
    border-radius: 999px;
    overflow: hidden;
    margin-top: 0.9rem;
  }
  .bar {
    height: 100%;
    background: var(--accent);
    transition: width 0.15s;
  }
  .ok {
    color: var(--accent);
    font-size: 0.9rem;
    margin: 0.75rem 0 0;
  }
  .submit {
    margin-top: 1rem;
    display: flex;
    justify-content: flex-end;
  }
</style>

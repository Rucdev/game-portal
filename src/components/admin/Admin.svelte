<script lang="ts">
  import GameDetail from './GameDetail.svelte';
  import GameList from './GameList.svelte';

  // 画面は「一覧」と「詳細」の2つだけなので、URL のハッシュで切り替える
  // （#/games/<slug> が詳細）。リロードしても同じ画面に戻れる。
  function slugFromHash(): string | null {
    const match = /^#\/games\/([a-z0-9-]+)$/.exec(window.location.hash);
    return match ? match[1]! : null;
  }

  let slug = $state<string | null>(slugFromHash());

  $effect(() => {
    const onHashChange = () => (slug = slugFromHash());
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  });
</script>

<div class="admin">
  {#if slug}
    {#key slug}
      <GameDetail {slug} />
    {/key}
  {:else}
    <GameList />
  {/if}
</div>

<style>
  .admin :global(h1) {
    font-size: 1.5rem;
    margin: 0 0 1rem;
  }
  .admin :global(h2) {
    font-size: 1.05rem;
    margin: 0 0 0.75rem;
  }
  .admin :global(.card) {
    background: var(--surface);
    border: 1px solid var(--line);
    border-radius: var(--radius);
    padding: 1rem 1.1rem;
    margin-bottom: 1.25rem;
  }
  .admin :global(button),
  .admin :global(.button) {
    font: inherit;
    font-size: 0.9rem;
    padding: 0.4rem 0.8rem;
    border-radius: 6px;
    border: 1px solid var(--line);
    background: var(--surface);
    color: var(--ink);
    cursor: pointer;
    text-decoration: none;
    display: inline-block;
  }
  .admin :global(button:hover:not(:disabled)),
  .admin :global(.button:hover) {
    border-color: var(--accent);
  }
  .admin :global(button:disabled) {
    opacity: 0.5;
    cursor: not-allowed;
  }
  .admin :global(button.primary) {
    background: var(--accent);
    border-color: var(--accent);
    color: var(--accent-ink);
    font-weight: 600;
  }
  .admin :global(button.danger) {
    color: var(--danger);
  }
  .admin :global(input[type='text']) {
    font: inherit;
    padding: 0.4rem 0.6rem;
    border-radius: 6px;
    border: 1px solid var(--line);
    background: var(--bg);
    color: var(--ink);
    width: 100%;
  }
  .admin :global(label) {
    display: grid;
    gap: 0.25rem;
    font-size: 0.85rem;
    color: var(--muted);
  }
  .admin :global(.error) {
    color: var(--danger);
    font-size: 0.9rem;
    margin: 0.5rem 0 0;
  }
  .admin :global(.muted) {
    color: var(--muted);
  }
  .admin :global(code) {
    font-family: ui-monospace, 'SF Mono', Menlo, Consolas, monospace;
    font-size: 0.9em;
  }
</style>

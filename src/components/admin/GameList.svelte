<script lang="ts">
  import { createGame, listGames, type Game } from './api';

  let games = $state<Game[]>([]);
  let loading = $state(true);
  let loadError = $state('');

  let slug = $state('');
  let title = $state('');
  let creating = $state(false);
  let createError = $state('');

  async function load() {
    try {
      games = (await listGames()).games;
      loadError = '';
    } catch (error) {
      loadError = (error as Error).message;
    } finally {
      loading = false;
    }
  }

  async function submit(event: SubmitEvent) {
    event.preventDefault();
    creating = true;
    createError = '';
    try {
      const { game } = await createGame(slug.trim(), title.trim());
      window.location.hash = `#/games/${game.slug}`;
    } catch (error) {
      createError = (error as Error).message;
    } finally {
      creating = false;
    }
  }

  $effect(() => {
    void load();
  });
</script>

<h1>ゲーム管理</h1>

<section class="card">
  <h2>ゲームを登録</h2>
  <form onsubmit={submit}>
    <label>
      slug（URL に使う名前）
      <input type="text" bind:value={slug} placeholder="my-game" pattern="[a-z0-9][a-z0-9\-]*" required />
    </label>
    <label>
      タイトル
      <input type="text" bind:value={title} placeholder="My Game" required />
    </label>
    <button class="primary" type="submit" disabled={creating}>登録</button>
  </form>
  {#if createError}<p class="error">{createError}</p>{/if}
</section>

<section class="card">
  <h2>登録済み</h2>
  {#if loading}
    <p class="muted">読み込み中…</p>
  {:else if loadError}
    <p class="error">{loadError}</p>
  {:else if games.length === 0}
    <p class="muted">まだゲームがありません。上のフォームから登録してください。</p>
  {:else}
    <ul>
      {#each games as game (game.slug)}
        <li>
          <a href={`#/games/${game.slug}`}>
            <span class="title">{game.title}</span>
            <code>{game.slug}</code>
          </a>
          <span class="state" class:live={game.active_version}>
            {game.active_version ? `公開中 ${game.active_version}` : '非公開'}
          </span>
          <span class="muted">{game.version_count ?? 0} バージョン</span>
        </li>
      {/each}
    </ul>
  {/if}
</section>

<style>
  form {
    display: grid;
    grid-template-columns: 1fr 1.5fr auto;
    gap: 0.75rem;
    align-items: end;
  }
  @media (max-width: 40rem) {
    form {
      grid-template-columns: 1fr;
    }
  }
  ul {
    list-style: none;
    margin: 0;
    padding: 0;
  }
  li {
    display: grid;
    grid-template-columns: 1fr auto auto;
    gap: 1rem;
    align-items: center;
    padding: 0.6rem 0;
    border-top: 1px solid var(--line);
    font-size: 0.9rem;
  }
  li:first-child {
    border-top: 0;
  }
  li a {
    display: flex;
    gap: 0.6rem;
    align-items: baseline;
    text-decoration: none;
    min-width: 0;
  }
  .title {
    font-weight: 600;
    font-size: 1rem;
    color: var(--ink);
  }
  li a:hover .title {
    color: var(--accent);
  }
  li code {
    color: var(--muted);
  }
  .state {
    color: var(--muted);
  }
  .state.live {
    color: var(--accent);
    font-weight: 600;
  }
</style>

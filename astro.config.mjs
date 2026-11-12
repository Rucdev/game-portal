import cloudflare from '@astrojs/cloudflare';
import svelte from '@astrojs/svelte';
import { defineConfig } from 'astro/config';

export default defineConfig({
  adapter: cloudflare({ imageService: 'passthrough' }),
  integrations: [svelte()],
});

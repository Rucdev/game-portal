import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { serveGame } from '../../server/serve';

export const prerender = false;

export const ALL: APIRoute = ({ request }) => serveGame(request, env);

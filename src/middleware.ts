import { defineMiddleware } from 'astro:middleware';
import { env } from 'cloudflare:workers';
import { authenticate } from './server/auth';

// 管理画面と管理 API は Cloudflare Access の認証を必須にする。
// 公開ページと /games/* の配信は対象外。
function isProtected(pathname: string): boolean {
  return (
    pathname === '/admin' ||
    pathname.startsWith('/admin/') ||
    pathname === '/api' ||
    pathname.startsWith('/api/')
  );
}

export const onRequest = defineMiddleware(async (context, next) => {
  if (!isProtected(context.url.pathname)) return next();

  const result = await authenticate(context.request, {
    teamDomain: env.ACCESS_TEAM_DOMAIN as string,
    aud: env.ACCESS_AUD as string,
    dev: import.meta.env.DEV,
  });
  if (!result.ok) {
    return new Response(JSON.stringify({ error: result.message }), {
      status: result.status,
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
    });
  }
  return next();
});

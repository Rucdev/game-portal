// Cloudflare Access が付与する JWT を検証する。
// 本番で ACCESS_TEAM_DOMAIN / ACCESS_AUD が未設定の場合は拒否する（fail closed）。
// ローカル開発（astro dev）では設定がなければ素通しにする。

import { createRemoteJWKSet, jwtVerify } from 'jose';

export interface AccessConfig {
  teamDomain: string;
  aud: string;
  dev: boolean;
}

export type AuthResult =
  | { ok: true; email: string | null }
  | { ok: false; status: 401 | 403 | 500; message: string };

const jwksCache = new Map<string, ReturnType<typeof createRemoteJWKSet>>();

function jwksFor(teamDomain: string) {
  let jwks = jwksCache.get(teamDomain);
  if (!jwks) {
    jwks = createRemoteJWKSet(new URL('/cdn-cgi/access/certs', teamDomain));
    jwksCache.set(teamDomain, jwks);
  }
  return jwks;
}

export async function authenticate(request: Request, config: AccessConfig): Promise<AuthResult> {
  if (!config.teamDomain || !config.aud) {
    if (config.dev) return { ok: true, email: null };
    return {
      ok: false,
      status: 500,
      message: 'Cloudflare Access is not configured (ACCESS_TEAM_DOMAIN / ACCESS_AUD).',
    };
  }

  const token = request.headers.get('Cf-Access-Jwt-Assertion');
  if (!token) return { ok: false, status: 401, message: 'Missing Cloudflare Access token.' };

  try {
    const { payload } = await jwtVerify(token, jwksFor(config.teamDomain), {
      issuer: config.teamDomain.replace(/\/$/, ''),
      audience: config.aud,
    });
    return { ok: true, email: typeof payload.email === 'string' ? payload.email : null };
  } catch {
    return { ok: false, status: 403, message: 'Invalid Cloudflare Access token.' };
  }
}

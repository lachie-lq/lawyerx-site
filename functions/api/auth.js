/**
 * Cloudflare Pages Function — GitHub OAuth authorize redirect
 *
 * Route: GET /api/auth → redirects to GitHub OAuth authorize page
 *
 * Required environment variables (set in Cloudflare Pages dashboard):
 *   GITHUB_CLIENT_ID      — GitHub OAuth App client ID
 *   GITHUB_CLIENT_SECRET  — GitHub OAuth App client secret
 */

export const onRequestGet = async ({ request, env }) => {
  if (!env.GITHUB_CLIENT_ID) {
    return new Response('配置错误：缺少 GITHUB_CLIENT_ID', { status: 500 });
  }

  const url        = new URL(request.url);
  const scope      = url.searchParams.get('scope') || 'repo,user';
  const redirectUri = `${url.origin}/api/callback`;

  const target = new URL('https://github.com/login/oauth/authorize');
  target.searchParams.set('client_id',     env.GITHUB_CLIENT_ID);
  target.searchParams.set('redirect_uri',  redirectUri);
  target.searchParams.set('scope',         scope);
  target.searchParams.set('state',         crypto.randomUUID());

  return Response.redirect(target.toString(), 302);
};

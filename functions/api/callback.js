/**
 * Cloudflare Pages Function — GitHub OAuth callback handler
 *
 * Route: GET /api/callback → exchanges code for token, returns postMessage HTML
 *
 * Required environment variables (set in Cloudflare Pages dashboard):
 *   GITHUB_CLIENT_ID      — GitHub OAuth App client ID
 *   GITHUB_CLIENT_SECRET  — GitHub OAuth App client secret
 */

const GITHUB_TOKEN = 'https://github.com/login/oauth/access_token';

/* ---------- helpers ---------- */

function htmlResponse(body, status = 200) {
  return new Response(body, {
    status,
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'no-store',
    },
  });
}

function popupSuccessHTML({ token, provider }) {
  const payload = JSON.stringify({ token, provider }).replace(/</g, '\\u003c');
  return `<!doctype html>
<html lang="zh-CN">
<head><meta charset="utf-8"><title>GitHub 登录完成</title></head>
<body>
<script>
(function () {
  var payload = ${payload};
  var origin = window.location.origin;
  /* Decap CMS 两步握手协议：
   * 1. 先发送 authorizing:github 通知 CMS 切换监听器
   * 2. 等待 CMS 回传 authorizing:github
   * 3. 再发送 authorization:github:success:... 传递 token
   */
  function sendAuth() {
    if (window.opener) {
      window.opener.postMessage(
        'authorization:github:success:' + JSON.stringify(payload), origin);
    }
  }
  function onMessage(e) {
    if (e.data === 'authorizing:github') {
      window.removeEventListener('message', onMessage, false);
      window.opener.postMessage(e.data, e.origin);
      sendAuth();
      setTimeout(sendAuth, 500);
      setTimeout(function () { window.close(); }, 1500);
    }
  }
  window.addEventListener('message', onMessage, false);
  /* 通知 CMS：开始授权 */
  if (window.opener) {
    window.opener.postMessage('authorizing:github', origin);
  }
})();
</script>
<p>GitHub 登录完成，可以关闭此窗口。</p>
</body>
</html>`;
}

function popupErrorHTML(message) {
  const payload = JSON.stringify({ error: message }).replace(/</g, '\\u003c');
  return `<!doctype html>
<html lang="zh-CN">
<head><meta charset="utf-8"><title>登录失败</title></head>
<body>
<script>
(function () {
  var payload = ${payload};
  var origin = window.location.origin;
  function sendError() {
    if (window.opener) {
      window.opener.postMessage(
        'authorization:github:error:' + JSON.stringify(payload), origin);
    }
  }
  function onMessage(e) {
    if (e.data === 'authorizing:github') {
      window.removeEventListener('message', onMessage, false);
      window.opener.postMessage(e.data, e.origin);
      sendError();
      setTimeout(function () { window.close(); }, 2000);
    }
  }
  window.addEventListener('message', onMessage, false);
  if (window.opener) {
    window.opener.postMessage('authorizing:github', origin);
  }
})();
</script>
<p>登录失败：${message}</p>
</body>
</html>`;
}

/* ---------- main entry ---------- */

export const onRequestGet = async ({ request, env }) => {
  if (!env.GITHUB_CLIENT_ID || !env.GITHUB_CLIENT_SECRET) {
    return htmlResponse(
      '<h1>配置错误</h1><p>请在 Cloudflare Pages 环境变量中设置 GITHUB_CLIENT_ID 和 GITHUB_CLIENT_SECRET。</p>',
      500
    );
  }

  const url  = new URL(request.url);
  const code = url.searchParams.get('code');

  if (!code) {
    return htmlResponse(popupErrorHTML('缺少授权码 (code)'), 400);
  }

  const redirectUri = `${url.origin}/api/callback`;

  let tokenRes;
  try {
    tokenRes = await fetch(GITHUB_TOKEN, {
      method: 'POST',
      headers: {
        'accept':       'application/json',
        'content-type': 'application/json',
        'user-agent':   'lawyerx-decap-oauth',
      },
      body: JSON.stringify({
        client_id:     env.GITHUB_CLIENT_ID,
        client_secret: env.GITHUB_CLIENT_SECRET,
        code,
        redirect_uri:  redirectUri,
      }),
    });
  } catch (err) {
    return htmlResponse(popupErrorHTML('无法连接 GitHub: ' + err.message), 502);
  }

  const tokenData = await tokenRes.json();

  if (!tokenRes.ok || tokenData.error || !tokenData.access_token) {
    const msg = tokenData.error_description || tokenData.error || 'Token 交换失败';
    return htmlResponse(popupErrorHTML(msg), 400);
  }

  return htmlResponse(popupSuccessHTML({
    token:    tokenData.access_token,
    provider: 'github',
  }));
};

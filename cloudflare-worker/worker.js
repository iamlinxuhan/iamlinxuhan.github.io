/**
 * linxuhan-dl —— GitHub Release 下载加速 Worker
 *
 * 把  https://dl.linxuhan.top/<项目>/<tag>/<文件名>
 * 映射到 https://github.com/<owner>/<repo>/releases/download/<tag>/<文件名>
 *
 * · GET 响应写入 Cloudflare 边缘缓存，同一个文件只回源一次；
 * · 下载文件不可变，缓存一年（immutable）；
 * · Range 请求直接透传，支持断点续传，不写缓存；
 * · 只允许两个项目和合乎规则的文件名，避免变成任意 URL 代理。
 */

const PROJECTS = {
  'GomokuAI': 'iamlinxuhan/GomokuAI',
  'NCM-Studio': 'iamlinxuhan/NCM-Studio',
};

const TAG_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
const ASSET_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._+-]*$/;

function text(status, message, extraHeaders) {
  const headers = new Headers(extraHeaders || {});
  headers.set('Content-Type', 'text/plain; charset=utf-8');
  headers.set('Cache-Control', 'no-store');
  return new Response(message, { status, headers });
}

function notFound(message) {
  return text(404, message || 'Not Found');
}

function pickHeaders(source) {
  const headers = new Headers();
  const keep = [
    'content-type',
    'content-length',
    'etag',
    'last-modified',
    'accept-ranges',
  ];
  keep.forEach((name) => {
    const value = source.headers.get(name);
    if (value) headers.set(name, value);
  });
  return headers;
}

export default {
  async fetch(request, env, ctx) {
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      return text(405, 'Method Not Allowed', { Allow: 'GET, HEAD' });
    }

    const url = new URL(request.url);
    const parts = url.pathname.split('/').filter(Boolean);
    if (parts.length !== 3) {
      return notFound('用法：/<项目>/<tag>/<文件名>');
    }

    const [project, tag, asset] = parts;
    const repo = PROJECTS[project];
    if (!repo || !TAG_PATTERN.test(tag) || !ASSET_PATTERN.test(asset)) {
      return notFound('未知的项目或文件名');
    }

    const target =
      'https://github.com/' + repo + '/releases/download/' + tag + '/' + encodeURIComponent(asset);

    /* 断点续传：Range 直接回源，不经过整文件缓存 */
    const range = request.headers.get('Range');
    if (range) {
      const origin = await fetch(target, {
        method: request.method,
        headers: { Range: range },
        redirect: 'follow',
      });
      const headers = pickHeaders(origin);
      const contentRange = origin.headers.get('content-range');
      if (contentRange) headers.set('Content-Range', contentRange);
      headers.set('Content-Disposition', 'attachment; filename="' + asset + '"');
      headers.set('Cache-Control', 'no-store');
      headers.set('Access-Control-Allow-Origin', '*');
      return new Response(request.method === 'HEAD' ? null : origin.body, {
        status: origin.status,
        statusText: origin.statusText,
        headers,
      });
    }

    /* HEAD 只问元信息，不入缓存 */
    if (request.method === 'HEAD') {
      const origin = await fetch(target, { method: 'HEAD', redirect: 'follow' });
      const headers = pickHeaders(origin);
      headers.set('Content-Disposition', 'attachment; filename="' + asset + '"');
      headers.set('Access-Control-Allow-Origin', '*');
      return new Response(null, { status: origin.status, headers });
    }

    /* 缓存键去掉查询串，避免 ?v=1 之类的参数产生多份副本 */
    const cache = caches.default;
    const cacheKey = new Request(url.origin + url.pathname, { method: 'GET' });
    const cached = await cache.match(cacheKey);
    if (cached) {
      const headers = new Headers(cached.headers);
      headers.set('X-Download-Cache', 'HIT');
      return new Response(cached.body, {
        status: cached.status,
        statusText: cached.statusText,
        headers,
      });
    }

    const origin = await fetch(target, { redirect: 'follow' });
    if (!origin.ok) {
      return text(
        origin.status,
        '上游返回 ' + origin.status + '。请确认版本号与文件名是否正确。'
      );
    }

    const headers = pickHeaders(origin);
    headers.set('Content-Disposition', 'attachment; filename="' + asset + '"');
    headers.set('Cache-Control', 'public, max-age=31536000, immutable');
    headers.set('Access-Control-Allow-Origin', '*');
    headers.set('X-Download-Cache', 'MISS');
    headers.set('X-Download-Source', 'github');

    const response = new Response(origin.body, {
      status: 200,
      statusText: 'OK',
      headers,
    });

    ctx.waitUntil(cache.put(cacheKey, response.clone()));
    return response;
  },
};

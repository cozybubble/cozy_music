const http = require('http');
const https = require('https');
const url = require('url');
const fs = require('fs');
const path = require('path');
const { URL } = url;

const API_BASE_URL = "https://music-api.gdstudio.xyz/api.php";
const KUWO_HOST_PATTERN = /(^|\.)kuwo\.cn$/i;
const SAFE_RESPONSE_HEADERS = [
  "content-type", "cache-control", "accept-ranges",
  "content-length", "content-range", "etag",
  "last-modified", "expires"
];

const PORT = process.env.PORT || 9000;
const STATIC_DIR = __dirname; // 假设 music.html 在 proxy.js 同目录

// MIME 类型映射（简单版）
const MIME_TYPES = {
  '.html': 'text/html',
  '.js': 'application/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
};

// 工具函数：发起 HTTP(S) 请求并流式返回
function httpRequest(options, reqHeaders = {}) {
  return new Promise((resolve, reject) => {
    const client = options.protocol === 'https:' ? https : http;
    const req = client.request(options, (res) => {
      resolve(res);
    });
    req.on('error', reject);
    Object.entries(reqHeaders).forEach(([key, value]) => {
      if (value !== undefined) req.setHeader(key, value);
    });
    req.end();
  });
}

function isAllowedKuwoHost(hostname) {
  if (!hostname) return false;
  return KUWO_HOST_PATTERN.test(hostname);
}

function normalizeKuwoUrl(rawUrl) {
  try {
    const parsed = new URL(rawUrl);
    if (!isAllowedKuwoHost(parsed.hostname)) return null;
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
    parsed.protocol = 'http:';
    return parsed;
  } catch {
    return null;
  }
}

async function proxyKuwoAudio(targetUrl, req, res) {
  const normalized = normalizeKuwoUrl(targetUrl);
  if (!normalized) {
    res.writeHead(400, { 'Content-Type': 'text/plain' });
    return res.end('Invalid target');
  }

  const headers = {
    'User-Agent': req.headers['user-agent'] || 'Mozilla/5.0',
    'Referer': 'https://www.kuwo.cn/',
  };

  if (req.headers.range) {
    headers.Range = req.headers.range;
  }

  try {
    const upstreamRes = await httpRequest({
      protocol: normalized.protocol,
      hostname: normalized.hostname,
      port: normalized.port,
      path: normalized.pathname + normalized.search,
      method: 'GET',
    }, headers);

    const responseHeaders = {};
    for (const [key, value] of Object.entries(upstreamRes.headers)) {
      if (SAFE_RESPONSE_HEADERS.includes(key.toLowerCase())) {
        responseHeaders[key] = value;
      }
    }

    if (!responseHeaders['cache-control']) {
      responseHeaders['cache-control'] = 'public, max-age=3600';
    }
    responseHeaders['Access-Control-Allow-Origin'] = '*';

    res.writeHead(upstreamRes.statusCode, responseHeaders);
    upstreamRes.pipe(res);
  } catch (err) {
    console.error('Proxy Kuwo error:', err.message);
    res.writeHead(500, { 'Content-Type': 'text/plain' });
    res.end('Proxy failed');
  }
}

async function proxyApiRequest(req, res, query) {
  const apiURL = new URL(API_BASE_URL);

  const { target, callback, ...params } = query || {};
  for (const [key, value] of Object.entries(params)) {
    apiURL.searchParams.set(key, value);
  }

  if (!apiURL.searchParams.has('types')) {
    res.writeHead(400, { 'Content-Type': 'text/plain' });
    return res.end('Missing types');
  }

  try {
    const upstreamRes = await httpRequest({
      protocol: apiURL.protocol,
      hostname: apiURL.hostname,
      port: apiURL.port,
      path: apiURL.pathname + apiURL.search,
      method: 'GET',
      headers: {
        'User-Agent': req.headers['user-agent'] || 'Mozilla/5.0',
        'Accept': 'application/json',
      },
    });

    const responseHeaders = {};
    for (const [key, value] of Object.entries(upstreamRes.headers)) {
      if (SAFE_RESPONSE_HEADERS.includes(key.toLowerCase())) {
        responseHeaders[key] = value;
      }
    }

    if (!responseHeaders['content-type']) {
      responseHeaders['content-type'] = 'application/json; charset=utf-8';
    }
    responseHeaders['Access-Control-Allow-Origin'] = '*';
    if (!responseHeaders['cache-control']) {
      responseHeaders['cache-control'] = 'no-store';
    }

    res.writeHead(upstreamRes.statusCode, responseHeaders);
    upstreamRes.pipe(res);
  } catch (err) {
    console.error('API proxy error:', err.message);
    res.writeHead(500, { 'Content-Type': 'text/plain' });
    res.end('API proxy failed');
  }
}

function parseQuery(search) {
  if (!search) return {};
  const params = {};
  search.slice(1).split('&').forEach(pair => {
    const [key, value] = pair.split('=');
    if (key) params[decodeURIComponent(key)] = value ? decodeURIComponent(value.replace(/\+/g, ' ')) : '';
  });
  return params;
}

// 新增：提供静态文件（如 music.html）
function serveStaticFile(filePath, res) {
  const ext = path.extname(filePath).toLowerCase();
  const contentType = MIME_TYPES[ext] || 'application/octet-stream';

  fs.access(filePath, fs.constants.F_OK, (err) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      return res.end('404 Not Found');
    }

    const readStream = fs.createReadStream(filePath);
    res.writeHead(200, {
      'Content-Type': contentType,
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'no-cache'
    });
    readStream.pipe(res);
    readStream.on('error', () => {
      res.writeHead(500, { 'Content-Type': 'text/plain' });
      res.end('Internal Server Error');
    });
  });
}

// 创建 HTTP 服务器
const server = http.createServer(async (req, res) => {
  const reqUrl = new URL(req.url, `http://${req.headers.host}`);
  const query = parseQuery(reqUrl.search);

  // CORS 预检
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET,HEAD,OPTIONS',
      'Access-Control-Allow-Headers': '*',
      'Access-Control-Max-Age': '86400',
    });
    return res.end();
  }

  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405, { 'Content-Type': 'text/plain' });
    return res.end('Method not allowed');
  }

  const target = query.target;
  const pathname = reqUrl.pathname;

  // 1. 如果有 ?target=xxx，走代理逻辑
  if (target) {
    return proxyKuwoAudio(target, req, res);
  }

  // 2. 如果是 API 请求（包含 types 参数），走通用 API 代理
  if (query.types) {
    return proxyApiRequest(req, res, query);
  }

  // 3. 否则，当作静态文件请求处理
  let filePath = path.join(STATIC_DIR, pathname);

  // 默认首页
  if (pathname === '/' || pathname === '') {
    filePath = path.join(STATIC_DIR, 'music.html');
  }

  // 安全限制：防止路径遍历（如 ../../etc/passwd）
  if (!filePath.startsWith(STATIC_DIR + path.sep) && filePath !== STATIC_DIR) {
    res.writeHead(403, { 'Content-Type': 'text/plain' });
    return res.end('Forbidden');
  }

  serveStaticFile(filePath, res);
});

server.listen(PORT, () => {
  console.log(`✅ Music server running at http://localhost:${PORT}`);
  console.log(`   - Static files served from: ${STATIC_DIR}`);
});
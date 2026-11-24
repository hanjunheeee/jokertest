'use strict';

// 여러 계정 도구 서버 파일, 한 포트에서 겉 화면(multi.localhost)·칸 화면(p1~p10.multi.localhost)·백엔드 넘기기를 같이 맡음
// start.js·check.js가 부름 — 칸마다 주소가 달라 쿠키·localStorage가 칸마다 따로, api·소켓은 같은 주소로 받아 백엔드로 넘김
const fs = require('node:fs');
const http = require('node:http');
const net = require('node:net');
const path = require('node:path');

const SHELL_HOST = 'multi.localhost';
const SLOT_HOST = /^p(\d{1,2})\.multi\.localhost$/i;
const MAX_SLOTS = 10;
const MODES = ['desktop', 'mobile'];

// 백엔드로 넘길 경로 첫 마디 (backend/index.js 라우터 + socket.io), 화면 주소(/game-matching 등)와 안 겹침
const API_PREFIXES = new Set(['auth', 'user', 'friends', 'game', 'economy', 'notifications', 'reports', 'inquiries', 'health', 'socket.io']);

const MIME = Object.freeze({
    '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.map': 'application/json; charset=utf-8',
    '.txt': 'text/plain; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
    '.gif': 'image/gif', '.webp': 'image/webp', '.avif': 'image/avif', '.ico': 'image/x-icon', '.mp3': 'audio/mpeg',
    '.wav': 'audio/wav', '.ogg': 'audio/ogg', '.m4a': 'audio/mp4', '.mp4': 'video/mp4', '.webm': 'video/webm',
    '.woff': 'font/woff', '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.otf': 'font/otf', '.wasm': 'application/wasm',
    '.webmanifest': 'application/manifest+json',
});

const firstSegment = (pathname) => pathname.split('/')[1] ?? '';

// 칸 상태 (칸 수·칸마다 PC/폰·이름표·소리) — 파일에 남겨 다음에 켜도 그대로
function defaultState() {
    return { count: 6, sound: 'active', slots: Array.from({ length: MAX_SLOTS }, () => ({ mode: 'desktop', label: '' })) };
}

// 받은 값 다듬기 (모르는 값은 버림) — 파일·겉 화면에서 온 값 둘 다 여기를 지남
function cleanState(raw, base = defaultState()) {
    const out = { ...base, slots: base.slots.map((s) => ({ ...s })) };
    if (!raw || typeof raw !== 'object') return out;
    const count = Number(raw.count);
    if (Number.isInteger(count) && count >= 1 && count <= MAX_SLOTS) out.count = count;
    if (['active', 'all', 'none'].includes(raw.sound)) out.sound = raw.sound;
    if (Array.isArray(raw.slots)) {
        raw.slots.slice(0, MAX_SLOTS).forEach((s, i) => {
            if (!s || typeof s !== 'object') return;
            if (MODES.includes(s.mode)) out.slots[i].mode = s.mode;
            if (typeof s.label === 'string') out.slots[i].label = s.label.slice(0, 24);
        });
    }
    return out;
}

function loadState(file) {
    try { return cleanState(JSON.parse(fs.readFileSync(file, 'utf8'))); } catch { return defaultState(); }
}

function saveState(file, state) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, `${JSON.stringify(state, null, 1)}\n`);
}

// 주소 경로 → 폴더 안 실제 파일 (폴더 밖으로 못 나감), 없으면 null
function fileUnder(root, pathname) {
    if (!root) return null;
    const target = path.resolve(root, `.${pathname}`);
    if (target !== root && !target.startsWith(root + path.sep)) return null;
    try {
        const stat = fs.statSync(target);
        return stat.isFile() ? { file: target, stat } : null;
    } catch {
        return null;
    }
}

// 파일 보내기: ETag·한 부분(Range, 소리·영상 넘기기용)까지
function sendFile(req, res, { file, stat }, cacheControl) {
    const etag = `W/"${stat.size.toString(16)}-${Math.floor(stat.mtimeMs).toString(16)}"`;
    const headers = {
        'Content-Type': MIME[path.extname(file).toLowerCase()] ?? 'application/octet-stream',
        'Cache-Control': cacheControl,
        'Accept-Ranges': 'bytes',
        ETag: etag,
    };
    if (req.headers['if-none-match'] === etag) { res.writeHead(304, headers); res.end(); return; }
    let start = 0;
    let end = stat.size - 1;
    let status = 200;
    const m = /^bytes=(\d*)-(\d*)$/.exec(String(req.headers.range ?? '').trim());
    if (m && (m[1] !== '' || m[2] !== '')) {
        if (m[1] === '') start = Math.max(0, stat.size - Number(m[2]));
        else { start = Number(m[1]); if (m[2] !== '') end = Math.min(end, Number(m[2])); }
        if (start > end || start >= stat.size) { res.writeHead(416, { ...headers, 'Content-Range': `bytes */${stat.size}` }); res.end(); return; }
        status = 206;
        headers['Content-Range'] = `bytes ${start}-${end}/${stat.size}`;
    }
    headers['Content-Length'] = String(stat.size === 0 ? 0 : end - start + 1);
    res.writeHead(status, headers);
    if (req.method === 'HEAD' || stat.size === 0) { res.end(); return; }
    fs.createReadStream(file, { start, end }).on('error', () => res.destroy()).pipe(res);
}

function sendText(res, status, type, body, extra = {}) {
    res.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-store', ...extra });
    res.end(body);
}

// 백엔드로 넘길 머리말: Host는 백엔드 것, 우리 칸 주소에서 온 Origin·Referer만 뺌 (다른 사이트 Origin은 그대로 → 백엔드가 거절)
// 까닭: 백엔드 허용 주소(FRONTEND_URL)에 p3.multi.localhost가 없음 — Origin이 없으면 개발·시험 백엔드는 받아 줌(socket/connection/originCheck.js), 운영은 거절
function forwardHeaders(req, api, port) {
    const headers = { ...req.headers, host: api.host };
    const own = new RegExp(`^http://p\\d{1,2}\\.multi\\.localhost:${port}(/|$)`, 'i');
    if (own.test(String(headers.origin ?? ''))) delete headers.origin;
    if (own.test(String(headers.referer ?? ''))) delete headers.referer;
    return headers;
}

// 백엔드 쿠키에 Domain이 붙어 와도 칸 주소에만 남게 뺌 (지금 백엔드는 안 붙임 — utils/auth/cookieOptions.js)
function slotCookies(rawHeaders) {
    const out = [];
    for (let i = 0; i < rawHeaders.length; i += 2) {
        const key = rawHeaders[i];
        let value = rawHeaders[i + 1];
        if (key.toLowerCase() === 'set-cookie') value = value.replace(/;\s*domain=[^;]*/gi, '');
        out.push(key, value);
    }
    return out;
}

/**
 * 도구 서버 켜기
 * @param {{ port:number, apiUrl:string, builds:{desktop:string, mobile:string}, publicDir:string, stateFile:string, shellFile:string, slotScript:string, count?:number, log?:(s:string)=>void }} o
 * @returns {Promise<{ close:()=>Promise<void>, shellUrl:string, slotUrl:(n:number)=>string }>}
 */
function startServer(o) {
    const log = o.log ?? (() => {});
    const api = new URL(o.apiUrl);
    if (api.protocol !== 'http:') throw new Error(`--api는 http 주소만 됨 (받음 ${o.apiUrl})`);
    const apiPort = Number(api.port || 80);
    const agent = new http.Agent({ keepAlive: true, maxSockets: 256 });
    let state = loadState(o.stateFile);
    if (o.count) state.count = o.count;
    saveState(o.stateFile, state);

    const shellUrl = `http://${SHELL_HOST}:${o.port}/`;
    const slotUrl = (n) => `http://p${n}.${SHELL_HOST}:${o.port}`;

    // 칸 화면 index.html에 도우미(slot.js)를 맨 앞에 끼움 — 빌드 폴더 파일은 안 고치고 보낼 때만
    const indexCache = new Map();
    const slotIndex = (mode) => {
        const file = path.join(o.builds[mode], 'index.html');
        const stat = fs.statSync(file);
        const hit = indexCache.get(mode);
        if (hit && hit.mtimeMs === stat.mtimeMs) return hit.html;
        const html = fs.readFileSync(file, 'utf8').replace(/<head>/i, '<head>\n    <script src="/__multi/slot.js"></script>');
        indexCache.set(mode, { mtimeMs: stat.mtimeMs, html });
        return html;
    };

    // 백엔드 살아 있나 (겉 화면 띠에 보임)
    const apiAlive = () => new Promise((resolve) => {
        const r = http.get({ host: api.hostname, port: apiPort, path: '/health', timeout: 1500 }, (res) => { res.resume(); resolve(res.statusCode < 500); });
        r.on('timeout', () => { r.destroy(); resolve(false); });
        r.on('error', () => resolve(false));
    });

    const readBody = (req) => new Promise((resolve, reject) => {
        let size = 0;
        const chunks = [];
        req.on('data', (c) => { size += c.length; if (size > 64 * 1024) { reject(new Error('too big')); req.destroy(); } else chunks.push(c); });
        req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
        req.on('error', reject);
    });

    // 겉 화면 (multi.localhost)
    async function handleShell(req, res, pathname) {
        if (pathname === '/' || pathname === '/index.html') {
            const html = fs.readFileSync(o.shellFile, 'utf8').replace('/*__MULTI_CONFIG__*/', `window.__MULTI = ${JSON.stringify({ port: o.port, api: o.apiUrl, max: MAX_SLOTS })};`);
            sendText(res, 200, 'text/html; charset=utf-8', html);
            return;
        }
        if (pathname === '/__api/state' && req.method === 'GET') { sendText(res, 200, 'application/json', JSON.stringify(state)); return; }
        if (pathname === '/__api/state' && req.method === 'POST') {
            // json만 받음 (다른 사이트가 몰래 보내는 단순 요청은 json 머리말을 못 붙임)
            if (!String(req.headers['content-type'] ?? '').startsWith('application/json')) { sendText(res, 415, 'application/json', '{"message":"json only"}'); return; }
            try {
                state = cleanState(JSON.parse(await readBody(req)), state);
                saveState(o.stateFile, state);
                sendText(res, 200, 'application/json', JSON.stringify(state));
            } catch {
                sendText(res, 400, 'application/json', '{"message":"bad state"}');
            }
            return;
        }
        if (pathname === '/__api/health') {
            sendText(res, 200, 'application/json', JSON.stringify({ api: o.apiUrl, apiAlive: await apiAlive(), builds: Object.fromEntries(MODES.map((m) => [m, fs.existsSync(path.join(o.builds[m], 'index.html'))])) }));
            return;
        }
        sendText(res, 404, 'text/plain; charset=utf-8', '없음');
    }

    // 칸 화면 (p<n>.multi.localhost): 백엔드 경로면 넘기고, 아니면 그 칸 모드(PC/폰)의 빌드본
    function handleSlot(req, res, n, pathname) {
        if (pathname === '/__multi/slot.js') {
            sendFile(req, res, { file: o.slotScript, stat: fs.statSync(o.slotScript) }, 'no-cache');
            return;
        }
        if (API_PREFIXES.has(firstSegment(pathname))) { proxyHttp(req, res); return; }
        if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405, { Allow: 'GET, HEAD' }); res.end(); return; }
        const mode = state.slots[n - 1]?.mode ?? 'desktop';
        const other = mode === 'desktop' ? 'mobile' : 'desktop';
        if (!fs.existsSync(path.join(o.builds[mode], 'index.html'))) {
            sendText(res, 503, 'text/plain; charset=utf-8', `${mode === 'desktop' ? 'PC' : '폰'} 화면 빌드본이 없음 — start.js를 다시 켜면 빌드함`);
            return;
        }
        // 빌드 조각(/assets/)은 모드를 막 바꾼 때를 위해 다른 빌드본도 찾아 봄
        const found = fileUnder(o.builds[mode], pathname)
            ?? (pathname.startsWith('/assets/') ? fileUnder(o.builds[other], pathname) : null)
            ?? fileUnder(o.publicDir, pathname);
        if (found && path.basename(found.file) !== 'index.html') {
            const immutable = pathname.startsWith('/assets/') && !found.file.startsWith(o.publicDir + path.sep);
            sendFile(req, res, found, immutable ? 'public, max-age=31536000, immutable' : 'no-cache');
            return;
        }
        const ext = path.extname(pathname);
        if (ext && ext !== '.html') { sendText(res, 404, 'text/plain; charset=utf-8', '없음'); return; }
        sendText(res, 200, 'text/html; charset=utf-8', slotIndex(mode), { 'Cache-Control': 'no-cache' });
    }

    function proxyHttp(req, res) {
        const up = http.request({ host: api.hostname, port: apiPort, method: req.method, path: req.url, headers: forwardHeaders(req, api, o.port), agent }, (upRes) => {
            res.writeHead(upRes.statusCode, upRes.statusMessage, slotCookies(upRes.rawHeaders));
            upRes.pipe(res);
            upRes.on('error', () => res.destroy());
        });
        up.on('error', () => {
            if (res.headersSent) { res.destroy(); return; }
            sendText(res, 502, 'application/json; charset=utf-8', JSON.stringify({ message: `백엔드(${o.apiUrl})에 못 붙음` }));
        });
        req.pipe(up);
    }

    // 웹소켓: 받은 요청 머리를 다시 써서 백엔드에 TCP로 붙이고 양쪽을 이음
    function proxyUpgrade(req, socket, head) {
        socket.on('error', () => {});
        const up = net.connect(apiPort, api.hostname);
        up.once('connect', () => {
            const headers = forwardHeaders(req, api, o.port);
            const lines = [`${req.method} ${req.url} HTTP/${req.httpVersion}`, ...Object.entries(headers).flatMap(([k, v]) => (Array.isArray(v) ? v : [v]).map((x) => `${k}: ${x}`))];
            up.write(`${lines.join('\r\n')}\r\n\r\n`);
            if (head?.length) up.write(head);
            up.pipe(socket);
            socket.pipe(up);
        });
        up.on('error', () => socket.destroy());
        up.on('close', () => socket.destroy());
        socket.on('close', () => up.destroy());
    }

    const hostOf = (req) => String(req.headers.host ?? '').toLowerCase().replace(/:\d+$/, '');

    const handler = async (req, res) => {
        let pathname;
        try { pathname = decodeURIComponent(new URL(req.url, 'http://x').pathname); } catch { res.writeHead(400); res.end(); return; }
        const host = hostOf(req);
        const slot = SLOT_HOST.exec(host);
        try {
            if (slot) {
                const n = Number(slot[1]);
                if (n < 1 || n > MAX_SLOTS) { sendText(res, 404, 'text/plain; charset=utf-8', '칸 번호는 1~10'); return; }
                handleSlot(req, res, n, pathname);
                return;
            }
            if (host === SHELL_HOST) { await handleShell(req, res, pathname); return; }
            // localhost:5390 등으로 들어오면 겉 주소로 보냄 (칸과 같은 사이트여야 칸 쿠키가 실림)
            res.writeHead(302, { Location: shellUrl });
            res.end();
        } catch (error) {
            log(`요청 처리 오류 ${req.method} ${host}${pathname}: ${error.message}`);
            if (!res.headersSent) sendText(res, 500, 'text/plain; charset=utf-8', '도구 서버 오류');
            else res.destroy();
        }
    };

    const servers = [];
    const listen = (bindHost) => new Promise((resolve, reject) => {
        const server = http.createServer(handler);
        server.on('upgrade', (req, socket, head) => {
            const slot = SLOT_HOST.exec(hostOf(req));
            const pathname = String(req.url ?? '').split('?')[0];
            if (slot && firstSegment(pathname) === 'socket.io') proxyUpgrade(req, socket, head);
            else socket.destroy();
        });
        // 오래 열린 소켓 연결은 시간 제한 없음
        server.requestTimeout = 0;
        server.headersTimeout = 30_000;
        server.once('error', reject);
        server.listen(o.port, bindHost, () => { servers.push(server); resolve(); });
    });
    // localhost 두 주소에만 붙음 (같은 망 다른 기기엔 안 보임), 크롬은 *.localhost를 둘 중 하나로 찾음
    return listen('127.0.0.1')
        .then(() => listen('::1').catch((error) => { if (error.code !== 'EADDRNOTAVAIL' && error.code !== 'EAFNOSUPPORT') throw error; }))
        .then(() => ({
            shellUrl,
            slotUrl,
            close: () => Promise.all(servers.map((s) => new Promise((done) => { s.closeAllConnections?.(); s.close(() => done()); }))).then(() => agent.destroy()),
        }));
}

module.exports = { startServer, cleanState, defaultState, API_PREFIXES, SHELL_HOST, MAX_SLOTS };

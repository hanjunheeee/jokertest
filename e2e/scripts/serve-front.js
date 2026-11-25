#!/usr/bin/env node
'use strict';

// 시험 화면 띄우기 파일, 데스크톱(5273)·모바일(5274)·관리자(5275) 화면을 빌드본(기본) 또는 vite 개발 서버로 켬 — node scripts/serve-front.js desktop|mobile|admin
// playwright.config.js webServer·감독의 서버 켜 두기 스크립트가 부름, 빌드본은 화면 고칠 때마다 다시 켜야 반영 (README '화면 서버')
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { E2E, E2E_DIR } = require('../helpers/env');
const { FAKE_AD_ENV } = require('../helpers/outside');

const ROOT = path.join(E2E_DIR, '..');
// sources = 이 파일·폴더가 빌드본보다 새로우면 다시 빌드 (staleReason)
const APPS = Object.freeze({
    desktop: {
        dir: path.join(ROOT, 'frontend'),
        config: path.join(E2E_DIR, 'vite', 'desktop.config.mjs'),
        outDir: path.join(E2E_DIR, '.runtime', 'front', 'desktop'),
        publicDir: path.join(ROOT, 'frontend', 'public'),
        port: E2E.desktopPort,
        sources: [path.join(ROOT, 'frontend', 'src'), path.join(ROOT, 'frontend', 'index.html'), path.join(ROOT, 'frontend', 'vite.config.js')],
    },
    mobile: {
        dir: path.join(ROOT, 'frontend-mobile'),
        config: path.join(E2E_DIR, 'vite', 'mobile.config.mjs'),
        outDir: path.join(E2E_DIR, '.runtime', 'front', 'mobile'),
        // 모바일도 데스크톱 public을 그대로 씀 (frontend-mobile/vite.config.js publicDir)
        publicDir: path.join(ROOT, 'frontend', 'public'),
        port: E2E.mobilePort,
        // 모바일은 데스크톱 로직(frontend/src)도 같이 씀
        sources: [
            path.join(ROOT, 'frontend-mobile', 'src'), path.join(ROOT, 'frontend', 'src'),
            path.join(ROOT, 'frontend-mobile', 'index.html'), path.join(ROOT, 'frontend-mobile', 'vite.config.js'),
        ],
    },
    // 관리자: 입구 admin.html, public 없음, /admin-api·Access 흉내는 admin-gate.js (개발 서버 모드 없음 → 늘 빌드본)
    admin: {
        dir: path.join(ROOT, 'frontend'),
        config: path.join(E2E_DIR, 'vite', 'admin.config.mjs'),
        outDir: path.join(E2E_DIR, '.runtime', 'front', 'admin'),
        publicDir: null,
        entry: 'admin.html',
        buildOnly: true,
        port: E2E.adminPort,
        sources: [path.join(ROOT, 'frontend', 'src'), path.join(ROOT, 'frontend', 'admin.html'), path.join(ROOT, 'frontend', 'vite.admin.config.js')],
    },
});

const MIME = Object.freeze({
    '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.map': 'application/json; charset=utf-8',
    '.txt': 'text/plain; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
    '.gif': 'image/gif', '.webp': 'image/webp', '.avif': 'image/avif', '.ico': 'image/x-icon', '.mp3': 'audio/mpeg',
    '.wav': 'audio/wav', '.ogg': 'audio/ogg', '.m4a': 'audio/mp4', '.mp4': 'video/mp4', '.webm': 'video/webm',
    '.woff': 'font/woff', '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.otf': 'font/otf', '.wasm': 'application/wasm',
    '.webmanifest': 'application/manifest+json',
});

const log = (name, text) => process.stdout.write(`[e2e-front:${name}] ${text}\n`);

// 화면 폴더의 .env 파일은 안 읽음 (개발 주소·진짜 광고 값이 시험 빌드에 섞이지 않게) — 필요한 값은 main이 환경값으로 직접 줌
const NO_ENV_FILES = Object.freeze({ envDir: false });

// 빌드 표시 파일: 무엇으로 언제 빌드했는지 (다시 안 빌드하기 E2E_FRONT_REBUILD=0를 써도 되는 빌드본인지 가림)
const BUILD_MARK = 'e2e-build.json';
// 이 빌드에 들어간 광고 값 (모바일만 가짜 광고 값, 나머지는 없음)
const adsOf = (name) => (name === 'mobile' ? FAKE_AD_ENV.VITE_ADSENSE_CLIENT : null);
// 상점 쿠폰 단추: 화면 기본은 숨김, 시험 빌드(데스크톱·모바일)는 켜서 쿠폰 브라우저 시험이 돎 (frontend store/constants/storeLayoutStyle.js)
const couponOf = (name) => (name === 'desktop' || name === 'mobile' ? '1' : null);

// 파일·폴더 묶음에서 가장 늦게 고친 시각 (node_modules·dist는 안 봄)
function newestMtime(targets) {
    let newest = 0;
    const visit = (target) => {
        let stat;
        try { stat = fs.statSync(target); } catch { return; }
        if (stat.isFile()) { newest = Math.max(newest, stat.mtimeMs); return; }
        if (!stat.isDirectory()) return;
        for (const entry of fs.readdirSync(target)) {
            if (entry === 'node_modules' || entry === 'dist') continue;
            visit(path.join(target, entry));
        }
    };
    targets.forEach(visit);
    return newest;
}

/**
 * 있던 빌드본을 그대로 못 쓰는 까닭 (써도 되면 null)
 * 화면 코드를 고친 뒤 옛 빌드본으로 시험이 도는 것·광고 값이 다른 빌드본을 쓰는 것 막기
 */
function staleReason(name, app) {
    if (!fs.existsSync(path.join(app.outDir, app.entry ?? 'index.html'))) return '빌드본 없음';
    let mark = null;
    try { mark = JSON.parse(fs.readFileSync(path.join(app.outDir, BUILD_MARK), 'utf8')); } catch { return '빌드 표시 없음 (예전 방식 빌드본)'; }
    if (mark?.envFiles !== false || (mark.ads ?? null) !== adsOf(name) || (mark.coupon ?? null) !== couponOf(name)) return '빌드 값이 다름 (.env·광고·쿠폰 단추 값)';
    if (!(newestMtime([...app.sources, app.config]) <= mark.builtAt)) return '화면 코드가 빌드본보다 새로움';
    return null;
}

// vite는 그 화면 폴더의 것을 씀 (e2e 폴더엔 vite가 없음)
const loadVite = (app) => import(pathToFileURL(path.join(app.dir, 'node_modules', 'vite', 'dist', 'node', 'index.js')).href);

// 주소 경로 → 실제 파일 (root 밖으로 못 나감), 없으면 null
function fileUnder(root, pathname) {
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
        'Last-Modified': stat.mtime.toUTCString(),
    };
    if (req.headers['if-none-match'] === etag) { res.writeHead(304, headers); res.end(); return; }
    let start = 0;
    let end = stat.size - 1;
    let status = 200;
    const range = req.headers.range;
    if (range) {
        const m = /^bytes=(\d*)-(\d*)$/.exec(range.trim());
        if (m && (m[1] !== '' || m[2] !== '')) {
            if (m[1] === '') { start = Math.max(0, stat.size - Number(m[2])); } else { start = Number(m[1]); if (m[2] !== '') end = Math.min(end, Number(m[2])); }
        }
        if (!m || start > end || start >= stat.size) {
            res.writeHead(416, { ...headers, 'Content-Range': `bytes */${stat.size}` });
            res.end();
            return;
        }
        status = 206;
        headers['Content-Range'] = `bytes ${start}-${end}/${stat.size}`;
    }
    headers['Content-Length'] = String(stat.size === 0 ? 0 : end - start + 1);
    res.writeHead(status, headers);
    if (req.method === 'HEAD' || stat.size === 0) { res.end(); return; }
    fs.createReadStream(file, { start, end }).on('error', () => res.destroy()).pipe(res);
}

/**
 * 빌드본 정적 서버: (gate가 맡으면 gate) → 빌드 폴더 → public 폴더 → (확장자 없는 주소면) index.html (화면 안 주소 이동용)
 * 관리자는 입구가 admin.html → /members 같은 화면 주소로 바로 들어와도 admin.html
 * localhost 두 주소(127.0.0.1·::1)에만 붙음 — 같은 망 다른 기기엔 안 보임
 */
function serveStatic(name, app, gate = null) {
    // 확인용으로 다른 포트에 띄울 때만 E2E_FRONT_PORT (평소엔 5273·5274 그대로)
    const port = Number(process.env.E2E_FRONT_PORT || app.port);
    const index = path.join(app.outDir, app.entry ?? 'index.html');
    if (!fs.existsSync(index)) throw new Error(`빌드본 없음: ${index}`);
    const handler = (req, res) => {
        if (gate?.(req, res)) return;
        if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405, { Allow: 'GET, HEAD' }); res.end(); return; }
        let pathname;
        try { pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname); } catch { res.writeHead(400); res.end(); return; }
        const found = fileUnder(app.outDir, pathname) ?? (app.publicDir ? fileUnder(app.publicDir, pathname) : null);
        if (found) {
            // 이름에 해시가 붙은 빌드 조각만 오래 둠, 나머지는 매번 확인
            const immutable = pathname.startsWith('/assets/') && found.file.startsWith(app.outDir + path.sep);
            sendFile(req, res, found, immutable ? 'public, max-age=31536000, immutable' : 'no-cache');
            return;
        }
        if (path.extname(pathname) && path.extname(pathname) !== '.html') { res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); res.end('없음'); return; }
        sendFile(req, res, { file: index, stat: fs.statSync(index) }, 'no-cache');
    };
    const servers = [];
    const listen = (host) => new Promise((resolve, reject) => {
        const server = http.createServer(handler);
        server.once('error', reject);
        server.listen(port, host, () => { servers.push(server); resolve(); });
    });
    return listen('127.0.0.1')
        .then(() => listen('::1').catch((error) => { if (error.code !== 'EADDRNOTAVAIL' && error.code !== 'EAFNOSUPPORT') throw error; }))
        .then(() => {
            log(name, `빌드본 켬 http://localhost:${port} (빌드 폴더 ${path.relative(E2E_DIR, app.outDir)})`);
            return { close: () => Promise.all(servers.map((s) => new Promise((resolve) => s.close(resolve)))) };
        });
}

async function main() {
    const name = process.argv[2];
    const app = APPS[name];
    if (!app) throw new Error('쓰는 법: node scripts/serve-front.js desktop|mobile|admin');
    const asked = (process.env.E2E_FRONT || 'build').toLowerCase();
    const mode = app.buildOnly ? 'build' : asked;
    if (asked !== 'build' && asked !== 'dev') throw new Error(`E2E_FRONT는 build 또는 dev (받은 값 ${asked})`);
    // 화면이 부를 백엔드는 늘 시험 백엔드 (.env 파일은 안 읽고 여기서 직접 줌)
    process.env.VITE_API_BASE_URL = E2E.apiUrl;
    // 모바일 광고: 가짜 광고 값으로 빌드 (값이 없으면 개발 빌드라 회색 "광고 자리" 상자, 진짜 값이면 진짜 광고 요청이 나감)
    // 광고 꾸러미 요청은 시험 쪽이 가짜로 답함 (helpers/outside.js)
    if (name === 'mobile') Object.assign(process.env, FAKE_AD_ENV);
    // 쿠폰 단추 켬 (데스크톱·모바일 시험 빌드만)
    if (couponOf(name)) process.env.VITE_STORE_COUPON_BUTTON = couponOf(name);
    // tailwind 등이 지금 폴더 기준으로 찾는 것 맞추기 (예전 'cd frontend && vite'와 같게)
    process.chdir(app.dir);

    let closer = null;
    if (mode === 'dev') {
        const vite = await loadVite(app);
        const server = await vite.createServer({ configFile: app.config, root: app.dir, mode: 'development', ...NO_ENV_FILES });
        await server.listen();
        log(name, `vite 개발 서버 켬 http://localhost:${app.port}`);
        closer = { close: () => server.close() };
    } else {
        // 다시 안 빌드하기를 골라도 못 쓰는 빌드본이면 다시 빌드 (null = 써도 됨)
        const stale = process.env.E2E_FRONT_REBUILD === '0' ? staleReason(name, app) : '';
        if (stale === null) {
            log(name, '빌드 건너뜀 (E2E_FRONT_REBUILD=0, 있던 빌드본 씀)');
        } else {
            if (stale) log(name, `E2E_FRONT_REBUILD=0이지만 다시 빌드: ${stale}`);
            // 개발 서버와 같게 DEV=true로 빌드 (개발 전용 길·버튼·테스트 결제 키 검사가 개발 서버와 같음)
            process.env.NODE_ENV = 'development';
            const vite = await loadVite(app);
            const started = Date.now();
            log(name, '빌드 시작…');
            await vite.build({ configFile: app.config, root: app.dir, mode: 'development', logLevel: 'warn', ...NO_ENV_FILES });
            // 시작 시각을 적음 (빌드 도중 고친 파일은 "빌드본보다 새로움"으로 잡히게)
            fs.writeFileSync(path.join(app.outDir, BUILD_MARK), `${JSON.stringify({ builtAt: started, ads: adsOf(name), coupon: couponOf(name), envFiles: false })}\n`);
            log(name, `빌드 끝 (${Math.round((Date.now() - started) / 1000)}초)`);
        }
        // 관리자만 앞단(Access 흉내·/admin-api 넘기기)을 붙임
        const gate = name === 'admin' ? require('./admin-gate').createAdminGate() : null;
        closer = await serveStatic(name, app, gate);
    }
    const stop = () => {
        Promise.resolve(closer?.close()).catch(() => {}).finally(() => process.exit(0));
        setTimeout(() => process.exit(0), 2000).unref();
    };
    process.on('SIGINT', stop);
    process.on('SIGTERM', stop);
}

if (require.main === module) {
    main().catch((error) => {
        console.error(`[e2e-front] 시작 실패: ${error?.stack ?? error}`);
        process.exit(1);
    });
}

module.exports = { APPS, fileUnder, staleReason, newestMtime };

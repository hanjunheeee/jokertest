'use strict';

// 여러 계정 도구 켜는 파일, 화면 빌드(낡았을 때만) → 도구 서버(기본 5390) → 크롬 창 하나에 겉 화면을 띄움
// 사람이 직접 돌림: node tools/시험도구/여러계정/start.js --count 8 (Ctrl+C로 끔, 켠 것만 닫음) — 자세한 건 README.md
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { createRequire } = require('node:module');
const { startServer, MAX_SLOTS } = require('./server');

const HERE = __dirname;
const REPO = path.join(HERE, '..', '..', '..');
const RUN_DIR = path.join(HERE, '..', '.run', 'multi');
const BUILDS = { desktop: path.join(RUN_DIR, 'front', 'desktop'), mobile: path.join(RUN_DIR, 'front', 'mobile') };
const BUILD_MARK = 'multi-build.json';
// 빌드본보다 새로우면 다시 빌드할 화면 코드 (모바일은 데스크톱 로직도 같이 씀)
const SOURCES = {
    desktop: ['frontend/src', 'frontend/index.html', 'frontend/vite.config.js'],
    mobile: ['frontend-mobile/src', 'frontend/src', 'frontend-mobile/index.html', 'frontend-mobile/vite.config.js'],
};
const APP_DIRS = { desktop: path.join(REPO, 'frontend'), mobile: path.join(REPO, 'frontend-mobile') };
// 다른 도구·시험이 쓰는 포트 (개발 4000·5173·5174, e2e 4100·5273~5275) — 도구 서버는 이 포트를 안 씀
const TAKEN_PORTS = new Set([4000, 4100, 5173, 5174, 5273, 5274, 5275]);

const log = (text) => process.stdout.write(`[여러계정] ${text}\n`);

function parseArgs(argv) {
    const o = { count: null, port: 5390, api: 'http://localhost:4000', rebuild: false, build: true, open: true, headless: false };
    for (let i = 0; i < argv.length; i += 1) {
        const a = argv[i];
        const next = () => argv[++i];
        if (a === '--count') o.count = Number(next());
        else if (a === '--port') o.port = Number(next());
        else if (a === '--api') o.api = String(next());
        else if (a === '--rebuild') o.rebuild = true;
        else if (a === '--no-build') o.build = false;
        else if (a === '--no-open') o.open = false;
        else if (a === '--headless') o.headless = true;
        else if (a === '--help' || a === '-h') o.help = true;
        else throw new Error(`모르는 값: ${a} (--help로 쓰는 법)`);
    }
    if (o.count !== null && !(Number.isInteger(o.count) && o.count >= 1 && o.count <= MAX_SLOTS)) throw new Error('--count는 1~10');
    if (!(Number.isInteger(o.port) && o.port > 1024 && o.port < 65536)) throw new Error('--port는 1025~65535');
    if (TAKEN_PORTS.has(o.port)) throw new Error(`${o.port}번은 개발 서버·e2e 시험이 쓰는 포트 — 다른 포트를 고름`);
    return o;
}

const HELP = `쓰는 법: node tools/시험도구/여러계정/start.js [--count 8] [--api http://localhost:4000] [--port 5390]
  --count N     칸 수 1~10 (안 주면 지난번 값, 처음은 6)
  --api 주소    게임 백엔드 주소 (기본 http://localhost:4000 = npm run dev 백엔드)
  --port N      도구 서버 포트 (기본 5390)
  --rebuild     화면을 꼭 다시 빌드 / --no-build 빌드 안 함(있던 빌드본 씀)
  --no-open     창을 안 띄우고 주소만 알려 줌 (내 크롬·엣지로 직접 엶)`;

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

// 빌드본을 그대로 못 쓰는 까닭 (써도 되면 null)
function staleReason(name) {
    if (!fs.existsSync(path.join(BUILDS[name], 'index.html'))) return '빌드본 없음';
    let mark;
    try { mark = JSON.parse(fs.readFileSync(path.join(BUILDS[name], BUILD_MARK), 'utf8')); } catch { return '빌드 표시 없음'; }
    const watched = [...SOURCES[name].map((p) => path.join(REPO, p)), path.join(HERE, 'build.mjs')];
    if (!(newestMtime(watched) <= mark.builtAt)) return '화면 코드가 빌드본보다 새로움';
    return null;
}

// 빌드는 자식 프로세스로 (화면 폴더에서 돌려야 tailwind 등이 제 파일을 찾음)
function build(name) {
    return new Promise((resolve, reject) => {
        const started = Date.now();
        log(`${name === 'desktop' ? 'PC' : '폰'} 화면 빌드 시작 (1~3분)…`);
        const child = spawn(process.execPath, [path.join(HERE, 'build.mjs'), name, BUILDS[name]], { cwd: APP_DIRS[name], stdio: 'inherit' });
        child.on('error', reject);
        child.on('exit', (code) => {
            if (code !== 0) { reject(new Error(`${name} 빌드 실패 (위 글 참고)`)); return; }
            // 시작 시각을 적음 (빌드 도중 고친 파일은 "빌드본보다 새로움"으로 잡히게)
            fs.writeFileSync(path.join(BUILDS[name], BUILD_MARK), `${JSON.stringify({ builtAt: started })}\n`);
            log(`${name === 'desktop' ? 'PC' : '폰'} 화면 빌드 끝 (${Math.round((Date.now() - started) / 1000)}초)`);
            resolve();
        });
    });
}

// 크롬 창 하나 (프로필은 .run/multi/profile에 남김 → 칸마다 한 로그인이 다음에 켜도 남음)
async function openWindow(url, headless) {
    const { chromium } = createRequire(path.join(REPO, 'e2e', 'package.json'))('@playwright/test');
    const context = await chromium.launchPersistentContext(path.join(RUN_DIR, 'profile'), {
        headless,
        viewport: null,
        locale: 'ko-KR',
        // 화면 가득·소리 자동 재생 허용(칸마다 소리를 켜고 끌 수 있게)
        args: ['--start-maximized', '--autoplay-policy=no-user-gesture-required'],
    });
    // 확인 창(alert·confirm·prompt)은 사람이 직접 누르게 둠 — 듣는 곳이 없으면 Playwright가 바로 닫아 버림
    context.on('dialog', () => {});
    const page = context.pages()[0] ?? await context.newPage();
    await page.goto(url);
    return context;
}

async function main() {
    const o = parseArgs(process.argv.slice(2));
    if (o.help) { console.log(HELP); return; }
    fs.mkdirSync(RUN_DIR, { recursive: true });

    for (const name of ['desktop', 'mobile']) {
        const why = o.rebuild ? '--rebuild' : staleReason(name);
        if (!o.build) { if (why === '빌드본 없음') log(`${name} 빌드본이 없음 — 그 모드 칸은 안내 글만 보임`); continue; }
        if (why === null) { log(`${name === 'desktop' ? 'PC' : '폰'} 화면: 있던 빌드본 씀`); continue; }
        log(`${name === 'desktop' ? 'PC' : '폰'} 화면 다시 빌드: ${why}`);
        await build(name);
    }

    const server = await startServer({
        port: o.port,
        apiUrl: o.api,
        builds: BUILDS,
        publicDir: path.join(REPO, 'frontend', 'public'),
        stateFile: path.join(RUN_DIR, 'state.json'),
        shellFile: path.join(HERE, 'shell.html'),
        slotScript: path.join(HERE, 'slot.js'),
        count: o.count,
        log,
    }).catch((error) => {
        if (error.code === 'EADDRINUSE') throw new Error(`${o.port}번 포트를 이미 씀 (도구가 이미 켜져 있나?) — --port 5391처럼 다른 포트로`);
        throw error;
    });
    log(`도구 서버 켬: ${server.shellUrl}  (백엔드 ${o.api})`);

    let context = null;
    const close = async () => {
        await context?.close().catch(() => {});
        await server.close().catch(() => {});
        process.exit(0);
    };
    process.on('SIGINT', close);
    process.on('SIGTERM', close);

    if (o.open) {
        context = await openWindow(server.shellUrl, o.headless).catch((error) => {
            log(`창 띄우기 실패: ${String(error?.message ?? error).split('\n')[0]}`);
            log(`크롬·엣지에서 ${server.shellUrl} 를 직접 열면 됨`);
            return null;
        });
        // 창을 닫으면 도구도 끝냄
        context?.on('close', () => { log('창이 닫혀서 끝냄'); server.close().finally(() => process.exit(0)); });
    } else {
        log(`크롬·엣지에서 ${server.shellUrl} 를 열면 됨 (주소는 꼭 multi.localhost — localhost:${o.port}로 열면 그리로 보냄)`);
    }
    log('끄기: 이 터미널에서 Ctrl+C');
}

main().catch((error) => { console.error(`[여러계정] 멈춤: ${String(error?.message ?? error).split('\n')[0]}`); process.exit(1); });

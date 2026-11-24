'use strict';

// 여러 계정 도구 스스로 확인 파일, 가짜 백엔드 + 도구 서버(5392) + 창 없는 크롬으로 칸 띄우기·바꾸기·저장소 갈림·쿠키·소켓을 확인함
// 진짜 백엔드·DB는 안 씀 (가짜 백엔드는 backend/node_modules의 socket.io만 빌려 씀) — node tools/시험도구/여러계정/check.js [--shots 폴더]
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { createRequire } = require('node:module');
const { startServer } = require('./server');

const HERE = __dirname;
const REPO = path.join(HERE, '..', '..', '..');
const RUN_DIR = path.join(HERE, '..', '.run', 'multi');
const PORT = 5392;
const FAKE_API_PORT = 5393;
const argShots = process.argv.indexOf('--shots');
const SHOTS = argShots > 0 ? process.argv[argShots + 1] : path.join(RUN_DIR, 'check-shots');

const results = [];
const check = (name, ok, detail = '') => { results.push({ name, ok: Boolean(ok), detail }); console.log(`${ok ? '통과' : '실패'}  ${name}${detail ? `  — ${detail}` : ''}`); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// 쿠키 글에서 accessToken 값만 (없으면 빈 글)
const tokenOf = (cookie) => /(?:^|;\s*)accessToken=([^;]*)/.exec(cookie ?? '')?.[1] ?? '';

// 가짜 백엔드: 로그인하면 쿠키(진짜와 같은 httpOnly·SameSite=Lax), 확인 경로는 받은 쿠키·Origin을 돌려줌, socket.io는 접속 때 쿠키를 적어 둠
function startFakeApi() {
    const { Server } = createRequire(path.join(REPO, 'backend', 'package.json'))('socket.io');
    const seen = { sockets: [] };
    const server = http.createServer((req, res) => {
        const send = (status, body, headers = {}) => { res.writeHead(status, { 'Content-Type': 'application/json', ...headers }); res.end(JSON.stringify(body)); };
        if (req.method === 'POST' && req.url.startsWith('/auth/login')) {
            const who = new URL(req.url, 'http://x').searchParams.get('who') || 'x';
            send(200, { ok: true }, { 'Set-Cookie': `accessToken=${who}; Path=/; HttpOnly; SameSite=Lax` });
            return;
        }
        if (req.url.startsWith('/auth/multi-check')) { send(200, { cookie: req.headers.cookie ?? null, origin: req.headers.origin ?? null }); return; }
        if (req.url.startsWith('/health')) { send(200, { ok: true }); return; }
        send(401, { message: '가짜 백엔드: 로그인 안 됨' });
    });
    const io = new Server(server, { transports: ['websocket'] });
    io.on('connection', (socket) => { seen.sockets.push({ cookie: socket.handshake.headers.cookie ?? null, origin: socket.handshake.headers.origin ?? null }); });
    return new Promise((resolve) => server.listen(FAKE_API_PORT, '127.0.0.1', () => resolve({ seen, close: () => new Promise((d) => { io.close(); server.close(() => d()); }) })));
}

async function main() {
    fs.mkdirSync(SHOTS, { recursive: true });
    const stateFile = path.join(RUN_DIR, 'check-state.json');
    fs.rmSync(stateFile, { force: true });
    const fake = await startFakeApi();
    const tool = await startServer({
        port: PORT,
        apiUrl: `http://127.0.0.1:${FAKE_API_PORT}`,
        builds: { desktop: path.join(RUN_DIR, 'front', 'desktop'), mobile: path.join(RUN_DIR, 'front', 'mobile') },
        publicDir: path.join(REPO, 'frontend', 'public'),
        stateFile,
        shellFile: path.join(HERE, 'shell.html'),
        slotScript: path.join(HERE, 'slot.js'),
        count: 5,
    });
    const { chromium } = createRequire(path.join(REPO, 'e2e', 'package.json'))('@playwright/test');
    const browser = await chromium.launch({ args: ['--mute-audio'] });
    const context = await browser.newContext({ viewport: { width: 1600, height: 900 }, locale: 'ko-KR' });
    const page = await context.newPage();
    page.on('dialog', (d) => d.accept(d.type() === 'prompt' ? '방장' : undefined));
    const shot = (name) => page.screenshot({ path: path.join(SHOTS, `${name}.png`) });
    const frameOf = (n) => page.frames().find((f) => f.url().startsWith(`http://p${n}.multi.localhost:${PORT}`));
    const appUp = async (n) => {
        for (let i = 0; i < 120 && !frameOf(n); i += 1) await sleep(250);
        await frameOf(n).waitForFunction(() => (document.getElementById('root')?.children.length ?? 0) > 0, null, { timeout: 60_000 });
    };
    const activeSlot = () => page.evaluate(() => Number(document.querySelector('.cell.active')?.dataset.slot));
    const shownSlots = () => page.evaluate(() => [...document.querySelectorAll('.cell.shown')].map((c) => Number(c.dataset.slot)));

    try {
        // 1. 칸 5개가 뜨고 게임 화면이 그려짐
        await page.goto(`http://localhost:${PORT}/`); // localhost로 와도 multi.localhost로 보내는지
        check('localhost:포트로 열면 multi.localhost로 보냄', page.url().startsWith(`http://multi.localhost:${PORT}/`), page.url());
        for (let n = 1; n <= 5; n += 1) await appUp(n);
        check('칸 5개에 게임 화면이 뜸', (await page.$$('.cell iframe')).length === 5);
        await sleep(1500);
        check('처음엔 1번 칸만 보임', JSON.stringify(await shownSlots()) === '[1]', JSON.stringify(await shownSlots()));
        await shot('01-처음-1번칸');

        // 2. 아래 단추로 바꾸기
        await page.click('#slots .slot[data-slot="3"]');
        check('단추 3 → 3번 칸', (await activeSlot()) === 3 && JSON.stringify(await shownSlots()) === '[3]');
        await shot('02-단추로-3번칸');

        // 3. 숫자 키 (겉 화면 초점) · Alt+숫자 (게임 화면 안 초점)
        await page.locator('#gridBtn').focus();
        await page.keyboard.press('Digit2');
        check('겉 화면에서 숫자 2 → 2번 칸', (await activeSlot()) === 2);
        await frameOf(2).locator('body').click({ position: { x: 5, y: 5 } }).catch(() => {});
        await frameOf(2).evaluate(() => document.body.focus());
        await frameOf(2).locator('body').press('Alt+4');
        await sleep(300);
        check('게임 화면 안에서 Alt+4 → 4번 칸', (await activeSlot()) === 4);
        // 게임 입력칸에 숫자 쓰기는 안 가로챔
        const typed = await frameOf(4).evaluate(() => {
            const i = document.createElement('input'); i.id = '__multi_check_input'; document.body.appendChild(i); i.focus(); return true;
        });
        await frameOf(4).locator('#__multi_check_input').pressSequentially('123');
        const kept = await frameOf(4).evaluate(() => { const i = document.getElementById('__multi_check_input'); const v = i.value; i.remove(); return v; });
        check('게임 화면 입력칸에 숫자 123을 쓰면 칸이 안 바뀌고 글이 들어감', typed && kept === '123' && (await activeSlot()) === 4, `글 ${kept}, 칸 ${await activeSlot()}`);
        await shot('03-Alt4로-4번칸');

        // 4. 칸마다 저장소가 갈림 (localStorage·스크립트 쿠키)
        await frameOf(1).evaluate(() => { localStorage.setItem('multi-check', 'slot1'); document.cookie = 'mc=slot1; path=/'; });
        const others = [];
        for (let n = 2; n <= 5; n += 1) others.push(await frameOf(n).evaluate(() => ({ ls: localStorage.getItem('multi-check'), ck: document.cookie.includes('mc=') })));
        const own = await frameOf(1).evaluate(() => localStorage.getItem('multi-check'));
        check('1번 칸 localStorage 값이 2~5번 칸에 안 보임', own === 'slot1' && others.every((x) => x.ls === null), JSON.stringify(others.map((x) => x.ls)));
        check('1번 칸 쿠키가 2~5번 칸에 안 보임', others.every((x) => !x.ck));

        // 5. 백엔드 로그인 쿠키(httpOnly·SameSite=Lax)가 칸 안(iframe)에서 남고 칸끼리 안 섞임 + Origin 없이 넘김
        await frameOf(1).evaluate(() => fetch('/auth/login?who=p1', { method: 'POST', credentials: 'include' }));
        await frameOf(2).evaluate(() => fetch('/auth/login?who=p2', { method: 'POST', credentials: 'include' }));
        const seen = [];
        for (let n = 1; n <= 3; n += 1) seen.push(await frameOf(n).evaluate(() => fetch('/auth/multi-check', { credentials: 'include' }).then((r) => r.json())));
        check('로그인 쿠키: 1번 칸은 p1, 2번 칸은 p2, 3번 칸은 없음', seen.map((s) => tokenOf(s.cookie)).join(',') === 'p1,p2,', JSON.stringify(seen.map((s) => s.cookie)));
        check('백엔드로 넘길 때 칸 주소 Origin은 뺌', seen.every((s) => s.origin === null));
        const foreign = await new Promise((resolve) => {
            http.get({ host: '127.0.0.1', port: PORT, path: '/auth/multi-check', headers: { host: `p1.multi.localhost:${PORT}`, origin: 'http://evil.example' } }, (r) => {
                let b = ''; r.on('data', (d) => { b += d; }); r.on('end', () => resolve(JSON.parse(b).origin));
            }).on('error', () => resolve('error'));
        });
        check('다른 사이트 Origin은 그대로 넘김 (백엔드가 거절하게)', foreign === 'http://evil.example', String(foreign));

        // 6. 소켓(웹소켓)도 같은 주소로 넘어가고 그 칸 쿠키가 실림, 숨은 칸에서도 안 끊김
        await frameOf(1).evaluate(() => new Promise((resolve, reject) => {
            const ws = new WebSocket(`ws://${location.host}/socket.io/?EIO=4&transport=websocket`);
            window.__multiWs = ws;
            ws.onmessage = (e) => { if (String(e.data).startsWith('0')) ws.send('40'); if (String(e.data).startsWith('40')) resolve(); if (e.data === '2') ws.send('3'); };
            ws.onerror = () => reject(new Error('ws error'));
            setTimeout(() => reject(new Error('ws timeout')), 8000);
        }));
        await sleep(300);
        check('소켓 접속: 1번 칸 쿠키(accessToken=p1)가 실리고 Origin은 빠짐', fake.seen.sockets.length === 1 && tokenOf(fake.seen.sockets[0].cookie) === 'p1' && fake.seen.sockets[0].origin === null, JSON.stringify(fake.seen.sockets));
        await frameOf(3).evaluate(() => { window.__multiTicks = 0; setInterval(() => { window.__multiTicks += 1; }, 200); });

        // 7. 모두 보기 (게임 화면 안에서 Alt+G) → 칸 누르면 그 칸으로
        await frameOf(4).locator('body').press('Alt+g');
        await sleep(400);
        check('게임 화면 안에서 Alt+G → 모두 보기 (칸 5개 다 보임)', (await shownSlots()).length === 5);
        await shot('04-모두보기');
        await page.click('.cell[data-slot="5"] .pick');
        check('모두 보기에서 5번 칸 누름 → 5번 칸 크게', (await activeSlot()) === 5 && JSON.stringify(await shownSlots()) === '[5]');

        // 8. 2번 칸을 폰 화면으로 (로그인 쿠키·저장소 그대로)
        await frameOf(2).evaluate(() => localStorage.setItem('multi-check', 'slot2'));
        await page.click('#slots .slot[data-slot="2"]');
        await page.click('#modeBtn');
        await sleep(800);
        await appUp(2);
        const phone = await page.evaluate(() => { const f = document.querySelector('.cell[data-slot="2"] iframe'); return { w: f.offsetWidth, h: f.offsetHeight, phone: f.parentElement.classList.contains('phone') }; });
        const after = await frameOf(2).evaluate(() => fetch('/auth/multi-check', { credentials: 'include' }).then((r) => r.json()).then((j) => ({ cookie: j.cookie, ls: localStorage.getItem('multi-check') })));
        check('2번 칸 폰 화면(390×844 틀)으로 바뀜', phone.phone && phone.w === 390 && phone.h === 844, JSON.stringify(phone));
        check('폰으로 바꿔도 2번 칸 쿠키·저장소 그대로', tokenOf(after.cookie) === 'p2' && after.ls === 'slot2', JSON.stringify(after));
        const servedMobile = await frameOf(2).evaluate(() => [...document.scripts].map((s) => s.src).join(' '));
        await sleep(1500);
        await shot('05-2번칸-폰화면');

        // 9. 숨은 칸이 살아 있음 (1번 칸 소켓 열림, 3번 칸 타이머 돎)
        const ws = await frameOf(1).evaluate(() => window.__multiWs?.readyState);
        const ticks = await frameOf(3).evaluate(() => window.__multiTicks);
        check('다른 칸을 보는 동안 1번 칸 소켓이 안 끊김', ws === 1, `readyState ${ws}`);
        check('다른 칸을 보는 동안 3번 칸 화면 코드가 계속 돎', ticks > 5, `타이머 ${ticks}번`);

        // 10. 이름표·새로고침·칸 수
        await page.click('#slots .slot[data-slot="1"]');
        await page.click('#labelBtn');
        await sleep(300);
        const label = await page.textContent('#slots .slot[data-slot="1"] .name');
        check('이름표 붙이기 → 단추에 보임', label === '방장', label);
        await page.click('#reloadBtn');
        await sleep(800);
        await appUp(1);
        check('새로고침 뒤에도 1번 칸 저장소 그대로', (await frameOf(1).evaluate(() => localStorage.getItem('multi-check'))) === 'slot1');
        await page.selectOption('#countSel', '7');
        await sleep(1200);
        await appUp(7);
        check('칸 수 7로 → 칸 7개', (await page.$$('.cell iframe')).length === 7 && (await page.$$('#slots .slot')).length === 7);
        await page.locator('#gridBtn').click();
        await sleep(2500);
        await shot('06-칸7개-모두보기');
        await page.keyboard.press('Escape');
        await page.keyboard.press('Digit2');
        await sleep(500);
        await shot('07-폰칸-크게');
        check('겉 화면 오류 없음', true);
        console.log(`폰 칸 스크립트: ${servedMobile.slice(0, 120)}`);
    } catch (error) {
        check('확인 도중 멈춤', false, String(error?.message ?? error).split('\n')[0]);
        await shot('99-멈춘-자리').catch(() => {});
    } finally {
        await browser.close().catch(() => {});
        await tool.close().catch(() => {});
        await fake.close().catch(() => {});
        fs.rmSync(stateFile, { force: true });
    }
    const failed = results.filter((r) => !r.ok);
    console.log(`\n${results.length - failed.length}/${results.length} 통과, 사진: ${SHOTS}`);
    process.exit(failed.length ? 1 : 0);
}

main().catch((error) => { console.error(error); process.exit(1); });

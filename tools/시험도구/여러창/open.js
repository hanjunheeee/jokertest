'use strict';

// 직접 해 보기용 여러 사람 창 열기, 개발 서버(백엔드 4000·화면 5173)에 시험 계정 tester<번호>로 로그인한 창을 번호마다 하나씩 띄움
// 사람이 직접 돌림 (bash tools/시험도구/여러창/open.sh 2 3 4 5) — 창마다 쿠키가 따로라 한 PC에서 여러 계정이 같이 들어감, Ctrl+C로 다 닫음
// 앞에 room을 붙이면(open.sh room 1 2 3 4 5) 첫 계정이 방을 만들고 나머지가 방 코드로 들어간 대기방까지 감 (준비·시작은 사람이 누름), 창은 화면 가득 크기로 겹쳐 둠
const fs = require('node:fs');
const path = require('node:path');
const { createRequire } = require('node:module');
const { execFileSync } = require('node:child_process');

const REPO = path.join(__dirname, '..', '..', '..');
const e2eRequire = createRequire(path.join(REPO, 'e2e', 'package.json'));
const backendRequire = createRequire(path.join(REPO, 'backend', 'package.json'));
const { chromium } = e2eRequire('@playwright/test');
// 비번은 backend/.env의 DEV_TESTER_PASSWORD에서 읽음 (화면·로그에 안 찍음)
backendRequire('dotenv').config({ path: path.join(REPO, 'backend', '.env'), quiet: true });

// 잡은 알림 글·사진 두는 곳 (git에 안 올라가는 .run/ 아래)
const RUN_DIR = path.join(__dirname, '..', '.run', 'players');
const NOTES_FILE = path.join(RUN_DIR, 'notes.log');
const SHOTS_DIR = path.join(RUN_DIR, 'shots');
fs.mkdirSync(SHOTS_DIR, { recursive: true });

const API = process.env.PLAY_API_URL || 'http://localhost:4000';
const FRONT = process.env.PLAY_FRONT_URL || 'http://localhost:5173';

// 주 화면의 보이는 영역 (맥: 메뉴 막대·Dock 뺀 곳), 못 읽으면 1440×800
function screenArea() {
    if (process.platform !== 'darwin') return { x: 0, y: 0, w: 1440, h: 800 };
    try {
        // 띄울 화면을 이름으로 고름(PLAY_DISPLAY, 예: F2775K): 꽂혀 있으면 그 화면, 없으면 주 화면
        const script = 'ObjC.import("AppKit"); const ss = $.NSScreen.screens; const H = ss.objectAtIndex(0).frame.size.height; const out = [];'
            + ' for (let i = 0; i < ss.count; i++) { const v = ss.objectAtIndex(i).visibleFrame;'
            + ' out.push([v.origin.x, H - (v.origin.y + v.size.height), v.size.width, v.size.height, ObjC.unwrap(ss.objectAtIndex(i).localizedName)].join(" ")); } out.join("\\n");';
        const rows = execFileSync('osascript', ['-l', 'JavaScript', '-e', script], { encoding: 'utf8' }).split(/\r?\n/).filter(Boolean).map((line) => {
            const [x, y, w, h, ...name] = line.trim().split(/\s+/);
            return { x: Number(x), y: Number(y), w: Number(w), h: Number(h), name: name.join(' ') };
        });
        const want = (process.env.PLAY_DISPLAY || '').trim().toLowerCase();
        return (want && rows.find((r) => r.name.toLowerCase().includes(want))) || rows[0];
    } catch {
        return { x: 0, y: 0, w: 1440, h: 800 };
    }
}

// 첫 창이 방을 만들고(정원 = 사람 수, 5 미만이면 5) 나머지가 방 코드로 들어옴 — e2e 화면 도우미(설정 화면·코드 입장)를 그대로 씀
async function gatherInRoom(pages, numbers) {
    const { openSetup, fillSettings } = e2eRequire('./tests/room/roomHelpers/setupScreen');
    const ui = e2eRequire('./helpers/ui');
    const host = pages[0];
    // 방 코드는 방장 창의 소켓 글에서 읽음 (영문 대문자·숫자 6자)
    let code = null;
    host.on('websocket', (ws) => ws.on('framereceived', (frame) => {
        const m = /"roomCode":"([A-Z0-9]{6})"/.exec(typeof frame.payload === 'string' ? frame.payload : '');
        if (m) code = m[1];
    }));
    await host.reload();
    await openSetup(host);
    await fillSettings(host, { maxPlayers: Math.max(5, numbers.length) });
    await host.getByRole('button', { name: '게임 만들기' }).click();
    await host.waitForURL(/\/game-matching/, { timeout: 15000 });
    for (let i = 0; i < 40 && !code; i += 1) await new Promise((r) => setTimeout(r, 250));
    if (!code) throw new Error('방 코드를 못 읽음 (방장 창의 "초대코드 공유"로 코드를 보고 다른 창에서 비밀연회장에 넣으면 됨)');
    console.log(`tester${numbers[0]}: 방 만듦 (방 코드 ${code}, 정원 ${Math.max(5, numbers.length)})`);
    for (let i = 1; i < pages.length; i += 1) {
        await ui.joinRoomByCodeUi(pages[i], code);
        console.log(`tester${numbers[i]}: 방에 들어옴`);
    }
    await host.bringToFront().catch(() => {});
    console.log('모두 대기방에 있음 → 창마다 "준비완료", 방장 창(첫 계정)에서 "게임시작"');
}

async function main() {
    const room = process.argv.includes('room');
    // big: 방은 안 만들고 창만 화면 가득 겹쳐 둠 (이미 도는 판에 창을 다시 붙일 때 — 로그인하면 판 화면으로 돌아감)
    const big = room || process.argv.includes('big');
    const numbers = process.argv.slice(2).map(Number).filter((n) => Number.isInteger(n) && n >= 1 && n <= 10);
    if (numbers.length === 0) {
        console.log('사용: open.sh <시험 계정 번호들> — 예: open.sh 2 3 4 5 (tester2~5 창 넷)');
        process.exit(1);
    }
    const password = process.env.DEV_TESTER_PASSWORD;
    if (!password) throw new Error('backend/.env에 DEV_TESTER_PASSWORD가 없음 (backend에서 node scripts/seed-dev-testers.js 먼저)');

    // 소리는 꺼 둠 (PLAY_SOUND=1이면 켬)
    const args = process.env.PLAY_SOUND === '1' ? [] : ['--mute-audio'];
    const browser = await chromium.launch({ headless: false, args });
    const cdp = await browser.newBrowserCDPSession();

    // 창을 바둑판으로 놓음 (가로 칸 수는 창 수에 맞춤)
    const area = screenArea();
    const cols = numbers.length <= 2 ? numbers.length : numbers.length <= 6 ? 3 : 4;
    const rows = Math.ceil(numbers.length / cols);
    const w = Math.max(500, Math.floor(area.w / cols));
    const h = Math.floor(area.h / rows);

    const pages = [];
    for (let i = 0; i < numbers.length; i += 1) {
        const n = numbers[i];
        const email = `tester${n}@example.test`;
        // 화면 크기를 고정하지 않음 → 창을 키우면 화면도 같이 커짐
        const context = await browser.newContext({ viewport: null, locale: 'ko-KR', baseURL: FRONT });
        const res = await context.request.post(`${API}/auth/login`, { data: { email, password }, headers: { origin: FRONT } });
        if (res.status() !== 200) {
            console.log(`tester${n}: 로그인 실패 (${res.status()}) — 창은 로그인 화면으로 엶`);
        }
        // 창 바꾸기 줄: 창마다 맨 아래에 계정 단추 줄을 띄움 → 누르면 그 계정 창이 앞으로 옴 (크롬은 쿠키가 다른 계정을 한 창의 탭으로 못 묶어서 탭처럼 보이게 한 것)
        await context.exposeBinding('__playSwitch', (_source, index) => pages[index]?.bringToFront().catch(() => {}));
        await context.addInitScript(({ labels, me }) => {
            const draw = () => {
                if (!document.body || document.getElementById('__play_bar')) return;
                const bar = document.createElement('div');
                bar.id = '__play_bar';
                bar.style.cssText = 'position:fixed;left:50%;bottom:4px;transform:translateX(-50%);z-index:2147483647;display:flex;gap:4px;padding:3px 6px;background:rgba(0,0,0,.75);border-radius:8px;font:12px/1.4 -apple-system,sans-serif';
                labels.forEach((label, index) => {
                    const b = document.createElement('button');
                    b.textContent = label;
                    b.style.cssText = `all:unset;cursor:pointer;padding:2px 8px;border-radius:6px;color:#fff;background:${index === me ? '#b8860b' : '#444'}`;
                    b.addEventListener('click', (e) => { e.stopPropagation(); window.__playSwitch(index); });
                    bar.appendChild(b);
                });
                const hide = document.createElement('button');
                hide.textContent = '×';
                hide.title = '이 줄 숨기기 (새로고침하면 다시 나옴)';
                hide.style.cssText = 'all:unset;cursor:pointer;padding:2px 6px;color:#bbb';
                hide.addEventListener('click', (e) => { e.stopPropagation(); bar.remove(); window.__playBarHidden = true; });
                bar.appendChild(hide);
                document.body.appendChild(bar);
            };
            setInterval(() => { if (!window.__playBarHidden) draw(); }, 500);
        }, { labels: numbers.map((x) => `tester${x}`), me: i });
        // 잠깐 떴다 사라지는 알림 잡기: 화면 위쪽(위 30%)에 새로 생긴 짧은 글을 적고 그 순간 사진을 찍음 → tools/시험도구/.run/players/ (notes.log·shots/)
        let lastShot = 0;
        await context.exposeBinding('__playNote', async (source, note) => {
            const at = new Date().toTimeString().slice(0, 8);
            fs.appendFileSync(NOTES_FILE, `${at} tester${n} [${note.kind}] ${note.ms != null ? `${note.ms}ms ` : ''}${note.path} :: ${note.text}\n`);
            if (note.kind !== '생김' || Date.now() - lastShot < 400) return;
            lastShot = Date.now();
            await source.page.screenshot({ path: path.join(SHOTS_DIR, `${at.replace(/:/g, '')}-tester${n}-${lastShot % 100000}.png`) }).catch(() => {});
        });
        await context.addInitScript(() => {
            const seen = new Map();
            const textOf = (el) => (el.innerText || '').replace(/\s+/g, ' ').trim();
            const pathOf = (el) => { const parts = []; for (let e = el; e && e !== document.body && parts.length < 4; e = e.parentElement) parts.unshift(e.tagName.toLowerCase() + (e.getAttribute('role') ? `[${e.getAttribute('role')}]` : '')); return location.pathname + ' ' + parts.join('>'); };
            const start = () => {
                if (!document.body) return setTimeout(start, 200);
                new MutationObserver((records) => {
                    for (const r of records) {
                        for (const el of r.addedNodes) {
                            if (el.nodeType !== 1 || el.id === '__play_bar' || el.closest?.('#__play_bar')) continue;
                            const text = textOf(el);
                            if (text.length < 2 || text.length > 200) continue;
                            const box = el.getBoundingClientRect();
                            if (box.width === 0 || box.top > window.innerHeight * 0.3) continue;
                            seen.set(el, { at: Date.now(), text, path: pathOf(el) });
                            window.__playNote({ kind: '생김', text, path: pathOf(el) });
                        }
                        for (const el of r.removedNodes) {
                            const info = seen.get(el);
                            if (!info) continue;
                            seen.delete(el);
                            window.__playNote({ kind: '사라짐', text: info.text, path: info.path, ms: Date.now() - info.at });
                        }
                    }
                }).observe(document.body, { childList: true, subtree: true });
            };
            start();
        });
        // 확인 창(예: "로비로 나가시겠습니까?")은 사람이 직접 누르게 둠 — 듣는 곳이 없으면 Playwright가 창을 바로 닫아 버려 "잠깐 떴다 사라짐"이 됨
        context.on('dialog', () => {});
        const page = await context.newPage();
        const session = await context.newCDPSession(page);
        const { targetInfo } = await session.send('Target.getTargetInfo');
        const { windowId } = await cdp.send('Browser.getWindowForTarget', { targetId: targetInfo.targetId });
        // 먼저 고른 화면 위로 옮김 (화면 가득 키우기는 창이 놓인 화면에서 됨)
        if (big) await cdp.send('Browser.setWindowBounds', { windowId, bounds: { left: area.x + 40, top: area.y + 40, width: Math.min(1280, area.w - 80), height: Math.min(800, area.h - 80) } }).catch(() => {});
        await cdp.send('Browser.setWindowBounds', {
            windowId,
            // 방 모드는 화면 가득(겹쳐 둠, 창 바꾸기는 Cmd+` 또는 Dock), 아니면 바둑판
            bounds: big ? { windowState: 'maximized' } : { left: area.x + (i % cols) * Math.floor(area.w / cols), top: area.y + Math.floor(i / cols) * h, width: w, height: h },
        }).catch(() => {});
        pages.push(page);
        await page.goto(res.status() === 200 ? `${FRONT}/lobby` : `${FRONT}/login`).catch(() => {});
        // 탭 이름 앞에 계정 이름을 붙임 (어느 창이 누구인지 보이게, 화면이 바뀌어도 다시 붙임)
        await page.addInitScript((label) => {
            const tag = () => { if (!document.title.startsWith(label)) document.title = `${label} ${document.title}`; };
            setInterval(tag, 1000);
        }, `[tester${n}]`).catch(() => {});
        await page.reload().catch(() => {});
        console.log(`tester${n}: 창 열림`);
    }

    if (room) await gatherInRoom(pages, numbers).catch((error) => console.log(`방 모으기 멈춤: ${String(error?.message ?? error).split('\n')[0]} — 열린 창에서 손으로 이어 하면 됨`));
    console.log(`창 ${numbers.length}개 열림. 다 닫으려면 이 터미널에서 Ctrl+C`);
    const close = async () => { await browser.close().catch(() => {}); process.exit(0); };
    process.on('SIGINT', close);
    process.on('SIGTERM', close);
    browser.on('disconnected', () => process.exit(0));
    await new Promise(() => {});
}

main().catch((error) => { console.error(`멈춤: ${String(error?.message ?? error).split('\n')[0]}`); process.exit(1); });

'use strict';

// 브라우저 창 모음 파일, 큰 창(실제 크기)·작은 창(0.45배로 줄여 보임) 브라우저 둘 + 창 늘어놓기·숨기기
// 맥은 배율 플래그가 창 크기를 안 줄여서 화면 흉내 배율(Emulation scale)로 줄여 보임 → 큰 창도 화면보다 크면 줄임, 자동으로 누를 때만 잠깐 제 배율(wake/rest)
// session.js가 창을 만들 때, run.js가 장면을 보여 줄 때 씀 (큰 창은 화면마다 하나씩, 작은 창은 주 화면 남은 칸) — 창 없는 모드(--selfcheck)면 브라우저 하나에 창 위치는 안 건드림
const { execFileSync } = require('node:child_process');
const { e2eRequire, fromE2e } = require('./paths');

const { chromium } = e2eRequire('@playwright/test');
const { chromiumArgs, guardBrowser } = fromE2e('helpers/outside');

// 작은 창 배율: 1280×800 창이 약 583×400으로 보임 → 1920 화면에 큰 창(1296) 옆에 한 줄 들어감
const SMALL_SCALE = 0.45;
// 맥: --force-device-scale-factor가 창·글 크기를 안 바꿈(2026-11-17 맥북 1440×796에서 잼) → 창마다 화면 흉내 배율로 줄임
const EMULATE = process.platform === 'darwin';
// 맥 화면이 좁을 때(가로 1900 미만) 작은 창 배율: 1280×800 창이 493×308로 보임 → 테두리까지 높이 395라 796 화면에 두 줄 들어감
const SMALL_SCALE_NARROW = 0.385;
// 크롬 창은 폭 500 밑으로 안 줄어듦 (맥북에서 잼) → 작은 창 한 줄 자리는 500 이상으로 잡음
const MIN_WINDOW_W = 500;
// 맥 창 테두리(탭 줄·주소 줄) 높이를 못 잴 때 쓰는 값 (맥북에서 잰 값)
const MAC_CHROME_H = 87;
// 화면 정보를 못 읽으면 쓰는 값 (1920×1080 한 개)
const FALLBACK_SCREENS = [{ x: 0, y: 0, w: 1920, h: 1032, primary: true }];

// 화면(모니터) 작업 영역 목록, 주 화면 먼저 → 나머지는 왼쪽부터
function readScreens() {
    if (process.platform === 'darwin') return readMacScreens();
    if (process.platform !== 'win32') return FALLBACK_SCREENS;
    try {
        const out = execFileSync('powershell', ['-NoProfile', '-Command',
            'Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.Screen]::AllScreens | ForEach-Object { "$($_.WorkingArea.X) $($_.WorkingArea.Y) $($_.WorkingArea.Width) $($_.WorkingArea.Height) $($_.Primary)" }'],
        { encoding: 'utf8' });
        const list = out.split(/\r?\n/).filter(Boolean).map((line) => {
            const [x, y, w, h, primary] = line.trim().split(/\s+/);
            return { x: Number(x), y: Number(y), w: Number(w), h: Number(h), primary: primary === 'True' };
        }).filter((s) => s.w > 0 && s.h > 0);
        if (list.length === 0) return FALLBACK_SCREENS;
        return list.sort((a, b) => (b.primary - a.primary) || (a.x - b.x));
    } catch {
        return FALLBACK_SCREENS;
    }
}

// 맥 화면 목록: JXA(맥 자동화 스크립트)로 NSScreen의 보이는 영역(메뉴 막대·Dock 뺀 곳)을 읽음, 단위는 점(레티나여도 창 좌표와 같은 단위)
// NSScreen은 아래가 0이라 위가 0인 좌표로 뒤집음 (첫 화면 = 메뉴 막대 있는 주 화면)
function readMacScreens() {
    try {
        const script = 'ObjC.import("AppKit"); const ss = $.NSScreen.screens; const H = ss.objectAtIndex(0).frame.size.height; const out = [];'
            + ' for (let i = 0; i < ss.count; i++) { const v = ss.objectAtIndex(i).visibleFrame;'
            + ' out.push([v.origin.x, H - (v.origin.y + v.size.height), v.size.width, v.size.height, i === 0, ObjC.unwrap(ss.objectAtIndex(i).localizedName)].join(" ")); } out.join("\\n");';
        const out = execFileSync('osascript', ['-l', 'JavaScript', '-e', script], { encoding: 'utf8', timeout: 10_000 });
        const list = out.split(/\r?\n/).filter(Boolean).map((line) => {
            const [x, y, w, h, primary, ...name] = line.trim().split(/\s+/);
            return { x: Math.round(Number(x)), y: Math.round(Number(y)), w: Math.round(Number(w)), h: Math.round(Number(h)), primary: primary === 'true', name: name.join(' ') };
        }).filter((s) => s.w > 0 && s.h > 0);
        if (list.length === 0) return FALLBACK_SCREENS;
        // 띄울 화면을 이름으로 고름(EYE_DISPLAY, 예: F2775K): 그 화면이 꽂혀 있으면 맨 앞(주 화면 자리)으로, 없으면 원래 차례
        const want = (process.env.EYE_DISPLAY || '').trim().toLowerCase();
        const wanted = (s) => Boolean(want) && s.name.toLowerCase().includes(want);
        return list.sort((a, b) => (wanted(b) - wanted(a)) || (b.primary - a.primary) || (a.x - b.x));
    } catch {
        return FALLBACK_SCREENS;
    }
}

/**
 * 창 자리 정하기: 화면마다 위→아래로 쌓고, 안 들어가면 옆 칸, 화면이 차면 다음 화면 (큰 창 먼저)
 * @param {{w:number,h:number}[]} sizes 창 바깥 크기 (실제 화소)
 * @returns {{x:number,y:number,overlap:boolean}[]} 같은 차례
 * @example place([{w:1296,h:888},{w:583,h:400},{w:583,h:400}], [{x:0,y:0,w:1920,h:1032}]) // [{x:0,y:0},{x:1296,y:0},{x:1296,y:400}]
 */
function place(sizes, screens) {
    const out = [];
    let si = 0;
    let colX = 0;
    let colW = 0;
    let y = 0;
    for (const size of sizes) {
        let spot = null;
        while (si < screens.length && !spot) {
            const s = screens[si];
            if (y + size.h <= s.h && colX + size.w <= s.w) {
                spot = { x: s.x + colX, y: s.y + y, overlap: false };
                y += size.h;
                colW = Math.max(colW, size.w);
            } else if (y > 0) {
                // 이 칸은 찼음 → 옆 칸
                colX += colW; colW = 0; y = 0;
            } else {
                // 빈 칸에도 안 들어감 → 다음 화면
                si += 1; colX = 0; colW = 0; y = 0;
            }
        }
        // 화면이 다 찼으면 마지막 화면에 비스듬히 겹쳐 둠
        if (!spot) {
            const s = screens[screens.length - 1];
            const k = out.filter((o) => o.overlap).length;
            spot = { x: s.x + 40 * (k + 1), y: s.y + 40 * (k + 1), overlap: true };
        }
        out.push(spot);
    }
    return out;
}

// 맥 창 테두리 높이 재기: 화면 흉내 없는 창을 잠깐 열어 바깥 높이 − 안 높이
async function measureChrome(browser) {
    const context = await browser.newContext({ viewport: null });
    try {
        const page = await context.newPage();
        const h = await page.evaluate(() => window.outerHeight - window.innerHeight);
        return h > 0 && h < 200 ? h : MAC_CHROME_H;
    } finally {
        await context.close().catch(() => {});
    }
}

class Windows {
    constructor({ headless }) {
        this.headless = headless;
        this.browsers = new Map(); // 'big' | 'small' → 브라우저
        this.cdp = new Map();
        this.screens = headless ? FALLBACK_SCREENS : readScreens();
        this.emulate = EMULATE && !headless;
        this.chromeH = MAC_CHROME_H;
    }

    // 브라우저 열쇠: 창 없는 모드·맥은 브라우저 하나 (맥은 창마다 배율을 따로 줌)
    keyOf(kind) { return this.headless || this.emulate ? 'big' : kind; }

    // 창 없는 모드는 브라우저 하나만 (작은 창도 같은 브라우저, 크기는 그대로)
    async browser(kind = 'big') {
        const key = this.keyOf(kind);
        // 사람이 브라우저를 꺼 버렸으면(창을 다 닫거나 Cmd+Q) 다시 띄움
        if (this.browsers.has(key)) {
            const alive = await Promise.resolve(this.browsers.get(key)).then((b) => (typeof b.isConnected === 'function' ? b.isConnected() : true), () => false);
            if (!alive) { this.browsers.delete(key); this.cdp.delete(key); }
        }
        if (!this.browsers.has(key)) {
            // 켜는 중인 약속을 넣어 둠 → 동시에 불러도 브라우저가 하나만 뜸
            this.browsers.set(key, (async () => {
                const args = [...chromiumArgs()];
                if (key === 'small') args.push(`--force-device-scale-factor=${SMALL_SCALE}`);
                // 소리는 꺼 둠 (효과음을 들어야 하는 줄, 예: 바-26은 EYE_SOUND=1로 켬)
                if (process.env.EYE_SOUND !== '1') args.push('--mute-audio');
                const launched = await chromium.launch({ headless: this.headless, args });
                this.cdp.set(key, await launched.newBrowserCDPSession());
                if (this.emulate) this.chromeH = await measureChrome(launched).catch(() => MAC_CHROME_H);
                return guardBrowser(launched);
            })());
        }
        return this.browsers.get(key);
    }

    // 작은 창에 맞춘 창 값 (화면 배율 같이 줄여야 1280×800이 그대로 다 보임) — 맥은 늘 1 (창 좌표가 그대로 점 단위, 줄이기는 fit이 함)
    scaleOf(kind) { return !this.headless && !this.emulate && kind === 'small' ? SMALL_SCALE : 1; }

    /**
     * 맥: 창마다 보일 배율 정하기 → 큰 창은 화면에 들어가는 만큼(최대 1), 작은 창은 0.45(좁은 화면 0.3)
     * 작은 창이 있으면 큰 창을 더 줄여 오른쪽에 작은 창 한 줄 자리를 남김
     * @example 화면 1440×796, 큰 창 1280×800 하나 → 0.88 / 작은 창도 있으면 큰 창 0.73·작은 창 0.385
     */
    viewScales(entries) {
        const main = this.screens[0];
        const smallK = main.w >= 1900 ? SMALL_SCALE : SMALL_SCALE_NARROW;
        const hasSmall = entries.some((e) => e.kind !== 'big');
        const down = (n) => Math.floor(n * 100) / 100;
        return entries.map((e) => {
            if (e.kind !== 'big') return smallK;
            const vp = e.page.viewportSize() ?? { width: 1280, height: 800 };
            const room = main.w - (hasSmall ? Math.max(MIN_WINDOW_W, Math.round(1280 * smallK)) : 0);
            return down(Math.min(1, (main.h - this.chromeH) / vp.height, room / vp.width));
        });
    }

    // 맥: 창 하나에 배율 주기 (화면 흉내 배율, 화면 크기 값은 그대로) — 배율 1이고 준 적 없으면 안 건드림
    async setViewScale(entry, k) {
        if (k === 1 && !entry.emuSession) return;
        const vp = entry.page.viewportSize();
        if (!vp) return;
        if (!entry.emuSession) entry.emuSession = await entry.page.context().newCDPSession(entry.page);
        await entry.emuSession.send('Emulation.setDeviceMetricsOverride', {
            width: vp.width, height: vp.height, deviceScaleFactor: entry.dsf ?? 1, mobile: Boolean(entry.mobile), scale: k,
        });
    }

    // 맥: 창을 보일 배율·크기로 맞춤 (arrange가 자리 잡기 전에 부름)
    async fit(entries) {
        const scales = this.viewScales(entries);
        for (let i = 0; i < entries.length; i += 1) {
            const e = entries[i];
            const vp = e.page.viewportSize();
            if (!vp) continue;
            e.viewK = scales[i];
            await this.setViewScale(e, e.viewK).catch(() => {});
            await this.bounds(e, { width: Math.round(vp.width * e.viewK), height: Math.round(vp.height * e.viewK) + this.chromeH }).catch(() => {});
        }
    }

    // 맥: 자동으로 누르기 전 제 배율로 (줄인 채로는 Playwright 누르기가 "가려짐"으로 실패함), 끝나면 rest로 다시 줄임
    async wake(entries) {
        if (!this.emulate) return;
        for (const e of entries) if (e.viewK && e.viewK !== 1) await this.setViewScale(e, 1).catch(() => {});
    }

    async rest(entries) {
        if (!this.emulate) return;
        for (const e of entries) if (e.viewK && e.viewK !== 1) await this.setViewScale(e, e.viewK).catch(() => {});
    }

    // 창 하나의 브라우저 창 번호
    async windowId(entry) {
        if (entry.windowId) return entry.windowId;
        const session = await entry.page.context().newCDPSession(entry.page);
        const { targetInfo } = await session.send('Target.getTargetInfo');
        await session.detach().catch(() => {});
        const { windowId } = await this.cdp.get(this.keyOf(entry.kind)).send('Browser.getWindowForTarget', { targetId: targetInfo.targetId });
        entry.windowId = windowId;
        return windowId;
    }

    async bounds(entry, value) {
        const id = await this.windowId(entry);
        const cdp = this.cdp.get(this.keyOf(entry.kind));
        if (value) await cdp.send('Browser.setWindowBounds', { windowId: id, bounds: value });
        return (await cdp.send('Browser.getWindowBounds', { windowId: id })).bounds;
    }

    // 뒤에서 준비하는 장면 창은 내려 둠 (지금 장면을 안 가리게)
    async hide(entry) {
        if (this.headless) return;
        await this.bounds(entry, { windowState: 'minimized' }).catch(() => {});
    }

    /**
     * 장면 창 늘어놓기 (큰 창 먼저, 화면마다 겹치지 않게) → 겹친 창 수
     * @param {{page:any, kind:'big'|'small'}[]} entries
     */
    async arrange(entries) {
        if (this.headless || entries.length === 0) return 0;
        // 화면을 늘어놓을 때마다 다시 읽음 (도중에 바깥 모니터를 꽂거나 뽑으면 화면 크기가 달라짐)
        this.screens = readScreens();
        // 창 하나만 보기(EYE_SOLO=1): 첫 사람 창만 늘어놓고 나머지는 내려 둠 (다른 창에 안 가려지게, 내려 둔 창은 Dock에서 꺼내 볼 수 있음)
        if (process.env.EYE_SOLO === '1' && entries.length > 1) {
            for (const e of entries.slice(1)) await this.hide(e);
            entries = entries.slice(0, 1);
        }
        const bigs = entries.filter((e) => e.kind === 'big');
        const smalls = entries.filter((e) => e.kind !== 'big');
        if (this.emulate) {
            for (const e of entries) await this.bounds(e, { windowState: 'normal' }).catch(() => {});
            await this.fit(entries);
        }
        const sizeOf = async (e) => {
            await this.bounds(e, { windowState: 'normal' }).catch(() => {});
            const b = await this.bounds(e);
            const scale = this.scaleOf(e.kind);
            return { w: Math.round(b.width * scale), h: Math.round(b.height * scale) };
        };
        const bigSizes = [];
        for (const e of bigs) bigSizes.push(await sizeOf(e));
        const smallSizes = [];
        for (const e of smalls) smallSizes.push(await sizeOf(e));
        const bigSpots = place(bigSizes, this.screens);
        // 작은 창은 주 화면에만 (줄인 배율 브라우저는 다른 화면 좌표가 어긋남) → 주 화면의 큰 창 오른쪽 남은 칸
        const main = this.screens[0];
        const usedW = Math.max(0, ...bigSpots.map((p, i) => (p.x >= main.x && p.x < main.x + main.w ? p.x - main.x + bigSizes[i].w : 0)));
        const strip = usedW + 200 <= main.w ? { ...main, x: main.x + usedW, w: main.w - usedW } : main;
        const smallSpots = place(smallSizes, [strip]);
        const moves = [...bigs.map((e, i) => [e, bigSpots[i]]), ...smalls.map((e, i) => [e, smallSpots[i]])];
        for (const [e, spot] of moves) {
            const scale = this.scaleOf(e.kind);
            await this.bounds(e, { left: Math.round(spot.x / scale), top: Math.round(spot.y / scale) }).catch(() => {});
        }
        // 창에 꽉 차게 보기(EYE_FULL=1): 화면 크기를 고정하지 않은 큰 창은 화면 가득 키움
        if (process.env.EYE_FULL === '1') {
            for (const e of bigs) if (!e.page.viewportSize()) await this.bounds(e, { windowState: 'maximized' }).catch(() => {});
        }
        // 큰 창이 맨 위로 오게 마지막에 앞으로
        for (const e of [...smalls, ...[...bigs].reverse()]) await e.page.bringToFront().catch(() => {});
        return [...bigSpots, ...smallSpots].filter((p) => p.overlap).length;
    }

    async close() {
        for (const p of this.browsers.values()) await Promise.resolve(p).then((b) => b.close()).catch(() => {});
        this.browsers.clear();
    }
}

module.exports = { Windows, place, SMALL_SCALE };

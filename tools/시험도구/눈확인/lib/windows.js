'use strict';

// 브라우저 창 모음 파일, 큰 창(실제 크기)·작은 창(0.45배로 줄여 보임) 브라우저 둘 + 창 늘어놓기·숨기기
// session.js가 창을 만들 때, run.js가 장면을 보여 줄 때 씀 (큰 창은 화면마다 하나씩, 작은 창은 주 화면 남은 칸) — 창 없는 모드(--selfcheck)면 브라우저 하나에 창 위치는 안 건드림
const { execFileSync } = require('node:child_process');
const { e2eRequire, fromE2e } = require('./paths');

const { chromium } = e2eRequire('@playwright/test');
const { chromiumArgs, guardBrowser } = fromE2e('helpers/outside');

// 작은 창 배율: 1280×800 창이 약 583×400으로 보임 → 1920 화면에 큰 창(1296) 옆에 한 줄 들어감
const SMALL_SCALE = 0.45;
// 화면 정보를 못 읽으면 쓰는 값 (1920×1080 한 개)
const FALLBACK_SCREENS = [{ x: 0, y: 0, w: 1920, h: 1032, primary: true }];

// 화면(모니터) 작업 영역 목록, 주 화면 먼저 → 나머지는 왼쪽부터
function readScreens() {
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

class Windows {
    constructor({ headless }) {
        this.headless = headless;
        this.browsers = new Map(); // 'big' | 'small' → 브라우저
        this.cdp = new Map();
        this.screens = headless ? FALLBACK_SCREENS : readScreens();
    }

    // 창 없는 모드는 브라우저 하나만 (작은 창도 같은 브라우저, 크기는 그대로)
    async browser(kind = 'big') {
        const key = this.headless ? 'big' : kind;
        if (!this.browsers.has(key)) {
            const args = [...chromiumArgs()];
            if (key === 'small') args.push(`--force-device-scale-factor=${SMALL_SCALE}`);
            const launched = await chromium.launch({ headless: this.headless, args });
            this.browsers.set(key, guardBrowser(launched));
            this.cdp.set(key, await launched.newBrowserCDPSession());
        }
        return this.browsers.get(key);
    }

    // 작은 창에 맞춘 창 값 (화면 배율 같이 줄여야 1280×800이 그대로 다 보임)
    scaleOf(kind) { return !this.headless && kind === 'small' ? SMALL_SCALE : 1; }

    // 창 하나의 브라우저 창 번호
    async windowId(entry) {
        if (entry.windowId) return entry.windowId;
        const session = await entry.page.context().newCDPSession(entry.page);
        const { targetInfo } = await session.send('Target.getTargetInfo');
        await session.detach().catch(() => {});
        const { windowId } = await this.cdp.get(entry.kind).send('Browser.getWindowForTarget', { targetId: targetInfo.targetId });
        entry.windowId = windowId;
        return windowId;
    }

    async bounds(entry, value) {
        const id = await this.windowId(entry);
        const cdp = this.cdp.get(entry.kind);
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
        const bigs = entries.filter((e) => e.kind === 'big');
        const smalls = entries.filter((e) => e.kind !== 'big');
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
        // 큰 창이 맨 위로 오게 마지막에 앞으로
        for (const e of [...smalls, ...[...bigs].reverse()]) await e.page.bringToFront().catch(() => {});
        return [...bigSpots, ...smallSpots].filter((p) => p.overlap).length;
    }

    async close() {
        for (const b of this.browsers.values()) await b.close().catch(() => {});
        this.browsers.clear();
    }
}

module.exports = { Windows, place, SMALL_SCALE };

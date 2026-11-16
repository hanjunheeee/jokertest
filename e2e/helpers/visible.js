'use strict';

// "사람 눈에 보이나" 확인 파일, 글·단추가 있기만 한 게 아니라 크기·화면 안·안 가려짐·글자색과 바탕색 대비까지 봄
// 브라우저 시험이 toBeVisible 대신 씀 (toBeVisible은 검정 바탕 검정 글자·덮인 단추도 통과 → 받은 버그 7을 못 잡았음)
//
// 쓰는 법
//   const { expectReadable, expectAllReadable, readability, contrastRatio } = require('../../helpers/visible');
//
//   // 기본: 보임 + 크기 0 아님 + 화면 안 + 가운데가 안 가려짐 + 대비 4.5 이상 (큰 글자는 3 이상, 글자 크기 보고 알아서)
//   await expectReadable(page.getByRole('button', { name: '추방' }));
//   await expectReadable(page.getByText('잔액이 부족합니다'));
//   // 큰 글자로 치기 (24px 넘거나 18.66px 넘는 굵은 글자는 알아서 큰 글자로 봄)
//   await expectReadable(page.getByText('낮이 밝았습니다'), { large: true });
//   // 글이 없는 단추(그림 단추)는 대비를 못 셈 → 보임·화면 안·안 가려짐만 (contrast: false)
//   await expectReadable(page.getByRole('button', { name: '설정' }), { contrast: false });
//   // 그림 단추(그림 위에 글)도 그대로 — 글자색은 안쪽 글 칸에서, 바탕은 사진에서 (expectButtonReadable은 같은 것의 다른 이름)
//   await expectReadable(page.getByRole('button', { name: '게임시작' }));
//   // 여러 개 다 (예: 재판 유죄·무죄 단추 둘)
//   await expectAllReadable(page.getByRole('dialog').getByRole('button'));
//   // 값만 받아 직접 보기 → { ratio, color, background, large, inViewport, coveredBy, ... }
//   const r = await readability(locator); expect(r.ratio).toBeGreaterThan(7);
//
// 바탕색 찾는 법
//   - 위로 올라가며 처음 불투명한 background-color (반투명은 겹쳐 섞음)
//   - 바탕이 그림·그라데이션이거나 body까지 불투명한 바탕이 없으면(떠 있는 창 등) 요소 사진을 찍어 픽셀 중앙값을 바탕으로 씀
//   - method: 'dom' | 'pixels'로 한쪽만 쓰게 할 수 있음 (기본 'auto')
// 그림 단추 (단추 안에 그림 + 글 칸이 따로 있는 것 — 대기방 "준비완료"·"게임시작" 등)
//   - 글자색·글자 크기는 단추가 아니라 글이 실제로 그려지는 안쪽 글 칸에서 읽음 (단추에 바로 붙은 글이 없을 때만, 화면 읽기 전용으로 접어 둔 글은 건너뜀)
//   - 그 글 칸 뒤에 그림이 깔려 있으면 바탕색은 사진으로 봄 → 단추에 바로 expectReadable을 써도 됨
// pointer-events:none인 글·알림 칸: 가운데 점 확인 때만 잠깐 누를 수 있게 바꿔 봄 (안 그러면 늘 "가려짐"으로 나옴)
// 못 잡는 것: pointer-events:none인 덮개(elementFromPoint가 지나침), 글자 그림자·테두리로만 읽히는 글
const { expect } = require('@playwright/test');
const zlib = require('node:zlib');

// WCAG AA(웹 접근성 기준): 보통 글 4.5, 큰 글 3
const MIN_RATIO_NORMAL = 4.5;
const MIN_RATIO_LARGE = 3;
// 이보다 투명하면 거의 안 보이는 것으로 봄 (toBeVisible은 opacity 0도 보인다고 함)
const MIN_OPACITY = 0.3;
// 화면 끝 1px 정도는 반올림 차이로 넘칠 수 있음
const EDGE_SLACK_PX = 1;

/** 'rgb(1, 2, 3)'·'rgba(1, 2, 3, 0.5)' → { r, g, b, a } (못 읽으면 null) */
function parseColor(text) {
    const m = /rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:[,\s/]+([\d.]+%?))?\s*\)/i.exec(text ?? '');
    if (!m) return null;
    let a = m[4] === undefined ? 1 : Number.parseFloat(m[4]);
    if (m[4]?.endsWith('%')) a /= 100;
    return { r: Number(m[1]), g: Number(m[2]), b: Number(m[3]), a };
}

// 위 색(반투명)을 아래 색(불투명)에 겹친 색
const blend = (top, bottom) => ({
    r: top.r * top.a + bottom.r * (1 - top.a),
    g: top.g * top.a + bottom.g * (1 - top.a),
    b: top.b * top.a + bottom.b * (1 - top.a),
    a: 1,
});

// 밝기 (WCAG 상대 휘도)
function luminance({ r, g, b }) {
    const ch = (v) => {
        const s = v / 255;
        return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
    };
    return 0.2126 * ch(r) + 0.7152 * ch(g) + 0.0722 * ch(b);
}

/**
 * 두 색 대비 (1~21) — 같은 색 1, 검정·흰색 21
 * @example contrastRatio({ r: 0, g: 0, b: 0 }, { r: 255, g: 255, b: 255 }) // 21
 */
function contrastRatio(a, b) {
    const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
    return (hi + 0.05) / (lo + 0.05);
}

const colorText = (c) => (c ? `rgb(${Math.round(c.r)}, ${Math.round(c.g)}, ${Math.round(c.b)})` : '없음');

// PNG(시험 사진) → 픽셀 [r,g,b,...] (8비트·RGB/RGBA·겹침 없는 것만 — Playwright 사진이 이 모양), 새 꾸러미 없이
function decodePng(buf) {
    let pos = 8;
    let width = 0; let height = 0; let colorType = 0;
    const idat = [];
    while (pos < buf.length) {
        const len = buf.readUInt32BE(pos);
        const type = buf.toString('ascii', pos + 4, pos + 8);
        const data = buf.subarray(pos + 8, pos + 8 + len);
        if (type === 'IHDR') {
            width = data.readUInt32BE(0); height = data.readUInt32BE(4);
            if (data[8] !== 8 || data[12] !== 0) throw new Error('PNG 모양이 8비트·겹침 없음이 아님');
            colorType = data[9];
        } else if (type === 'IDAT') idat.push(data);
        else if (type === 'IEND') break;
        pos += 12 + len;
    }
    const bpp = colorType === 6 ? 4 : colorType === 2 ? 3 : 0;
    if (!bpp) throw new Error(`PNG 색 모양 ${colorType}은 못 읽음`);
    const raw = zlib.inflateSync(Buffer.concat(idat));
    const stride = width * bpp;
    const out = Buffer.alloc(height * stride);
    for (let y = 0; y < height; y += 1) {
        const filter = raw[y * (stride + 1)];
        const line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
        for (let x = 0; x < stride; x += 1) {
            const left = x >= bpp ? out[y * stride + x - bpp] : 0;
            const up = y > 0 ? out[(y - 1) * stride + x] : 0;
            const upLeft = y > 0 && x >= bpp ? out[(y - 1) * stride + x - bpp] : 0;
            let v = line[x];
            if (filter === 1) v += left;
            else if (filter === 2) v += up;
            else if (filter === 3) v += Math.floor((left + up) / 2);
            else if (filter === 4) {
                const p = left + up - upLeft;
                const pa = Math.abs(p - left); const pb = Math.abs(p - up); const pc = Math.abs(p - upLeft);
                v += pa <= pb && pa <= pc ? left : pb <= pc ? up : upLeft;
            }
            out[y * stride + x] = v & 0xff;
        }
    }
    return { width, height, bpp, pixels: out };
}

// 사진 픽셀 중앙값 = 바탕색 어림 (글자 픽셀은 적어서 중앙값에 거의 안 걸림)
function medianColor({ pixels, bpp }) {
    const rs = []; const gs = []; const bs = [];
    for (let i = 0; i < pixels.length; i += bpp) { rs.push(pixels[i]); gs.push(pixels[i + 1]); bs.push(pixels[i + 2]); }
    const mid = (list) => list.sort((x, y) => x - y)[Math.floor(list.length / 2)];
    return { r: mid(rs), g: mid(gs), b: mid(bs), a: 1 };
}

// 페이지 안에서 잼: 글자색·바탕 층·투명도·글자 크기·가운데 점에 맨 위 요소
function measureInPage(el) {
    // 글이 실제로 그려지는 칸: 요소에 바로 붙은 글이 있으면 그 요소 그대로 (입력 칸도), 없으면 안쪽에서 눈에 보이는 첫 글 칸
    // 예: <button><img><span>준비완료</span></button> → span (글자색이 span에 걸려 있음)
    const hasOwnText = (node) => Array.from(node.childNodes).some((c) => c.nodeType === 3 && c.textContent.trim().length > 0);
    const drawn = (node) => {
        const r = node.getBoundingClientRect();
        const s = getComputedStyle(node);
        // 1px로 접어 둔 화면 읽기 전용 글·숨긴 칸은 눈에 안 보임
        return r.width > 1 && r.height > 1 && s.visibility !== 'hidden' && s.display !== 'none';
    };
    let textEl = el;
    if (!hasOwnText(el) && !el.matches('input, textarea, select')) {
        const walker = document.createTreeWalker(el, NodeFilter.SHOW_ELEMENT);
        for (let node = walker.nextNode(); node; node = walker.nextNode()) {
            if (hasOwnText(node) && drawn(node)) { textEl = node; break; }
        }
    }
    const style = getComputedStyle(textEl);
    const layers = [];
    let opacity = 1;
    let needsPixels = false;
    let foundOpaque = false;
    for (let node = textEl; node && node.nodeType === 1; node = node.parentElement) {
        const s = getComputedStyle(node);
        opacity *= Number.parseFloat(s.opacity || '1');
        if (foundOpaque) continue;
        if (s.backgroundImage && s.backgroundImage !== 'none') { needsPixels = true; foundOpaque = true; continue; }
        layers.push({ color: s.backgroundColor, tag: node.tagName });
        // 'rgb(1, 2, 3)' → 1, 'rgba(0, 0, 0, 0)' → 0, 'transparent' → 0
        const parts = (/rgba?\(([^)]+)\)/.exec(s.backgroundColor)?.[1] ?? '').split(/[\s,/]+/).filter(Boolean);
        const alpha = parts.length >= 4 ? Number.parseFloat(parts[3]) / (parts[3].endsWith('%') ? 100 : 1) : parts.length === 3 ? 1 : 0;
        if (alpha >= 1) {
            foundOpaque = true;
            // body·html 바탕만 찾았으면 떠 있는 창일 수 있어 사진으로 확인
            if (node === document.body || node === document.documentElement) needsPixels = true;
        }
    }
    if (!foundOpaque) needsPixels = true;
    // 안쪽 글 칸 뒤에 그림이 깔렸으면(그림 단추) 스타일로는 바탕색을 모름 → 사진으로 봄
    if (!needsPixels && textEl !== el) {
        const tr = textEl.getBoundingClientRect();
        const behindText = (r) => r.width > 0 && r.height > 0 && r.left < tr.right && tr.left < r.right && r.top < tr.bottom && tr.top < r.bottom;
        for (const media of el.querySelectorAll('img, svg, canvas, video')) {
            if (textEl.contains(media) || media.contains(textEl)) continue;
            if (behindText(media.getBoundingClientRect())) { needsPixels = true; break; }
        }
    }
    const rect = el.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const isOwn = (n) => Boolean(n && (n === el || el.contains(n)));
    let hit = document.elementFromPoint(cx, cy);
    // pointer-events:none인 요소는 elementFromPoint가 건너뛰어 늘 "가려짐"으로 나옴 → 잠깐 누를 수 있게 바꿔 다시 보고 바로 되돌림
    if (!isOwn(hit) && getComputedStyle(el).pointerEvents === 'none') {
        const before = el.getAttribute('style');
        el.style.setProperty('pointer-events', 'auto', 'important');
        try {
            hit = document.elementFromPoint(cx, cy);
        } finally {
            if (before === null) el.removeAttribute('style'); else el.setAttribute('style', before);
        }
    }
    const covered = !isOwn(hit);
    const describe = (n) => {
        if (!n) return '없음';
        const label = n.getAttribute('aria-label') || (n.innerText || '').trim().slice(0, 30);
        return `<${n.tagName.toLowerCase()}${n.className && typeof n.className === 'string' ? ` class="${n.className.slice(0, 60)}"` : ''}>${label ? ` "${label}"` : ''}`;
    };
    const fontSize = Number.parseFloat(style.fontSize) || 0;
    const fontWeight = Number.parseInt(style.fontWeight, 10) || 400;
    return {
        color: style.color,
        layers,
        needsPixels,
        opacity,
        visibility: style.visibility,
        fontSize,
        fontWeight,
        hasText: (el.innerText || el.value || '').trim().length > 0,
        // 글자색을 읽은 곳: 'self' = 그 요소, 아니면 안쪽 글 칸
        textFrom: textEl === el ? 'self' : describe(textEl),
        covered,
        coveredBy: covered ? describe(hit) : null,
        viewport: { width: window.innerWidth, height: window.innerHeight },
        rect: { x: rect.left, y: rect.top, width: rect.width, height: rect.height },
    };
}

/**
 * 보임 값 재기 (확인은 안 함) — 직접 보고 싶을 때
 * @param {import('@playwright/test').Locator} locator 하나만 가리켜야 함
 * @param {{ method?: 'auto'|'dom'|'pixels', large?: boolean }} [o]
 * @returns {Promise<{ ratio:number|null, minRatio:number, large:boolean, color:string, background:string, backgroundFrom:'dom'|'pixels',
 *   opacity:number, inViewport:boolean, rect:object, viewport:object, covered:boolean, coveredBy:string|null, hasText:boolean, textFrom:string }>}
 */
async function readability(locator, { method = 'auto', large } = {}) {
    await locator.scrollIntoViewIfNeeded();
    const m = await locator.evaluate(measureInPage);
    const textColor = parseColor(m.color);
    let background = null;
    let backgroundFrom = 'dom';
    if (method === 'pixels' || (method === 'auto' && m.needsPixels)) {
        const png = await locator.screenshot({ animations: 'disabled', caret: 'hide' });
        background = medianColor(decodePng(png));
        backgroundFrom = 'pixels';
    } else {
        // 아래(불투명)부터 위로 겹침, 끝까지 없으면 흰 바탕
        background = { r: 255, g: 255, b: 255, a: 1 };
        for (const layer of [...m.layers].reverse()) {
            const c = parseColor(layer.color);
            if (c && c.a > 0) background = c.a >= 1 ? c : blend(c, background);
        }
    }
    const shown = textColor ? (textColor.a >= 1 ? textColor : blend(textColor, background)) : null;
    const isLarge = large ?? (m.fontSize >= 24 || (m.fontSize >= 18.66 && m.fontWeight >= 700));
    const { x, y, width, height } = m.rect;
    const inViewport = width > 0 && height > 0 && x >= -EDGE_SLACK_PX && y >= -EDGE_SLACK_PX
        && x + width <= m.viewport.width + EDGE_SLACK_PX && y + height <= m.viewport.height + EDGE_SLACK_PX;
    return {
        ratio: shown ? Math.round(contrastRatio(shown, background) * 100) / 100 : null,
        minRatio: isLarge ? MIN_RATIO_LARGE : MIN_RATIO_NORMAL,
        large: isLarge,
        color: colorText(shown),
        background: colorText(background),
        backgroundFrom,
        opacity: m.opacity,
        inViewport,
        rect: m.rect,
        viewport: m.viewport,
        covered: m.covered,
        coveredBy: m.coveredBy,
        hasText: m.hasText,
        textFrom: m.textFrom,
    };
}

/**
 * 사람 눈에 읽히는지 확인 (하나) — 실패하면 무엇 때문인지 우리말로 던짐
 * @param {import('@playwright/test').Locator} locator
 * @param {object} [o]
 * @param {boolean} [o.large] 큰 글자로 칠지 (안 주면 글자 크기 보고 정함)
 * @param {boolean} [o.contrast=true] 대비 볼지 (글 없는 그림 단추는 false)
 * @param {boolean} [o.uncovered=true] 가운데가 다른 것에 안 가려졌는지 볼지
 * @param {number} [o.minRatio] 대비 기준 덮어쓰기 (기준을 낮추는 데 쓰지 않음)
 * @param {'auto'|'dom'|'pixels'} [o.method='auto'] 바탕색 찾는 법
 * @param {number} [o.timeout] 보일 때까지 기다리는 시간 (기본 expect 시간)
 */
async function expectReadable(locator, { large, contrast = true, uncovered = true, minRatio, method = 'auto', timeout } = {}) {
    await expect(locator).toBeVisible(timeout === undefined ? {} : { timeout });
    // 창이 열리는 움직임 중이면 가려짐·색이 잠깐 틀림 → 기준을 넘을 때까지 짧게 다시 봄
    let last = null;
    await expect.poll(async () => {
        last = await readability(locator, { method, large });
        return problemsOf(last, { contrast, uncovered, minRatio }).join(' / ') || 'OK';
    }, { timeout: timeout ?? 5000, message: '읽히는지 확인' }).toBe('OK').catch(() => {
        throw new Error(`사람 눈에 안 읽힘: ${problemsOf(last, { contrast, uncovered, minRatio }).join(' / ')}\n값: ${JSON.stringify(last)}`);
    });
    return last;
}

// 기준에 안 맞는 것 목록 (우리말)
function problemsOf(r, { contrast, uncovered, minRatio }) {
    if (!r) return ['재지 못함'];
    const out = [];
    if (!(r.rect.width > 0 && r.rect.height > 0)) out.push(`크기 0 (${r.rect.width}×${r.rect.height})`);
    if (!r.inViewport) out.push(`화면 밖 (위치 ${Math.round(r.rect.x)},${Math.round(r.rect.y)} 크기 ${Math.round(r.rect.width)}×${Math.round(r.rect.height)}, 화면 ${r.viewport.width}×${r.viewport.height})`);
    if (r.opacity < MIN_OPACITY) out.push(`거의 투명 (opacity ${r.opacity})`);
    if (uncovered && r.covered) out.push(`가운데가 다른 것에 가려짐: ${r.coveredBy}`);
    if (contrast) {
        const need = Math.max(minRatio ?? 0, r.minRatio);
        if (!r.hasText) out.push('글이 없어 대비를 못 셈 (그림 단추면 { contrast: false })');
        else if (r.ratio === null) out.push('글자색을 못 읽음');
        else if (r.ratio < need) out.push(`대비 ${r.ratio} < ${need} (글자 ${r.color}, 바탕 ${r.background} — ${r.backgroundFrom === 'pixels' ? '사진' : '스타일'}에서)`);
    }
    return out;
}

/**
 * 고른 것 전부 읽히는지 (0개면 실패) — 예: 창 안 단추 전부
 * @param {import('@playwright/test').Locator} locator 여러 개 가리켜도 됨
 * @param {Parameters<typeof expectReadable>[1]} [o]
 */
async function expectAllReadable(locator, o = {}) {
    await expect(locator.first()).toBeVisible(o.timeout === undefined ? {} : { timeout: o.timeout });
    const count = await locator.count();
    for (let i = 0; i < count; i += 1) await expectReadable(locator.nth(i), o);
    return count;
}

/**
 * 그림 단추(그림 + 안쪽 글 칸)가 읽히는지 — expectReadable과 같은 확인 (안쪽 글 칸의 글자색·글 뒤 그림 바탕을 알아서 봄)
 * 시험 글에서 "그림 단추를 잰다"가 드러나게 이름만 따로 둠
 * @param {import('@playwright/test').Locator} locator 단추 하나
 * @param {Parameters<typeof expectReadable>[1]} [o]
 */
const expectButtonReadable = (locator, o = {}) => expectReadable(locator, o);

module.exports = {
    expectReadable,
    expectButtonReadable,
    expectAllReadable,
    readability,
    contrastRatio,
    parseColor,
    decodePng,
    MIN_RATIO_NORMAL,
    MIN_RATIO_LARGE,
};

'use strict';

// "사람 눈에 보이나" 확인 파일, 글·단추가 있기만 한 게 아니라 크기·화면 안·안 가려짐·글자색과 바탕색 대비까지 봄
// 브라우저 시험이 toBeVisible 대신 씀 (toBeVisible은 검정 바탕 검정 글자·덮인 단추도 통과 → 받은 버그 7을 못 잡았음)
//
// 쓰는 법
//   const { expectReadable, expectAllReadable, readability, contrastRatio } = require('../../helpers/visible');
//
//   // 기본: 보임 + 크기 0 아님 + 화면 안 + 안 가려짐(가운데·글 양 끝) + 대비 4.5 이상 (큰 글자는 3 이상, 글자 크기 보고 알아서)
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
//   // 화면이 서서히 나타나는 중이면 다 나타난 뒤 한 번만 재기 (readability는 안 기다림)
//   await waitFullyShown(locator); const r = await readability(locator);
//
// 바탕색 찾는 법
//   - 위로 올라가며 처음 불투명한 background-color (반투명은 겹쳐 섞음)
//   - 글 자리 다섯 점에서 화면에 겹친 요소를 위→아래로 봐서, 불투명한 바탕색보다 그림(<img>·<svg>·<canvas>·<video>·바탕 그림·덧칸 그림)이 먼저 나오면 그림 바탕
//     (양피지·나무 판 그림은 글의 조상이 아니라 옆에 절대 위치로 깔린 <img>라 위로 올라가기만 하면 그 뒤 검정 막을 바탕으로 잘못 잡았음)
//   - 그림 바탕·body까지 불투명한 바탕 없음(떠 있는 창)·옆 칸 색이 깔림이면 글자만 잠깐 투명하게 하고 글 상자를 찍어 픽셀 중앙값을 바탕으로 씀
//     → backgroundFrom 'image'(그림) / 'pixels'(사진) / 'dom'(스타일), 사진이면 ratioP10(나쁜 쪽 10% 대비)도 같이 줌 (판정은 중앙값 기준)
//   - method: 'dom' | 'pixels'로 한쪽만 쓰게 할 수 있음 (기본 'auto')
// 그림 단추 (단추 안에 그림 + 글 칸이 따로 있는 것 — 대기방 "준비완료"·"게임시작" 등)
//   - 글자색·글자 크기는 단추가 아니라 글이 실제로 그려지는 안쪽 글 칸에서 읽음 (단추에 바로 붙은 글이 없을 때만, 화면 읽기 전용으로 접어 둔 글은 건너뜀)
//   - 그 글 칸 뒤에 그림이 깔려 있으면 바탕색은 사진으로 봄 → 단추에 바로 expectReadable을 써도 됨
// 가려짐: 요소 가운데 + 글 상자 가운데·왼쪽 1/8·오른쪽 7/8 네 점에서, 위에 겹친 남의 요소 중 눈에 보이는 것(바탕색·그림·테두리·글)이 있으면 가려짐
//   - 바탕 없는 투명 칸이 겹친 것은 가림 아님 (글이 그대로 보임), 반투명 막은 가림
//   - 자기 조상·자식은 가림 아님, 가장자리 1~2px 겹침은 안 봄
// 화면 안: 글 없는 그림은 부모 칸(overflow가 visible 아님)이 잘라 낸 뒤 보이는 부분으로 봄, 글이 있는 요소는 상자 전체로 봄(반쯤 잘린 글 통과 막기)
// pointer-events:none인 글·알림 칸: 가려짐 확인 때만 잠깐 누를 수 있게 바꿔 봄 (안 그러면 아래 칸을 덮개로 봄)
// 못 잡는 것: pointer-events:none인 덮개(elementsFromPoint가 지나침), 글자 그림자·테두리로만 읽히는 글
// 못 잰 때: 기한 안에 한 번도 못 쟀으면 짧게 쉬고 두 번까지 더 잼, 그래도 못 재면 막힌 단계·요소 수·크기·오류 글을 실패 글에 담음
const { expect, test } = require('@playwright/test');
const zlib = require('node:zlib');

// WCAG AA(웹 접근성 기준): 보통 글 4.5, 큰 글 3
const MIN_RATIO_NORMAL = 4.5;
const MIN_RATIO_LARGE = 3;
// 이보다 투명하면 거의 안 보이는 것으로 봄 (toBeVisible은 opacity 0도 보인다고 함)
const MIN_OPACITY = 0.3;
// 화면 끝 1px 정도는 반올림 차이로 넘칠 수 있음
const EDGE_SLACK_PX = 1;
// 기본 기한, 기한이 거의 다 가도 한 단계에 주는 최소 시간, 기한 뒤 더 재 보는 횟수(한 번도 못 쟀을 때만), 다시 잴 때 쉬는 틈
// 한 번 재기가 기한보다 길면 예전엔 끝나기 전에 끊겨 "재지 못함"만 남았음 (CPU 100%에서 사파리 1.5~3초·PC 사진 5~9초)
const DEFAULT_TIMEOUT_MS = 5000;
const MIN_STEP_MS = 3000;
const EXTRA_TRIES = 2;
const RETRY_GAPS_MS = [100, 250, 500, 1000];

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

// 사진 픽셀 중앙값 = 바탕색 어림 (글자는 찍을 때 지워 둬서 바탕 픽셀만 남음)
function medianColor({ pixels, bpp }) {
    const rs = []; const gs = []; const bs = [];
    for (let i = 0; i < pixels.length; i += bpp) { rs.push(pixels[i]); gs.push(pixels[i + 1]); bs.push(pixels[i + 2]); }
    const mid = (list) => list.sort((x, y) => x - y)[Math.floor(list.length / 2)];
    return { r: mid(rs), g: mid(gs), b: mid(bs), a: 1 };
}

// 바탕 픽셀마다 글자와 대비를 재서 나쁜 쪽 10% 자리 값 (판정엔 안 씀, 얼룩진 그림에서 글자색 쪽으로 쏠린 곳이 얼마나 되나 보기)
// 예: 밝은 양피지에 어두운 얼룩 조금 → 중앙값 대비 9.8, ratioP10 7.1
function worstTenthRatio({ pixels, bpp }, textColor) {
    const ratios = [];
    for (let i = 0; i < pixels.length; i += bpp) {
        const bg = { r: pixels[i], g: pixels[i + 1], b: pixels[i + 2], a: 1 };
        ratios.push(contrastRatio(textColor.a >= 1 ? textColor : blend(textColor, bg), bg));
    }
    ratios.sort((x, y) => x - y);
    return ratios[Math.floor(ratios.length * 0.1)];
}

// 페이지 안에서 함 — action: 'scroll' 화면 안으로 / 'measure' 잼 / 'hide' 글자 지움(사진 찍기 전) / 'show' 글자 되돌림
// 셋이 같은 글 칸을 찾아야 해서 한 함수에 둠 (evaluate로 넘기는 함수는 바깥 함수를 못 부름)
function inPage(el, action) {
    // 화면 밖일 때만 가운데로 옮김 — scrollIntoViewIfNeeded는 "멈춰 있음"을 기다려 CPU 100% 사파리에서 1.5~8초 걸렸음 (움직임은 다시 재기가 맡음)
    if (action === 'scroll') {
        const r = el.getBoundingClientRect();
        const outside = (box) => r.top < box.top - 1 || r.left < box.left - 1 || r.bottom > box.bottom + 1 || r.right > box.right + 1;
        let out = outside({ top: 0, left: 0, bottom: window.innerHeight, right: window.innerWidth });
        // 채팅 목록처럼 안에서 굴러가는 칸(auto·scroll)에 잘려 있어도 옮김 (말줄임 같은 hidden 칸은 안 건드림)
        for (let p = el.parentElement; p && !out && p !== document.body; p = p.parentElement) {
            const s = getComputedStyle(p);
            if (/(auto|scroll|overlay)/.test(`${s.overflowX} ${s.overflowY}`)) out = outside(p.getBoundingClientRect());
        }
        if (r.width > 0 && r.height > 0 && out) el.scrollIntoView({ block: 'center', inline: 'center' });
        return null;
    }
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
    // 글자 지우기·되돌리기: 글자색·그림자·획만 투명하게 (글 칸 자기 바탕·테두리는 그대로 남아 바탕으로 찍힘)
    // 색 바뀜이 스르륵 움직이면 덜 지워진 채 찍히고, 되돌릴 때도 스르륵 다시 나타남 → 그동안만 움직임 끔
    const HIDE = 'data-visible-check-hide';
    const STILL = 'data-visible-check-still';
    if (action === 'hide') {
        if (!document.getElementById(HIDE)) {
            const css = document.createElement('style');
            css.id = HIDE;
            css.textContent = `[${HIDE}], [${HIDE}] *, [${HIDE}]::placeholder, [${HIDE}] *::placeholder {`
                + ' color: transparent !important; -webkit-text-fill-color: transparent !important; text-shadow: none !important;'
                + ' -webkit-text-stroke-width: 0 !important; text-decoration-color: transparent !important; caret-color: transparent !important; }'
                + ` [${STILL}], [${STILL}] * { transition: none !important; }`;
            document.head.appendChild(css);
        }
        textEl.setAttribute(STILL, '');
        textEl.setAttribute(HIDE, '');
        // 지운 모습이 한 번 그려진 뒤 찍게 두 장면 기다림 (창이 뒤에 있어 장면이 안 오면 0.2초 뒤 그냥 감)
        return new Promise((done) => {
            const timer = setTimeout(done, 200);
            requestAnimationFrame(() => requestAnimationFrame(() => { clearTimeout(timer); done(); }));
        });
    }
    if (action === 'show') {
        // 찍는 사이 글 칸이 바뀌었어도 표시 붙은 것은 다 되돌림
        for (const node of document.querySelectorAll(`[${HIDE}]`)) node.removeAttribute(HIDE);
        // 움직임 끈 채로 색을 먼저 되돌려 둠 (자리 재기가 스타일을 바로 다시 계산시킴) → 그다음 움직임 켬, 스르륵 안 생김
        document.body.getBoundingClientRect();
        for (const node of document.querySelectorAll(`[${STILL}]`)) node.removeAttribute(STILL);
        document.getElementById(HIDE)?.remove();
        return null;
    }
    // 색 글을 rgb로 맞춤: Tailwind 4 색은 'oklch(0.87 0.005 56)'·'oklab(0 0 0 / 0.7)'로 나와 rgb만 읽는 셈이 못 읽음
    // → 1칸 그림판에 칠해 다시 읽음 (rgb·rgba는 그대로), 예: 'oklch(1 0 0)' → 'rgba(255, 255, 255, 1)'
    let pad = null;
    const toRgb = (color) => {
        if (!color || /^rgba?\(/i.test(color) || color === 'transparent') return color;
        if (!pad) { const c = document.createElement('canvas'); c.width = 1; c.height = 1; pad = c.getContext('2d', { willReadFrequently: true }); }
        pad.clearRect(0, 0, 1, 1);
        pad.fillStyle = 'rgba(0, 0, 0, 0)';
        pad.fillStyle = color;
        pad.fillRect(0, 0, 1, 1);
        const [r, g, b, a] = pad.getImageData(0, 0, 1, 1).data;
        return `rgba(${r}, ${g}, ${b}, ${Math.round((a / 255) * 1000) / 1000})`;
    };
    const style = getComputedStyle(textEl);
    const layers = [];
    let opacity = 1;
    let needsPixels = false;
    let foundOpaque = false;
    // 글 뒤에 깔린 그림 요소 (없으면 null)
    let pictureBehind = null;
    // 'rgb(1, 2, 3)' → 1, 'rgba(0, 0, 0, 0)' → 0, 'transparent' → 0
    const alphaOf = (color) => {
        const parts = (/rgba?\(([^)]+)\)/.exec(color)?.[1] ?? '').split(/[\s,/]+/).filter(Boolean);
        return parts.length >= 4 ? Number.parseFloat(parts[3]) / (parts[3].endsWith('%') ? 100 : 1) : parts.length === 3 ? 1 : 0;
    };
    // 그림을 그리는 칸인지: <img>·<canvas>·<video>·<svg>(안쪽 포함), 바탕 그림·그라데이션, 앞뒤 덧칸(::before·::after)의 바탕 그림
    const paintsPicture = (node) => {
        if (node.closest('svg') || ['IMG', 'CANVAS', 'VIDEO', 'PICTURE'].includes(node.tagName)) return true;
        if (getComputedStyle(node).backgroundImage !== 'none') return true;
        return ['::before', '::after'].some((which) => {
            const p = getComputedStyle(node, which);
            return p.content !== 'none' && p.content !== 'normal' && p.backgroundImage !== 'none';
        });
    };
    // 글 상자: 글 줄들을 감싼 칸 (넓은 p라도 글이 있는 곳만), 입력 칸·글 없는 단추는 요소 칸 그대로
    function textBox(node) {
        if (hasOwnText(node)) {
            const range = document.createRange();
            range.selectNodeContents(node);
            const r = range.getBoundingClientRect();
            if (r.width > 0 && r.height > 0) return r;
        }
        return node.getBoundingClientRect();
    }
    // 화면 밖으로 나간 부분은 잘라 냄, 다 나갔으면 null → 예: 글 상자 x -10 폭 100 → { x: 0, width: 90 }
    const clipOf = (r) => {
        const x0 = Math.max(0, Math.floor(r.left)); const y0 = Math.max(0, Math.floor(r.top));
        const x1 = Math.min(window.innerWidth, Math.ceil(r.right)); const y1 = Math.min(window.innerHeight, Math.ceil(r.bottom));
        return x1 - x0 >= 1 && y1 - y0 >= 1 ? { x: x0, y: y0, width: x1 - x0, height: y1 - y0 } : null;
    };
    // 다섯 점에서 겹친 요소를 위→아래로 보며 글 아래 첫 그림·옆 칸 바탕색 찾기
    // pointer-events:none인 그림(꾸밈 그림에 흔함)은 elementsFromPoint가 건너뜀 → 잴 때만 모두 누를 수 있게 했다가 바로 뺌 (그사이 화면은 안 그려짐)
    function scanBelowText(node, tr) {
        const xs = [tr.left + tr.width / 2, tr.left + tr.width * 0.15, tr.right - tr.width * 0.15];
        const ys = [tr.top + tr.height / 2, tr.top + tr.height * 0.2, tr.bottom - tr.height * 0.2];
        const points = [[xs[0], ys[0]], [xs[1], ys[1]], [xs[2], ys[1]], [xs[1], ys[2]], [xs[2], ys[2]]];
        const css = document.createElement('style');
        css.textContent = '*, *::before, *::after { pointer-events: auto !important; }';
        document.head.appendChild(css);
        const found = { picture: null, sideColor: null };
        try {
            for (const [x, y] of points) {
                const stack = document.elementsFromPoint(x, y);
                // 글 칸(또는 글 칸을 품은 조상)이 나오는 자리부터가 "글 아래" — 그 위는 덮개라 가려짐 확인 몫
                const start = stack.findIndex((n) => n === node || n.contains(node));
                for (let i = 0; i < stack.length; i += 1) {
                    const n = stack[i];
                    if (i < start) {
                        // 글 칸 안쪽 그림(글 칸 안 absolute 그림 등)은 글 뒤 바탕으로 침
                        if (node.contains(n) && n !== node && paintsPicture(n)) { found.picture = n; return found; }
                        continue;
                    }
                    // 글 칸 자기 바탕 그림·덧칸 그림도 글자 뒤에 그려짐
                    if (paintsPicture(n)) { found.picture = n; return found; }
                    const a = alphaOf(toRgb(getComputedStyle(n).backgroundColor));
                    const ancestor = n === node || n.contains(node);
                    if (a > 0 && !ancestor && !found.sideColor) found.sideColor = n;
                    if (a >= 1) break;
                }
            }
        } finally {
            css.remove();
        }
        return found;
    }
    for (let node = textEl; node && node.nodeType === 1; node = node.parentElement) {
        const s = getComputedStyle(node);
        opacity *= Number.parseFloat(s.opacity || '1');
        if (foundOpaque) continue;
        if (s.backgroundImage && s.backgroundImage !== 'none') { needsPixels = true; foundOpaque = true; pictureBehind = node; continue; }
        layers.push({ color: toRgb(s.backgroundColor), tag: node.tagName });
        const alpha = alphaOf(toRgb(s.backgroundColor));
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
            if (behindText(media.getBoundingClientRect())) { needsPixels = true; pictureBehind = media; break; }
        }
    }
    // 화면에서 실제로 겹친 순서로 글 아래를 봄 (위로 올라가기만 하면 옆 칸으로 깔린 그림을 놓침)
    // 예: <div 틀><img 양피지 absolute><div 글 칸><p>낮이 되었습니다</p></div></div> — img는 p의 조상이 아니라 형제 쪽
    // 글 상자 가운데·네 귀퉁이 쪽 다섯 점에서 아래로 내려가며, 불투명한 바탕색보다 그림이 먼저 나오면 그림 바탕
    const textRect = textBox(textEl);
    if (!pictureBehind && textRect.width > 0 && textRect.height > 0) {
        const scan = scanBelowText(textEl, textRect);
        if (scan.picture) { pictureBehind = scan.picture; needsPixels = true; }
        // 조상이 아닌 칸(옆 칸)의 바탕색이 글 아래 깔림 → 위로 올라가며 본 색이 틀림, 사진으로 봄
        else if (scan.sideColor) needsPixels = true;
    }
    const rect = el.getBoundingClientRect();
    // 조상 칸(overflow가 visible 아님)이 잘라 낸 뒤 실제로 그려지는 부분 → 다 잘렸으면 null
    // 예: 배지 그림 scale-[1.35]라 상자는 x -1.3인데 부모(overflow:hidden)가 x 2.5부터 잘라 보이는 부분은 화면 안
    // absolute는 자기 위치 기준 칸(위치 잡힌 조상)보다 아래 칸에 안 잘리고, fixed는 조상에 안 잘림 → 그 칸은 건너뜀(덜 잘라 보면 더 엄격함)
    const visibleRectOf = (node) => {
        const r = node.getBoundingClientRect();
        let box = { left: r.left, top: r.top, right: r.right, bottom: r.bottom };
        let pos = getComputedStyle(node).position;
        let escapes = pos === 'absolute' ? 'positioned' : pos === 'fixed' ? 'all' : null;
        for (let p = node.parentElement; p && p !== document.documentElement; p = p.parentElement) {
            const s = getComputedStyle(p);
            const boundary = s.position !== 'static' || s.transform !== 'none';
            if (escapes === 'all' && s.transform === 'none') continue;
            if (escapes === 'positioned' && !boundary) continue;
            if (s.display !== 'inline' && (s.overflowX !== 'visible' || s.overflowY !== 'visible')) {
                const pr = p.getBoundingClientRect();
                const left = pr.left + p.clientLeft;
                const top = pr.top + p.clientTop;
                if (s.overflowX !== 'visible') box = { ...box, left: Math.max(box.left, left), right: Math.min(box.right, left + p.clientWidth) };
                if (s.overflowY !== 'visible') box = { ...box, top: Math.max(box.top, top), bottom: Math.min(box.bottom, top + p.clientHeight) };
            }
            if (escapes && boundary) {
                pos = s.position;
                escapes = pos === 'absolute' ? 'positioned' : pos === 'fixed' ? 'all' : null;
            }
        }
        const width = box.right - box.left;
        const height = box.bottom - box.top;
        return width > 0 && height > 0 ? { x: box.left, y: box.top, width, height } : null;
    };
    const visibleRect = visibleRectOf(el);
    const isOwn =(n) => Boolean(n && (n === el || el.contains(n)));
    // 그 점에서 눈에 보이는 무언가를 그리는 요소인지 (안 그리는 투명 칸은 덮어도 글이 그대로 보임 → 가림 아님)
    // 그림·입력 칸·바탕색(반투명 막 포함)·바탕 그림·뒤 흐림·안쪽 그림자·자기 글·보이는 덧칸·그 점의 테두리 = 그림
    // 자식이 그 점에 그리면 자식이 겹친 목록에서 더 위에 나와 따로 걸림
    const paintsAt = (n, x, y) => {
        if (n.closest('svg') || ['IMG', 'CANVAS', 'VIDEO', 'PICTURE', 'IFRAME', 'EMBED', 'OBJECT', 'INPUT', 'TEXTAREA', 'SELECT'].includes(n.tagName)) return true;
        let alpha = 1;
        for (let p = n; p && p.nodeType === 1; p = p.parentElement) alpha *= Number.parseFloat(getComputedStyle(p).opacity || '1');
        // 거의 완전히 투명(opacity 0 쪽)한 칸은 안 보임
        if (alpha < 0.05) return false;
        const s = getComputedStyle(n);
        if (alphaOf(toRgb(s.backgroundColor)) > 0 || s.backgroundImage !== 'none') return true;
        if ((s.backdropFilter && s.backdropFilter !== 'none') || /inset/.test(s.boxShadow)) return true;
        if (hasOwnText(n)) return true;
        const pseudoShows = ['::before', '::after'].some((which) => {
            const ps = getComputedStyle(n, which);
            if (ps.content === 'none' || ps.content === 'normal') return false;
            return !/^(""|'')$/.test(ps.content) || ps.backgroundImage !== 'none' || alphaOf(toRgb(ps.backgroundColor)) > 0
                || ['Top', 'Right', 'Bottom', 'Left'].some((side) => Number.parseFloat(ps[`border${side}Width`]) > 0 && ps[`border${side}Style`] !== 'none');
        });
        if (pseudoShows) return true;
        // 테두리는 가장자리 띠에만 그려짐 → 그 점이 띠 안이면 그림 (예: 테두리만 있는 빈 틀 안쪽 글은 안 가림)
        const band = (side) => {
            const style = s[`border${side}Style`];
            if (style === 'none' || style === 'hidden' || alphaOf(toRgb(s[`border${side}Color`])) <= 0) return 0;
            return Number.parseFloat(s[`border${side}Width`]) || 0;
        };
        const r = n.getBoundingClientRect();
        return x < r.left + band('Left') || x > r.right - band('Right') || y < r.top + band('Top') || y > r.bottom - band('Bottom');
    };
    // 한 점에서 위→아래로 보며 처음 나오는 "눈에 보이는 남의 요소" (없으면 null)
    // 자기·자식이 먼저 나오거나 조상까지 내려오면(그 점엔 자기가 안 깔림 — 여러 줄 글 틈 등) 안 가려짐
    const coverAt = (x, y) => {
        for (const n of document.elementsFromPoint(x, y)) {
            if (isOwn(n) || n.contains(el)) return null;
            if (paintsAt(n, x, y)) return n;
        }
        return null;
    };
    // 볼 점: 요소 가운데(예전 점) + 글 상자 가운데·왼쪽 1/8·오른쪽 7/8 (글 앞뒤가 단추 밑에 들어간 것 잡기)
    // 글 상자는 넘침을 자르는 조상(말줄임 등) 안으로 줄임 → 잘려 안 보이는 글 자리를 옆 칸으로 잘못 보지 않게
    // 양 끝 점은 가장자리에서 1/8(최소 2px) 안쪽 → 1~2px 겹침은 가림 아님
    const checkPoints = () => {
        const points = [{ x: rect.left + rect.width / 2, y: rect.top + rect.height / 2, where: '요소 가운데', keepOffscreen: true }];
        let box = { left: textRect.left, right: textRect.right, top: textRect.top, bottom: textRect.bottom };
        for (let node = textEl; node && node.nodeType === 1; node = node === el ? null : node.parentElement) {
            const s = getComputedStyle(node);
            if (s.overflowX === 'visible' && s.overflowY === 'visible') continue;
            const r = node.getBoundingClientRect();
            box = { left: Math.max(box.left, r.left), right: Math.min(box.right, r.right), top: Math.max(box.top, r.top), bottom: Math.min(box.bottom, r.bottom) };
        }
        const w = box.right - box.left;
        const h = box.bottom - box.top;
        if (w > 0 && h > 0) {
            const inset = Math.min(w / 2, Math.max(w / 8, 2));
            const y = box.top + h / 2;
            points.push({ x: box.left + w / 2, y, where: '글 가운데' }, { x: box.left + inset, y, where: '글 왼쪽' }, { x: box.right - inset, y, where: '글 오른쪽' });
        }
        for (const p of points) {
            const inside = p.x >= 0 && p.y >= 0 && p.x < window.innerWidth && p.y < window.innerHeight;
            // 화면 밖 점: 요소 가운데는 예전처럼 가려짐(덮은 것 없음)으로, 글 점은 건너뜀 (화면 밖은 inViewport가 따로 잡음)
            if (!inside) {
                if (p.keepOffscreen) return { hit: null, where: p.where };
                continue;
            }
            const hit = coverAt(p.x, p.y);
            if (hit) return { hit, where: p.where };
        }
        return null;
    };
    let cover = checkPoints();
    // pointer-events:none인 요소는 elementsFromPoint가 건너뛰어 아래 칸을 덮개로 봄 → 잠깐 누를 수 있게 바꿔 다시 보고 바로 되돌림
    if (cover && getComputedStyle(el).pointerEvents === 'none') {
        const before = el.getAttribute('style');
        el.style.setProperty('pointer-events', 'auto', 'important');
        try {
            cover = checkPoints();
        } finally {
            if (before === null) el.removeAttribute('style'); else el.setAttribute('style', before);
        }
    }
    const covered = Boolean(cover);
    const describe = (n) => {
        if (!n) return '없음';
        const label = n.getAttribute('aria-label') || (n.innerText || '').trim().slice(0, 30);
        return `<${n.tagName.toLowerCase()}${n.className && typeof n.className === 'string' ? ` class="${n.className.slice(0, 60)}"` : ''}>${label ? ` "${label}"` : ''}`;
    };
    const fontSize = Number.parseFloat(style.fontSize) || 0;
    const fontWeight = Number.parseInt(style.fontWeight, 10) || 400;
    return {
        color: toRgb(style.color),
        layers,
        needsPixels,
        opacity,
        visibility: style.visibility,
        fontSize,
        fontWeight,
        hasText: (el.innerText || el.value || '').trim().length > 0,
        // 글자색을 읽은 곳: 'self' = 그 요소, 아니면 안쪽 글 칸
        textFrom: textEl === el ? 'self' : describe(textEl),
        // 바탕을 어디서 잴지: 'dom' 스타일 / 'image' 글 뒤 그림이라 사진 / 'pixels' 그림은 아니지만 스타일로 모름(떠 있는 창·옆 칸 색)이라 사진
        bgKind: pictureBehind ? 'image' : needsPixels ? 'pixels' : 'dom',
        backgroundBy: pictureBehind ? describe(pictureBehind) : null,
        // 사진 찍을 글 상자 (화면 안으로 자름, 사진은 화면 기준 자리)
        clip: clipOf(textRect),
        covered,
        coveredBy: covered ? `${describe(cover.hit)} (${cover.where})` : null,
        viewport: { width: window.innerWidth, height: window.innerHeight },
        rect: { x: rect.left, y: rect.top, width: rect.width, height: rect.height },
        visibleRect,
    };
}

// 어느 단계에서 막혔는지 오류에 붙여 둠 → 못 잰 까닭 글에 씀
async function stage(name, fn) {
    try {
        return await fn();
    } catch (error) {
        if (error && typeof error === 'object' && !error.visibleStage) error.visibleStage = name;
        throw error;
    }
}

// 사진 찍기 전 Playwright가 글꼴 다 받기(document.fonts.ready)를 기다림 → 바깥 글꼴(신라 2MB, jsdelivr)이 늦게 오면 5~9초 막혔음
// 글자는 지우고 바탕만 찍어서 글꼴이 덜 와도 바탕 값은 같음 → 이 사진에서만 안 기다림 (여러 창이 같이 찍으면 마지막 것이 끝날 때 되돌림)
const NO_FONT_WAIT = 'PW_TEST_SCREENSHOT_NO_FONTS_READY';
let fontWaitOff = 0;
let fontWaitBefore;
async function withoutFontWait(fn) {
    if (fontWaitOff === 0) {
        fontWaitBefore = process.env[NO_FONT_WAIT];
        process.env[NO_FONT_WAIT] = '1';
    }
    fontWaitOff += 1;
    try {
        return await fn();
    } finally {
        fontWaitOff -= 1;
        if (fontWaitOff === 0) {
            if (fontWaitBefore === undefined) delete process.env[NO_FONT_WAIT];
            else process.env[NO_FONT_WAIT] = fontWaitBefore;
        }
    }
}

// 글자만 지우고 글 상자 자리를 찍음 → PNG (글자 픽셀이 바탕 값에 안 섞이게)
// 움직임 멈추기(animations: 'disabled')는 안 씀: 끝이 있는 움직임을 끝으로 건너뛰어 창이 일찍 닫히는 등 화면이 바뀜
async function shootWithoutText(locator, clip, opt = {}) {
    await stage('글자 지우기', () => locator.evaluate(inPage, 'hide', opt));
    try {
        return await stage('사진 찍기', () => withoutFontWait(() => locator.page().screenshot({ clip, caret: 'hide', scale: 'css', ...opt })));
    } finally {
        // 찍는 사이 화면이 바뀌어 요소가 없어졌으면 되돌릴 것도 없음 → 없어진 요소를 15초(기본) 기다리지 않게 1초만
        await locator.evaluate(inPage, 'show', { timeout: 1000 }).catch(() => {});
    }
}

/**
 * 보임 값 재기 (확인은 안 함) — 직접 보고 싶을 때
 * @param {import('@playwright/test').Locator} locator 하나만 가리켜야 함
 * @param {{ method?: 'auto'|'dom'|'pixels', large?: boolean, timeout?: number }} [o] timeout = 단계마다 기다리는 시간 (안 주면 Playwright 기본)
 * @returns {Promise<{ ratio:number|null, ratioP10:number|null, minRatio:number, large:boolean, color:string, background:string,
 *   backgroundFrom:'dom'|'image'|'pixels', backgroundBy:string|null,
 *   opacity:number, inViewport:boolean, rect:object, viewport:object, covered:boolean, coveredBy:string|null, hasText:boolean, textFrom:string }>}
 */
async function readability(locator, { method = 'auto', large, timeout } = {}) {
    const opt = timeout === undefined ? {} : { timeout };
    await stage('화면 안으로 옮기기', () => locator.evaluate(inPage, 'scroll', opt));
    const m = await stage('스타일 재기', () => locator.evaluate(inPage, 'measure', opt));
    const textColor = parseColor(m.color);
    let background = null;
    let backgroundFrom = 'dom';
    let shot = null;
    // 그림 바탕·스타일로 모르는 바탕일 때만 사진 (평범한 글은 사진 없이 빠르게)
    if (m.clip && (method === 'pixels' || (method === 'auto' && m.bgKind !== 'dom'))) {
        const png = await shootWithoutText(locator, m.clip, opt);
        shot = await stage('사진 읽기', async () => decodePng(png));
        background = medianColor(shot);
        backgroundFrom = m.bgKind === 'image' ? 'image' : 'pixels';
    } else {
        // 아래(불투명)부터 위로 겹침, 끝까지 없으면 흰 바탕
        background = { r: 255, g: 255, b: 255, a: 1 };
        for (const layer of [...m.layers].reverse()) {
            const c = parseColor(layer.color);
            if (c && c.a > 0) background = c.a >= 1 ? c : blend(c, background);
        }
    }
    const shown = textColor ? (textColor.a >= 1 ? textColor : blend(textColor, background)) : null;
    const ratio = shown ? Math.round(contrastRatio(shown, background) * 100) / 100 : null;
    const isLarge = large ?? (m.fontSize >= 24 || (m.fontSize >= 18.66 && m.fontWeight >= 700));
    // 화면 안 판정: 글 없는 그림(배지 등)은 부모가 잘라 낸 뒤 보이는 부분으로, 글이 있으면 예전처럼 요소 상자 전체로
    // (글을 잘린 부분으로 재면 화면 끝에 반쯤 잘린 글도 통과함 → 글은 안 줄임)
    const box = m.hasText ? m.rect : m.visibleRect;
    const inViewport = Boolean(box) && box.width > 0 && box.height > 0 && box.x >= -EDGE_SLACK_PX && box.y >= -EDGE_SLACK_PX
        && box.x + box.width <= m.viewport.width + EDGE_SLACK_PX && box.y + box.height <= m.viewport.height + EDGE_SLACK_PX;
    return {
        ratio,
        // 사진으로 쟀을 때 바탕 픽셀 중 글자와 대비가 나쁜 쪽 10% 자리 값 (참고만, 스타일로 쟀으면 ratio와 같음)
        ratioP10: shot && textColor ? Math.round(worstTenthRatio(shot, textColor) * 100) / 100 : ratio,
        minRatio: isLarge ? MIN_RATIO_LARGE : MIN_RATIO_NORMAL,
        large: isLarge,
        color: colorText(shown),
        background: colorText(background),
        backgroundFrom,
        // 바탕으로 잡은 그림 요소 (그림 바탕일 때만)
        backgroundBy: m.backgroundBy,
        opacity: m.opacity,
        inViewport,
        rect: m.rect,
        // 부모 칸이 잘라 낸 뒤 보이는 부분 (다 잘렸으면 null)
        visibleRect: m.visibleRect,
        viewport: m.viewport,
        covered: m.covered,
        coveredBy: m.coveredBy,
        hasText: m.hasText,
        textFrom: m.textFrom,
    };
}

/**
 * 서서히 나타나는 움직임이 끝날 때까지 기다림 — 자기와 조상 투명도를 곱한 값이 1이 되면 끝
 * readability는 한 번만 재서 움직임 도중 덜 밝은 장면을 재기도 함 → 다 나타난 모습을 재야 할 때 먼저 부름
 * 예: 폰 대기방 판은 0.9초 동안 투명도 0 → 1, 들어오자마자 재면 "방장 자리" 바탕이 rgb(113, 103, 88)로 잡혀 대비 3.37
 * @param {import('@playwright/test').Locator} locator 하나만 가리켜야 함
 * @param {{ timeout?: number }} [o] 기다리는 시간 (안 주면 expect 시간)
 */
async function waitFullyShown(locator, { timeout } = {}) {
    // 겹친 투명도 → 예: 판 0.12 × 이름표 1 = 0.12, 다 나타나면 1
    const shownOpacity = () => locator.evaluate((el) => {
        let opacity = 1;
        for (let node = el; node && node.nodeType === 1; node = node.parentElement) opacity *= Number.parseFloat(getComputedStyle(node).opacity || '1');
        return opacity;
    });
    await expect.poll(shownOpacity, { message: '다 나타남 (겹친 투명도 1)', ...(timeout === undefined ? {} : { timeout }) }).toBe(1);
}

/**
 * 사람 눈에 읽히는지 확인 (하나) — 실패하면 무엇 때문인지 우리말로 던짐
 * @param {import('@playwright/test').Locator} locator
 * @param {object} [o]
 * @param {boolean} [o.large] 큰 글자로 칠지 (안 주면 글자 크기 보고 정함)
 * @param {boolean} [o.contrast=true] 대비 볼지 (글 없는 그림 단추는 false)
 * @param {boolean} [o.uncovered=true] 다른 것에 안 가려졌는지 볼지 (요소 가운데·글 가운데·글 양 끝)
 * @param {number} [o.minRatio] 대비 기준 덮어쓰기 (기준을 낮추는 데 쓰지 않음)
 * @param {'auto'|'dom'|'pixels'} [o.method='auto'] 바탕색 찾는 법
 * @param {number} [o.timeout] 보일 때까지 기다리는 시간이자 다시 재 보는 기한 (기본: 보임은 expect 시간, 재기는 5초)
 */
async function expectReadable(locator, { large, contrast = true, uncovered = true, minRatio, method = 'auto', timeout } = {}) {
    await expect(locator).toBeVisible(timeout === undefined ? {} : { timeout });
    const rules = { contrast, uncovered, minRatio };
    // 창이 열리는 움직임 중이면 가려짐·색이 잠깐 틀림 → 기준을 넘을 때까지 짧게 다시 봄
    // 재기 한 번은 끝까지 기다림: 예전 expect.poll은 기한에 끊고 뒤에서 계속 돌게 둬서(글자 지우기·되돌리기가 다음 재기와 겹침) 값 없이 "재지 못함"만 남겼음
    // 재다 난 오류도 삼키지 않고 다시 재 봄 (예전엔 첫 오류에 바로 끝나고 오류 글은 버려졌음)
    return test.step('읽히는지 확인', async () => {
        const deadline = Date.now() + (timeout ?? DEFAULT_TIMEOUT_MS);
        let last = null;
        let fail = null;
        let tries = 0;
        let extra = 0;
        for (;;) {
            tries += 1;
            try {
                last = await readability(locator, { method, large, timeout: Math.max(deadline - Date.now(), MIN_STEP_MS) });
                fail = null;
                if (problemsOf(last, rules).length === 0) return last;
            } catch (error) {
                fail = { stage: error?.visibleStage ?? '알 수 없음', message: firstLine(error) };
            }
            const now = Date.now();
            if (now >= deadline) {
                // 한 번이라도 쟀으면 그 값으로 판정, 한 번도 못 쟀으면 짧게 쉬고 두 번까지 더
                if (last || extra >= EXTRA_TRIES) break;
                extra += 1;
            }
            const gap = RETRY_GAPS_MS[Math.min(tries - 1, RETRY_GAPS_MS.length - 1)];
            await new Promise((done) => { setTimeout(done, now >= deadline ? gap : Math.min(gap, deadline - now)); });
        }
        if (!last) throw new Error(`사람 눈에 안 읽힘: ${await whyNotMeasured(locator, fail, tries)}`);
        const tail = fail ? `\n(마지막 재기는 못 함 — 단계 '${fail.stage}', 오류: ${fail.message})` : '';
        throw new Error(`사람 눈에 안 읽힘: ${problemsOf(last, rules).join(' / ')}\n값: ${JSON.stringify(last)}${tail}`);
    }, { box: true });
}

// 오류 첫 줄 (Playwright 글 색 코드 뺌)
const firstLine = (error) => String(error?.message ?? error).replace(/\u001b\[[0-9;]*m/g, '').split('\n')[0].trim().slice(0, 240);

// 한 번도 못 쟀을 때 까닭: 몇 번 해 봤나·막힌 단계·요소 수·크기·오류 글
// 예: "재지 못함 — 3번 해 봄, 막힌 단계 '스타일 재기', 요소 없음(사라짐), 오류: locator.evaluate: Timeout 3000ms exceeded."
async function whyNotMeasured(locator, fail, tries) {
    const count = await locator.count().catch(() => null);
    const box = count === 1 ? await locator.boundingBox({ timeout: 1000 }).catch(() => null) : null;
    let size;
    if (count === null) size = '요소 수 못 셈';
    else if (count === 0) size = '요소 없음(사라짐)';
    else if (count > 1) size = `요소 ${count}개(하나여야 함)`;
    else if (!box) size = '크기 못 읽음(화면에 안 그려짐)';
    else size = `크기 ${Math.round(box.width)}×${Math.round(box.height)}, 위치 ${Math.round(box.x)},${Math.round(box.y)}`;
    return `재지 못함 — ${tries}번 해 봄, 막힌 단계 '${fail?.stage ?? '알 수 없음'}', ${size}, 오류: ${fail?.message ?? '없음'}`;
}

// 바탕을 잰 곳 → 오류 글 낱말
const FROM_TEXT = { dom: '스타일', image: '그림', pixels: '사진' };

// 기준에 안 맞는 것 목록 (우리말)
function problemsOf(r, { contrast, uncovered, minRatio }) {
    if (!r) return ['재지 못함'];
    const out = [];
    if (!(r.rect.width > 0 && r.rect.height > 0)) out.push(`크기 0 (${r.rect.width}×${r.rect.height})`);
    // 그림이 부모 칸에 다 잘려 안 보이면 따로 알림, 화면 밖이면 보이는 부분 자리도 같이 적음
    const v = r.visibleRect;
    const seen = v ? `, 잘린 뒤 보이는 부분 ${Math.round(v.x)},${Math.round(v.y)} ${Math.round(v.width)}×${Math.round(v.height)}` : ', 부모 칸에 다 잘려 보이는 부분 없음';
    if (!r.inViewport) out.push(`화면 밖 (위치 ${Math.round(r.rect.x)},${Math.round(r.rect.y)} 크기 ${Math.round(r.rect.width)}×${Math.round(r.rect.height)}${'visibleRect' in r ? seen : ''}, 화면 ${r.viewport.width}×${r.viewport.height})`);
    if (r.opacity < MIN_OPACITY) out.push(`거의 투명 (opacity ${r.opacity})`);
    if (uncovered && r.covered) out.push(`다른 것에 가려짐: ${r.coveredBy}`);
    if (contrast) {
        const need = Math.max(minRatio ?? 0, r.minRatio);
        if (!r.hasText) out.push('글이 없어 대비를 못 셈 (그림 단추면 { contrast: false })');
        else if (r.ratio === null) out.push('글자색을 못 읽음');
        else if (r.ratio < need) out.push(`대비 ${r.ratio} < ${need} (글자 ${r.color}, 바탕 ${r.background} — ${FROM_TEXT[r.backgroundFrom] ?? r.backgroundFrom}에서${r.backgroundFrom === 'dom' ? '' : `, 나쁜 쪽 10% 대비 ${r.ratioP10}`})`);
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
    waitFullyShown,
    contrastRatio,
    parseColor,
    decodePng,
    MIN_RATIO_NORMAL,
    MIN_RATIO_LARGE,
};

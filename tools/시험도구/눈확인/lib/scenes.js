'use strict';

// 장면 목록 읽기 파일, scenes/*.js(이름이 _로 시작하는 건 도우미라 뺌)를 모아 번호 차례(가→자)로 줄 세움
// 들어가는 법·통과 글은 목록 글(눈으로_확인할_것.md)에서 번호로 채움 → 장면 파일엔 준비 함수만 써도 됨 (run.js가 부름)
const fs = require('node:fs');
const path = require('node:path');
const { TOOL_DIR, LIST_FILES } = require('./paths');

const BUNDLES = '가나다라마바사아자';

// 번호 → 차례 값 (가-01 → 1001, 바-27 → 6027)
function orderOf(id) {
    const m = /^([가-힣])-(\d+)/.exec(id);
    if (!m || !BUNDLES.includes(m[1])) return Number.MAX_SAFE_INTEGER;
    return (BUNDLES.indexOf(m[1]) + 1) * 1000 + Number(m[2]);
}

/**
 * 목록 글의 표 줄 읽기 → Map(번호 → { where, how, look })
 * @example '| 가-02 | PC | 주소창에 … | "소셜 로그인을 취소…" | … |' → { where: 'PC', how: '주소창에 …', look: '"소셜 로그인을 취소…"' }
 */
function readList(files = LIST_FILES) {
    const rows = new Map();
    // 있는 첫 파일만 읽음 (reports/ → docs/ 사본 차례)
    const file = [].concat(files).find((f) => fs.existsSync(f));
    if (!file) return rows;
    let text = '';
    try { text = fs.readFileSync(file, 'utf8'); } catch { return rows; }
    for (const line of text.split(/\r?\n/)) {
        const cells = line.split('|').map((c) => c.trim());
        if (cells.length < 6 || !/^[가-힣]-\d+$/.test(cells[1])) continue;
        rows.set(cells[1], { where: cells[2], how: cells[3], look: cells[4] });
    }
    return rows;
}

/**
 * 장면 전부 읽기 (같은 번호가 두 파일에 있으면 멈춤)
 * @param {{ dirs?: string[], only?: string[] }} [o] only = 번호 앞부분 목록 (예: ['가', '바-01'])
 */
function loadScenes({ dirs = [path.join(TOOL_DIR, 'scenes')], only = [] } = {}) {
    const list = readList();
    const seen = new Map();
    const scenes = [];
    for (const dir of dirs) {
        for (const name of fs.readdirSync(dir).filter((n) => n.endsWith('.js') && !n.startsWith('_')).sort()) {
            const file = path.join(dir, name);
            const items = require(file);
            if (!Array.isArray(items)) throw new Error(`${name}: 장면 배열을 내보내야 함 (module.exports = [ … ])`);
            for (const item of items) {
                if (!item?.id) throw new Error(`${name}: 번호(id) 없는 장면`);
                if (seen.has(item.id)) throw new Error(`장면 번호 겹침: ${item.id} (${seen.get(item.id)} · ${name})`);
                seen.set(item.id, name);
                if (typeof item.prepare !== 'function' && !item.manual) throw new Error(`${item.id}: prepare 함수나 manual 까닭이 있어야 함`);
                const fromList = list.get(item.id) ?? {};
                scenes.push({ needs: ['desktop'], ...fromList, ...item, file: name });
            }
        }
    }
    scenes.sort((a, b) => orderOf(a.id) - orderOf(b.id) || a.id.localeCompare(b.id));
    if (only.length === 0) return scenes;
    return scenes.filter((sc) => only.some((p) => sc.id.startsWith(p)));
}

module.exports = { loadScenes, readList, orderOf };

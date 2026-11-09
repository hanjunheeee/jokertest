'use strict';

// 밤 시험 화면 글자·기록 파일, 역할·차례 글자 표·조사 붙이기 + 밤 연출 화면 기록·결과 화면 읽기
// _night/index.js가 다시 내보냄 (b-night 시험은 require('./_night')로 씀)
const { expect } = require('@playwright/test');
const { ROLE_LABELS } = require('../../../../helpers/ui');

const ACTION_LABELS = Object.freeze({ JOKER: '암살', DOCTOR: '보호', GUARD: '조사', WITCH_HUNTER: '확인' });
const TURN_MESSAGES = Object.freeze({
    JOKER: '광대의 시간입니다',
    DOCTOR: '의사의 시간입니다',
    GUARD: '경비원의 시간입니다',
    WITCH_HUNTER: '마녀사냥꾼의 시간입니다',
});
const TURN_TAGS = Object.freeze({ JOKER: '[밤-광대]', DOCTOR: '[밤-의사]', GUARD: '[밤-경비원]', WITCH_HUNTER: '[밤-마녀사냥꾼]' });
// 역할 이름 화면 글자는 helpers/ui.js 것 그대로 (옛 이름 ROLE_NAMES)
const ROLE_NAMES = ROLE_LABELS;

/** 받침 따라 조사 붙이기: josa('경비원', '이', '가') → '경비원이' */
function josa(word, withFinal, withoutFinal) {
    const code = word.charCodeAt(word.length - 1) - 0xac00;
    const hasFinal = code >= 0 && code <= 11171 && code % 28 !== 0;
    return word + (hasFinal ? withFinal : withoutFinal);
}

/**
 * 화면 기록 걸기: 밤 역할 안내 창이 뜰 때마다 역할을 적음, autoConfirm이면 '단계 전환 안내'는 바로 확인 누름
 * (판 화면에 들어온 뒤 부름, SPA라 결과 화면까지 기록이 남음)
 */
async function recordUi(page, { autoConfirm = true } = {}) {
    await page.evaluate((auto) => {
        if (window.__nightRec) return;
        const rec = { turns: [], privateResults: [], finals: [], kills: 0, waits: 0, entrances: [], videos: [] };
        window.__nightRec = rec;
        let lastTurnEl = null;
        let lastPrivate = null;
        let lastFinal = null;
        let lastKill = null;
        let lastWait = null;
        let lastEntrance = null;
        const scan = () => {
            const turnEl = document.querySelector('[data-night-turn-role]');
            if (turnEl && turnEl !== lastTurnEl) rec.turns.push(turnEl.getAttribute('data-night-turn-role'));
            lastTurnEl = turnEl;
            const priv = document.querySelector('[data-ingame-night-private-result]');
            if (priv && priv !== lastPrivate) rec.privateResults.push(priv.innerText.replace(/\s+/g, ' ').trim());
            lastPrivate = priv;
            const fin = document.querySelector('[data-ingame-night-success-final]');
            if (fin && fin !== lastFinal) rec.finals.push(fin.getAttribute('data-ingame-night-success-final'));
            lastFinal = fin;
            const kill = document.querySelector('[data-ingame-night-success-kill]');
            if (kill && kill !== lastKill) rec.kills += 1;
            lastKill = kill;
            // 연출 영상 주소 (같은 창이 영상만 바꿔 이어 틀어서 주소가 바뀔 때마다 적음)
            const video = document.querySelector('[data-ingame-night-success-source-video]');
            const src = video ? (video.getAttribute('src') || '').split('/').pop() : null;
            if (src && src !== rec.videos[rec.videos.length - 1]) rec.videos.push(src);
            const wait = document.querySelector('[data-ingame-night-presentation-wait]');
            if (wait && wait !== lastWait) rec.waits += 1;
            lastWait = wait;
            const ent = document.querySelector('[data-ingame-phase-entrance]');
            if (ent && ent !== lastEntrance) rec.entrances.push(ent.getAttribute('data-ingame-phase-entrance'));
            lastEntrance = ent;
            if (auto && ent) {
                const btn = [...ent.querySelectorAll('button')].find((b) => b.innerText.trim() === '확인');
                if (btn) setTimeout(() => btn.click(), 50);
            }
        };
        new MutationObserver(scan).observe(document.body, { childList: true, subtree: true, attributes: true });
        scan();
    }, autoConfirm);
}

/** 화면 기록 읽기 */
function readUi(page) {
    return page.evaluate(() => window.__nightRec ?? null);
}

/** 결과 화면까지: /gameresult → 연출 영상 건너뛰기(뜨면) → 승패 띠 */
async function reachResult(page, { timeout = 60000 } = {}) {
    await expect(page).toHaveURL(/\/gameresult/, { timeout });
    const skip = page.getByRole('button', { name: '건너뛰기' });
    const banner = page.getByText(/^(승리|패배)$/);
    await expect(async () => {
        if (await skip.isVisible().catch(() => false)) await skip.click({ timeout: 1000 }).catch(() => {});
        await expect(banner).toBeVisible({ timeout: 1000 });
    }).toPass({ timeout: 45000 });
}

/** 결과 화면 MVP 칸 */
function mvpPanel(page) {
    return page.getByRole('complementary', { name: 'MVP 플레이어' });
}

module.exports = { ACTION_LABELS, TURN_MESSAGES, TURN_TAGS, ROLE_NAMES, josa, recordUi, readUi, reachResult, mvpPanel };

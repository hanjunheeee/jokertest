'use strict';

// 판 끝내기·결과 화면 파일, 끝까지 단계 넘기기·결과 화면 기다리기·승패 정해 결과까지 판 돌리기 (5명 이상 판)
// roomHelpers/index.js가 다시 내보냄 (tests/room·tests/result는 require('./roomHelpers')로 씀)
const { expect } = require('@playwright/test');
const ui = require('../../../helpers/ui');
const { sleep } = require('../../../helpers/wait');

/** 판 끝날 때까지 단계 넘기기 → 마지막 판 요약 (끝나 장부에서 빠지면 null) */
async function finishGame(t, { stepDelayMs = 900, maxSteps = 40 } = {}) {
    let last = null;
    for (let i = 0; i < maxSteps; i += 1) {
        const s = await t.state();
        if (!s) return last;
        last = s;
        if (s.phase === 'ENDED' || s.winResult) return s;
        await t.advance().catch(() => {});
        await sleep(stepDelayMs);
    }
    throw new Error('판이 안 끝남');
}

/** 결과 화면 본체가 보일 때까지 (연출 영상이 막히면 건너뛰기) */
async function waitResult(page) {
    await expect(page).toHaveURL(/\/gameresult/, { timeout: 30000 });
    const list = page.getByRole('region', { name: '가면무도회 참가자 정체' });
    const skip = page.getByRole('button', { name: '건너뛰기' });
    await expect(list.or(skip)).toBeVisible({ timeout: 30000 });
    if (await skip.isVisible().catch(() => false)) await skip.click();
    await expect(list).toBeVisible({ timeout: 30000 });
    return list;
}

/** 역할 공개 창 닫기 (여럿) */
async function closeReveals(pages) {
    await Promise.all(pages.map((p) => ui.readRoleReveal(p).catch(() => null)));
}

/**
 * 결과 판 차리기 (봇 방장, 5명 판): 역할 정하고 봇 표로 한 명 처형 → 판 끝 → 결과 화면
 * 사람은 아무것도 안 냄(기권으로 셈) — 낮 투표는 최다 득표가 기권보다 많아야 재판이라 인원을 맞춰 둠
 * kind
 * - 'jokerWin'   나 광대 + 봇 광대 1 (광대 2): 시민 하나 처형 → 광대 2 : 나머지 2 → 광대 승 (나 이김)
 * - 'jokerLose'  나 시민, 봇 광대 2: 시민 하나 처형 → 광대 승 (나 짐)
 * - 'citizenWin' 나 시민, 봇 광대 1: 광대 처형 → 시민 승 (나 이김)
 * extraHumans: 'jokerWin'·'jokerLose'는 1명까지(그 사람이 처형됨, 시민), 'citizenWin'은 2명까지(시민) — 그 넘게는 봇 표가 모자람
 * @returns {Promise<{ t, joker:string, jokers:string[], victim:string, end:any, list:any }>} joker = 첫 광대 uuid, victim = 처형된 사람
 */
async function playToResult({ user, table, kind = 'jokerWin', extraHumans = [] }) {
    const me = user.account.uuid;
    const humans = [user, ...extraHumans];
    const extraUuids = extraHumans.map((x) => x.account.uuid);
    if (kind !== 'citizenWin' && extraHumans.length > 1) throw new Error(`${kind}는 사람 2명까지 (봇 표가 기권보다 많아야 재판)`);
    if (kind === 'citizenWin' && extraHumans.length > 2) throw new Error('citizenWin은 사람 3명까지 (봇 표가 기권보다 많아야 재판)');
    // 사람 1명: 봇 4 (5명) / jokerWin·jokerLose 사람 2명: 봇 3 (5명, 다른 사람이 처형됨) / citizenWin 사람 n: 봇 n+3
    const botCount = kind === 'citizenWin' ? humans.length + 3 : 5 - humans.length;
    let jokers = [];
    let victim = null;
    const t = await table.setup({
        humans,
        bots: botCount,
        settings: kind === 'citizenWin' ? {} : { jokerCount: 2 },
        roles: ({ bots }) => {
            const out = Object.fromEntries(extraUuids.map((u) => [u, 'CITIZEN']));
            const b = bots.map((x) => x.account.uuid);
            if (kind === 'jokerWin') {
                jokers = [me, b[0]];
                victim = extraUuids[0] ?? b[1];
                Object.assign(out, { [me]: 'JOKER', [b[0]]: 'JOKER' });
                b.slice(1).forEach((u) => { out[u] = 'CITIZEN'; });
            } else if (kind === 'jokerLose') {
                jokers = [b[0], b[1]];
                victim = extraUuids[0] ?? b[2];
                Object.assign(out, { [me]: 'CITIZEN', [b[0]]: 'JOKER', [b[1]]: 'JOKER' });
                b.slice(2).forEach((u) => { out[u] = 'CITIZEN'; });
            } else {
                jokers = [b[0]];
                victim = b[0];
                Object.assign(out, { [me]: 'CITIZEN', [b[0]]: 'JOKER' });
            }
            return out;
        },
    });
    // 미리 정한 역할이 맞았는지 (안 맞으면 판이 다른 쪽으로 끝남)
    const start = await t.state();
    for (const u of jokers) {
        if (start.players.find((p) => p.uuid === u)?.role !== 'JOKER') throw new Error(`광대로 정한 사람이 광대가 아님 (${u})`);
    }
    await t.assertBotsCanExecute(victim);
    // 봇 전부 victim을 찍고 유죄, 밤엔 아무도 안 죽임 (victim 봇은 자기 못 찍어 기권)
    t.playBots((bot) => ({ dayVote: bot.account.uuid === victim ? 'abstain' : victim, tribunal: 'GUILTY', night: 'skip' }));
    await closeReveals(humans.map((h) => h.page));
    const end = await finishGame(t, { stepDelayMs: 1200 });
    const list = await waitResult(user.page);
    return { t, joker: jokers[0], jokers, victim, end, list };
}

/** 결과 목록에서 이름 줄 하나 */
function resultRow(page, name) {
    return page.getByRole('region', { name: '가면무도회 참가자 정체' }).getByRole('listitem').filter({ hasText: name });
}

module.exports = { finishGame, waitResult, closeReveals, playToResult, resultRow };

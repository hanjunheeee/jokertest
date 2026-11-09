'use strict';

// 판 끝내기·결과 화면 파일, 끝까지 단계 넘기기·결과 화면 기다리기·승패 정해 결과까지 판 돌리기
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
 * 결과 판 차리기 (봇 방장): 나 + 봇 n, 역할 정하고 끝까지 → 결과 화면
 * kind: 'jokerWin'(나 광대·봇 시민 1) | 'jokerLose'(나 시민·봇 광대 1) | 'citizenWin'(나 시민·봇 광대·봇 시민, 봇 시민이 광대 처형)
 */
async function playToResult({ user, table, kind = 'jokerWin', extraHumans = [] }) {
    const me = user.account.uuid;
    let joker = null;
    const humans = [user, ...extraHumans];
    let t;
    if (kind === 'jokerWin') {
        // 사람이 더 있으면 봇도 광대로 (광대 2 : 시민 = 바로 광대 승)
        const extra = extraHumans.length > 0;
        t = await table.setup({
            humans, bots: 1, settings: extra ? { jokerCount: 2 } : {},
            roles: ({ bots }) => ({ [me]: 'JOKER', ...Object.fromEntries(extraHumans.map((x) => [x.account.uuid, 'CITIZEN'])), [bots[0].account.uuid]: extra ? 'JOKER' : 'CITIZEN' }),
        });
        joker = me;
    } else if (kind === 'jokerLose') {
        t = await table.setup({ humans, bots: 1, roles: ({ bots }) => { joker = bots[0].account.uuid; return { [me]: 'CITIZEN', [joker]: 'JOKER' }; } });
    } else {
        t = await table.setup({ humans, bots: 2, roles: ({ bots }) => { joker = bots[0].account.uuid; return { [me]: 'CITIZEN', [joker]: 'JOKER', [bots[1].account.uuid]: 'CITIZEN' }; } });
        t.playBots((bot) => (bot.account.uuid === joker
            ? { dayVote: 'abstain', tribunal: 'skip', night: 'skip' }
            : { dayVote: joker, tribunal: 'GUILTY', night: 'skip' }));
    }
    await closeReveals(humans.map((h) => h.page));
    const end = await finishGame(t, { stepDelayMs: kind === 'citizenWin' ? 1200 : 900 });
    const list = await waitResult(user.page);
    return { t, joker, end, list };
}

/** 결과 목록에서 이름 줄 하나 */
function resultRow(page, name) {
    return page.getByRole('region', { name: '가면무도회 참가자 정체' }).getByRole('listitem').filter({ hasText: name });
}

module.exports = { finishGame, waitResult, closeReveals, playToResult, resultRow };

'use strict';

// 인원마다 광대가 이기는 길 브라우저 시험 (PC) — 광대 2명 판에서 시민 처형·밤 암살·시민 나감으로 광대 = 나머지가 되면 결과 화면에 광대 진영 승리
// 목록 시험목록/A07-승패-결과-골드.md A07-E-096~105, 모이는지만 봄: npx playwright test --list tests/ingame/a07-win-sizes.spec.js
const { test, expect } = require('../../helpers/fixtures');
const { expectReadable } = require('../../helpers/visible');
const n = require('./b-night/_night');
const k = require('./_a07-simple-kit');

const { C, uid, nick } = k;
const id = (no) => `A07-E-${String(no).padStart(3, '0')}`;

/**
 * 광대 2명 판을 열고 시민 봇이 나가 산 2:3(광대 2 · 사람 + 시민 봇 2)이 되게 함 — 승부는 아직 없음
 * 인원이 많을수록 더 많이 나감 (5명 판 0명, 10명 판 5명) → 승부가 나는 마지막 한 걸음만 케이스마다 다름
 */
async function openTwoToThree(table, user, size) {
    const { t, page } = await k.open(table, user, 'CITIZEN', ['JOKER', 'JOKER', ...C(size - 3)]);
    const [j1, j2, c1, c2, ...leavers] = t.bots;
    for (const bot of leavers) await k.leave(t, bot);
    const s = await k.expectStillPlaying(t, page);
    expect(n.aliveCount(s), '산 사람 5명 (광대 2 · 나머지 3)').toBe(5);
    return { t, page, j1, j2, c1, c2 };
}

// 결과 화면에 광대 진영 승리가 읽히고 서버 승자도 광대
async function expectJokerWin(t, page) {
    await k.reachBoard(page);
    await expectReadable(page.getByText(k.WIN_TEXT.JOKER, { exact: true }));
    expect((await t.state()).winResult?.winner).toBe('JOKER');
}

// A07-E-096~099: 재판으로 시민 처형 → 2:2
[6, 7, 8, 10].forEach((size, i) => {
    const smoke = i === 0 ? ' @smoke' : '';
    test(`${id(96 + i)} ${size}명 판 산 2:3에서 재판으로 시민 처형 → 광대 진영 승리 @game${smoke}`, async ({ user, table }) => {
        test.setTimeout(180_000);
        const { t, page, c1 } = await openTwoToThree(table, user, size);
        const end = await k.execute(t, uid(c1));
        expect(end.phase).toBe('ENDED');
        await expectJokerWin(t, page);
    });
});

// A07-E-100~103: 밤 암살 → 2:2, 낮 시작 연출(영상·글) 뒤 결과 화면
[5, 7, 8, 10].forEach((size, i) => {
    test(`${id(100 + i)} ${size}명 판 산 2:3에서 밤 암살 → 낮 시작 연출 뒤 광대 진영 승리 @game`, async ({ user, table }) => {
        test.setTimeout(180_000);
        const { t, page, j1, j2, c1 } = await openTwoToThree(table, user, size);
        const end = await k.nightKill(t, [j1, j2], uid(c1));
        expect(end.phase).toBe('ENDED');
        await expectJokerWin(t, page);
        // 결과 화면 앞에 암살 영상 창과 죽은 사람 글이 떴음 (화면 기록)
        const rec = await n.readUi(page);
        expect(rec.kills, '암살 영상 창이 뜬 수').toBeGreaterThanOrEqual(1);
        expect(rec.dawnMessages).toContain(`지난밤 ${nick(c1)}님이 살해당했습니다`);
    });
});

// A07-E-104~105: 시민 봇이 하나 더 나감 → 2:2
[7, 10].forEach((size, i) => {
    test(`${id(104 + i)} ${size}명 판 산 2:3에서 시민 봇이 나감 → 광대 진영 승리 @game`, async ({ user, table }) => {
        test.setTimeout(180_000);
        const { t, page, c1 } = await openTwoToThree(table, user, size);
        await k.leave(t, c1);
        await expectJokerWin(t, page);
    });
});

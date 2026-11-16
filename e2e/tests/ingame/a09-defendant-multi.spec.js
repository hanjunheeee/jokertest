'use strict';

// 끊긴 피고 어려운 브라우저 시험 (PC, 사람 2명) — 재판 도중 피고가 탭을 닫고 손잡이 탈락하면 그 사람 사망·밤(결정), 60초 전에 처형되면 탈주 아님
// 목록 A09-끊김-나가기-탈주.md A09-H-042·049, 끊긴 피고는 사용자 결정(2026-11-16 오전 둘째 11번)대로 — 모이는지만: npx playwright test --list tests/ingame/a09-defendant-multi.spec.js
const { test, expect } = require('../../helpers/fixtures');
const { expectReadable } = require('../../helpers/visible');
const A = require('./_a04-multi');
const K = require('./_a09-simple-kit');
const H = require('./_a09-hard-kit');

const { U, nick, GRACE_MS } = H;
const { trial } = A;

// 7명 판(사람 2 + 봇 5) → 붙어 있는 ㄴ을 피고로 세움 (봇 다섯 + ㄱ 찍음)
async function trialOfB(user, players, table) {
    const [a, b] = await H.openPeople(user, players, 2);
    const t = await H.seat(table, [a, b], { n: 7 });
    const s = await H.pickDefendant(t, U(b), { voters: [a] });
    expect(s.tribunal?.defendantUuid, 'ㄴ이 피고').toBe(U(b));
    await expect(trial.win(a.page)).toBeVisible({ timeout: 15_000 });
    await expect(trial.defendantNotice(b.page)).toBeVisible({ timeout: 15_000 });
    return { a, b, t };
}

// 피고 탭 닫기 → 서버가 끊김을 안 때(ms)
async function closeDefendant(t, person) {
    const since = Date.now();
    await person.page.close();
    return K.droppedAt(t, U(person), since);
}

test('A09-H-042 7명 판(사람 2 + 봇 5) 피고 ㄴ이 재판 중 탭을 닫음 → 손잡이 탈락 → ㄱ 화면 재판 창 닫힘·추방 연출 없이 밤, 결정대로 ㄴ 사망 @game @hard @smoke', async ({ user, players, table }) => {
    test.setTimeout(240_000);
    const { a, b, t } = await trialOfB(user, players, table);
    await closeDefendant(t, b);
    await K.expire(t, U(b));
    await expect(trial.win(a.page)).toBeHidden({ timeout: 15_000 });
    await expect(trial.nightNotice(a.page)).toBeVisible({ timeout: 15_000 });
    await expect(trial.expulsion(a.page)).toHaveCount(0);
    await H.expectStatus(a.page, nick(b), 'dead');
    const s = await t.state();
    expect(s.phase).toBe('NIGHT');
    expect(K.rowOf(s, U(b)).alive).toBe(false);
});

test('A09-H-049 7명 판(사람 2 + 봇 5, 재판 120초) 피고 ㄴ이 재판 중 탭을 닫음 → 60초 전에 ㄱ·봇이 유죄로 처형 → ㄴ 다시 열면 사망 창, 나가서 방 만들기 됨(탈주 아님) @game @hard', async ({ user, players, table }) => {
    test.setTimeout(240_000);
    const { a, b, t } = await trialOfB(user, players, table);
    const dropAt = await closeDefendant(t, b);
    // 봇 다섯 + ㄱ 유죄 → 다 냄 → 5초 뒤 처형 (손잡이 안 씀)
    await H.botsJudge(t, 'GUILTY');
    await A.pressVote(a.page, 'GUILTY');
    await A.waitState(t, (g) => K.rowOf(g, U(b))?.alive === false, { message: '피고 처형' });
    expect(Date.now() - dropAt, '끊긴 지 60초 안에 처형 (탈락이 아님)').toBeLessThan(GRACE_MS);
    await expectReadable(a.page.getByText(trial.expelText(nick(b)), { exact: true }), { timeout: 25_000 });

    const tab = await b.context.newPage();
    H.collectDialogs(tab);
    await tab.goto('/ingame');
    const dead = await K.waitDeadChoice(tab);
    await expect(dead).toContainText('당신은 사망했습니다.');
    await expect(dead).toContainText('사망한 뒤라 나가도 탈주가 아니며');
    await dead.getByRole('button', { name: '게임 나가기' }).click();
    await expect(tab).not.toHaveURL(/\/ingame/, { timeout: 15_000 });
    await K.createRoomOk(tab);
    expect(await H.desertionRows(U(b)), '탈주 줄 없음').toEqual([]);
});

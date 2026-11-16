'use strict';

// 서버 2대 한 판 끝까지 브라우저 시험 (어려움) — 두 서버 로비에 나뉘어 있던 사람들이 코드로 모여 낮·재판·밤을 거쳐 같은 결과 화면까지, 판 골드는 사람마다 한 번
// 목록 A17-서버-여러대.md 번호 A17-H-001~002 (E2E_NODES=2에서만 돎), 모임만: E2E_NODES=2 npx playwright test --list --no-deps tests/multinode/a17-full-game.spec.js
const K = require('./_a17-kit');
const { expectReadable } = require('../../helpers/visible');
const { hostGame, closeReveals, resultRow } = require('../room/roomHelpers');
const N = require('../ingame/b-night/_night');
const A4 = require('../ingame/_a04-multi');
const K8 = require('../result/_a08-hard-kit');

const { test, expect, mn, N1, N2, U, nick } = K;

// 재판 창이 뜬 사람들이 화면으로 유죄·무죄를 누름 (누른 뒤 "투표가 완료되었습니다."까지)
async function judge(people, vote) {
    for (const p of people) {
        await expect(A4.trial.win(p.page)).toBeVisible({ timeout: 15_000 });
        await A4.pressVote(p.page, vote);
    }
}

test('A17-H-001 사람 5(서버 ㄱ 3·서버 ㄴ 2)가 코드로 모여 5명 판 → 낮·재판·밤 → 결과 화면 5명 같은 판 @game @hard @smoke', async ({ crowd }) => {
    test.setTimeout(480_000);
    const a = await crowd.on(N1);
    const b = await crowd.on(N1);
    const c = await crowd.on(N1);
    const d = await crowd.on(N2);
    const e = await crowd.on(N2);
    const people = [a, b, c, d, e];
    // 방장 ㄱ이 화면으로 방을 만들고 넷이 코드로 모임, 광대는 서버 ㄴ에서 온 ㅁ
    const roles = { [U(a)]: 'CITIZEN', [U(b)]: 'CITIZEN', [U(c)]: 'CITIZEN', [U(d)]: 'CITIZEN', [U(e)]: 'JOKER' };
    const t = await hostGame({ host: a, guests: [b, c, d, e], botList: [], roles });
    await K8.expectRoles(t.gameId, roles);
    for (const p of people) expect(await mn.gameNodeOf(U(p)), `${nick(p)} 판 서버`).toBe(N1);
    await closeReveals(people.map((p) => p.page));

    // 첫날 낮: 넷이 ㅁ을 찍어 재판 → ㄱ·ㄴ만 무죄 (다 내면 생기는 5초 당김 없이 손잡이로 판정) → ㅁ 삶
    await A4.toVote(t, 1);
    await A4.toTribunal(t, e, { humansVote: true });
    await judge([a, b], 'NOT_GUILTY');
    await A4.endTribunal(t);
    expect((await t.player(U(e)))?.alive, '무죄 → 광대 삶').toBe(true);

    // 밤(아무도 안 고름) → 둘째 날 낮: 다시 ㅁ 재판 → ㄱ·ㄴ·ㄷ 유죄 → 처형 → 시민 승
    await N.toDay(t, { dayIndex: 2 });
    await A4.toVote(t, 2);
    await A4.toTribunal(t, e, { humansVote: true });
    await judge([a, b, c], 'GUILTY');
    const end = await A4.endTribunal(t);
    expect(end.phase, '광대 처형 → 판 끝').toBe('ENDED');
    expect(end.winResult?.winner, '서버 승자').toBe('CITIZEN');

    // 다섯 화면 모두 같은 결과판: 다섯 이름이 한 줄씩
    await K8.allAtResult(people);
    for (const viewer of people) {
        for (const p of people) await expect(resultRow(viewer.page, nick(p)), `${nick(viewer)} 화면의 ${nick(p)} 줄`).toHaveCount(1);
    }
    await expectReadable(resultRow(e.page, nick(a)).getByText(nick(a), { exact: true }).first());
});

test('A17-H-002 6명 판(사람 3 중 2는 서버 ㄴ 출신 + 봇 3) 끝 → 세 사람 결과판 "+1골드", 판 골드 장부는 사람마다 한 줄 @game @hard', async ({ crowd, bots }) => {
    test.setTimeout(300_000);
    const a = await crowd.on(N1);
    const b = await crowd.on(N2);
    const c = await crowd.on(N2);
    const people = [a, b, c];
    const [hostBot, ...otherBots] = await mn.botsOn(bots, 3, N1);
    const { t, joker } = await K.startGame({ hostBot, otherBots, people });
    for (const p of people) expect(await mn.gameNodeOf(U(p)), `${nick(p)} 판 서버`).toBe(N1);

    await K.endByJoker(t, joker);
    await K8.allAtResult(people);
    for (const p of people) {
        await expect(K.goldChip(p.page, nick(p))).toHaveText('+1골드');
        await expectReadable(K.goldChip(p.page, nick(p)));
    }

    // 산 채로 나간 광대 봇만 빼고 다섯 명이 딱 한 줄씩 (두 서버가 같은 판을 두 번 지급하지 않음)
    const expected = [...people, ...t.bots.filter((bot) => bot !== joker)].map(U).sort();
    await expect.poll(() => K.rewardedUuids(t.gameId), { timeout: 30_000, message: '판 골드 장부 줄' }).toEqual(expected);
});

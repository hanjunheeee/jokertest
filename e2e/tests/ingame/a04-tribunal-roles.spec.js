'use strict';

// 직업별 재판 브라우저 시험 (PC): 동료 광대 표도 셈, 의사·경비원·마녀사냥꾼 봇도 투표, 내가 광대·의사·마녀사냥꾼이어도 단추
// 목록 docs/게임_의도_2026-11-15/시험목록/A04-재판.md A04-E-145~148·150
const { test, expect } = require('../../helpers/fixtures');
const K = require('./_a04-pc');

const { TEXT, uuidOf } = K;

const aliveOf = (s, bot) => s.players.find((p) => p.uuid === uuidOf(bot)).alive;

test('A04-E-145 PC 8명 판(광대 2) 광대 피고에게 동료 광대 봇이 무죄 → 그 표도 셈 (유죄 1 : 무죄 1 동점 → 산 채) @game @smoke', async ({ user, table }) => {
    const t = await K.seat(table, user, { n: 8, bots: ['JOKER', 'JOKER'] });
    const [defendant, ally, citizen] = [t.bots[0], t.bots[1], t.bots[2]];
    await K.toFirstDay(t);
    await K.openTribunal(t, uuidOf(defendant));
    await K.expectTribunal(user.page, defendant.nickname);
    await K.expectVoteButtons(user.page);
    expect((await K.botVerdict(t, citizen, 'GUILTY')).ok).toBe(true);
    expect((await K.botVerdict(t, ally, 'NOT_GUILTY')).ok).toBe(true);
    // 동료 광대 표가 빠졌다면 유죄 1 : 무죄 0으로 처형
    const after = await K.closeTribunal(t);
    expect(after.phase).toBe('NIGHT');
    expect(aliveOf(after, defendant)).toBe(true);
});

test('A04-E-146 PC 10명 판 의사·경비원·마녀사냥꾼 봇이 유죄 → 세 표가 다 들어감 (유죄 3 : 시민 봇 무죄 2 → 처형) @game', async ({ user, table }) => {
    const t = await K.seat(table, user, { n: 10, bots: ['JOKER', 'DOCTOR', 'GUARD', 'WITCH_HUNTER'] });
    const [doctor, guard, hunter] = [t.bots[1], t.bots[2], t.bots[3]];
    const defendant = t.bots[4];
    // 직업이 정한 대로인지 (서버 기준)
    const start = await t.state();
    for (const [bot, role] of [[doctor, 'DOCTOR'], [guard, 'GUARD'], [hunter, 'WITCH_HUNTER']]) {
        expect(start.players.find((p) => p.uuid === uuidOf(bot)).role).toBe(role);
    }
    await K.toFirstDay(t);
    await K.openTribunal(t, uuidOf(defendant));
    await K.expectTribunal(user.page, defendant.nickname);
    for (const bot of [doctor, guard, hunter]) expect((await K.botVerdict(t, bot, 'GUILTY')).ok).toBe(true);
    await K.botsVerdict(t, 'NOT_GUILTY', [t.bots[5], t.bots[6]]);
    // 세 직업 중 한 표라도 빠지면 2 : 2 동점으로 산 채
    const after = await K.closeTribunal(t);
    expect(aliveOf(after, defendant)).toBe(false);
});

[
    [147, 6, 'JOKER', [], '광대'],
    [148, 7, 'DOCTOR', ['JOKER'], '의사'],
    [150, 10, 'WITCH_HUNTER', ['JOKER'], '마녀사냥꾼'],
].forEach(([no, n, me, bots, label]) => {
    test(`A04-E-${no} PC ${n}명 판 내가 ${label}(피고 아님) → 재판 단추가 읽히고 누르면 완료 글 @game`, async ({ user, table }) => {
        const t = await K.seat(table, user, { n, me, bots });
        // 피고: 시민 봇 (광대 봇이 있으면 그다음 봇)
        const defendant = t.bots[2];
        await K.toFirstDay(t);
        await K.openTribunal(t, uuidOf(defendant));
        await K.expectTribunal(user.page, defendant.nickname);
        await K.expectVoteButtons(user.page);
        await K.press(user.page, TEXT.GUILTY);
        await K.expectNoVoteButtons(user.page);
    });
});

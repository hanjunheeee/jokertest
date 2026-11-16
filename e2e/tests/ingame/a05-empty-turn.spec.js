'use strict';

// 빈 밤 차례 브라우저 시험 (PC, 진짜 시간) — 다 죽은 직업 차례도 안내가 뜨고 6~18초 뒤 넘어감, 광대가 끝까지 안 고르면 30초 뒤 넘어감
// 목록 시험목록/A05a-밤-차례-능력.md A05-E-012~014, 모이는지만 봄: npx playwright test --list tests/ingame/a05-empty-turn.spec.js
const { test, expect } = require('../../helpers/fixtures');
const { expectReadable } = require('../../helpers/visible');
const n = require('./b-night/_night');
const k = require('./_a05a-pc-kit');

// 진짜 시간 허용 폭 (초)
const SLACK = 1.5;
const turnMessage = (page, role) => page.getByRole('dialog', { name: '밤 역할 안내' }).getByText(n.TURN_MESSAGES[role]);
const turnOf = (role, dayIndex) => (p) => p.role === role && p.dayIndex === dayIndex;

// 다 죽은 직업 차례: [번호, 인원, 다 죽을 직업, 봇 직업 (차례 순서대로), 표시]
const EMPTY = [
    ['A05-E-012', 6, 'DOCTOR', ['JOKER', 'DOCTOR'], ' @smoke'],
    ['A05-E-013', 8, 'GUARD', ['JOKER', 'DOCTOR', 'GUARD'], ''],
];
for (const [no, players, role, botRoles, mark] of EMPTY) {
    const name = n.ROLE_NAMES[role];
    test(`${no} ${players}명 ${name} 봇이 첫날 처형된 판: 첫 밤 시민 화면에 "${n.TURN_MESSAGES[role]}"가 뜨고 6~18초(±${SLACK}) 뒤 다음으로 @game @realtime${mark}`, async ({ user, table }) => {
        const { t, page } = await k.open(table, user, { bots: players - 1, me: 'CITIZEN', botRoles, settings: { nightActionTime: 30 } });
        const gone = t.bots[botRoles.indexOf(role)];
        const watcher = t.bots[0];
        await k.execute(t, gone);
        // 추방 연출이 도는 동안엔 차례 안내가 밀림 → 화면이 밤까지 따라온 뒤 앞 차례를 닫기 시작
        await k.nightShown(page, 1);
        // 이 밤엔 넘기기 손잡이를 안 씀 (빈 차례 기다림을 보는 시험): 앞 차례는 봇이 건너뛰기를 내서 닫힘
        for (const before of botRoles.slice(0, botRoles.indexOf(role))) {
            await k.waitState(t, (s) => s.phase === 'NIGHT' && s.nightTurnRole === before, `${before} 차례 열림`);
            await k.botAct(t, t.bots[botRoles.indexOf(before)], null);
        }
        const [startedAt] = await Promise.all([
            k.eventAt(watcher, 'night_turn_started', turnOf(role, 1), 30_000),
            expectReadable(turnMessage(page, role), { timeout: 30_000 }),
        ]);
        const endedAt = await k.eventAt(watcher, 'night_turn_ended', turnOf(role, 1), 25_000);
        const waited = (endedAt - startedAt) / 1000;
        expect(waited, '빈 차례 길이(초)').toBeGreaterThanOrEqual(6 - SLACK);
        expect(waited, '빈 차례 길이(초)').toBeLessThanOrEqual(18 + SLACK);
        // 다음으로: 그 직업이 이 판의 마지막 차례라 바로 낮
        await k.dayShown(page, 2);
        expect((await t.state()).dayIndex).toBe(2);
    });
}

test(`A05-E-014 5명 밤 30초 방: 광대 봇이 끝까지 안 고르면 30초(±${SLACK}) 뒤 차례가 넘어가고 낮에 사망 카드 없음 @game @realtime`, async ({ user, table }) => {
    const { t, page } = await k.open(table, user, { bots: 4, me: 'CITIZEN', botRoles: ['JOKER'], settings: { nightActionTime: 30 } });
    const watcher = t.bots[1];
    // 낮은 손잡이로 넘기고 밤 차례는 진짜로 기다림 (광대 봇은 아무것도 안 냄)
    await n.toNight(t, { dayIndex: 1 });
    const startedAt = await k.eventAt(watcher, 'night_turn_started', turnOf('JOKER', 1));
    const endedAt = await k.eventAt(watcher, 'night_turn_ended', turnOf('JOKER', 1), 40_000);
    expect(Math.abs((endedAt - startedAt) / 1000 - 30), '광대 차례 길이와 30초의 차이').toBeLessThanOrEqual(SLACK);
    await k.dayShown(page, 2);
    expect((await t.state()).dayIndex).toBe(2);
    await k.expectDeadNames(page, []);
});

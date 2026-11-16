'use strict';

// 밤 대상 고르기 브라우저 시험 (PC) — 직업마다 카드 메뉴에 밤 항목이 있는 카드·없는 카드, 첫 밤 마녀사냥꾼, 남의 차례·시민·죽은 사람 화면
// 목록 시험목록/A05a-밤-차례-능력.md A05-E-015~042, 모이는지만 봄: npx playwright test --list tests/ingame/a05-targets.spec.js
const { test, expect } = require('../../helpers/fixtures');
const { expectReadable } = require('../../helpers/visible');
const n = require('./b-night/_night');
const k = require('./_a05a-pc-kit');

// 내 차례에 카드 다섯 장을 볼 판 차리기 (직업마다) → { t, page, night, cards: 카드 이름 → 사람 }
// 죽은 사람은 첫날 봇 표로 처형해서 만듦
const SCENES = {
    // 7명 광대2 (자동 구성: 광대2·의사1·시민4)
    JOKER: async (table, user) => {
        const { t, page } = await k.open(table, user, {
            bots: 6, settings: { jokerCount: 2 }, me: 'JOKER', botRoles: ['JOKER', 'DOCTOR', 'CITIZEN', 'CITIZEN'],
        });
        const [mate, doctor, dead, citizen] = t.bots;
        await k.execute(t, dead);
        await n.toTurn(t, 'JOKER', { dayIndex: 1 });
        return { t, page, night: 1, cards: { '동료 광대': mate, '자기': user, '산 의사': doctor, '죽은 시민': dead, '산 시민': citizen } };
    },
    // 8명 직접{광대1·의사2}
    DOCTOR: async (table, user) => {
        const { t, page } = await k.open(table, user, {
            bots: 7, settings: n.custom({ JOKER: 1, DOCTOR: 2 }), me: 'DOCTOR', botRoles: ['JOKER', 'DOCTOR', 'CITIZEN', 'CITIZEN'],
        });
        const [joker, mate, dead, citizen] = t.bots;
        await k.execute(t, dead);
        await n.toTurn(t, 'DOCTOR', { dayIndex: 1 });
        return { t, page, night: 1, cards: { '자기': user, '동료 의사': mate, '산 광대': joker, '죽은 시민': dead, '산 시민': citizen } };
    },
    // 8명 직접{광대1·경비원2}
    GUARD: async (table, user) => {
        const { t, page } = await k.open(table, user, {
            bots: 7, settings: n.custom({ JOKER: 1, GUARD: 2 }), me: 'GUARD', botRoles: ['JOKER', 'GUARD', 'CITIZEN', 'CITIZEN'],
        });
        const [joker, mate, dead, citizen] = t.bots;
        await k.execute(t, dead);
        await n.toTurn(t, 'GUARD', { dayIndex: 1 });
        return { t, page, night: 1, cards: { '자기': user, '동료 경비원': mate, '산 광대': joker, '죽은 시민': dead, '산 시민': citizen } };
    },
    // 10명 직접{광대1·마녀사냥꾼2}, 둘째 밤 (첫 밤엔 마녀사냥꾼 차례 없음)
    WITCH_HUNTER: async (table, user) => {
        const { t, page } = await k.open(table, user, {
            bots: 9, settings: n.custom({ JOKER: 1, WITCH_HUNTER: 2 }), me: 'WITCH_HUNTER', botRoles: ['JOKER', 'WITCH_HUNTER', 'CITIZEN', 'CITIZEN'],
        });
        const [joker, mate, dead, citizen] = t.bots;
        await k.execute(t, dead);
        await n.toTurn(t, 'WITCH_HUNTER', { dayIndex: 2 });
        return { t, page, night: 2, cards: { '자기': user, '산 동료 마녀사냥꾼': mate, '산 광대': joker, '죽은 사람': dead, '산 시민': citizen } };
    },
};
const SCENE_NAMES = {
    JOKER: '7명 광대2 판(시민 1 처형)',
    DOCTOR: '8명 직접{의사2} 판(시민 1 처형)',
    GUARD: '8명 직접{경비원2} 판(시민 1 처형)',
    WITCH_HUNTER: '10명 직접{마녀사냥꾼2} 판 둘째 밤(시민 1 처형)',
};

// [번호, 내 직업, 카드, 기대] — '있음' = 눌러 고를 수 있음, '잠김' = 항목은 보이나 못 누름, '없음' = 항목이 없어 메뉴가 안 열림
// 화면 규칙(utils/playerCardMenu.js): 고를 수 없는 남의 카드는 잠긴 채 보임, 내 카드(의사 말고)·동료 광대 카드는 항목 자체가 없음
const CARD_TABLE = [
    ['A05-E-015', 'JOKER', '동료 광대', '없음'],
    ['A05-E-016', 'JOKER', '자기', '없음'],
    ['A05-E-017', 'JOKER', '산 의사', '있음'],
    ['A05-E-018', 'JOKER', '죽은 시민', '잠김'],
    ['A05-E-019', 'JOKER', '산 시민', '있음'],
    ['A05-E-020', 'DOCTOR', '자기', '있음'],
    ['A05-E-021', 'DOCTOR', '동료 의사', '있음'],
    ['A05-E-022', 'DOCTOR', '산 광대', '있음'],
    ['A05-E-023', 'DOCTOR', '죽은 시민', '잠김'],
    ['A05-E-024', 'DOCTOR', '산 시민', '있음'],
    ['A05-E-025', 'GUARD', '자기', '없음'],
    ['A05-E-026', 'GUARD', '동료 경비원', '있음'],
    ['A05-E-027', 'GUARD', '산 광대', '있음'],
    ['A05-E-028', 'GUARD', '죽은 시민', '잠김'],
    ['A05-E-029', 'GUARD', '산 시민', '있음'],
    ['A05-E-030', 'WITCH_HUNTER', '자기', '없음'],
    ['A05-E-031', 'WITCH_HUNTER', '산 동료 마녀사냥꾼', '잠김'],
    ['A05-E-032', 'WITCH_HUNTER', '산 광대', '잠김'],
    ['A05-E-033', 'WITCH_HUNTER', '죽은 사람', '있음'],
    ['A05-E-034', 'WITCH_HUNTER', '산 시민', '잠김'],
];
for (const [no, role, cardName, expected] of CARD_TABLE) {
    const action = n.ACTION_LABELS[role];
    test(`${no} ${SCENE_NAMES[role]} ${n.ROLE_NAMES[role]} 사람 내 차례: ${cardName} 카드에 "${action}" 항목 ${expected} @game`, async ({ user, table }) => {
        if (role === 'WITCH_HUNTER') test.setTimeout(180_000);
        const { t, page, night, cards } = await SCENES[role](table, user);
        const name = k.nick(cards[cardName]);
        if (expected === '있음') await k.expectNightItem(page, name, action);
        else expect(await k.itemState(page, name), `${cardName} 카드 밤 항목`).toBe(expected);
        // 내 차례 동안 본 것이어야 뜻이 있음
        await k.expectTurn(t, role, night);
    });
}

test('A05-E-035 10명 마녀사냥꾼 사람 첫 밤(첫날 처형 있음): 차례가 안 오고 처형된 카드에 "확인" 항목 없음 @game', async ({ user, table }) => {
    const { t, page } = await k.open(table, user, { bots: 9, me: 'WITCH_HUNTER', botRoles: ['JOKER', 'DOCTOR', 'GUARD', 'CITIZEN'] });
    const dead = t.bots[3];
    await k.execute(t, dead);
    // 첫 밤 차례마다 처형된 카드를 눌러 봄
    for (const role of ['JOKER', 'DOCTOR', 'GUARD']) {
        await n.toTurn(t, role, { dayIndex: 1 });
        expect(await k.itemState(page, k.nick(dead)), `${n.ROLE_NAMES[role]} 차례에 처형된 카드`).toBe('없음');
        await k.expectTurn(t, role, 1);
    }
    await k.toDay(t, 2);
    await k.dayShown(page, 2);
    expect(n.turnOrder(t.bots[0], 1), '서버가 연 첫 밤 차례').toEqual(['JOKER', 'DOCTOR', 'GUARD']);
    expect(await k.turnsSeen(page), '화면에 뜬 차례 안내').not.toContain('WITCH_HUNTER');
});

test('A05-E-036 10명 마녀사냥꾼 사람 둘째 밤 죽은 사람 0명: 안내는 뜨고 고를 카드가 없고 밤 30초(±1.5) 뒤 넘어감 @game @realtime', async ({ user, table }) => {
    test.setTimeout(180_000);
    const { t, page } = await k.open(table, user, {
        bots: 9, me: 'WITCH_HUNTER', botRoles: ['JOKER', 'DOCTOR', 'GUARD'], settings: { nightActionTime: 30 },
    });
    const watcher = t.bots[0];
    const mine = (p) => p.role === 'WITCH_HUNTER' && p.dayIndex === 2;
    // 둘째 밤 내 차례 앞까지는 손잡이로 (첫날 처형 없음·첫 밤 아무도 안 죽음), 내 차례는 진짜로 30초
    await Promise.all([
        expectReadable(page.getByRole('dialog', { name: '밤 역할 안내' }).getByText(n.TURN_MESSAGES.WITCH_HUNTER), { timeout: 90_000 }),
        n.toTurn(t, 'WITCH_HUNTER', { dayIndex: 2 }),
    ]);
    const startedAt = await k.eventAt(watcher, 'night_turn_started', mine);
    // 어느 카드에도 눌러 고를 수 있는 확인 항목이 없음
    const pickable = [];
    for (const who of [user, ...t.bots]) {
        if ((await k.itemState(page, k.nick(who))) === '있음') pickable.push(k.nick(who));
    }
    expect(pickable, '고를 수 있는 카드').toEqual([]);
    await k.expectTurn(t, 'WITCH_HUNTER', 2);
    const endedAt = await k.eventAt(watcher, 'night_turn_ended', mine, 40_000);
    expect(Math.abs((endedAt - startedAt) / 1000 - 30), '내 차례 길이와 30초의 차이').toBeLessThanOrEqual(1.5);
    await k.dayShown(page, 3);
    expect((await t.state()).dayIndex).toBe(3);
});

// 남의 차례엔 밤 항목 없음: [번호, 내 직업, 인원, 볼 차례, 몇 번째 밤]
const OTHER_TURN = [
    ['A05-E-037', 'DOCTOR', 6, 'JOKER', 1],
    ['A05-E-038', 'GUARD', 8, 'DOCTOR', 1],
    ['A05-E-039', 'WITCH_HUNTER', 10, 'GUARD', 2],
    ['A05-E-040', 'JOKER', 6, 'DOCTOR', 1],
];
for (const [no, role, players, turn, night] of OTHER_TURN) {
    test(`${no} ${players}명 ${n.ROLE_NAMES[role]} 사람: ${n.ROLE_NAMES[turn]} 차례 중엔 카드에 밤 항목 없음 @game`, async ({ user, table }) => {
        if (night > 1) test.setTimeout(180_000);
        const { t, page } = await k.open(table, user, { bots: players - 1, me: role, botRoles: ['CITIZEN'] });
        // 내 차례였다면 고를 수 있는 카드: 마녀사냥꾼은 죽은 사람(첫날 처형), 나머지는 산 시민
        const target = t.bots[0];
        if (role === 'WITCH_HUNTER') await k.execute(t, target);
        await n.toTurn(t, turn, { dayIndex: night });
        expect(await k.itemState(page, k.nick(target)), '남의 차례 카드 밤 항목').toBe('없음');
        await k.expectTurn(t, turn, night);
    });
}

test('A05-E-041 5명 시민 사람: 밤(광대 차례)에 어느 카드에도 밤 항목 없음 @game @smoke', async ({ user, table }) => {
    const { t, page } = await k.open(table, user, { bots: 4, me: 'CITIZEN', botRoles: ['JOKER', 'CITIZEN'] });
    await n.toTurn(t, 'JOKER', { dayIndex: 1 });
    for (const who of [t.bots[0], t.bots[1], user]) {
        expect(await k.itemState(page, k.nick(who)), '시민 화면 카드 밤 항목').toBe('없음');
    }
    await k.expectTurn(t, 'JOKER', 1);
});

// 죽어도 내 직업 차례엔 남의 카드에 "보호"가 잠긴 채 보임(까닭 "사망한 플레이어는 행동할 수 없습니다"), 내 카드는 고를 대상이 아니라 항목 없음
test('A05-E-042 6명 의사 사람이 첫날 처형됨: 첫 밤 의사 차례에 산 시민 카드의 밤 항목은 잠김, 내 카드엔 없음 @game', async ({ user, table }) => {
    const { t, page } = await k.open(table, user, { bots: 5, me: 'DOCTOR', botRoles: ['JOKER', 'CITIZEN'] });
    const citizen = t.bots[1];
    await k.execute(t, user);
    // 추방 연출·사망 뒤 창을 넘기고 밤 화면까지 온 뒤 의사 차례로 (죽은 직업 차례는 잠깐만 열려 있어 미리 화면을 맞춤)
    await k.nightShown(page, 1);
    await k.expectDead(page, user);
    await n.toTurn(t, 'DOCTOR', { dayIndex: 1 });
    expect(await k.itemState(page, k.nick(citizen)), '산 시민 카드 밤 항목').toBe('잠김');
    await k.expectTurn(t, 'DOCTOR', 1);
    expect(await k.itemState(page, k.nick(user)), '내 카드 밤 항목').toBe('없음');
});

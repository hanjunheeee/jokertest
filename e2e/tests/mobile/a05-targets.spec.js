'use strict';

// 모바일 밤 대상 시험: 내 차례에 카드를 누르면 뜨는 카드 시트에 직업 행동(암살·보호·조사·확인)이 있는지 — 직업 4 × 카드 5
// 목록 시험목록/A05a-밤-차례-능력.md A05-E-101~120 — 쓰는 동안엔 안 돌림: npx playwright test --list tests/mobile/a05-targets.spec.js
const { test, expect } = require('../../helpers/fixtures');
const kit = require('./_a05a-kit');

const { night, ROLE_NAMES } = kit;

// 사람 직업마다 판: 같은 직업 봇 1명(동료) + 시민 봇 하나를 첫날 처형해 죽은 카드를 만듦, 마녀사냥꾼은 둘째 밤에 봄
const TABLES = {
    JOKER: { name: '7명 광대2', total: 7, settings: { jokerCount: 2 }, botRoles: ['JOKER', 'DOCTOR'], dayIndex: 1 },
    DOCTOR: { name: '8명 직접{광대1·의사2}', total: 8, settings: night.custom({ JOKER: 1, DOCTOR: 2 }), botRoles: ['JOKER', 'DOCTOR'], dayIndex: 1 },
    GUARD: { name: '8명 직접{광대1·경비원2}', total: 8, settings: night.custom({ JOKER: 1, GUARD: 2 }), botRoles: ['JOKER', 'GUARD'], dayIndex: 1 },
    WITCH_HUNTER: {
        name: '10명 직접{광대1·마녀사냥꾼2} 둘째 밤', total: 10, settings: night.custom({ JOKER: 1, WITCH_HUNTER: 2 }), botRoles: ['JOKER', 'WITCH_HUNTER'], dayIndex: 2,
    },
};

// 카드 5가지 → 그 카드 주인 닉네임
const TARGETS = {
    self: (g, me) => me.account.nickname,
    ally: (g, me, role) => kit.nickOf(g.bots[role][0]),
    joker: (g) => kit.nickOf(g.bots.JOKER[0]),
    doctor: (g) => kit.nickOf(g.bots.DOCTOR[0]),
    dead: (g, me, role, dead) => kit.nickOf(dead),
    citizen: (g, me, role, dead, living) => kit.nickOf(living),
};

// [번호, 사람 직업, 카드, 카드 이름, 밤 항목]
const CASES = [
    ['A05-E-101', 'JOKER', 'ally', '동료 광대', '없음'],
    ['A05-E-102', 'JOKER', 'self', '자기', '없음'],
    ['A05-E-103', 'JOKER', 'doctor', '산 의사', '있음'],
    ['A05-E-104', 'JOKER', 'dead', '죽은 시민', '없음'],
    ['A05-E-105', 'JOKER', 'citizen', '산 시민', '있음'],
    ['A05-E-106', 'DOCTOR', 'self', '자기', '있음'],
    ['A05-E-107', 'DOCTOR', 'ally', '동료 의사', '있음'],
    ['A05-E-108', 'DOCTOR', 'joker', '산 광대', '있음'],
    ['A05-E-109', 'DOCTOR', 'dead', '죽은 시민', '없음'],
    ['A05-E-110', 'DOCTOR', 'citizen', '산 시민', '있음'],
    ['A05-E-111', 'GUARD', 'self', '자기', '없음'],
    ['A05-E-112', 'GUARD', 'ally', '동료 경비원', '있음'],
    ['A05-E-113', 'GUARD', 'joker', '산 광대', '있음'],
    ['A05-E-114', 'GUARD', 'dead', '죽은 시민', '없음'],
    ['A05-E-115', 'GUARD', 'citizen', '산 시민', '있음'],
    ['A05-E-116', 'WITCH_HUNTER', 'self', '자기', '없음'],
    ['A05-E-117', 'WITCH_HUNTER', 'ally', '산 동료 마녀사냥꾼', '없음'],
    ['A05-E-118', 'WITCH_HUNTER', 'joker', '산 광대', '없음'],
    ['A05-E-119', 'WITCH_HUNTER', 'dead', '죽은 사람', '있음'],
    ['A05-E-120', 'WITCH_HUNTER', 'citizen', '산 시민', '없음'],
];

for (const [no, role, target, targetName, expected] of CASES) {
    const tb = TABLES[role];
    const tag = no === 'A05-E-101' ? ' @smoke' : '';
    test(`${no} 모바일 ${tb.name} ${ROLE_NAMES[role]} 사람: ${targetName} 카드 시트에 ${kit.ACTION_LABELS[role]} 항목 ${expected} @game${tag}`, async ({ user, table }) => {
        const g = await kit.seat(table, { humans: [user], bots: tb.total - 1, humanRoles: [role], botRoles: tb.botRoles, settings: tb.settings });
        const page = user.page;
        const [dead, living] = g.bots.CITIZEN;
        // 시민 봇 하나를 첫날 처형 → 첫 밤 (마녀사냥꾼은 첫 밤 차례가 없어 둘째 밤까지)
        await kit.executeByBots(g.t, kit.uuidOf(dead));
        if (tb.dayIndex === 2) await kit.toNight(g.t, 2);
        await kit.stepToTurn(g.t, role);
        // 내 차례가 켜진 걸 먼저 봄 (차례가 아니라서 없는 것과 가르려고)
        await kit.expectMyTurn(page);

        const nickname = TARGETS[target](g, user, role, dead, living);
        expect(await kit.itemState(page, nickname, role)).toBe(expected);
        if (expected === '있음') await kit.expectItemShown(page, nickname, role);
    });
}

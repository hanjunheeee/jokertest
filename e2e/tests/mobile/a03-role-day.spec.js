'use strict';

// 모바일 직업별 낮 화면 시험: 판 인원마다 사람 직업을 바꿔도 낮엔 직업 능력 단추 없음, 투표 대상은 나 빼고 산 사람
// 목록 A03-낮투표.md A03-E-245~265 (모바일 몫), 돌리지 않고 모임만: npx playwright test --list tests/mobile/a03-role-day.spec.js
const { test, expect } = require('../../helpers/fixtures');
const { ROLE_LABELS } = require('../../helpers/ui');
const { talk, startTalkGame, toDay, toVote, openRoster, closeRoster, playerItems } = require('./_talk');

// ── 이 파일 도우미 (공용으로 올릴 후보: 모바일 낮 투표 묶음) ──

// 자동 역할 구성 (광대 1, 6명부터 의사, 8명부터 경비원, 10명부터 마녀사냥꾼, 남는 자리 시민)
function autoRoles(n) {
    const list = ['JOKER'];
    if (n >= 6) list.push('DOCTOR');
    if (n >= 8) list.push('GUARD');
    if (n >= 10) list.push('WITCH_HUNTER');
    while (list.length < n) list.push('CITIZEN');
    return list;
}

// 봇 직업 차례: 시민 먼저·광대 마지막 → 봇 0·1(X·Y)은 늘 시민이라 재판·퇴장에도 판이 안 끝남
const BOT_ORDER = ['CITIZEN', 'WITCH_HUNTER', 'GUARD', 'DOCTOR', 'JOKER'];

// 직업 고정 계획: 사람은 받은 직업(기본 시민), 남은 직업을 봇에 → { uuid: 직업 }
function rolePlan(n, humanRoles = []) {
    return ({ humans, bots }) => {
        const pool = autoRoles(n);
        const out = {};
        humans.forEach((h, i) => {
            const role = humanRoles[i] ?? 'CITIZEN';
            if (!pool.includes(role)) throw new Error(`${n}명 자동 구성에 ${role} 자리 없음`);
            pool.splice(pool.indexOf(role), 1);
            out[h.account.uuid] = role;
        });
        pool.sort((a, b) => BOT_ORDER.indexOf(a) - BOT_ORDER.indexOf(b));
        bots.forEach((b, i) => { out[b.account.uuid] = pool[i]; });
        return out;
    };
}

// 서버가 정한 직업이 계획과 같은지 (예약이 가끔 못 맞음)
async function expectRoles(t, plan) {
    const want = plan({ humans: t.humans, bots: t.bots });
    const s = await t.state();
    expect(Object.fromEntries(s.players.map((p) => [p.uuid, p.role]))).toEqual(want);
}

// 판 차리고 제 1일 낮 투표까지 (역할 공개·토론은 이 시험이 보는 규칙이 아니라 손잡이로 빨리)
async function openVote(table, user, n, { humanRoles, settings } = {}) {
    const roles = rolePlan(n, humanRoles);
    const t = await startTalkGame(table, user, { bots: n - 1, roles, settings });
    await expectRoles(t, roles);
    await toDay(t, user.page);
    await toVote(t, user.page);
    return t;
}

const abstainButton = (page) => page.getByRole('button', { name: '기권' });


// 밤 행동 단추 이름 (낮엔 하나도 없어야 함)
const NIGHT_ACTION_NAMES = ['암살', '보호', '조사', '확인', '건너뛰기'];

// 세로 카톡형: 카드 판 대신 플레이어 목록 시트 줄마다 행동 단추 — 그 사람 줄 항목 이름 목록 (누를 수 있는 것만 enabled에) → 목록 닫음
async function sheetItems(page, nick) {
    const items = await playerItems(page, nick);
    await closeRoster(page);
    return items;
}

// ── 시험 ──

// (판 인원, 사람 직업): 5명 광대·시민 · 6~7명 +의사 · 8~9명 +경비원 · 10명 +마녀사냥꾼
const ROLES_BY_SIZE = [
    [5, ['JOKER', 'CITIZEN']],
    [6, ['JOKER', 'CITIZEN', 'DOCTOR']],
    [7, ['JOKER', 'CITIZEN', 'DOCTOR']],
    [8, ['JOKER', 'CITIZEN', 'DOCTOR', 'GUARD']],
    [9, ['JOKER', 'CITIZEN', 'DOCTOR', 'GUARD']],
    [10, ['JOKER', 'CITIZEN', 'DOCTOR', 'GUARD', 'WITCH_HUNTER']],
];
const CASES = ROLES_BY_SIZE.flatMap(([n, roles]) => roles.map((role) => ({ n, role })));

CASES.forEach(({ n, role }, i) => {
    const no = 245 + i;
    const smoke = i === 0 ? ' @smoke' : '';
    test(`A03-E-${no} 모바일 ${n}명 판 사람 ${ROLE_LABELS[role]} → 낮엔 직업 능력 단추 없음, 투표 대상 = 나 빼고 산 사람 @game${smoke}`, async ({ user, table }) => {
        test.setTimeout(180_000);
        const t = await openVote(table, user, n, { humanRoles: [role] });
        // 낮 투표 행동 줄: 투표 현황·기권만 (건너뛰기 같은 밤 단추 없음)
        await expect(abstainButton(user.page)).toBeEnabled();
        for (const name of NIGHT_ACTION_NAMES) {
            await expect(talk.actionRow(user.page).getByRole('button', { name, exact: true })).toHaveCount(0);
        }
        // 남의 줄마다 항목은 '투표하기' 하나뿐이고 누를 수 있음
        for (const bot of t.bots) {
            const items = await sheetItems(user.page, bot.nickname);
            expect(items.all, `${bot.nickname} 카드 항목`).toEqual(['투표하기']);
            expect(items.enabled).toEqual(['투표하기']);
        }
        // 내 줄("(나)")엔 행동 단추가 없음
        await openRoster(user.page);
        const mine = talk.roster(user.page).locator('li[data-roster-player]').filter({ hasText: ' (나)' });
        await expect(mine).toHaveCount(1);
        await expect(mine.getByRole('menuitem')).toHaveCount(0);
        await closeRoster(user.page);
    });
});

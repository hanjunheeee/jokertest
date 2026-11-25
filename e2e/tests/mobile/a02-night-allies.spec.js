'use strict';

// 모바일 1일 밤 동료 카드 브라우저 시험 — 내 밤 차례에 동료 카드를 누르면 의사·경비원은 밤 단추가 눌러지고 광대는 없음
// 목록 A02-판시작-역할.md 번호 A02-E-158~162 (앞 단계는 손잡이로 넘김, 시간 규칙을 보는 시험 아님)
const { test, expect } = require('../../helpers/fixtures');
const { customRoleSettings } = require('../../helpers/game');
const { talk, clearOverlays, openPlayer, closeRoster, rosterRowOf } = require('./_talk');
const { toTurn } = require('../ingame/b-night/_night');

// 밤 단추 이름 (화면 getInGameNightActionLabel 글)
const NIGHT_LABEL = { JOKER: '암살', DOCTOR: '보호', GUARD: '조사' };

// 사람 1 + 봇 n-1 판, 사람과 첫 봇 같은 직업 → 사람 직업 확인, 짝 상대·시민 하나는 서버 값에서 찾음
async function openPairGame(table, user, { n, role, settings }) {
    const me = user.account.uuid;
    const t = await table.setup({
        humans: [user],
        bots: n - 1,
        settings,
        roles: ({ bots }) => ({ [me]: role, [bots[0].account.uuid]: role }),
    });
    const s = await t.state();
    expect(s.players.find((p) => p.uuid === me)?.role, '미리 정한 내 직업').toBe(role);
    const partner = s.players.find((p) => p.uuid !== me && p.role === role);
    const citizen = s.players.find((p) => p.role === 'CITIZEN');
    expect(partner, '같은 직업 상대').toBeTruthy();
    return { t, partner, citizen };
}

// 세로 카톡형: 카드 띠 대신 플레이어 목록 시트(밤엔 "직업 행동")의 그 사람 줄 열기 (연출 창이 막으면 닫으면서 다시)
async function openSheet(page, nickname) {
    let row = null;
    await expect(async () => {
        await clearOverlays(page);
        row = await openPlayer(page, nickname);
    }).toPass({ timeout: 25_000 });
    return row;
}

const closeSheet = (page) => closeRoster(page);

// 1일 밤 내 차례까지 (낮은 아무도 안 찍어 재판 없이 밤)
async function toMyTurn(t, page, role) {
    await toTurn(t, role, { dayIndex: 1 });
    await expect(talk.phaseLine(page)).toContainText('밤', { timeout: 15_000 });
}

// 동료 줄 밤 단추가 눌러지고, 누르면 서버가 받아 "취소하기"로 바뀜
async function expectAllyPressable(page, role, partnerNick) {
    const sheet = await openSheet(page, partnerNick);
    const button = sheet.getByRole('menuitem', { name: NIGHT_LABEL[role], exact: true });
    await expect(button).toBeEnabled();
    await button.click();
    await expect(async () => {
        const again = await openSheet(page, partnerNick);
        await expect(again.getByRole('menuitem', { name: '취소하기', exact: true })).toBeVisible({ timeout: 1500 });
    }).toPass({ timeout: 15_000 });
}

// 광대: 시민 줄엔 암살 눌러짐(목록이 막힌 게 아님을 먼저 봄) → 동료 줄엔 눌러지는 암살 없음
// 동료 광대 줄은 행동 항목이 없음 (화면 utils/playerCardMenu.js — 줄에 단추 칸이 안 그려짐)
async function expectAllyBlocked(page, partnerNick, citizenNick) {
    const sheet = await openSheet(page, citizenNick);
    await expect(sheet.getByRole('menuitem', { name: '암살', exact: true })).toBeEnabled();
    const kill = rosterRowOf(page, partnerNick).getByRole('menuitem', { name: '암살', exact: true });
    expect((await kill.count()) === 0 || (await kill.isDisabled()), '동료 광대 줄의 암살 단추가 꺼져 있거나 없음').toBe(true);
    await closeSheet(page);
}

const DOCTOR_PAIR = customRoleSettings({ JOKER: 1, DOCTOR: 2 });
const GUARD_PAIR = customRoleSettings({ JOKER: 1, GUARD: 2 });

const CASES = [
    { no: 'A02-E-158', role: 'DOCTOR', n: 6, settings: DOCTOR_PAIR, pressable: true },
    { no: 'A02-E-159', role: 'DOCTOR', n: 10, settings: DOCTOR_PAIR, pressable: true },
    { no: 'A02-E-160', role: 'JOKER', n: 5, settings: { jokerCount: 2 }, pressable: false },
    { no: 'A02-E-161', role: 'JOKER', n: 10, settings: { jokerCount: 2 }, pressable: false },
    { no: 'A02-E-162', role: 'GUARD', n: 8, settings: GUARD_PAIR, pressable: true },
];

const ROLE_NAME = { JOKER: '광대', DOCTOR: '의사', GUARD: '경비원' };

CASES.forEach((c, i) => {
    const what = c.pressable ? `"${NIGHT_LABEL[c.role]}" 눌러짐` : '"암살" 꺼짐';
    const tags = ['@game', ...(i === 0 ? ['@smoke'] : [])].join(' ');
    test(`${c.no} 모바일 ${ROLE_NAME[c.role]} 2명 ${c.n}명 판 1일 밤 → 동료 카드 ${what} ${tags}`, async ({ user, table }) => {
        const { t, partner, citizen } = await openPairGame(table, user, c);
        await toMyTurn(t, user.page, c.role);
        if (c.pressable) await expectAllyPressable(user.page, c.role, partner.nickname);
        else await expectAllyBlocked(user.page, partner.nickname, citizen.nickname);
    });
});

'use strict';

// 모바일 밤 차례 안내 시험: 내 직업 차례에 "○○의 시간입니다"가 보이는지, 시민 화면이 본 차례 안내 목록, 다 죽은 직업 차례의 무작위 기다림
// 목록 시험목록/A05a-밤-차례-능력.md A05-E-093~100·150 — 쓰는 동안엔 안 돌림: npx playwright test --list tests/mobile/a05-turn-order.spec.js
const { test, expect } = require('../../helpers/fixtures');
const { expectReadable } = require('../../helpers/visible');
const kit = require('./_a05a-kit');
const { talk } = require('./_talk');

const { night, ROLE_NAMES, TURN_MESSAGES } = kit;
const roleNames = (roles) => roles.map((role) => ROLE_NAMES[role]).join(', ');

// 내 직업 차례 안내: 사람 직업 × 판 인원 (자동 구성 — 5명 광대, 6명부터 의사, 8명부터 경비원, 10명 마녀사냥꾼은 둘째 밤부터)
const MY_TURN_CASES = [
    { no: 'A05-E-093', role: 'JOKER', total: 5, dayIndex: 1, tag: ' @smoke' },
    { no: 'A05-E-094', role: 'DOCTOR', total: 6, dayIndex: 1, tag: '' },
    { no: 'A05-E-095', role: 'GUARD', total: 8, dayIndex: 1, tag: '' },
    { no: 'A05-E-096', role: 'WITCH_HUNTER', total: 10, dayIndex: 2, tag: '' },
];

for (const c of MY_TURN_CASES) {
    const nightName = c.dayIndex === 2 ? '둘째 밤' : '첫 밤';
    test(`${c.no} 모바일 ${c.total}명 ${ROLE_NAMES[c.role]} 사람 ${nightName}: 내 차례에 "${TURN_MESSAGES[c.role]}" 보임 @game${c.tag}`, async ({ user, table }) => {
        const g = await kit.seat(table, { humans: [user], bots: c.total - 1, humanRoles: [c.role], autoConfirm: false });
        const page = user.page;
        await kit.toNight(g.t, c.dayIndex);
        // 밤 안내를 확인해야 차례 안내가 뜸 → 확인한 뒤 앞 차례를 넘겨 내 차례로
        await kit.confirmEntrance(page, 'NIGHT');
        await kit.stepToTurn(g.t, c.role);
        await kit.expectTurnNotice(page, c.role);
        // 안내가 닫히면 내 차례 단추(건너뛰기)가 눌림 = 정말 내 차례
        await kit.expectMyTurn(page);
    });
}

// 시민 화면이 본 차례 안내 목록: 판 인원마다 열리는 차례가 다름
const LIST_CASES = [
    { no: 'A05-E-097', total: 5, dayIndex: 1, turns: ['JOKER'] },
    { no: 'A05-E-098', total: 6, dayIndex: 1, turns: ['JOKER', 'DOCTOR'] },
    { no: 'A05-E-099', total: 8, dayIndex: 1, turns: ['JOKER', 'DOCTOR', 'GUARD'] },
    { no: 'A05-E-100', total: 10, dayIndex: 2, turns: ['JOKER', 'DOCTOR', 'GUARD', 'WITCH_HUNTER'] },
];

for (const c of LIST_CASES) {
    const nightName = c.dayIndex === 2 ? '둘째 밤' : '첫 밤';
    test(`${c.no} 모바일 ${c.total}명 시민 사람 ${nightName}: 화면에 뜬 차례 안내 = [${roleNames(c.turns)}] @game`, async ({ user, table }) => {
        const g = await kit.seat(table, { humans: [user], bots: c.total - 1, humanRoles: ['CITIZEN'], autoConfirm: false });
        const page = user.page;
        await kit.toNight(g.t, c.dayIndex);
        await kit.confirmEntrance(page, 'NIGHT');
        // 차례마다 안내가 읽히는지 보고, 닫힌 뒤 다음 차례로 (안내 창이 차례마다 새로 떠야 화면 기록에 따로 적힘)
        const watchAll = Object.fromEntries(kit.TURN_ROLES.map((role) => [role, kit.watch(async () => {
            await kit.expectTurnNotice(page, role);
            await kit.waitNoticeGone(page);
        })]));
        const { turns } = await kit.playNight(g.t, watchAll);
        // 서버가 연 차례도, 화면에 뜬 안내도 목록과 같음 (둘째 밤 판은 첫 밤 안내를 확인 안 해 둘째 밤 것만 적힘)
        expect(turns).toEqual(c.turns);
        await kit.expectDayShown(page, c.dayIndex + 1);
        expect((await night.readUi(page)).turns).toEqual(c.turns);
    });
}

test('A05-E-150 모바일 6명 의사 봇 첫날 처형: 첫 밤 시민 화면에 "의사의 시간입니다"가 뜨고 6~18초 안에 낮으로 @game @realtime', async ({ user, table }) => {
    test.setTimeout(180_000);
    // 밤 30초 판: 다 죽은 직업 차례는 차례 길이의 20~60%(6~18초)를 무작위로 기다렸다 넘어감
    const g = await kit.seat(table, {
        humans: [user], bots: 5, humanRoles: ['CITIZEN'], botRoles: ['JOKER', 'DOCTOR'], settings: { nightActionTime: 30 }, autoConfirm: false,
    });
    const page = user.page;
    const [joker] = g.bots.JOKER;
    const [doctor] = g.bots.DOCTOR;
    await kit.executeByBots(g.t, kit.uuidOf(doctor));

    // 여기부터 손잡이 안 씀: 추방 연출 뒤 밤 안내 확인 → 광대 차례 안내
    await kit.confirmEntrance(page, 'NIGHT');
    await kit.expectTurnNotice(page, 'JOKER');
    // 광대 봇이 건너뛰면 5초 뒤 광대 차례가 닫히고, 산 사람이 없는 의사 차례가 열림
    await kit.botPick(g.t, joker, null);
    const notice = kit.turnNotice(page, 'DOCTOR').getByText(TURN_MESSAGES.DOCTOR, { exact: true });
    await notice.waitFor({ state: 'visible', timeout: 15_000 });
    const openedAt = Date.now();
    await expectReadable(notice, { timeout: 2500 });

    // 의사 차례가 지나 낮이 될 때까지 걸린 시간 (허용 폭 ±1.5초)
    // 모바일 명패 줄엔 날짜 글이 없음 → 밤 다음 낮 명패 "[낮"이 뜰 때까지
    await talk.phaseLine(page).filter({ hasText: '[낮' }).waitFor({ state: 'attached', timeout: 25_000 });
    const waited = Date.now() - openedAt;
    expect(waited).toBeGreaterThanOrEqual(6000 - 1500);
    expect(waited).toBeLessThanOrEqual(18_000 + 1500);
    // 광대가 건너뛴 밤이라 사망 카드는 처형된 의사 하나뿐
    await kit.expectDeadCount(page, 2, 1);
});

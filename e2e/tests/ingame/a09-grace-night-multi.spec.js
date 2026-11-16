'use strict';

// 밤에 끊겨 빠지는 어려운 브라우저 시험 (PC, 사람 2명) — 보호를 고른 의사가 탈락해도 보호는 남음·암살을 고른 광대가 탈락해도 암살은 남음(둘 다 결정)·끊긴 동안 밤에 살해되면 탈주 아님
// 목록 A09-끊김-나가기-탈주.md A09-H-032·033·048, 60초는 손잡이 / 보호는 사용자 결정(2026-11-16 아침 3번), 암살은 결정(낮 셋째 6번)대로 — 모이는지만: npx playwright test --list tests/ingame/a09-grace-night-multi.spec.js
// 둘 다 그 직업 차례가 닫혀 고른 것이 정해진 뒤에 탈락시킴 (차례가 열려 있는 동안 탈락해도 이미 낸 고름은 남음 — 결정 넷째 장·백엔드 A09-B-192·334~336, 이 파일은 닫힌 뒤 경우만 봄)
const { test, expect } = require('../../helpers/fixtures');
const { expectReadable } = require('../../helpers/visible');
const night = require('./b-night/_night');
const A = require('./_a04-multi');
const K = require('./_a09-simple-kit');
const H = require('./_a09-hard-kit');

const { U, nick, GRACE_MS } = H;

// 탭 닫기 → 서버가 끊김을 앎 → 60초 손잡이로 탈락
async function closeAndExpire(t, person) {
    const since = Date.now();
    await person.page.close();
    await K.droppedAt(t, U(person), since);
    await K.expire(t, U(person));
}

test('A09-H-032 7명 판(사람 2 + 봇 5, 직접 구성 광대 1·의사 1·경비원 1) 의사 ㄴ이 보호를 고름 → 의사 차례가 닫힌 뒤 탭 닫음 → 손잡이 탈락 → 결정대로 보호는 남아 낮에 ㄱ 화면 "지난밤 의사가 공격받은 사람을 살려냈습니다" @game @hard', async ({ user, players, table }) => {
    test.setTimeout(240_000);
    const [a, b] = await H.openPeople(user, players, 2);
    // 경비원을 넣음: 의사 차례가 닫힌 뒤에도 밤이 이어져야 그 밤 안에 탈락시킬 수 있음 (7명 자동 구성엔 의사 뒤 차례가 없음)
    const t = await H.seat(table, [a, b], { n: 7, humanRoles: ['CITIZEN', 'DOCTOR'], settings: night.custom({ JOKER: 1, DOCTOR: 1, GUARD: 1 }) });
    const [joker] = await H.botsBy(t, 'JOKER');
    const [x] = await H.botsBy(t, 'CITIZEN');
    await night.toTurn(t, 'JOKER', { dayIndex: 1 });
    expect((await night.botNight(t, joker, U(x)))?.ok, '광대 봇이 X를 고름').toBe(true);
    await A.waitState(t, (g) => g.phase === 'NIGHT' && g.nightTurnRole === 'DOCTOR', { timeout: 20_000, message: '의사 차례' });
    await night.nightActUi(b.page, nick(x), night.ACTION_LABELS.DOCTOR);
    // 의사가 다 냈으니 5초 뒤 의사 차례가 닫혀 보호가 정해짐 → 경비원 차례 (손잡이 안 씀, 경비원 봇은 안 내서 차례가 열린 채)
    await A.waitState(t, (g) => g.phase === 'NIGHT' && g.nightTurnRole === 'GUARD', { timeout: 20_000, message: '의사 차례가 닫히고 경비원 차례' });
    await closeAndExpire(t, b);
    const mid = await t.state();
    expect(mid.phase, '그 밤 안에 탈락').toBe('NIGHT');
    expect(K.rowOf(mid, U(b)).alive, '의사 ㄴ은 탈락').toBe(false);

    const day = await night.toDay(t, { dayIndex: 2 });
    expect(K.rowOf(day, U(b)).alive, '의사 ㄴ은 탈락').toBe(false);
    expect(K.rowOf(day, U(x)).alive, '보호가 남아 X가 살아남음').toBe(true);
    const report = a.page.locator('[data-ingame-dawn-report="SAVED"]');
    await expect(report).toContainText(H.TEXT.saved, { timeout: 20_000 });
    await expectReadable(report.getByText(H.TEXT.saved));
});

test('A09-H-033 8명 판(사람 2 + 봇 6, 광대 2) 광대 ㄴ만 대상을 고름 → 광대 차례가 닫힌 뒤 탭 닫음 → 손잡이 탈락 → 결정대로 암살은 남아 낮에 ㄱ 화면 "지난밤 X님이 살해당했습니다" @game @hard @smoke', async ({ user, players, table }) => {
    test.setTimeout(240_000);
    const [a, b] = await H.openPeople(user, players, 2);
    const t = await H.seat(table, [a, b], { n: 8, humanRoles: ['CITIZEN', 'JOKER'], settings: { jokerCount: 2 } });
    const [x] = await H.botsBy(t, 'CITIZEN');
    await K.toDay(t);
    await A.calm(a.page);
    // ㄱ 화면 기록: 단계 안내 창은 바로 닫고, 낮 시작 연출(암살 영상·글 창)이 뜨면 적힘
    await night.recordUi(a.page, { autoConfirm: true });
    await night.toTurn(t, 'JOKER', { dayIndex: 1 });
    await night.nightActUi(b.page, nick(x), night.ACTION_LABELS.JOKER);
    // 고른 것이 서버에 들어갔는지: 같은 카드 메뉴에 "취소하기"가 생김
    await expect(async () => {
        const menu = await night.openCardMenu(b.page, nick(x), { timeout: 5000 });
        await expect(menu.getByRole('menuitem', { name: '취소하기', exact: true })).toBeVisible({ timeout: 1500 });
    }).toPass({ timeout: 15_000 });
    // 동료 광대 봇은 안 고름 → 광대 차례를 손잡이로 닫음 (ㄴ이 고른 X로 암살이 정해짐) → 의사 차례
    await t.advance();
    await A.waitState(t, (g) => g.phase === 'NIGHT' && g.nightTurnRole === 'DOCTOR', { timeout: 20_000, message: '광대 차례가 닫히고 의사 차례' });
    await closeAndExpire(t, b);
    const mid = await t.state();
    expect(mid.phase, '그 밤 안에 탈락').toBe('NIGHT');
    expect(K.rowOf(mid, U(b)).alive, '광대 ㄴ은 탈락').toBe(false);

    const day = await night.toDay(t, { dayIndex: 2 });
    expect(K.rowOf(day, U(x)).alive, '암살이 남아 X가 죽음').toBe(false);
    // ㄱ 화면: 낮이 될 때 살해 연출 — 암살 영상 아래 글은 화면 기록에서 봄(영상이 금방 끝나도 남음), 영상이 못 뜨면 글 창에서 봄
    const killedText = `지난밤 ${nick(x)}님이 살해당했습니다`;
    const killedWindow = a.page.locator('[data-ingame-dawn-report="KILLED"] p').first();
    await expect.poll(async () => {
        const seen = await night.readUi(a.page);
        if (seen?.dawnMessages.includes(killedText)) return true;
        return ((await killedWindow.textContent({ timeout: 500 }).catch(() => null)) ?? '').trim() === killedText;
    }, { timeout: 30_000, message: 'ㄱ 화면 살해 글' }).toBe(true);
    // 의사가 살렸다는 글 창은 아님
    const rec = await night.readUi(a.page);
    expect(rec.kills > 0 || rec.dawnReports.includes('KILLED'), '낮 시작 살해 연출').toBe(true);
    expect(rec.dawnReports, '의사가 살렸다는 글 창').not.toContain('SAVED');
    await H.expectStatus(a.page, nick(x), 'dead', 20_000);
});

test('A09-H-048 6명 판(사람 2 + 봇 4) ㄴ이 탭을 닫은 동안 밤에 광대 봇이 ㄴ 암살 → ㄴ 다시 열면 사망 창, 다른 탭 방 만들기 됨(탈주 아님) @game @hard', async ({ user, players, table }) => {
    test.setTimeout(240_000);
    const [a, b] = await H.openPeople(user, players, 2);
    const t = await H.seat(table, [a, b], { n: 6 });
    const [joker] = await H.botsBy(t, 'JOKER');
    await night.toTurn(t, 'JOKER', { dayIndex: 1 });
    const since = Date.now();
    await b.page.close();
    const dropAt = await K.droppedAt(t, U(b), since);
    expect((await night.botNight(t, joker, U(b)))?.ok, '광대 봇이 끊긴 ㄴ을 고름').toBe(true);
    const day = await night.toDay(t, { dayIndex: 2 });
    expect(K.rowOf(day, U(b)).alive, '밤에 살해됨').toBe(false);
    expect(Date.now() - dropAt, '끊긴 지 60초 안에 죽음 (탈락이 아님)').toBeLessThan(GRACE_MS);

    const tab = await b.context.newPage();
    H.collectDialogs(tab);
    await tab.goto('/ingame');
    const dead = await K.waitDeadChoice(tab);
    await expectReadable(dead.getByText('당신은 사망했습니다.', { exact: true }));
    const other = await b.context.newPage();
    H.collectDialogs(other);
    await K.createRoomOk(other);
    expect(await H.desertionRows(U(b)), '탈주 줄 없음').toEqual([]);
});

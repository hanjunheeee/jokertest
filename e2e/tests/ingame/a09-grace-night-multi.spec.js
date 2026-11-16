'use strict';

// 밤에 끊겨 빠지는 어려운 브라우저 시험 (PC, 사람 2명) — 보호를 고른 의사가 탈락해도 보호는 남음(결정)·대상을 고른 광대가 탈락하면 암살 지워짐·끊긴 동안 밤에 살해되면 탈주 아님
// 목록 A09-끊김-나가기-탈주.md A09-H-032·033·048, 60초는 손잡이 / 의사 보호는 사용자 결정(2026-11-16 아침 3번)대로 — 모이는지만: npx playwright test --list tests/ingame/a09-grace-night-multi.spec.js
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

test('A09-H-032 7명 판(사람 2 + 봇 5) 의사 ㄴ이 보호를 고른 뒤 탭 닫음 → 손잡이 탈락 → 결정대로 보호는 남아 낮에 ㄱ 화면 "지난밤 의사가 공격받은 사람을 살려냈습니다" @game @hard', async ({ user, players, table }) => {
    test.setTimeout(240_000);
    const [a, b] = await H.openPeople(user, players, 2);
    const t = await H.seat(table, [a, b], { n: 7, humanRoles: ['CITIZEN', 'DOCTOR'] });
    const [joker] = await H.botsBy(t, 'JOKER');
    const [x] = await H.botsBy(t, 'CITIZEN');
    await night.toTurn(t, 'JOKER', { dayIndex: 1 });
    expect((await night.botNight(t, joker, U(x)))?.ok, '광대 봇이 X를 고름').toBe(true);
    await A.waitState(t, (g) => g.phase === 'NIGHT' && g.nightTurnRole === 'DOCTOR', { timeout: 20_000, message: '의사 차례' });
    await night.nightActUi(b.page, nick(x), night.ACTION_LABELS.DOCTOR);
    await closeAndExpire(t, b);

    const day = await night.toDay(t, { dayIndex: 2 });
    expect(K.rowOf(day, U(b)).alive, '의사 ㄴ은 탈락').toBe(false);
    expect(K.rowOf(day, U(x)).alive, '보호가 남아 X가 살아남음').toBe(true);
    const report = a.page.locator('[data-ingame-dawn-report="SAVED"]');
    await expect(report).toContainText(H.TEXT.saved, { timeout: 20_000 });
    await expectReadable(report.getByText(H.TEXT.saved));
});

test('A09-H-033 8명 판(사람 2 + 봇 6, 광대 2) 광대 ㄴ만 대상을 고른 뒤 탭 닫음 → 손잡이 탈락 → 암살 지워져 낮에 아무 일 없음(낮 시작 연출 없음) @game @hard @smoke', async ({ user, players, table }) => {
    test.setTimeout(240_000);
    const [a, b] = await H.openPeople(user, players, 2);
    const t = await H.seat(table, [a, b], { n: 8, humanRoles: ['CITIZEN', 'JOKER'], settings: { jokerCount: 2 } });
    const [x] = await H.botsBy(t, 'CITIZEN');
    await K.toDay(t);
    await A.calm(a.page);
    // ㄱ 화면 기록: 단계 안내 창은 바로 닫고, 낮 시작 연출(암살 영상·살림 글 창)이 뜨면 적힘
    await night.recordUi(a.page, { autoConfirm: true });
    await night.toTurn(t, 'JOKER', { dayIndex: 1 });
    await night.nightActUi(b.page, nick(x), night.ACTION_LABELS.JOKER);
    // 동료 광대 봇은 안 고름 → 차례가 열린 채로 ㄴ 탈락
    await closeAndExpire(t, b);

    const day = await night.toDay(t, { dayIndex: 2 });
    expect(K.rowOf(day, U(b)).alive).toBe(false);
    expect(K.rowOf(day, U(x)).alive, '암살이 지워져 X 산 채').toBe(true);
    // ㄱ 화면이 둘째 낮까지 따라온 뒤: 밤 뒤 낮 안내는 떴고, 암살 영상·낮 시작 글 창은 한 번도 안 뜸
    await expect.poll(async () => {
        const rec = await night.readUi(a.page);
        const lastNight = rec?.entrances.lastIndexOf('NIGHT') ?? -1;
        return lastNight >= 0 && rec.entrances.lastIndexOf('DAY') > lastNight;
    }, { timeout: 30_000, message: 'ㄱ 화면 둘째 낮' }).toBe(true);
    const rec = await night.readUi(a.page);
    expect(rec.kills, '암살 영상').toBe(0);
    expect(rec.dawnReports, '낮 시작 글 창').toEqual([]);
    expect(rec.dawnMessages, '살해 글').toEqual([]);
    await H.expectStatus(a.page, nick(x), 'alive');
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

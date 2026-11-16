'use strict';

// 점검 시작 시각 강제 종료 브라우저 시험 (PC, 사람 2명) — 예약 시각이 되면 도는 판은 승패 없이 끝나 "로비로 가기", 대기방은 닫힘 안내 → 로비
// 목록 A18-설정-배포-광고.md 번호 A18-H-001·002 — 점검은 서버 전체에 걸려 @serial, 시작 시각은 손잡이 없이 진짜 시계(20초 진짜로 기다림), 돌리지 않고 모임만: npx playwright test --list --no-deps tests/maintenance/a18-maintenance-force-end.spec.js
const { test, expect, ui, e2e } = require('../../helpers/fixtures');
const { expectReadable } = require('../../helpers/visible');
const { customRoleSettings } = require('../../helpers/game');
const { wallet } = require('../store/store-tools');
const L = require('../ingame/a-day/_lib');
const K = require('./_a18-kit');

test.afterEach(async () => {
    // 실패해도 점검이 남지 않게 (다른 시험 방 만들기가 막힘)
    await K.clearMaint();
});

/** 강제 종료 큰 안내 제목·설명이 사람 눈에 읽힘 */
async function expectForced(page, title, detail = null) {
    await expect(K.noticeTitle(page)).toHaveText(title, { timeout: 30_000 });
    await expectReadable(K.noticeTitle(page), { large: true });
    if (detail) await expectReadable(K.noticeLine(page, detail));
    await expectReadable(K.noticeButton(page, '로비로 가기'));
}

/** "로비로 가기" → 로비, 강제 종료 안내는 사라짐 (점검 중 안내가 따로 뜰 수는 있음) */
async function goLobby(page) {
    await K.noticeButton(page, '로비로 가기').click();
    await expect(page).toHaveURL(/\/lobby/, { timeout: 15_000 });
    await expect(K.noticeButton(page, '로비로 가기')).toHaveCount(0);
}

test('A18-H-001 6명 판(사람 2 + 봇 4) 20초 뒤 예약 → 두 화면 예약 안내 → 시각에 둘 다 "점검으로 판이 끝났어요" → 로비, 점검 끈 뒤 방 만들기 됨(탈주 글 없음), 잔액 그대로 @game @hard @serial @smoke', async ({ user, players, table }) => {
    test.setTimeout(240_000);
    const other = await players.add();
    const people = [user, other];
    const dialogs = people.map((p) => K.collectDialogs(p.page));
    const t = await table.setup({
        humans: people,
        bots: 4,
        settings: { ...K.LONG_TIMES, ...customRoleSettings({ JOKER: 1 }) },
        roles: ({ humans, bots }) => Object.fromEntries([
            ...humans.map((h) => [K.U(h), 'CITIZEN']),
            ...bots.map((b, i) => [K.U(b), i === 0 ? 'JOKER' : 'CITIZEN']),
        ]),
    });
    const start = await t.state();
    expect(start.players, '판 인원').toHaveLength(6);
    for (const p of people) expect(L.playerOf(start, K.U(p))?.role, '미리 정한 직업').toBe('CITIZEN');
    await L.toDay(t);
    const before = await Promise.all(people.map(async (p) => Number((await wallet(K.U(p))).gold)));

    const { startsAtMs } = await K.setMaint({ enabled: true, startsInMs: 20_000 });
    for (const p of people) await expect(K.noticeTitle(p.page)).toHaveText(K.TEXT.SCHEDULED_TITLE, { timeout: 15_000 });
    // 시각 전엔 판 그대로
    await K.sleepUntil(startsAtMs - 3000);
    expect(await t.state(), '시각 전엔 판 있음').not.toBeNull();

    for (const p of people) await expectForced(p.page, K.TEXT.FORCED_GAME_TITLE, K.TEXT.FORCED_GAME_DETAIL);
    await expect.poll(async () => (await t.state()) === null, { timeout: 20_000, message: '판이 서버에서 지워짐' }).toBe(true);
    for (const p of people) await goLobby(p.page);

    // 점검을 끄면 바로 방 만들기 됨 (탈주 대기 없음)
    await K.clearMaint();
    for (const p of people) {
        const room = await K.createRoomOk(p);
        expect(room.hostUuid).toBe(K.U(p));
    }
    dialogs.forEach((got, i) => expect(got.filter((m) => m.includes('탈주로')), `사람 ${i + 1} 탈주 글`).toEqual([]));
    // 승패 없이 끝나 판 골드 없음
    for (let i = 0; i < people.length; i += 1) {
        expect(Number((await wallet(K.U(people[i]))).gold), `사람 ${i + 1} 잔액 그대로`).toBe(before[i]);
    }
});

test('A18-H-002 5명 방(사람 2 + 봇 3, 시작 전) 20초 뒤 예약 → 시각에 두 화면 "점검으로 대기방이 닫혔어요" → 로비 @hard @serial', async ({ user, players, bots }) => {
    test.setTimeout(180_000);
    const other = await players.add();
    const people = [user, other];
    const [host, ...rest] = await bots.spawn(3);
    const room = await host.createRoom({ maxPlayers: 5 });
    for (const bot of rest) await bot.joinByCode(room.roomCode);
    for (const p of people) await ui.joinRoomByCodeUi(p.page, room.roomCode);
    await expect.poll(async () => (await e2e.roomOf(host.uuid))?.players?.length, { message: '방 인원' }).toBe(5);

    const { startsAtMs } = await K.setMaint({ enabled: true, startsInMs: 20_000 });
    for (const p of people) await expect(K.noticeTitle(p.page)).toHaveText(K.TEXT.SCHEDULED_TITLE, { timeout: 15_000 });
    await K.sleepUntil(startsAtMs - 3000);
    expect((await e2e.roomOf(host.uuid))?.roomId, '시각 전엔 방 그대로').toBe(room.roomId);

    for (const p of people) await expectForced(p.page, K.TEXT.FORCED_ROOM_TITLE);
    for (const p of people) await goLobby(p.page);
    for (const p of people) expect(await e2e.roomOf(K.U(p)), '방에서 빠짐').toBeNull();
    expect(await e2e.roomOf(host.uuid), '방 닫힘').toBeNull();
});

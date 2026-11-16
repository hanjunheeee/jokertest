'use strict';

// 대기방 방장 넘김·끊김 15초·방 삭제 브라우저 시험 (PC, 어려움 — 사람 여럿) — 들어온 차례대로 방장, 탭 닫음·새로고침 15초, 삭제하면 모두 방 목록
// 목록 A01b-입장-준비-추방-초대.md 번호 A01-H-507~510·513 (사람 2~3 + 봇, 판 안 씀, 15초는 늘 진짜로 기다림 @realtime)
const { test, expect, ui, e2e } = require('../../helpers/fixtures');
const { findRoomRow } = require('./roomHelpers');
const K = require('./_a01b-kick-kit');

const { U, TEXT, HOST_BUTTONS } = K;
const back = (page) => page.getByRole('button', { name: '멀티플레이 선택으로 돌아가기' });

// 사람 방장 A + 사람 손님들(코드 입장 차례대로) + 봇 → 방장 화면 인원이 맞을 때까지
async function peopleRoom(host, guests, bots, { maxPlayers = 6, botCount = 3, open = false } = {}) {
    const room = await K.humanRoom(host, { maxPlayers, open });
    for (const g of guests) await ui.joinRoomByCodeUi(g.page, room.roomCode);
    const list = await K.joinBots(bots, botCount, room.roomCode);
    await K.expectParty(host.page, 1 + guests.length + botCount);
    return { room, list };
}

// 방장 단추 넷이 다 보임 / 손님 단추 그대로 (방장 단추 없음)
async function expectHost(page, o = {}) {
    for (const name of HOST_BUTTONS) await expect(K.hostButton(page, name), `${name} 단추`).toBeVisible(o);
}
async function expectGuest(page) {
    await expect(K.hostButton(page, '방 나가기')).toBeVisible();
    await expect(K.hostButton(page, '게임시작')).toHaveCount(0);
    await expect(K.kickButton(page)).toHaveCount(0);
}

test('A01-H-507 사람 셋 방장 넘김 — A 나감 → B 방장·C 손님 그대로 → B 나감 → C 방장 (정원 6 · 사람 3 + 봇 2, 들어온 차례 A·B·C) @hard @smoke', async ({ user, players, bots }) => {
    const a = user;
    const b = await players.add();
    const c = await players.add();
    await peopleRoom(a, [b, c], bots, { botCount: 2 });

    await back(a.page).click();
    await expect(a.page).toHaveURL(/\/multiplay/);

    await expectHost(b.page);
    // 방장 바뀜 뒤 나감 알림이 옴 → C 인원이 줄었으면 방장 바뀜도 받은 뒤
    await K.expectParty(c.page, 4);
    await expectGuest(c.page);
    expect((await e2e.roomOf(U(c)))?.hostUuid, '서버 방장 B').toBe(U(b));

    await back(b.page).click();
    await expect(b.page).toHaveURL(/\/multiplay/);

    await expectHost(c.page);
    await K.expectParty(c.page, 3);
    expect((await e2e.roomOf(U(c)))?.hostUuid, '서버 방장 C').toBe(U(c));
});

test('A01-H-508 손님 사람이 탭을 닫으면 방장 화면 14초엔 자리 있음, 16초 안 빠짐 (정원 6 · 사람 2 + 봇 3) @hard @realtime', async ({ user, players, bots }) => {
    const a = user;
    const b = await players.add();
    await peopleRoom(a, [b], bots);

    const closedAt = Date.now();
    await b.page.close();

    await K.sleepUntil(closedAt + 14_000);
    await K.expectParty(a.page, 5, { timeout: 500 });
    expect(await K.seatsOf(U(a)), '14초엔 서버 명단에 있음').toContain(U(b));
    expect(Date.now() - closedAt, '15초 전에 본 것').toBeLessThan(K.ROOM_GRACE_MS);

    await K.expectParty(a.page, 4, { timeout: Math.max(1, closedAt + 16_000 - Date.now()) });
    expect(await K.seatsOf(U(a))).not.toContain(U(b));
});

test('A01-H-509 손님 사람이 준비 뒤 새로고침 → 방장 화면에서 손님 자리 20초 뒤에도 있음 (정원 6 · 사람 2 + 봇 3) @hard @realtime', async ({ user, players, bots }) => {
    const a = user;
    const b = await players.add();
    const { room } = await peopleRoom(a, [b], bots);
    await ui.readyUi(b.page);
    await expect(b.page.getByRole('button', { name: '준비취소', exact: true })).toBeVisible();

    const reloadedAt = Date.now();
    await b.page.reload();
    await expect(b.page).toHaveURL(/\/game-matching/);

    await K.sleepUntil(reloadedAt + 20_000);
    await K.expectParty(a.page, 5, { timeout: 500 });
    expect(await K.seatsOf(U(a)), '20초 뒤에도 서버 명단에 있음').toContain(U(b));
    expect((await e2e.roomOf(U(b)))?.roomId, '손님 같은 방').toBe(room.roomId);
});

test('A01-H-510 방장 사람이 탭을 닫으면 16초 안 손님 사람 화면에 방장 단추 (정원 6 · 사람 2 + 봇 3) @hard @realtime', async ({ user, players, bots }) => {
    const a = await players.add();
    const b = user;
    await peopleRoom(a, [b], bots);
    await expectGuest(b.page);

    const closedAt = Date.now();
    await a.page.close();

    await expect(K.hostButton(b.page, '게임시작')).toBeVisible({ timeout: Math.max(1, closedAt + 16_000 - Date.now()) });
    await expectHost(b.page, { timeout: 2_000 });
    expect((await e2e.roomOf(U(b)))?.hostUuid, '서버 방장 B').toBe(U(b));
});

test('A01-H-513 방장 삭제 → 손님 사람 둘 모두 방 목록, 목록에 그 방 없음 (정원 7 · 사람 3 + 봇 2) @hard', async ({ user, players, bots }) => {
    const a = user;
    const b = await players.add();
    const c = await players.add();
    await peopleRoom(a, [b, c], bots, { maxPlayers: 7, botCount: 2, open: true });
    const asked = K.answerNextConfirm(a.page, true);

    await K.hostButton(a.page, '방 삭제하기').click();

    expect(await asked).toBe(TEXT.deleteConfirm);
    for (const p of [a, b, c]) await expect(p.page).toHaveURL(/\/multiplay/, { timeout: 15_000 });
    expect(await e2e.roomOf(U(b)), 'B 방 자리 없음').toBeNull();
    expect(await e2e.roomOf(U(c)), 'C 방 자리 없음').toBeNull();
    expect(await findRoomRow(b.page, `${K.nick(a)}의 방`, { timeoutMs: 3_000 }), '목록에 없음').toBeNull();
});

'use strict';

// PC 공개 방 목록 브라우저 시험 — 봇이 만든 방이 줄로 뜸, 코드 배지(코드 글자는 안 보임)·마감·시작하면 사라짐·설정·공개 방식·인원 바뀜이 새로고침 없이 반영
// 목록 A01a-방만들기-설정-시작.md 번호 A01-E-033~042, 돌리지 않고 모임만: npx playwright test --list tests/room/a01-room-list.spec.js
const { test, expect } = require('../../helpers/fixtures');
const { expectReadable } = require('../../helpers/visible');
const { e2e } = require('../../helpers/internal');
const { openRoomList, findRoomRow, botUpdateSettings } = require('./roomHelpers');
const K = require('./_a01a-kit');

/** 봇 방장 방 하나 (+ 들어온 봇 joiners명) → { host, list, room, title } */
async function botRoom(bots, { joiners = 0, ...settings } = {}) {
    const list = await bots.spawn(1 + joiners);
    const host = list[0];
    const room = await host.createRoom({ accessType: 'open', maxPlayers: 10, ...settings });
    for (const b of list.slice(1)) await b.joinByCode(room.roomCode);
    return { host, list, room, title: `${host.nickname}의 방` };
}

/** 목록에서 그 방 줄 (못 찾으면 실패) */
async function rowOf(page, title) {
    const row = await findRoomRow(page, title, { timeoutMs: 15_000 });
    expect(row, `공개 방 목록에 "${title}" 줄`).not.toBeNull();
    return row;
}

/** 그 방 줄이 목록 어느 쪽에도 없어질 때까지 */
async function expectRowGone(page, title) {
    await expect.poll(async () => (await findRoomRow(page, title, { timeoutMs: 1500 })) === null, { timeout: 15_000 }).toBe(true);
}

test('A01-E-033 봇이 만든 공개 방(정원 10) → 목록에 "봇닉의 방" 줄, "1/10" @smoke', async ({ user, bots }) => {
    const { title } = await botRoom(bots);
    await openRoomList(user.page);
    const row = await rowOf(user.page, title);
    await expect(row.getByText(title, { exact: true })).toBeVisible();
    await expect(row.getByText('1/10', { exact: true })).toBeVisible();
});

test('A01-E-034 봇 코드 방 → 줄에 "코드" 배지, 코드 6자리는 화면 어디에도 없음', async ({ user, bots }) => {
    const { title, room } = await botRoom(bots, { accessType: 'code' });
    await openRoomList(user.page);
    const row = await rowOf(user.page, title);
    await expect(row.getByText('코드', { exact: true })).toBeVisible();
    await expect(user.page.getByText(room.roomCode)).toHaveCount(0);
    await expect(row).not.toContainText(room.roomCode);
});

test('A01-E-035 봇 5명 정원 5 방 → "마감" 배지 읽힘, 줄 단추 꺼짐', async ({ user, bots }) => {
    const { title } = await botRoom(bots, { maxPlayers: 5, joiners: 4 });
    await openRoomList(user.page);
    const row = await rowOf(user.page, title);
    await expect(row).toContainText('5/5');
    await expectReadable(row.getByText('마감', { exact: true }));
    await expect(row).toBeDisabled();
});

test('A01-E-036 봇 5명 방 시작 → 줄이 새로고침 없이 사라짐 @game', async ({ user, bots }) => {
    const { title, host, list, room } = await botRoom(bots, { maxPlayers: 5, joiners: 4 });
    await openRoomList(user.page);
    await rowOf(user.page, title);
    const live = await e2e.roomOf(host.uuid);
    for (const b of list) await b.setReady(live.roomId, live.settingsVersion);
    await e2e.setRoles(K.autoRoles([], list), { roomId: room.roomId });
    await host.startGame(live.roomId, live.settingsVersion);
    await expectRowGone(user.page, title);
});

test('A01-E-037 봇 방장이 광대 2→1로 바꿈 → 줄 요약이 "광대 1"로', async ({ user, bots }) => {
    const { title, host } = await botRoom(bots, { jokerCount: 2 });
    await openRoomList(user.page);
    const row = await rowOf(user.page, title);
    await expect(row).toContainText('광대 2');
    const r = await botUpdateSettings(host, { jokerCount: 1 });
    expect(r?.ok, `설정 바꾸기 답 ${JSON.stringify(r)}`).toBe(true);
    await expect(row).toContainText('광대 1');
    await expect(row).not.toContainText('광대 2');
});

test('A01-E-038 봇 방장 공개→코드 → "코드" 배지 생김, 다시 공개 → 배지 없어짐', async ({ user, bots }) => {
    const { title, host } = await botRoom(bots);
    await openRoomList(user.page);
    const row = await rowOf(user.page, title);
    const badge = row.getByText('코드', { exact: true });
    await expect(badge).toHaveCount(0);
    expect((await botUpdateSettings(host, { accessType: 'code' }))?.ok).toBe(true);
    await expect(badge).toBeVisible();
    expect((await botUpdateSettings(host, { accessType: 'open' }))?.ok).toBe(true);
    await expect(badge).toHaveCount(0);
});

test('A01-E-039 봇 하나 더 들어옴 → 줄 인원 "2/10"', async ({ user, bots }) => {
    const { title, room } = await botRoom(bots);
    await openRoomList(user.page);
    const row = await rowOf(user.page, title);
    await expect(row.getByText('1/10', { exact: true })).toBeVisible();
    const [guest] = await bots.spawn(1);
    await guest.joinByCode(room.roomCode);
    await expect(row.getByText('2/10', { exact: true })).toBeVisible();
});

test('A01-E-040 봇 3개가 한꺼번에 방 만듦 → 줄 3개 다 보임', async ({ user, bots }) => {
    const hosts = await bots.spawn(3);
    await openRoomList(user.page);
    // 0.5초 묶음 방송 안에 셋 다 (동시에 보냄)
    await Promise.all(hosts.map((h) => h.createRoom({ accessType: 'open', maxPlayers: 10 })));
    for (const h of hosts) await rowOf(user.page, `${h.nickname}의 방`);
});

test('A01-E-041 [지금 동작] 봇 방 자동·광대 2·60·60·90 → 줄 요약 "광대 2 / 토론 60초 · 투표 60초 · 밤 90초"', async ({ user, bots }) => {
    // 재판 시간은 안 보냄 → 투표를 따라가 요약에 안 나옴
    const { title } = await botRoom(bots, {
        jokerCount: 2, dayDiscussionTime: 60, dayVoteTime: 60, tribunalTime: undefined, nightActionTime: 90,
    });
    await openRoomList(user.page);
    const row = await rowOf(user.page, title);
    await expect(row.getByText('광대 2 / 토론 60초 · 투표 60초 · 밤 90초', { exact: true })).toBeVisible();
});

test('A01-E-042 공개 방 줄 제목·인원 글이 읽힘', async ({ user, bots }) => {
    const { title } = await botRoom(bots);
    await openRoomList(user.page);
    const row = await rowOf(user.page, title);
    await expectReadable(row.getByText(title, { exact: true }));
    await expectReadable(row.getByText('1/10', { exact: true }));
});

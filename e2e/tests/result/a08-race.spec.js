'use strict';

// 판 끝 뒤 단추를 같은 때·거의 같이 누르는 브라우저 시험 (PC, 어려움) — 동시에 "대기방으로", 두 단추 연달아, 누른 직후 로비 주소, 느린 연결, 마지막 한 칸 다툼
// 목록 A08-판끝-같은방.md 번호 A08-H-007·017~019·047·048 (늦은 답은 화면 소켓 길목으로 서버 답을 늦춰 만듦)
const { test, expect } = require('../../helpers/fixtures');
const { expectReadable } = require('../../helpers/visible');
const { e2e } = require('../../helpers/internal');
const { customRoleSettings } = require('../../helpers/game');
const { gotoLobby } = require('../../helpers/ui');
const { hostGame, createRoomUi } = require('../room/roomHelpers');
const {
    U, TEXT, returnButton, lobbyButton, leaveNotice, startButton, hostSeat, openHumans, rolesFor, expectRoles, seatTable, seatHosted,
    jokerLeaves, killByNight, killByHuman, allAtResult, pressReturn, botReturn, seatsOf, expectParty, gateSocket,
} = require('./_a08-hard-kit');

const sorted = (list) => [...list].sort();

// 그 화면에서 뜬 브라우저 확인 창 수 세기 (뜨면 확인을 눌러 흐름을 안 막음)
function countConfirms(page) {
    const seen = { count: 0 };
    page.on('dialog', (dialog) => {
        seen.count += 1;
        dialog.accept().catch(() => {});
    });
    return seen;
}

test('A08-H-007 사람 5명 판: 다섯이 같은 때 "대기방으로" → 명단 5명 겹침 없음, 방장 = 원래 방장 @game @hard', async ({ players }) => {
    test.setTimeout(420_000);
    const people = await openHumans(players, 5);
    const [a, b, c, d, e] = people;
    // ㄱ이 방장, 광대 ㄹ·ㅁ 중 ㄹ이 밤에 ㄷ을 암살 → 광대 승 (아무도 안 나감)
    const first = rolesFor(people, [d, e]);
    const t = await hostGame({ host: a, guests: [b, c, d, e], roles: first, settings: { jokers: 2 } });
    await expectRoles(t.gameId, first);
    await killByHuman(t, d, c);
    await allAtResult(people);

    await Promise.all(people.map((p) => returnButton(p.page).click()));
    for (const p of people) await expect(p.page).toHaveURL(/\/game-matching/, { timeout: 20_000 });

    const room = await e2e.roomOf(U(a));
    expect(room.roomCode, '같은 코드').toBe(t.roomCode);
    expect(sorted(room.players.map((p) => p.uuid)), '명단 5명 (한 사람 한 번씩)').toEqual(sorted(people.map(U)));
    expect(room.hostUuid, '방장 = 원래 방장').toBe(U(a));
    await expect(startButton(a.page)).toBeVisible();
    for (const p of [b, c, d, e]) await expect(startButton(p.page)).toHaveCount(0);
    for (const p of people) await expectParty(p.page, 5);
});

test('A08-H-017 5명 판(사람 2 + 봇 3): ㄱ이 "대기방으로" 직후 "로비로" 자리를 누름 → 대기방으로만 감, 로비 확인 창 안 뜸, 끝난 판 묶임 안 남음 @game @hard', async ({ players, table }) => {
    test.setTimeout(300_000);
    const [a, b] = await openHumans(players, 2);
    const page = a.page;
    const gate = await gateSocket(page);
    const { t, joker } = await seatTable(table, [a, b], 3);
    await jokerLeaves(t, joker);
    await allAtResult([a, b]);

    const confirms = countConfirms(page);
    const box = await lobbyButton(page).boundingBox();
    // 답이 1.5초 늦게 오게 해서 두 번째 누름이 "누르는 중"에 떨어지게 함
    gate.delayMs = 1500;
    await returnButton(page).click();
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    await expect(lobbyButton(page)).toBeDisabled();
    gate.delayMs = 0;

    await expect(page).toHaveURL(/\/game-matching/, { timeout: 20_000 });
    expect(confirms.count, '로비 확인 창').toBe(0);
    // 서버: 방 자리는 있고 끝난 판 묶임은 없음 (둘 다 남지 않음)
    expect(await seatsOf(U(a)), '서버 방 명단').toEqual([U(a)]);
    await expect.poll(async () => (await e2e.gameOf(U(a)))?.gameId ?? null, { message: '끝난 판 묶임' }).toBeNull();
    await expect(b.page).toHaveURL(/\/gameresult/);
});

test('A08-H-018 [B06-2] 6명 판(사람 2 + 봇 4): ㄱ이 "대기방으로"를 누르고 답이 오기 전에 로비 주소로 감 → 서버 대기방 명단에 ㄱ 없음, 방 만들기 됨 @game @hard', async ({ players, table }) => {
    test.setTimeout(300_000);
    const [a, b] = await openHumans(players, 2);
    const gate = await gateSocket(a.page);
    const { t, joker, host } = await seatTable(table, [a, b], 4);
    await jokerLeaves(t, joker);
    await allAtResult([a, b]);
    // 방 명단을 볼 사람: 원래 방장 봇이 먼저 들어가 있음
    await botReturn(host, t.gameId);

    gate.delayMs = 4000;
    await returnButton(a.page).click();
    await expect(lobbyButton(a.page)).toBeDisabled();
    // 답이 아직 안 온 채 주소로 로비에 감 (서버는 이미 자리를 줬을 수 있음 → 로비 입장이 정리)
    gate.delayMs = 0;
    await gotoLobby(a.page);

    await expect.poll(() => seatsOf(U(host)), { message: '서버 대기방 명단에 ㄱ 없음' }).toEqual([U(host)]);
    expect(await e2e.roomOf(U(a)), 'ㄱ 방 자리 없음').toBeNull();
    const room = await createRoomUi(a, {});
    expect(room.roomCode, '새 방은 다른 코드').not.toBe(t.roomCode);
    expect(room.players.map((p) => p.uuid), '새 방 명단').toEqual([U(a)]);
});

test('A08-H-019 [B06-2] 5명 판(모바일 ㄱ + PC ㄴ + 봇 3): 느린 연결에서 ㄱ이 "대기방으로" → 기다리는 동안 "로비로" 꺼짐 → 대기방에 들어감 @game @hard', async ({ players, table }) => {
    test.setTimeout(300_000);
    const a = await players.add({ mobile: true });
    const b = await players.add();
    const page = a.page;
    const gate = await gateSocket(page);
    const { t, joker } = await seatTable(table, [a, b], 3);
    await jokerLeaves(t, joker);
    await allAtResult([a, b]);

    const confirms = countConfirms(page);
    gate.delayMs = 4000;
    await returnButton(page).click();
    await expect(lobbyButton(page)).toBeDisabled();
    await expect(returnButton(page)).toBeDisabled();
    await expect(page.getByText('이동 중..', { exact: true })).toBeVisible();
    // 꺼진 "로비로"는 눌러도 아무 일 없음
    await lobbyButton(page).click({ force: true, timeout: 2000 }).catch(() => {});
    gate.delayMs = 0;

    await expect(page).toHaveURL(/\/game-matching/, { timeout: 20_000 });
    expect(confirms.count, '로비 확인 창').toBe(0);
    await expectParty(page, 1);
    expect(await seatsOf(U(a)), '서버 방 명단').toEqual([U(a)]);
});

test('A08-H-047 6명 판(사람 3 + 봇 3, 정원 6): 원래 방장이 들어온 방의 마지막 한 칸을 ㄴ "대기방으로"와 새 사람 코드 입장이 같은 때 다툼 → 한 명만 들어감, 다른 쪽은 가득 참 @game @hard', async ({ players, table, bots }) => {
    test.setTimeout(420_000);
    const [a, b, c] = await openHumans(players, 3);
    // 광대 2(ㄷ + 방장 봇) → 방장 봇이 두 밤에 봇 둘을 암살 → 광대 승 (아무도 안 나가 봇 3이 다 돌아옴)
    const t = await table.setup({
        humans: [a, b, c],
        bots: 3,
        settings: { ...customRoleSettings({ JOKER: 2 }), maxPlayers: 6 },
        roles: ({ bots: list }) => rolesFor([a, b, c], [c, list[0]]),
    });
    const [host, v1, v2] = t.bots;
    await expectRoles(t.gameId, rolesFor([a, b, c], [c, host]));
    await killByNight(t, [host], [U(v1), U(v2)]);
    await allAtResult([a, b, c]);

    // ㄴ만 빼고 5명이 들어감 (원래 방장 봇 포함 → 남겨 둔 자리 없음) → 정원 6에 한 칸 남음
    for (const bot of t.bots) await botReturn(bot, t.gameId);
    await pressReturn(a.page);
    await pressReturn(c.page);
    await expectParty(a.page, 5);
    await expect(hostSeat(a.page)).toHaveCount(0);

    const [fresh] = await bots.spawn(1);
    const [, joined] = await Promise.allSettled([returnButton(b.page).click(), fresh.joinByCode(t.roomCode)]);
    await expect.poll(async () => (await seatsOf(U(host))).length, { message: '정원 6이 참' }).toBe(6);
    const seats = await seatsOf(U(host));
    const bIn = seats.includes(U(b));
    expect([bIn, seats.includes(U(fresh))].filter(Boolean), '둘 중 한 명만 들어감').toHaveLength(1);

    if (bIn) {
        // 새 사람 쪽이 가득 참으로 거절됨
        await expect(b.page).toHaveURL(/\/game-matching/, { timeout: 20_000 });
        expect(joined.status, '새 사람 입장').toBe('rejected');
        expect(String(joined.reason?.message), '새 사람 거절 까닭').toContain('ROOM_FULL');
    } else {
        // ㄴ 쪽이 가득 참 글을 봄
        expect(joined.status, '새 사람 입장').toBe('fulfilled');
        await expect(leaveNotice(b.page)).toHaveText(TEXT.returnFull);
        await expectReadable(leaveNotice(b.page));
        await expect(b.page).toHaveURL(/\/gameresult/);
    }
});

test('A08-H-048 5명 판(사람 3 + 봇 2): 원래 방장 ㄱ과 ㄴ이 같은 때 "대기방으로" → 방장은 ㄱ @game @hard @smoke', async ({ players, bots }) => {
    test.setTimeout(300_000);
    const [a, b, c] = await openHumans(players, 3);
    const { t, joker } = await seatHosted(bots, a, [b, c], 2);
    await jokerLeaves(t, joker);
    await allAtResult([a, b, c]);

    await Promise.all([returnButton(a.page).click(), returnButton(b.page).click()]);
    for (const p of [a, b]) await expect(p.page).toHaveURL(/\/game-matching/, { timeout: 20_000 });

    await expect(startButton(a.page)).toBeVisible();
    await expect(startButton(b.page)).toHaveCount(0);
    await expect(hostSeat(b.page)).toHaveCount(0);
    const room = await e2e.roomOf(U(a));
    expect(room.hostUuid, '서버 방장').toBe(U(a));
    expect(sorted(room.players.map((p) => p.uuid)), '서버 방 명단').toEqual(sorted([a, b].map(U)));
    await expect(c.page).toHaveURL(/\/gameresult/);
});

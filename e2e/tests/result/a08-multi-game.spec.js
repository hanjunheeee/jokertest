'use strict';

// 같은 방에서 여러 판을 이어 하는 브라우저 시험 (PC, 어려움) — 판마다 같은 코드·같은 설정, 둘째 판 중 코드 입장 거절, 줄었다가 채워 시작, 첫 판 결과 화면에 남은 사람, 둘째 판 중 방장 바뀜
// 목록 A08-판끝-같은방.md 번호 A08-H-011~014·024·026·027·044·049 (180초는 손잡이 closeResults로, 판은 손잡이로 넘겨 끝냄)
const { test, expect } = require('../../helpers/fixtures');
const { expectReadable } = require('../../helpers/visible');
const { e2e } = require('../../helpers/internal');
const { customRoleSettings } = require('../../helpers/game');
const { joinRoomByCodeUi, closePhaseNotice } = require('../../helpers/ui');
const { hostGame, closeReveals, fillSettings } = require('../room/roomHelpers');
const {
    U, TEXT, returnButton, leaveNotice, startButton, hostSeat, openHumans, rolesFor, expectRoles, findJokerBot, seatTable, seatHosted,
    jokerLeaves, voteOutJoker, killByNight, killByHuman, leaveGameUi, allAtResult, pressReturn, botReturn, expectParty,
    expectRoomCodeShown, codeEntryAlert, readyHumans, readyBots, startByHuman, startByBot, expectStartBlocked, readRoomSettings, secondsLeft,
} = require('./_a08-hard-kit');

/**
 * 사람 5명(봇 없음) 판을 끝내고 다섯이 다 같은 대기방으로 돌아온 모습까지 — ㄱ이 방장
 * 판1: 광대 ㄹ·ㅁ, ㄹ이 화면으로 ㄷ 암살 → 광대 승 (아무도 안 나감)
 */
async function fiveBackInRoom(players) {
    const people = await openHumans(players, 5);
    const [a, b, c, d, e] = people;
    const first = rolesFor(people, [d, e]);
    const t = await hostGame({ host: a, guests: [b, c, d, e], roles: first, settings: { jokers: 2 } });
    await expectRoles(t.gameId, first);
    await killByHuman(t, d, c);
    await allAtResult(people);
    for (const p of people) await pressReturn(p.page);
    for (const p of people) await expectParty(p.page, 5);
    return { people, t };
}

// 다섯이 다시 같은 코드 대기방에 있는지 (화면 방 코드·서버 방 값)
async function expectSameRoomAgain(people, code) {
    const [a] = people;
    for (const p of people) await pressReturn(p.page);
    for (const p of people) await expectParty(p.page, 5);
    await expectRoomCodeShown(a.page, code);
    const room = await e2e.roomOf(U(a));
    expect(room.roomCode, '서버 방 코드').toBe(code);
    expect(room.hostUuid, '서버 방장 = 원래 방장').toBe(U(a));
    expect(room.players, '서버 방 5명').toHaveLength(5);
}

test('A08-H-011 사람 5명 판: 판1 끝 → 전원 대기방으로·준비 → 판2 끝까지 → 결과 화면 남은 시간이 다시 180 근처, 같은 코드 @game @hard', async ({ players }) => {
    test.setTimeout(600_000);
    const { people, t } = await fiveBackInRoom(players);
    const [a, b, c, d, e] = people;

    // 판2: 광대 ㄱ·ㄴ, ㄱ이 ㅁ을 암살 → 광대 승
    const second = rolesFor(people, [a, b]);
    const t2 = await startByHuman(a, [b, c, d, e], [], second);
    expect(t2.gameId, '새 판').not.toBe(t.gameId);
    await expectRoles(t2.gameId, second);
    await killByHuman(t2, a, e);
    const endSeenAt = Date.now();
    await allAtResult(people);

    // 남은 시간은 판2 끝 시각부터 새로 셈 (판 끝을 확인한 때부터 지난 시간만큼만 줄어 있음, 확인이 몇 초 늦을 수 있어 아래로 5초 여유)
    const left = await secondsLeft(a.page);
    const passed = (Date.now() - endSeenAt) / 1000;
    expect(left, '180 넘지 않음').toBeLessThanOrEqual(180);
    expect(left, `판2 끝부터 ${passed.toFixed(1)}초 지남`).toBeLessThanOrEqual(180 - passed + 1);
    expect(left, `판2 끝부터 ${passed.toFixed(1)}초 지남`).toBeGreaterThanOrEqual(180 - passed - 5);

    await expectSameRoomAgain(people, t.roomCode);
});

test('A08-H-012 7명 판(사람 2 + 봇 5): 판1 → 판2 → 판3 다 같은 코드, 판마다 돌아온 대기방 설정이 같음 @game @hard', async ({ players, bots }) => {
    test.setTimeout(600_000);
    const [a, b] = await openHumans(players, 2);
    const settings = { code: true, maxPlayers: 7, discussion: 60, vote: 60, tribunal: 30, night: 60 };
    const shown = { codeOnly: true, maxPlayers: 7, jokers: 1, discussion: 60, vote: 60, tribunal: 30, night: 60 };
    const seated = await seatHosted(bots, a, [b], 5, settings);
    const { botList } = seated;
    let { t, joker } = seated;
    const code = t.roomCode;
    const serverSettings = { maxPlayers: 7, jokerCount: 1, dayDiscussionTime: 60, dayVoteTime: 60, tribunalTime: 30, nightActionTime: 60 };

    for (const round of [1, 2, 3]) {
        // 봇 표로 광대 봇 처형 → 시민 승 (아무도 안 나가 7명이 다 돌아옴)
        await voteOutJoker(t, joker);
        await allAtResult([a, b]);
        await pressReturn(a.page);
        await pressReturn(b.page);
        for (const bot of botList) await botReturn(bot, t.gameId);
        for (const p of [a, b]) await expectParty(p.page, 7);

        await expectRoomCodeShown(a.page, code);
        const room = await e2e.roomOf(U(a));
        expect(room.roomCode, `판${round} 뒤 서버 방 코드`).toBe(code);
        expect(room.settings, `판${round} 뒤 서버 방 설정`).toMatchObject(serverSettings);
        expect(await readRoomSettings(a.page), `판${round} 뒤 대기방 설정 창`).toEqual(shown);
        if (round === 3) break;

        const next = await startByHuman(a, [b], botList, rolesFor([a, b], [botList.at(-1)]));
        expect(next.gameId, '새 판').not.toBe(t.gameId);
        t = next;
        joker = await findJokerBot(t, botList);
    }
});

test('A08-H-013 6명 판(사람 3 + 봇 3): 같은 방 둘째 판 중 판 밖 사람이 코드 입력 → "이미 게임이 시작된 방" → 둘째 판 끝 → 같은 코드로 들어감 @game @hard', async ({ players, table }) => {
    test.setTimeout(420_000);
    // ㄹ = 판 밖 사람
    const [a, b, c, d] = await openHumans(players, 4);
    const { t, joker, host } = await seatTable(table, [a, b, c], 3);
    await jokerLeaves(t, joker);
    await allAtResult([a, b, c]);

    const backBots = t.bots.filter((bot) => bot !== joker);
    for (const p of [a, b, c]) await pressReturn(p.page);
    for (const bot of backBots) await botReturn(bot, t.gameId);
    await expectParty(a.page, 5);
    const t2 = await startByBot(host, [a, b, c], backBots, rolesFor([a, b, c], [backBots.find((bot) => bot !== host)]));
    expect(t2.gameId, '새 판').not.toBe(t.gameId);
    const joker2 = await findJokerBot(t2, backBots, { not: host });

    expect(await codeEntryAlert(d.page, t.roomCode), '둘째 판 중 코드 입장').toContain(TEXT.started);
    expect(await e2e.roomOf(U(d)), '방 자리 안 생김').toBeNull();

    await jokerLeaves(t2, joker2);
    await allAtResult([a, b, c]);
    await joinRoomByCodeUi(d.page, t.roomCode);
    await expectParty(d.page, 1);
    expect((await e2e.roomOf(U(d)))?.roomCode, '서버 방 코드').toBe(t.roomCode);
});

test('A08-H-014 8명 판(사람 2 + 봇 6): 돌아온 대기방에서 재판 30초로 바꿈 → 둘째 판 → 끝 → 다음 대기방도 재판 30초 @game @hard', async ({ players, bots }) => {
    test.setTimeout(480_000);
    const [a, b] = await openHumans(players, 2);
    const { t, joker, botList } = await seatHosted(bots, a, [b], 6, { vote: 60, tribunal: 45 });
    await jokerLeaves(t, joker);
    await allAtResult([a, b]);

    const backBots = botList.filter((bot) => bot !== joker);
    await pressReturn(a.page);
    await pressReturn(b.page);
    for (const bot of backBots) await botReturn(bot, t.gameId);
    await expectParty(a.page, 7);
    expect((await readRoomSettings(a.page)).tribunal, '돌아온 대기방 재판 시간').toBe(45);

    // 방장 ㄱ이 설정 창에서 재판 30초로 저장
    await a.page.getByRole('button', { name: '방 설정 변경' }).click();
    await fillSettings(a.page, { tribunal: 30 });
    await a.page.getByRole('button', { name: '설정 저장' }).click();
    await expect.poll(async () => (await e2e.roomOf(U(a)))?.settings?.tribunalTime, { message: '서버 재판 시간' }).toBe(30);
    await expect(a.page.getByRole('dialog', { name: '방 설정 변경' })).toHaveCount(0);
    const dismiss = a.page.getByRole('button', { name: '설정 저장 결과 안내 닫기' });
    if (await dismiss.isVisible().catch(() => false)) await dismiss.click();

    const t2 = await startByHuman(a, [b], backBots, rolesFor([a, b], [backBots.at(-1)]));
    expect(t2.gameId, '새 판').not.toBe(t.gameId);
    await jokerLeaves(t2, await findJokerBot(t2, backBots));
    await allAtResult([a, b]);

    await pressReturn(a.page);
    await expect(startButton(a.page)).toBeVisible();
    expect((await readRoomSettings(a.page)).tribunal, '다음 대기방 재판 시간').toBe(30);
    const room = await e2e.roomOf(U(a));
    expect(room.settings.tribunalTime, '서버 재판 시간').toBe(30);
    expect(room.roomCode, '서버 방 코드').toBe(t.roomCode);
});

test('A08-H-024 6명 판(사람 4 + 봇 2): 4명만 대기방으로 → "게임시작"이 미리 꺼지고 까닭 글 → 새 사람 1 → 5명 → 시작 됨 @game @hard', async ({ players, bots }) => {
    test.setTimeout(420_000);
    const [a, b, c, d] = await openHumans(players, 4);
    const { t, joker } = await seatHosted(bots, a, [b, c, d], 2);
    await jokerLeaves(t, joker);
    await allAtResult([a, b, c, d]);

    // 사람 4명만 돌아옴 (남은 봇은 결과 화면 그대로)
    for (const p of [a, b, c, d]) await pressReturn(p.page);
    await expectParty(a.page, 4);
    await readyHumans([b, c, d, a]);
    // 4명 이하면 단추가 미리 꺼져 있어 누르지 않고 꺼짐·까닭 글만 봄 (결정 2026-11-16 낮 셋째 5번)
    await expectStartBlocked(a.page, { count: 4 });
    await expect(a.page).toHaveURL(/\/game-matching/);
    expect(await e2e.gameOf(U(a)), '새 판 안 생김').toBeNull();

    // 새 사람(판 밖 봇)이 같은 코드로 → 5명 → 시작
    const [fresh] = await bots.spawn(1);
    await fresh.joinByCode(t.roomCode);
    await expectParty(a.page, 5);
    const room = await e2e.roomOf(U(a));
    await readyBots([fresh], room);
    await e2e.setRoles(rolesFor([a, b, c, d], [fresh]), { roomId: room.roomId });
    await readyHumans([b, c, d, a]);
    await startButton(a.page).click();
    for (const p of [a, b, c, d]) await expect(p.page).toHaveURL(/\/ingame/, { timeout: 20_000 });
    const game = await e2e.gameOf(U(a));
    expect(game.gameId, '새 판').not.toBe(t.gameId);
    expect(game.players, '새 판 5명').toHaveLength(5);
});

test('A08-H-026 6명 판(사람 3 + 봇 3): ㄷ은 결과 화면 그대로, 나머지 5명이 둘째 판 시작 → 판1 결과 화면 닫힘 → ㄷ만 로비로, 둘째 판은 그대로 @game @hard', async ({ players, table }) => {
    test.setTimeout(420_000);
    const [a, b, c] = await openHumans(players, 3);
    // 광대 2(ㄷ + 방장 봇) → 방장 봇이 두 밤에 봇 둘을 암살 → 광대 승 (아무도 안 나가 봇 3이 다 돌아옴)
    const t = await table.setup({
        humans: [a, b, c],
        bots: 3,
        settings: customRoleSettings({ JOKER: 2 }),
        roles: ({ bots }) => rolesFor([a, b, c], [c, bots[0]]),
    });
    const [host, v1, v2] = t.bots;
    await expectRoles(t.gameId, rolesFor([a, b, c], [c, host]));
    await killByNight(t, [host], [U(v1), U(v2)]);
    await allAtResult([a, b, c]);

    await pressReturn(a.page);
    await pressReturn(b.page);
    for (const bot of t.bots) await botReturn(bot, t.gameId);
    await expectParty(a.page, 5);
    const t2 = await startByBot(host, [a, b], t.bots, rolesFor([a, b], [host, v1]));
    expect(t2.gameId, '새 판').not.toBe(t.gameId);

    const closed = await t.closeResults();
    expect(closed.fired, '판1 180초 시계 돌림').toBe(true);
    await expect(c.page).toHaveURL(/\/lobby/, { timeout: 15_000 });

    // 둘째 판 사람 화면·판은 그대로, 결과 닫힘 알림도 안 받음
    for (const p of [a, b]) await expect(p.page).toHaveURL(/\/ingame/);
    const s2 = await e2e.game(t2.gameId);
    expect(s2.phase, '둘째 판 진행 중').not.toBe('ENDED');
    expect(s2.players, '둘째 판 5명').toHaveLength(5);
    expect(host.events.filter((r) => r.event === 'game_result_closed'), '둘째 판 봇이 받은 결과 닫힘 알림').toHaveLength(0);
});

test('A08-H-027 6명 판(사람 2 + 봇 4): ㄴ은 결과 화면 그대로 → 나머지가 둘째 판 시작 → ㄴ "대기방으로" → 안내 글, 판 화면으로 안 감 @game @hard @smoke', async ({ players, bots }) => {
    test.setTimeout(420_000);
    const [a, b] = await openHumans(players, 2);
    const botList = await bots.spawn(4);
    const jokers = botList.slice(2);
    // 광대 2(뒤 봇 둘) → 두 밤에 앞 봇 둘을 암살 → 광대 승 (아무도 안 나가 봇 4가 다 돌아옴)
    const first = rolesFor([a, b], jokers);
    const t = await hostGame({ host: a, guests: [b], botList, roles: first, settings: { custom: { JOKER: 2 } } });
    await expectRoles(t.gameId, first);
    await killByNight(t, jokers, [U(botList[0]), U(botList[1])]);
    await allAtResult([a, b]);

    await pressReturn(a.page);
    for (const bot of botList) await botReturn(bot, t.gameId);
    await expectParty(a.page, 5);
    const t2 = await startByHuman(a, [], botList, rolesFor([a], jokers));
    expect(t2.gameId, '새 판').not.toBe(t.gameId);

    await returnButton(b.page).click();
    await expectReadable(leaveNotice(b.page));
    await expect(leaveNotice(b.page)).toHaveAttribute('data-notice-source', 'return');
    await expect(b.page).toHaveURL(/\/gameresult/);
    expect((await e2e.game(t2.gameId)).players.map((p) => p.uuid), '둘째 판에 ㄴ 없음').not.toContain(U(b));
    expect(await e2e.roomOf(U(b)), 'ㄴ 방 자리 없음').toBeNull();
});

test('A08-H-044 사람 5명 판: 같은 방 둘째 판도 역할 확인 → 낮 → 밤 → 판 끝 → 결과 화면 → 같은 코드 대기방 @game @hard', async ({ players }) => {
    test.setTimeout(600_000);
    const { people, t } = await fiveBackInRoom(players);
    const [a, b, c, d, e] = people;

    // 판2: 광대 ㄴ·ㄷ
    const second = rolesFor(people, [b, c]);
    const t2 = await startByHuman(a, [b, c, d, e], [], second);
    expect(t2.gameId, '새 판').not.toBe(t.gameId);
    await expectRoles(t2.gameId, second);

    // 역할 확인: 다섯 화면에 역할 창
    for (const p of people) await expect(p.page.getByRole('dialog', { name: '내 역할 보기' })).toBeVisible({ timeout: 20_000 });
    await closeReveals(people.map((p) => p.page));
    // 낮: 다섯 화면에 낮 안내
    await t2.advanceUntil('DAY');
    for (const p of people) {
        await expect(p.page.getByRole('dialog', { name: '단계 전환 안내' })).toContainText('낮이 되었습니다', { timeout: 20_000 });
        await closePhaseNotice(p.page);
    }
    // 밤: ㄴ이 화면으로 ㅁ 암살 → 광대 2 : 나머지 2 → 판 끝
    await killByHuman(t2, b, e);
    await allAtResult(people);
    await expect(returnButton(a.page)).toBeEnabled();

    await expectSameRoomAgain(people, t.roomCode);
});

test('A08-H-049 7명 판(사람 3 + 봇 4): 같은 방 둘째 판 중 방장 ㄱ이 나감(ㄴ이 방장) → 판 끝 → ㄷ이 먼저 대기방으로 → 방장 자리 칸 → ㄴ이 들어오면 ㄴ이 방장 @game @hard', async ({ players, bots }) => {
    test.setTimeout(480_000);
    const [a, b, c] = await openHumans(players, 3);
    const { t, joker, botList } = await seatHosted(bots, a, [b, c], 4);
    await jokerLeaves(t, joker);
    await allAtResult([a, b, c]);

    // 들어온 순서가 둘째 판 자리 순서: ㄱ(방장) → ㄴ → ㄷ → 봇 3
    const backBots = botList.filter((bot) => bot !== joker);
    for (const p of [a, b, c]) await pressReturn(p.page);
    for (const bot of backBots) await botReturn(bot, t.gameId);
    await expectParty(a.page, 6);
    const t2 = await startByHuman(a, [b, c], backBots, rolesFor([a, b, c], [backBots.at(-1)]));
    expect(t2.gameId, '새 판').not.toBe(t.gameId);
    const joker2 = await findJokerBot(t2, backBots);

    // 둘째 판 중 방장 ㄱ이 산 채로 나감 → 다음 방장은 맨 앞자리부터 = ㄴ
    await closeReveals([a.page, b.page, c.page]);
    await leaveGameUi(a.page);
    await expect.poll(async () => (await t2.player(U(a)))?.isParticipating, { message: 'ㄱ이 판에서 빠짐' }).toBe(false);
    await jokerLeaves(t2, joker2);
    await allAtResult([b, c]);

    // 남겨 둔 방장 자리는 판이 끝날 때의 방장(ㄴ) 것
    await pressReturn(c.page);
    await expect(hostSeat(c.page)).toBeVisible();
    await expect(startButton(c.page)).toHaveCount(0);
    await pressReturn(b.page);
    await expect(startButton(b.page)).toBeVisible();
    await expect(hostSeat(c.page)).toHaveCount(0);
    expect((await e2e.roomOf(U(b)))?.hostUuid, '서버 방장 = ㄴ').toBe(U(b));
});

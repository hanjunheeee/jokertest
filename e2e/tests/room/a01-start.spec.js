'use strict';

// PC 시작이 받아들여지나 브라우저 시험 — 정원 안 채워도 5명 이상 전원 준비면 시작, 4명이면 단추 꺼짐 + 까닭 글, 준비 안 함·구성 안 맞음·끊김 거절 글, 다시 붙음·막힘 뒤 다시·시작 따닥·목록에서 빠짐·손님 화면, 키보드, 판 인원·새 설정으로 시작
// 목록 A01a-방만들기-설정-시작.md 번호 A01-E-067~091·136~138·140, 돌리지 않고 모임만: npx playwright test --list tests/room/a01-start.spec.js
const { test, expect, ui } = require('../../helpers/fixtures');
const { expectReadable } = require('../../helpers/visible');
const { e2e } = require('../../helpers/internal');
const { blockedDialog } = require('./roomHelpers');
const K = require('./_a01a-kit');

const J2D2G2W2 = Object.freeze({ JOKER: 2, DOCTOR: 2, GUARD: 2, WITCH_HUNTER: 2 });
const startButton = (page) => page.getByRole('button', { name: '게임시작' });

/** 정한 직업 예약(이 방) → "게임시작" → 판 화면 → 판 요약 */
async function startToIngame(user, presets) {
    const room = await e2e.roomOf(K.U(user));
    await e2e.setRoles(presets, { roomId: room.roomId });
    await startButton(user.page).click();
    await expect(user.page).toHaveURL(/\/ingame/, { timeout: 20_000 });
    const game = await e2e.gameOf(K.U(user));
    expect(game?.gameId, '판이 생김').toBeTruthy();
    await K.expectRolesTaken(game.gameId, presets);
    return game;
}

// 정원 10 직접 J2D2G2W2 방 8명 직업 (사람 경비원, 봇이 나머지)
function rolesFor8(user, botList) {
    const rest = ['JOKER', 'JOKER', 'DOCTOR', 'DOCTOR', 'GUARD', 'WITCH_HUNTER', 'WITCH_HUNTER'];
    return { [K.U(user)]: 'GUARD', ...Object.fromEntries(botList.map((b, i) => [K.U(b), rest[i]])) };
}

// A01-E-067~072: 정원 10, 사람 방장 + 봇 4~9 = 5~10명 전원 준비 → 시작 → 판 화면
for (const [i, n] of [5, 6, 7, 8, 9, 10].entries()) {
    const id = `A01-E-0${67 + i}`;
    test(`${id} 정원 10 방 ${n}명 전원 준비 → "게임시작" → 판 화면 @game`, async ({ user, bots }) => {
        test.setTimeout(180_000);
        const botList = await bots.spawn(n - 1);
        await K.readyRoom(user, botList, { maxPlayers: 10, jokers: 1 });
        const game = await startToIngame(user, K.autoRoles([user], botList));
        const s = await e2e.game(game.gameId);
        expect(s.players).toHaveLength(n);
    });
}

test('A01-E-073 사람 + 봇 3 = 4명 전원 준비 → "게임시작" 꺼짐 + 까닭 글 "5명부터 시작할 수 있습니다. (지금 4명)" 읽힘, 대기방 그대로 / 봇 방장 4명 방 시작 요청은 서버가 인원 조건 글로 거절 @smoke', async ({ user, bots }) => {
    const [host, ...rest] = await bots.spawn(7);
    const botList = rest.splice(0, 3);
    await K.readyRoom(user, botList, { maxPlayers: 5, jokers: 1 });
    // 5명보다 적으면 누르기 전에 꺼져 있음 (결정 2026-11-16 낮 셋째 5번) → 누르지 않고 꺼짐·까닭 글·판 없음을 봄
    await K.expectStartRejected(user, K.MSG.MIN_PLAYERS);
    await expect(K.startLockedReason(user.page)).toHaveText(K.startLockedText(4));
    // 서버 거절은 그대로 있음: 화면으론 못 보내니 봇 방장(봇 4명 전원 준비)이 시작 요청을 바로 보냄
    const made = await host.createRoom({ accessType: 'code', maxPlayers: 5, jokerCount: 1 });
    await K.botsJoin(rest, made.roomCode);
    const live = await K.botsReady([host, ...rest], host.uuid);
    const reply = await host.request('start_game', { roomId: live.roomId, expectedSettingsVersion: live.settingsVersion });
    expect(reply?.ok).toBe(false);
    expect(reply?.code).toBe('MIN_PLAYERS_NOT_MET');
    expect(reply?.message).toBe(K.MSG.MIN_PLAYERS);
});

test('A01-E-074 6명 중 봇 1 준비 안 함 → "게임시작" 꺼짐 + 까닭 글 "모두 준비해야 시작할 수 있습니다. (준비 5/6)" 읽힘, 판 안 열림', async ({ user, bots }) => {
    const botList = await bots.spawn(5);
    const room = await K.createRoomOn(user, { maxPlayers: 6, jokers: 1 });
    await K.botsJoin(botList, room.roomCode);
    await K.botsReady(botList.slice(0, 4), K.U(user));
    await K.readyMe(user.page);
    // 준비 안 한 사람이 있으면 누르기 전에 꺼져 있음 (결정 2026-11-16 낮 넷째 1번) → 누르지 않고 꺼짐·까닭 글·판 없음을 봄
    await K.expectStartRejected(user, K.MSG.NOT_READY);
    await expect(K.startLockedReason(user.page)).toHaveText(K.startNotReadyText(5, 6));
});

test('A01-E-075 5명, 사람 방장만 준비 안 함 → "게임시작" 꺼짐 + 까닭 글 "(준비 4/5)" 읽힘 (방장도 셈)', async ({ user, bots }) => {
    const botList = await bots.spawn(4);
    await K.readyRoom(user, botList, { maxPlayers: 5, jokers: 1 }, { hostReady: false });
    await expect(user.page.getByRole('button', { name: '준비완료' })).toBeVisible();
    // 서버 규칙: 방장까지 전원 준비 → 방장만 안 해도 미리 꺼짐 (누르지 않음)
    await K.expectStartRejected(user, K.MSG.NOT_READY);
    await expect(K.startLockedReason(user.page)).toHaveText(K.startNotReadyText(4, 5));
});

// A01-E-076~077: 정원 10 J2D2G2W2, 지금 5 / 7명 → 구성 거절
for (const [no, n] of [[76, 5], [77, 7]]) {
    test(`A01-E-0${no} 정원 10 광대2·의사2·경비원2·마녀사냥꾼2, ${n}명 → 구성 거절 글 읽힘`, async ({ user, bots }) => {
        const botList = await bots.spawn(n - 1);
        await K.readyRoom(user, botList, { maxPlayers: 10, custom: J2D2G2W2 });
        await startButton(user.page).click();
        await K.expectStartRejected(user, K.MSG.ROLE_MISMATCH);
    });
}

test('A01-E-078 같은 구성 방 8명 → 판 화면 @game', async ({ user, bots }) => {
    test.setTimeout(180_000);
    const botList = await bots.spawn(7);
    await K.readyRoom(user, botList, { maxPlayers: 10, custom: J2D2G2W2 });
    const game = await startToIngame(user, rolesFor8(user, botList));
    expect((await e2e.game(game.gameId)).players).toHaveLength(8);
});

test('A01-E-079 정원 10 광대1·의사1 직접, 5명 → 판 화면, 판 인원 5 (남는 자리 시민) @game', async ({ user, bots }) => {
    const botList = await bots.spawn(4);
    await K.readyRoom(user, botList, { maxPlayers: 10, custom: { JOKER: 1, DOCTOR: 1, GUARD: 0, WITCH_HUNTER: 0 } });
    const presets = { [K.U(user)]: 'CITIZEN', [K.U(botList[0])]: 'JOKER', [K.U(botList[1])]: 'DOCTOR', [K.U(botList[2])]: 'CITIZEN', [K.U(botList[3])]: 'CITIZEN' };
    const game = await startToIngame(user, presets);
    expect((await e2e.gameOf(K.U(user))).players).toHaveLength(5);
    expect(game.gameId).toBeTruthy();
});

test('A01-E-080 정원 5 광대2·의사1·경비원1·마녀사냥꾼1(시민 0명), 5명 → 판 화면 @game', async ({ user, bots }) => {
    const botList = await bots.spawn(4);
    await K.readyRoom(user, botList, { maxPlayers: 5, custom: { JOKER: 2, DOCTOR: 1, GUARD: 1, WITCH_HUNTER: 1 } });
    const presets = { [K.U(user)]: 'GUARD', [K.U(botList[0])]: 'JOKER', [K.U(botList[1])]: 'JOKER', [K.U(botList[2])]: 'DOCTOR', [K.U(botList[3])]: 'WITCH_HUNTER' };
    await startToIngame(user, presets);
});

test('A01-E-081 자동 광대 2, 5명 → 판 화면 @game', async ({ user, bots }) => {
    const botList = await bots.spawn(4);
    await K.readyRoom(user, botList, { maxPlayers: 5, jokers: 2 });
    await startToIngame(user, K.autoRoles([user], botList, 2));
});

test('A01-E-082 5명 전원 준비, 봇 1 연결 끊음(15초 안) → 연결 확인 거절 글 읽힘, 대기방 그대로', async ({ user, bots }) => {
    const botList = await bots.spawn(4);
    await K.readyRoom(user, botList, { maxPlayers: 5, jokers: 1 });
    botList[3].socket.disconnect();
    await expect.poll(() => botList[3].socket.connected).toBe(false);
    await startButton(user.page).click();
    await K.expectStartRejected(user, K.MSG.UNAVAILABLE);
});

test('A01-E-083 끊긴 봇이 다시 붙음 → 시작 → 판 화면 @game', async ({ user, bots }) => {
    const botList = await bots.spawn(4);
    await K.readyRoom(user, botList, { maxPlayers: 5, jokers: 1 });
    botList[3].socket.disconnect();
    await expect.poll(() => botList[3].socket.connected).toBe(false);
    await startButton(user.page).click();
    await K.expectStartRejected(user, K.MSG.UNAVAILABLE);
    await K.closeBlocked(user.page);
    botList[3].socket.connect();
    await expect.poll(() => botList[3].socket.connected).toBe(true);
    // 다시 붙은 것을 서버가 알아챌 때까지 (막힘 창이 뜨면 닫고 다시) — 대기방 15초 안이라 그 사이 빠지지 않음
    const room = await e2e.roomOf(K.U(user));
    await e2e.setRoles(K.autoRoles([user], botList), { roomId: room.roomId });
    await expect(async () => {
        if (await blockedDialog(user.page).count() > 0) await K.closeBlocked(user.page);
        await startButton(user.page).click({ timeout: 2000 });
        await expect(user.page).toHaveURL(/\/ingame/, { timeout: 3000 });
    }).toPass({ timeout: 12_000 });
});

test('A01-E-084 준비 안 함으로 꺼진 "게임시작" → 봇 준비 → 단추 켜지고 까닭 글 사라짐 → 시작 → 판 화면 @game', async ({ user, bots }) => {
    const botList = await bots.spawn(4);
    const room = await K.createRoomOn(user, { maxPlayers: 5, jokers: 1 });
    await K.botsJoin(botList, room.roomCode);
    await K.botsReady(botList.slice(0, 3), K.U(user));
    await K.readyMe(user.page);
    // 막힘 창 대신 미리 꺼짐 (결정 2026-11-16 낮 넷째 1번)
    await K.expectStartRejected(user, K.MSG.NOT_READY);
    await K.botsReady([botList[3]], K.U(user));
    await expect(startButton(user.page)).toBeEnabled();
    await expect(K.startLockedReason(user.page)).toHaveCount(0);
    await startToIngame(user, K.autoRoles([user], botList));
});

test('A01-E-085 J2D2G2W2 7명 거절 → 봇 하나 더 들어와 8명 준비 → 시작 → 판 화면 @game', async ({ user, bots }) => {
    test.setTimeout(180_000);
    const botList = await bots.spawn(7);
    const room = await K.readyRoom(user, botList.slice(0, 6), { maxPlayers: 10, custom: J2D2G2W2 });
    await startButton(user.page).click();
    await K.expectStartRejected(user, K.MSG.ROLE_MISMATCH);
    await K.closeBlocked(user.page);
    await K.botsJoin([botList[6]], room.roomCode);
    await K.botsReady([botList[6]], K.U(user));
    await startToIngame(user, rolesFor8(user, botList));
});

test('A01-E-086 "게임시작" 빠르게 두 번 → 판 1개, 봇 넷 모두 같은 판 시작 알림 하나씩 @game', async ({ user, bots }) => {
    const botList = await bots.spawn(4);
    const room = await K.readyRoom(user, botList, { maxPlayers: 5, jokers: 1 });
    await e2e.setRoles(K.autoRoles([user], botList), { roomId: room.roomId });
    await startButton(user.page).evaluate((el) => { el.click(); el.click(); });
    await expect(user.page).toHaveURL(/\/ingame/, { timeout: 20_000 });
    const game = await e2e.gameOf(K.U(user));
    expect(game?.gameId).toBeTruthy();
    for (const bot of botList) {
        await expect.poll(() => bot.events.some((r) => r.event === 'game_started')).toBe(true);
        const started = bot.events.filter((r) => r.event === 'game_started').map((r) => r.payload?.gameId);
        expect(started, `봇 ${bot.nickname} 시작 알림`).toEqual([game.gameId]);
    }
});

test('A01-E-087 사람 방장 5명 공개 방 시작 → 다른 봇이 물은 공개 목록에 그 방 없음 @game', async ({ user, bots }) => {
    const [probe, ...botList] = await bots.spawn(5);
    const room = await K.readyRoom(user, botList, { maxPlayers: 5, jokers: 1, code: false });
    expect(await K.listedTitled(probe, K.titleOf(user))).toHaveLength(1);
    await startToIngame(user, K.autoRoles([user], botList));
    await expect.poll(async () => {
        const reply = await probe.request('get_public_rooms', {});
        return (reply?.rooms ?? []).some((r) => r.id === room.roomId);
    }).toBe(false);
});

test('A01-E-088 사람 손님 화면엔 "게임시작" 단추 없음', async ({ user, bots }) => {
    const [host] = await bots.spawn(1);
    const room = await host.createRoom({ accessType: 'open', maxPlayers: 10 });
    await ui.joinRoomByCodeUi(user.page, room.roomCode);
    await expect(user.page.getByRole('button', { name: '준비완료' })).toBeVisible();
    await expect(startButton(user.page)).toHaveCount(0);
});

test('A01-E-089 봇 방장 + 사람 + 봇 3 = 5명, 봇 방장 시작 → 사람 화면도 판 @game', async ({ user, table }) => {
    // table.setup = 봇 방장 방 → 사람 코드 입장·준비 → 봇 준비 → 봇 방장 시작 → 사람 화면 /ingame까지 기다림
    const t = await table.setup({ humans: [user], bots: 4, roles: ({ humans, bots }) => K.autoRoles(humans, bots) });
    await expect(user.page).toHaveURL(/\/ingame/);
    expect((await t.state()).players).toHaveLength(5);
});

test('A01-E-090 위에서 사람 손님 준비 안 함 → 봇 방장 시작 거절, 사람 화면 대기방 그대로·막힘 창 없음', async ({ user, bots }) => {
    const [host, ...rest] = await bots.spawn(4);
    const room = await host.createRoom({ accessType: 'code', maxPlayers: 5, jokerCount: 1 });
    await K.botsJoin(rest, room.roomCode);
    await ui.joinRoomByCodeUi(user.page, room.roomCode);
    const live = await K.botsReady([host, ...rest], host.uuid);
    const reply = await host.request('start_game', { roomId: live.roomId, expectedSettingsVersion: live.settingsVersion });
    expect(reply?.ok).toBe(false);
    expect(reply?.code).toBe('PLAYERS_NOT_READY');
    await expect(user.page).toHaveURL(/\/game-matching/);
    await expect(blockedDialog(user.page)).toHaveCount(0);
    expect(await e2e.gameOf(K.U(user))).toBeNull();
});

test('A01-E-091 키보드: 막힘 창(전원 준비 5명, 정원 10 광대2·의사2·경비원2·마녀사냥꾼2 구성 안 맞음) → Enter → 닫힘, 초점이 대기방으로', async ({ user, bots }) => {
    const page = user.page;
    // 인원 모자람·준비 안 됨은 "게임시작"이 미리 꺼져 막힘 창이 안 뜸 → 단추가 켜져 있는 구성 안 맞음(A01-E-076과 같은 방)으로 막힘 창을 띄움
    const botList = await bots.spawn(4);
    await K.readyRoom(user, botList, { maxPlayers: 10, custom: J2D2G2W2 });
    await startButton(page).click();
    await K.expectStartRejected(user, K.MSG.ROLE_MISMATCH);
    // 창이 뜨면 "확인"에 초점 → Enter로 닫음
    await expect(blockedDialog(page).getByRole('button', { name: '확인' })).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(blockedDialog(page)).toHaveCount(0);
    const focus = await page.evaluate(() => {
        const el = document.activeElement;
        return { onBody: !el || el === document.body, inBlocked: Boolean(el?.closest('[data-game-start-blocked]')) };
    });
    expect(focus.onBody, '초점이 몸통(body)으로 빠짐').toBe(false);
    expect(focus.inBlocked).toBe(false);
});

test('A01-E-136 정원 10 방 5명 시작 → 판 카드 5장(빈 자리 없음) @game', async ({ user, bots }) => {
    const page = user.page;
    const botList = await bots.spawn(4);
    await K.readyRoom(user, botList, { maxPlayers: 10, jokers: 1 });
    await startToIngame(user, K.autoRoles([user], botList));
    await ui.readRoleReveal(page);
    const names = [K.nick(user), ...botList.map((b) => b.nickname)].sort();
    await expect.poll(async () => {
        const seen = await page.locator('[data-ingame-player-nickname]').evaluateAll((els) => els.map((el) => el.getAttribute('data-ingame-player-nickname')));
        return [...new Set(seen)].sort();
    }, { timeout: 15_000 }).toEqual(names);
});

test('A01-E-137 토론 90·투표 30으로 바꾼 뒤 5명 시작 → 판 설정이 새 값 @game', async ({ user, bots }) => {
    const page = user.page;
    const botList = await bots.spawn(4);
    await K.readyRoom(user, botList, { maxPlayers: 5, jokers: 1 }, { hostReady: false });
    await K.openEditor(page);
    await K.fill(page, { discussion: 90, vote: 30 });
    await K.saveEditor(page);
    await expect.poll(async () => (await e2e.roomOf(K.U(user)))?.settings?.dayDiscussionTime).toBe(90);
    // 설정이 바뀌면 전원 준비가 풀림 → 새 버전으로 다시 준비
    await K.botsReady(botList, K.U(user));
    await K.readyMe(page);
    await startToIngame(user, K.autoRoles([user], botList));
    const settings = await K.startedSettings(botList[0]);
    expect(settings).toMatchObject({ dayDiscussionTime: 90, dayVoteTime: 30 });
});

test('A01-E-138 5명 전원 준비, "설정 저장"과 "게임시작"을 거의 같이 → 새 값 판이거나 시작 거절, 옛 값 판 없음', async ({ user, bots }) => {
    const page = user.page;
    const botList = await bots.spawn(4);
    const room = await K.readyRoom(user, botList, { maxPlayers: 5, jokers: 1 });
    await e2e.setRoles(K.autoRoles([user], botList), { roomId: room.roomId });
    await K.openEditor(page);
    await K.fill(page, { discussion: 90 });
    // 창이 대기방을 덮어 단추를 못 누름 → 둘을 화면 안에서 바로 이어 누름
    await page.evaluate(() => {
        document.querySelector('button[aria-label="설정 저장"]').click();
        document.querySelector('button[aria-label="게임시작"]').click();
    });
    await expect.poll(async () => (await e2e.roomOf(K.U(user)))?.settings?.dayDiscussionTime ?? 'GONE', { timeout: 15_000 }).not.toBe(60);
    // 시작 요청이 끝날 때까지 기다림 (끝나기 전에 "판이 있나"를 읽으면 그 뒤에 생긴 판을 놓쳐 그때그때 갈림): 판이 생겼거나 단추 글 "시작 중"이 풀림
    // 여기서 못 기다려도 아래 확인은 그대로 함
    await expect.poll(async () => Boolean(await e2e.gameOf(K.U(user))) || (await page.getByRole('button', { name: '시작 중' }).count()) === 0, { timeout: 10_000 })
        .toBe(true).catch(() => {});
    const game = await e2e.gameOf(K.U(user));
    if (game) {
        const settings = await K.startedSettings(botList[0]);
        expect(settings?.dayDiscussionTime, '판이 생겼으면 새 값(90)').toBe(90);
    } else {
        await expect(page).toHaveURL(/\/game-matching/);
        expect((await e2e.roomOf(K.U(user))).settings.dayDiscussionTime).toBe(90);
    }
    // 옛 값(60)으로 시작한 판 알림을 받은 봇 없음
    for (const bot of botList) {
        const old = bot.events.filter((r) => r.event === 'game_started' && r.payload?.state?.roomSettingsSource?.settings?.dayDiscussionTime === 60);
        expect(old, `봇 ${bot.nickname} 옛 값 판`).toHaveLength(0);
    }
});

test('A01-E-140 10명 방(자리 꽉 참, 전원 준비·봇 1 연결 끊음) 막힘 창 → 글·확인 단추가 안 가려지고 읽힘', async ({ user, bots }) => {
    const page = user.page;
    // 준비 안 됨은 단추가 미리 꺼져 막힘 창이 안 뜸 → 단추가 켜져 있는 끊긴 참가자(A01-E-082와 같은 길, 15초 안)로 막힘 창을 띄움
    const botList = await bots.spawn(9);
    await K.readyRoom(user, botList, { maxPlayers: 10, jokers: 1 });
    botList[8].socket.disconnect();
    await expect.poll(() => botList[8].socket.connected).toBe(false);
    await startButton(page).click();
    await K.expectStartRejected(user, K.MSG.UNAVAILABLE);
    await expectReadable(blockedDialog(page).getByRole('button', { name: '확인' }));
});

'use strict';

// 모바일 판 끝 뒤 같은 방 브라우저 시험 — 폰 결과 화면 "대기방으로"(같은 코드·설정·방장 자리)·"로비로"(확인 글·실패 안내·잠김)·새로고침·다음 판
// 목록 A08-판끝-같은방.md 번호 A08-E-078~100 (076·077·087·088·098은 지움, 사파리도: 079·083, 180초는 손잡이 closeResults로 넘김)
const { test, expect } = require('../../helpers/fixtures');
const { expectReadable } = require('../../helpers/visible');
const { e2e } = require('../../helpers/internal');
const ui = require('../../helpers/ui');
const { answerNextConfirm } = require('../room/_a01b-kick-kit');
const {
    U, TEXT, returnButton, lobbyButton, leaveNotice, startButton, hostSeat, expectStartBlocked,
    rolesFor, findJokerBot, seatTable, seatPhoneHosted, jokerLeaves, voteOutJoker, allAtResult, pressReturn, pressLobby, leaveToLobby,
    botReturn, botToLobby, seatsOf, expectParty, expectRoomCodeShown, codeEntryAlert, createRoomOnPhone, readyHumans, readyBots,
    startByBot, readRoomSettings, gateSocket,
} = require('../result/_a08-hard-kit');

// 사람 1 + 봇(total-1) 봇 방장 판 → 봇 표로 광대 봇 처형(시민 승, 탈주 없음) → 폰 결과 화면
async function phoneResult(user, table, total, settings = {}) {
    const seated = await seatTable(table, [user], total - 1, settings);
    await voteOutJoker(seated.t, seated.joker);
    await allAtResult([user]);
    return seated;
}

// 판 화면 설정 시트 열기: 역할 확인 동안엔 입장 준비 덮개(화면 전체)가, 그 뒤엔 "낮이 되었습니다" 창이 설정 단추를 덮음
// → 덮개가 사라질 때까지 기다리고 뜬 안내 창은 닫은 뒤 누름 (탭 줄이 보이면 열린 것)
async function openIngameSettings(page) {
    await expect(page.locator('[data-ingame-entry-preparing]')).toHaveCount(0, { timeout: 30_000 });
    const tabs = page.getByRole('navigation', { name: '인게임 설정 탭' });
    await expect(async () => {
        await ui.closeOverlays(page, { rounds: 2, keepWatching: false });
        await page.getByRole('button', { name: '인게임 설정', exact: true }).click({ timeout: 1500 });
        await expect(tabs).toBeVisible({ timeout: 1000 });
    }).toPass({ timeout: 30_000 });
    return tabs;
}

// 결과 화면 단추에 적힌 글 (그림 단추라 글 칸을 따로 봄 — 글자색·가려짐)
const returnLabel = (page) => returnButton(page).getByText('대기방으로', { exact: true });
const lobbyLabel = (page) => lobbyButton(page).getByText('로비로', { exact: true });

// A08-E-076(결과 화면 남은 시간 칸 읽힘)·077(남은 시간 칸 오른쪽 위)은 지움: 모바일(상대 화면) 결과 화면엔 남은 시간 칸이 없음 (커밋 d71ab651)
// 서버가 닫으면 로비로 가는 것은 A08-E-078(손잡이)·A08-H-032(진짜 180초)가 봄

test('A08-E-078 [모바일] 5명 판: 결과 화면이 닫히면 로비로 @game', async ({ user, table }) => {
    const { t } = await phoneResult(user, table, 5);
    const closed = await t.closeResults();
    expect(closed.fired, '180초 시계 돌림').toBe(true);
    await expect(user.page).toHaveURL(/\/lobby/, { timeout: 15_000 });
});

test('A08-E-079 [모바일] 7명 판: "대기방으로" → 대기방 방 코드 = 판 전 코드 @game @safari', async ({ user, table }) => {
    const { t } = await phoneResult(user, table, 7);
    await pressReturn(user.page);
    await expectRoomCodeShown(user.page, t.roomCode);
    expect((await e2e.roomOf(U(user)))?.roomCode, '서버 방 코드').toBe(t.roomCode);
});

test('A08-E-080 [모바일] 8명 판(코드 방·정원 8·광대 2·시간 바꿈): "대기방으로" → 대기방 설정 창 값이 그대로 @game', async ({ user, table }) => {
    test.setTimeout(180_000);
    const page = user.page;
    const wanted = { maxPlayers: 8, jokerCount: 2, dayDiscussionTime: 60, dayVoteTime: 60, tribunalTime: 30, nightActionTime: 60 };
    const t = await table.setup({
        humans: [user],
        bots: 7,
        settings: { accessType: 'code', ...wanted },
        roles: ({ bots }) => rolesFor([user], bots.slice(-2)),
    });
    const s = await t.state();
    const jokers = t.bots.filter((bot) => s.players.find((p) => p.uuid === U(bot))?.role === 'JOKER');
    expect(jokers, '광대 2명이 모두 봇').toHaveLength(2);
    expect(jokers.includes(t.bots[0]), '방장 봇은 광대 아님').toBe(false);
    // 광대 봇 둘이 다 나가면 산 광대 0명 → 시민 승
    for (const joker of jokers) await jokerLeaves(t, joker);
    await allAtResult([user]);
    await pressReturn(page);

    // 설정 창은 방장만 열림 → 원래 방장 봇이 "로비로" 가서 먼저 들어온 내가 방장
    await botToLobby(t.bots[0], t.gameId);
    await expect(startButton(page)).toBeVisible();
    expect(await readRoomSettings(page)).toEqual({
        codeOnly: true, maxPlayers: 8, jokers: 2, discussion: 60, vote: 60, tribunal: 30, night: 60,
    });
    const room = await e2e.roomOf(U(user));
    expect(room.roomCode, '서버 방 코드').toBe(t.roomCode);
    expect(room.settings, '서버 방 설정').toMatchObject(wanted);
});

test('A08-E-081 [모바일] 6명 판: 내가 먼저 "대기방으로" → 방장 자리 안내 글이 읽히고 "게임시작" 없음 @game', async ({ user, table }) => {
    await phoneResult(user, table, 6);
    const page = user.page;
    // 원래 방장 봇은 결과 화면에 그대로 → 방장 자리를 비워 둠
    await pressReturn(page);
    // 모바일(상대 화면)은 비워 둔 방장 자리가 이름 없는 빈 실루엣 → 판 아래 안내 글로 봄
    await expectReadable(page.getByText(TEXT.hostSeatNotice, { exact: true }));
    await expect(startButton(page)).toHaveCount(0);
});

test('A08-E-082 [모바일] 5명 판: 원래 방장 봇이 "로비로" → 먼저 들어온 내 화면에 "게임시작" @game', async ({ user, table }) => {
    const { t, host } = await phoneResult(user, table, 5);
    const page = user.page;
    await pressReturn(page);
    await expect(hostSeat(page)).toBeVisible();
    await expect(startButton(page)).toHaveCount(0);

    await botToLobby(host, t.gameId);
    // 방에 나 혼자라 "게임시작"은 꺼진 채(반투명) 보임 → 단추는 보임·화면 안·안 가려짐만 보고, 글이 읽히는지는 꺼진 까닭 글로 봄 (결정 2026-11-16 낮 셋째 5번)
    await expectReadable(startButton(page), { contrast: false });
    await expectStartBlocked(page, { count: 1 });
    await expect(hostSeat(page)).toHaveCount(0);
    expect((await e2e.roomOf(U(user)))?.hostUuid, '서버 방장').toBe(U(user));
});

test('A08-E-083 [모바일] 5명 판: "로비로" → 확인 창 글 "로비로 나가시겠습니까?" @game @safari', async ({ user, table }) => {
    await phoneResult(user, table, 5);
    const page = user.page;
    expect(await pressLobby(page, { accept: false })).toBe(TEXT.lobbyConfirm);
    // 취소했으니 결과 화면 그대로
    await expect(page).toHaveURL(/\/gameresult/);
    await expect(returnButton(page)).toBeEnabled();
});

test('A08-E-084 [모바일] 5명 판: "로비로" 확인 → 로비, 방 만들기 됨 @game', async ({ user, table }) => {
    await phoneResult(user, table, 5);
    const page = user.page;
    await leaveToLobby(page);
    const room = await createRoomOnPhone(user);
    expect(room.players.map((p) => p.uuid), '새 방 명단').toEqual([U(user)]);
    await expect(startButton(page)).toBeVisible();
});

test('A08-E-085 [모바일] 5명 판: 연결이 끊긴 채 "로비로" → 실패 안내 글이 읽힘 @game', async ({ user, table }) => {
    const page = user.page;
    const gate = await gateSocket(page);
    await phoneResult(user, table, 5);
    await gate.cut();
    expect(await pressLobby(page)).toBe(TEXT.lobbyConfirm);
    const notice = leaveNotice(page);
    await expect(notice).toHaveText(TEXT.exitOffline);
    await expect(notice).toHaveAttribute('data-notice-source', 'exit');
    await expectReadable(notice);
    await expect(page).toHaveURL(/\/gameresult/);
});

test('A08-E-086 [모바일] 6명 판: 연결이 끊긴 채 "대기방으로" → 실패 안내 글이 읽힘 @game', async ({ user, table }) => {
    const page = user.page;
    const gate = await gateSocket(page);
    await phoneResult(user, table, 6);
    await gate.cut();
    await returnButton(page).click();
    const notice = leaveNotice(page);
    await expect(notice).toHaveText(TEXT.returnOffline);
    await expect(notice).toHaveAttribute('data-notice-source', 'return');
    await expectReadable(notice);
    await expect(page).toHaveURL(/\/gameresult/);
});

// A08-E-087·088(답이 늦는 동안 다른 단추가 꺼짐)은 지움: 모바일(상대 화면) 결과 단추는 누르는 중에도 안 꺼짐(누른 뒤 다시 누름은 훅이 무시, frontend-mobile result/components/actions/ResultActions.jsx)

test('A08-E-089 [모바일] 5명 판: 결과 화면 새로고침 → "게임 결과를 확인할 수 없습니다" + "로비로 돌아가기" 하나 @game', async ({ user, table }) => {
    await phoneResult(user, table, 5);
    const page = user.page;
    await page.reload();
    await expectReadable(page.getByText(TEXT.noResult, { exact: true }), { timeout: 15_000 });
    await expect(page.getByRole('button', { name: '로비로 돌아가기' })).toBeVisible();
    await expect(returnButton(page)).toHaveCount(0);
    await expect(lobbyButton(page)).toHaveCount(0);
});

test('A08-E-090 [모바일] 6명 판 진행 중: 판 밖 사람이 그 코드 입력 → "이미 게임이 시작된 방" 글이 읽힘 @game', async ({ user, table }) => {
    const page = user.page;
    const t = await table.setup({ bots: 6, roles: ({ bots }) => rolesFor([], [bots.at(-1)]) });
    expect((await t.state())?.phase, '판 진행 중').not.toBe('ENDED');

    // 폰은 거절 글이 양피지 안내 창에 뜸 → 읽히는지 보고 닫음
    const text = await codeEntryAlert(page, t.roomCode, { close: false });
    expect(text).toContain(TEXT.started);
    const dialog = page.getByRole('alertdialog', { name: '안내' }).last();
    await expectReadable(dialog.getByRole('paragraph').first());
    await dialog.getByRole('button', { name: '확인' }).click();
    await expect(page).toHaveURL(/\/roomInvite/);
    expect(await e2e.roomOf(U(user)), '방 자리 안 생김').toBeNull();
});

test('A08-E-091 [모바일] 5명 판(내가 방장): 판 중 설정 시트에 "방관리" 탭도 "다음 게임 설정 유지"도 없음 @game', async ({ user, bots }) => {
    const page = user.page;
    await seatPhoneHosted(bots, user, [], 4);
    await ui.readRoleReveal(page);
    const tabs = await openIngameSettings(page);
    await expect(tabs.getByText('채팅', { exact: true })).toBeVisible();
    await expect(page.getByText('다음 게임 설정 유지')).toHaveCount(0);
    // 결정(2026-11-16 아침 12번): 방관리 탭째 없앰
    await expect(tabs.getByText('방관리', { exact: true })).toHaveCount(0);
});

test('A08-E-092 [모바일] 6명 판: 봇 1은 결과 화면 그대로 → 내 대기방 명단에 없음, 5명으로 시작 됨 @game', async ({ user, table }) => {
    test.setTimeout(180_000);
    const { t, joker, host } = await phoneResult(user, table, 6);
    const page = user.page;
    const stays = t.bots.find((bot) => bot !== host && bot !== joker);
    const back = t.bots.filter((bot) => bot !== stays);
    await pressReturn(page);
    for (const bot of back) await botReturn(bot, t.gameId);
    await expectParty(page, 5);
    expect(await seatsOf(U(user)), '서버 방 명단').not.toContain(U(stays));

    const t2 = await startByBot(host, [user], back, rolesFor([user], [back.at(-1)]));
    expect(t2.gameId, '새 판').not.toBe(t.gameId);
    const s2 = await e2e.game(t2.gameId);
    expect(s2.players, '둘째 판 5명').toHaveLength(5);
    expect(s2.players.map((p) => p.uuid)).not.toContain(U(stays));
});

test('A08-E-093 [모바일] 5명 판: 결과 화면에서 뒤로 가기 → 확인 창 글 "로비로 나가시겠습니까?" @game', async ({ user, table }) => {
    await phoneResult(user, table, 5);
    const page = user.page;
    // 합친 뒤 모바일 확인 창은 양피지 확인 창(appConfirm) → 브라우저 창·양피지 창 둘 다 받는 도우미로 취소
    const asked = answerNextConfirm(page, false);
    await page.evaluate(() => window.history.back());
    expect(await asked).toBe(TEXT.lobbyConfirm);
    await expect(page).toHaveURL(/\/gameresult/);
    await expect(returnButton(page)).toBeVisible();
});

test('A08-E-094 [모바일][버그 3] 5명 판: 봇 4는 "대기방으로", 나는 "로비로" → 로비에서 방 만들기 됨 @game', async ({ user, table }) => {
    const { t, host } = await phoneResult(user, table, 5);
    const page = user.page;
    for (const bot of t.bots) await botReturn(bot, t.gameId);
    await leaveToLobby(page);

    // "이미 참여 중인 방"으로 막히지 않고 새 방이 열림, 옛 방 명단엔 내가 없음
    const room = await createRoomOnPhone(user);
    expect(room.roomCode, '새 방은 다른 코드').not.toBe(t.roomCode);
    expect(room.players.map((p) => p.uuid), '새 방 명단').toEqual([U(user)]);
    expect(await seatsOf(U(host)), '옛 방 명단').not.toContain(U(user));
});

test('A08-E-095 [모바일] 7명 봇 판 끝 → 판 밖 사람이 그 코드 입력 → 대기방 @game', async ({ user, table }) => {
    const page = user.page;
    const t = await table.setup({ bots: 7, roles: ({ bots }) => rolesFor([], [bots.at(-1)]) });
    const joker = await findJokerBot(t, t.bots, { not: t.bots[0] });
    await jokerLeaves(t, joker);
    await expect.poll(async () => (await t.state())?.phase ?? 'ENDED', { message: '판 끝' }).toBe('ENDED');

    await ui.joinRoomByCodeUi(page, t.roomCode);
    await expectParty(page, 1);
    expect((await e2e.roomOf(U(user)))?.roomCode, '서버 방 코드').toBe(t.roomCode);
});

test('A08-E-096 [모바일] 6명 판(내가 방장): 나 + 봇 3만 대기방으로 → "게임시작"을 누르면 막힘 창에 인원 조건 거절 글이 읽힘, 새 판 안 생김 @game', async ({ user, bots }) => {
    test.setTimeout(180_000);
    const page = user.page;
    const me = U(user);
    const { t, joker, botList } = await seatPhoneHosted(bots, user, [], 5);
    await jokerLeaves(t, joker);
    await allAtResult([user]);
    await pressReturn(page);
    // 원래 방장이라 바로 방장
    await expect(startButton(page)).toBeVisible();

    const back = botList.filter((bot) => bot !== joker).slice(0, 3);
    for (const bot of back) await botReturn(bot, t.gameId);
    await readyBots(back, await e2e.roomOf(me));
    await readyHumans([user]);
    await expectParty(page, 4);

    // 4명 이하면 시작 안 됨 — 모바일(상대 화면)은 "게임시작"을 눌러야 막힘 창에 서버 거절 글 (expectStartBlocked가 화면에 맞춰 봄)
    await expectStartBlocked(page, { count: 4 });
    await expect(page).toHaveURL(/\/game-matching/);
    expect(await e2e.gameOf(me), '새 판 안 생김').toBeNull();
});

test('A08-E-097 [모바일] 5명 판: 같은 방 둘째 판의 방 코드 = 첫 판 코드 @game', async ({ user, table }) => {
    test.setTimeout(180_000);
    const { t, host } = await phoneResult(user, table, 5);
    const page = user.page;
    await pressReturn(page);
    for (const bot of t.bots) await botReturn(bot, t.gameId);
    await expectParty(page, 5);

    const t2 = await startByBot(host, [user], t.bots, rolesFor([user], [t.bots.at(-1)]));
    expect(t2.gameId, '새 판').not.toBe(t.gameId);
    expect((await e2e.game(t2.gameId))?.roomCode, '서버 둘째 판 방 코드').toBe(t.roomCode);
    // 판 화면 설정 시트 "방 코드 보기"에도 같은 코드
    await ui.readRoleReveal(page);
    await openIngameSettings(page);
    await page.getByTestId('setting-room-code').click();
    await expect(page.getByRole('group', { name: `방코드 ${t.roomCode}`, exact: true })).toBeVisible();
});

// A08-E-098("방장 자리" 이름표 글자 대비)은 지움: 모바일(상대 화면)엔 그 이름표가 없음

test('A08-E-099 [모바일] 5명 판: 실패 안내가 떠도 두 단추가 안 가려짐 @game', async ({ user, table }) => {
    const page = user.page;
    const gate = await gateSocket(page);
    await phoneResult(user, table, 5);
    await gate.cut();
    await returnButton(page).click();
    await expect(leaveNotice(page)).toHaveText(TEXT.returnOffline);
    await expectReadable(leaveNotice(page));
    // 단추 가운데 점에 단추 글이 그대로 있음 (안내가 덮으면 실패)
    await expectReadable(returnLabel(page));
    await expectReadable(lobbyLabel(page));
});

test('A08-E-100 [모바일] 5명 판: 전원 대기방으로 → 내 화면 새로고침 → 같은 대기방 그대로 @game', async ({ user, table }) => {
    const { t } = await phoneResult(user, table, 5);
    const page = user.page;
    await pressReturn(page);
    for (const bot of t.bots) await botReturn(bot, t.gameId);
    await expectParty(page, 5);

    await page.reload();
    await expect(page).toHaveURL(/\/game-matching/);
    await expectParty(page, 5);
    await expectRoomCodeShown(page, t.roomCode);
    expect(await seatsOf(U(user)), '서버 방 명단').toHaveLength(5);
});

'use strict';

// 판 끝 뒤 같은 방에 다시 들어오는 브라우저 시험 (PC, 어려움) — 죽고 나간·탈주·로비 간·새로고침·끊긴 사람의 코드 입장, 추방 3번 기록, 공개 방 목록, 대기방 새로고침, 돌아와서 다음 판
// 목록 A08-판끝-같은방.md 번호 A08-H-021~023·028·042·043·046·050 (판은 광대 봇이 나가거나 밤 암살로 끝냄, 끊김은 화면 소켓 길목으로)
const { test, expect } = require('../../helpers/fixtures');
const { expectReadable } = require('../../helpers/visible');
const { e2e } = require('../../helpers/internal');
const { Table } = require('../../helpers/game');
const { joinRoomByCodeUi } = require('../../helpers/ui');
const { createRoomUi, botsJoinAndReady, closeReveals, openRoomList, findRoomRow } = require('../room/roomHelpers');
const N = require('../ingame/b-night/_night');
const {
    U, TEXT, returnButton, leaveNotice, startButton, openHumans, rolesFor, expectRoles, findJokerBot, seatTable, seatHosted,
    jokerLeaves, killByNight, leaveGameUi, allAtResult, pressReturn, leaveToLobby, botReturn, seatsOf, expectParty, expectRoomCodeShown,
    codeEntryAlert, readyHumans, startByBot, gateSocket,
} = require('./_a08-hard-kit');

const sorted = (list) => [...list].sort();

// 죽은 사람: 연출 창을 닫으며 "사망 후 선택" 창을 기다림 → "게임 나가기" → 판 화면을 벗어남 (죽은 뒤라 탈주 아님)
async function leaveAsDead(page) {
    const dead = page.getByRole('dialog', { name: '사망 후 선택' });
    await expect(async () => {
        await N.closeNotices(page);
        await N.closeDawnReport(page);
        await expect(dead).toBeVisible({ timeout: 1500 });
    }).toPass({ timeout: 45_000 });
    // 나가기 확인을 브라우저 확인 창으로 물으면 "확인"
    const accept = (dialog) => { dialog.accept().catch(() => {}); };
    page.on('dialog', accept);
    await dead.getByRole('button', { name: '게임 나가기' }).click();
    await expect(page).not.toHaveURL(/\/ingame/, { timeout: 15_000 });
    page.off('dialog', accept);
}

// 방장이 "참가자 추방" 창에서 그 사람 줄의 "추방"을 누름 → 그 사람이 방에서 빠질 때까지, 창은 닫아 둠
async function kickUi(hostPage, target) {
    await hostPage.getByRole('button', { name: '참가자 추방' }).click();
    const dialog = hostPage.getByRole('dialog', { name: '플레이어 추방' });
    await dialog.getByRole('listitem').filter({ hasText: target.account.nickname })
        .getByRole('button', { name: '추방', exact: true }).click();
    await expect.poll(() => e2e.roomOf(U(target)), { message: '추방된 사람 방 자리 없음' }).toBeNull();
    if (await dialog.isVisible().catch(() => false)) await hostPage.getByRole('button', { name: '플레이어 추방 닫기' }).last().click();
    await expect(dialog).toHaveCount(0);
}

/**
 * 5명 판(사람 3 + 봇 2, 봇 방장)을 탈주 없이 끝내고 셋이 결과 화면에 있는 모습까지
 * 광대 2(ㄱ + 방장 봇) → 방장 봇이 밤에 다른 봇을 암살 → 광대 2 : 나머지 2 → 광대 승
 */
async function fiveEndedTogether(players, table) {
    const [a, b, c] = await openHumans(players, 3);
    const t = await table.setup({
        humans: [a, b, c],
        bots: 2,
        settings: { jokerCount: 2 },
        roles: ({ bots }) => rolesFor([a, b, c], [a, bots[0]]),
    });
    const [host, victim] = t.bots;
    await expectRoles(t.gameId, rolesFor([a, b, c], [a, host]));
    await killByNight(t, [host], [U(victim)]);
    await allAtResult([a, b, c]);
    return { a, b, c, t, host };
}

// ㄷ이 돌아온 방에서 다섯이 둘째 판을 같이 시작하는지
async function expectNextGameTogether({ a, b, c, t, host }) {
    for (const p of [a, b, c]) await expectParty(p.page, 5);
    const t2 = await startByBot(host, [a, b, c], t.bots, rolesFor([a, b, c], [a, host]));
    expect(t2.gameId, '새 판').not.toBe(t.gameId);
    const s2 = await e2e.game(t2.gameId);
    expect(sorted(s2.players.map((p) => p.uuid)), '둘째 판 5명 (ㄷ 포함)').toEqual(sorted([a, b, c, ...t.bots].map(U)));
    expect(s2.roomCode, '둘째 판 방 코드').toBe(t.roomCode);
}

test('A08-H-021 7명 판(사람 3 + 봇 4): ㄱ 처형 뒤 나감 · ㄴ 산 채로 나감 · ㄷ 판 끝 뒤 로비로 → 판 끝 뒤 같은 코드: ㄱ 들어감 / ㄴ 탈주 대기 글 / ㄷ 들어감 @game @hard', async ({ players, table }) => {
    test.setTimeout(480_000);
    const [a, b, c] = await openHumans(players, 3);
    const { t, joker } = await seatTable(table, [a, b, c], 4);

    // 봇 4표로 ㄱ을 처형 (기권 3보다 많음)
    await t.assertBotsCanExecute(U(a));
    t.playBots({ dayVote: U(a), tribunal: 'GUILTY', night: 'skip' });
    await closeReveals([a.page, b.page, c.page]);
    await t.advanceUntil((g) => g.players.find((p) => p.uuid === U(a))?.alive === false, { stepDelayMs: 1200, maxSteps: 60 });
    await t.stopBots();

    await leaveAsDead(a.page);
    await leaveGameUi(b.page);
    await expect.poll(async () => (await t.player(U(b)))?.isParticipating, { message: 'ㄴ이 판에서 빠짐' }).toBe(false);

    // 광대 봇이 나가 판 끝 → ㄷ은 결과 화면에서 "로비로"
    await jokerLeaves(t, joker);
    await allAtResult([c]);
    await leaveToLobby(c.page);

    await joinRoomByCodeUi(a.page, t.roomCode);
    expect(await codeEntryAlert(b.page, t.roomCode), 'ㄴ 코드 입장 안내').toMatch(TEXT.desertion);
    expect(await e2e.roomOf(U(b)), 'ㄴ 방 자리 없음').toBeNull();
    await joinRoomByCodeUi(c.page, t.roomCode);
    expect(await seatsOf(U(a)), '서버 방 명단').toEqual([U(a), U(c)]);
});

test('A08-H-022 6명 판(사람 2 + 봇 4): 판 전 방장 ㄱ이 ㄴ을 2번 추방(다시 들어와 판) → 판 끝 → 대기방에서 1번 더 추방 → ㄴ 코드 입장은 추방 거절 글 @game @hard', async ({ players, bots }) => {
    test.setTimeout(420_000);
    const [a, b] = await openHumans(players, 2);
    // 광대 1 (설정 화면 처음 값은 광대 2라 광대 봇을 하나로 못 정함)
    const room = await createRoomUi(a, { jokers: 1 });
    for (let i = 0; i < 2; i += 1) {
        await joinRoomByCodeUi(b.page, room.roomCode);
        await expectParty(a.page, 2);
        await kickUi(a.page, b);
    }
    // 2번 추방까진 다시 들어와 판을 함
    await joinRoomByCodeUi(b.page, room.roomCode);
    const botList = await bots.spawn(4);
    await botsJoinAndReady(botList, U(a), room.roomCode);
    await expectParty(a.page, 6);
    await e2e.setRoles(rolesFor([a, b], [botList.at(-1)]), { roomId: room.roomId });
    await readyHumans([b, a]);
    await startButton(a.page).click();
    for (const p of [a, b]) await expect(p.page).toHaveURL(/\/ingame/, { timeout: 20_000 });
    const t = new Table({ room, bots: botList, humans: [a, b] });
    t.gameId = (await e2e.gameOf(U(a))).gameId;
    await jokerLeaves(t, await findJokerBot(t, botList));
    await allAtResult([a, b]);

    // 같은 방으로 돌아온 뒤 3번째 추방
    await pressReturn(b.page);
    await pressReturn(a.page);
    await expectParty(a.page, 2);
    await kickUi(a.page, b);

    expect(await codeEntryAlert(b.page, room.roomCode), 'ㄴ 코드 입장 안내').toBe(TEXT.codeKicked);
    expect(await e2e.roomOf(U(b)), 'ㄴ 방 자리 없음').toBeNull();
    expect(await seatsOf(U(a)), '서버 방 명단').toEqual([U(a)]);
});

test('A08-H-023 5명 공개 방 판(사람 3 + 봇 2): 판 끝 → ㄷ 방 목록에 그 방 없음 → ㄱ 대기방으로 → ㄷ 목록에 보임 → 목록으로 들어옴 @game @hard', async ({ players, table }) => {
    test.setTimeout(360_000);
    const [a, b, c] = await openHumans(players, 3);
    const { t, joker, host } = await seatTable(table, [a, b, c], 2, { accessType: 'open' });
    const title = `${host.nickname}의 방`;
    await jokerLeaves(t, joker);
    await allAtResult([a, b, c]);

    // 아무도 안 들어간 빈 방은 목록에 없음
    await openRoomList(c.page);
    expect(await findRoomRow(c.page, title, { timeoutMs: 3000 }), '0명 방은 목록에 없음').toBeNull();

    await pressReturn(a.page);
    const row = await findRoomRow(c.page, title, { timeoutMs: 15_000 });
    expect(row, '첫 사람이 들어온 뒤 목록에 보임').not.toBeNull();
    await expect(row).toHaveAccessibleName(new RegExp(`${title}, 1/5명`));

    await row.click();
    await c.page.getByRole('button', { name: '선택한 방 입장' }).click();
    await expect(c.page).toHaveURL(/\/game-matching/, { timeout: 20_000 });
    expect(await seatsOf(U(a)), '서버 방 명단').toEqual([U(a), U(c)]);
    expect((await e2e.roomOf(U(c)))?.roomCode, '같은 방').toBe(t.roomCode);
    await expect(b.page).toHaveURL(/\/gameresult/);
});

test('A08-H-028 [B06-4] 5명 판(사람 3 + 봇 2): 전원 대기방으로 → 방장부터 한 명씩 새로고침 → 마지막 사람도 같은 대기방 그대로 @game @hard', async ({ players, bots }) => {
    test.setTimeout(360_000);
    const [a, b, c] = await openHumans(players, 3);
    const { t, joker, botList } = await seatHosted(bots, a, [b, c], 2);
    await jokerLeaves(t, joker);
    await allAtResult([a, b, c]);

    const backBot = botList.find((bot) => bot !== joker);
    for (const p of [a, b, c]) await pressReturn(p.page);
    await botReturn(backBot, t.gameId);
    for (const p of [a, b, c]) await expectParty(p.page, 4);

    for (const p of [a, b, c]) {
        await p.page.reload();
        await expect(p.page).toHaveURL(/\/game-matching/);
        await expectParty(p.page, 4);
        await expectRoomCodeShown(p.page, t.roomCode);
    }
    await expect(startButton(a.page)).toBeVisible();
    const room = await e2e.roomOf(U(c));
    expect(sorted(room.players.map((p) => p.uuid)), '서버 방 명단 그대로').toEqual(sorted([a, b, c, backBot].map(U)));
    expect(room.hostUuid, '서버 방장 그대로').toBe(U(a));
});

test('A08-H-042 5명 판(사람 3 + 봇 2): ㄷ 로비로 → 나머지 대기방으로 → ㄷ 같은 코드로 다시 → 준비 → 둘째 판 함께 시작 @game @hard @smoke', async ({ players, table }) => {
    test.setTimeout(420_000);
    const seated = await fiveEndedTogether(players, table);
    const { a, b, c, t } = seated;

    await leaveToLobby(c.page);
    await pressReturn(a.page);
    await pressReturn(b.page);
    for (const bot of t.bots) await botReturn(bot, t.gameId);
    await expectParty(a.page, 4);

    await joinRoomByCodeUi(c.page, t.roomCode);
    await expectNextGameTogether(seated);
});

test('A08-H-043 5명 판(사람 3 + 봇 2): ㄷ 결과 화면 새로고침 → 결과 없음 → 로비 → 같은 코드 → 둘째 판 함께 시작 @game @hard', async ({ players, table }) => {
    test.setTimeout(420_000);
    const seated = await fiveEndedTogether(players, table);
    const { a, b, c, t } = seated;

    await c.page.reload();
    await expectReadable(c.page.getByText(TEXT.noResult, { exact: true }), { timeout: 15_000 });
    await c.page.getByRole('button', { name: '로비로 돌아가기' }).click();
    await expect(c.page).toHaveURL(/\/lobby/);

    await pressReturn(a.page);
    await pressReturn(b.page);
    for (const bot of t.bots) await botReturn(bot, t.gameId);
    await expectParty(a.page, 4);

    await joinRoomByCodeUi(c.page, t.roomCode);
    await expectNextGameTogether(seated);
});

test('A08-H-046 5명 판(사람 2 + 봇 3): ㄱ이 끊긴 채 "대기방으로" → 연결 안내 → 다시 붙어 누름 → "연결이 끊겨 이 판에서 빠졌습니다…" 글 → 코드로는 들어감 @game @hard', async ({ players, table }) => {
    test.setTimeout(360_000);
    const [a, b] = await openHumans(players, 2);
    const page = a.page;
    const gate = await gateSocket(page);
    const { t, joker } = await seatTable(table, [a, b], 3);
    await jokerLeaves(t, joker);
    await allAtResult([a, b]);

    await gate.cut();
    await returnButton(page).click();
    await expect(leaveNotice(page)).toHaveText(TEXT.returnOffline);
    await expectReadable(leaveNotice(page));

    // 끊기는 순간 서버는 그 판에서 바로 뺌 → 다시 붙어 눌러도 결과 화면 사람이 아님 (결과 화면 시간은 남아 끊겨 빠졌다는 글)
    await gate.restore();
    await expect(async () => {
        await returnButton(page).click();
        await expect(leaveNotice(page)).toHaveText(TEXT.returnDropped, { timeout: 3000 });
    }).toPass({ timeout: 30_000 });
    await expectReadable(leaveNotice(page));
    await expect(page).toHaveURL(/\/gameresult/);

    await joinRoomByCodeUi(page, t.roomCode);
    expect((await e2e.roomOf(U(a)))?.roomCode, '같은 방').toBe(t.roomCode);
    await expect(b.page).toHaveURL(/\/gameresult/);
});

test('A08-H-050 6명 판(사람 2 + 봇 4): 판 끝 직전 ㄴ이 탭을 닫음 → 판 끝 → ㄴ 다시 접속하면 결과 없음 → 코드로 대기방 → 다음 판 함께 @game @hard', async ({ players, table }) => {
    test.setTimeout(420_000);
    const [a, b] = await openHumans(players, 2);
    const { t, joker, host } = await seatTable(table, [a, b], 4);
    await closeReveals([a.page, b.page]);

    await b.page.close();
    await jokerLeaves(t, joker);
    await allAtResult([a]);

    // ㄴ: 같은 브라우저에서 새 탭으로 다시 접속
    const again = await b.context.newPage();
    await again.goto('/gameresult');
    await expectReadable(again.getByText(TEXT.noResult, { exact: true }), { timeout: 15_000 });
    await again.getByRole('button', { name: '로비로 돌아가기' }).click();
    await expect(again).toHaveURL(/\/lobby/);
    await joinRoomByCodeUi(again, t.roomCode);

    // ㄱ + 남은 봇 3 + ㄴ = 5명으로 다음 판
    const backBots = t.bots.filter((bot) => bot !== joker);
    await pressReturn(a.page);
    for (const bot of backBots) await botReturn(bot, t.gameId);
    await expectParty(a.page, 5);
    const bAgain = { account: b.account, page: again };
    const t2 = await startByBot(host, [a, bAgain], backBots, rolesFor([a, b], [backBots.at(-1)]));
    expect(t2.gameId, '새 판').not.toBe(t.gameId);
    expect((await e2e.game(t2.gameId)).players.map((p) => p.uuid), '둘째 판에 ㄴ 있음').toContain(U(b));
});

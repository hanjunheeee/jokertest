'use strict';

// 진행 중 판 로비 입장 어려움 시험 (PC) — 산 사람은 새 탭·다른 기기·끊김 뒤에도 판으로 되돌아와 끝까지 함, 죽은 사람은 풀려 새 방·새 판, 골드는 그대로, 60초 탈락한 사람은 판으로 안 감
// 목록 A10-로비-입장-방어.md 번호 A10-H-004~008·015~018·027~029 (사람 2~5 + 봇, @realtime 둘은 진짜 시간 — 쓰는 동안 안 돌림)
const { test, expect, ui, e2e } = require('../../helpers/fixtures');
const { expectReadable } = require('../../helpers/visible');
const db = require('../../helpers/db');
const { hostGame, closeReveals, openSetup, waitResult } = require('../room/roomHelpers');
const K = require('../ingame/_a09-simple-kit');
const N = require('../ingame/b-night/_night');
const P = require('../ingame/_a04-pc');
const A5 = require('../mobile/_a05a-kit');
const H = require('../result/_a08-hard-kit');
const store = require('../store/store-tools');

const SAME_BROWSER = '같은 브라우저의 다른 창에서 접속해 현재 창의 연결이 종료되었습니다.';
const OTHER_LOGIN = '다른 기기 또는 브라우저에서 로그인되어 현재 접속이 종료되었습니다.';
const ALREADY_IN_ROOM = '이미 참여 중인 방이 있습니다.';
const U = (x) => x.account?.uuid ?? x.uuid;
const nick = (x) => x.account?.nickname ?? x.nickname;

/** 방 만들기 → 대기방까지, 방장 = 나 ("이미 참여 중인 방" 거절 글이 안 떠야 함) */
async function makeRoom(person) {
    const page = person.page;
    const said = [];
    const onDialog = (d) => { said.push(d.message()); d.accept().catch(() => {}); };
    page.on('dialog', onDialog);
    try {
        await openSetup(page);
        await page.getByRole('button', { name: '게임 만들기' }).click();
        await expect(page).toHaveURL(/\/game-matching/, { timeout: 15_000 });
    } finally {
        page.off('dialog', onDialog);
    }
    expect(said, '방 만들기 때 뜬 알림').not.toContain(ALREADY_IN_ROOM);
    await expect.poll(async () => (await e2e.roomOf(U(person)))?.hostUuid, { message: '새 방 방장 = 나' }).toBe(U(person));
}

/** 서버 판 값에서 그 사람이 산 채로 그 판에 참여 중 */
async function expectAliveIn(t, uuid) {
    const g = await e2e.gameOf(uuid);
    expect(g?.gameId, '그 사람 판').toBe(t.gameId);
    const row = K.rowOf(g, uuid);
    expect(row?.alive, '산 채').toBe(true);
    expect(row?.isParticipating, '판에 남음').toBe(true);
}

/** 죽은 사람이 그 판에서 풀렸는지 (서버 판 명단에서 참여 중 아님) */
async function expectReleased(t, uuid) {
    await expect.poll(async () => K.rowOf(await e2e.game(t.gameId), uuid)?.isParticipating, { message: '판에서 풀림' }).toBe(false);
}

/** 주소 /lobby → 판 화면으로 되돌아옴 */
async function lobbyBouncesToGame(page) {
    await page.goto('/lobby');
    await expect(page).toHaveURL(/\/ingame/, { timeout: 15_000 });
}

/** 낮 투표 단계에서 화면 카드 메뉴로 그 사람에게 투표 → 서버가 받음 ("기권" 단추가 꺼짐) */
async function voteUi(page, targetNickname) {
    const menu = await N.openCardMenu(page, targetNickname);
    await A5.menuItem(menu, '투표하기').click();
    await expect(page.getByRole('button', { name: '기권' })).toBeDisabled();
}

/** 광대 봇이 첫 밤에 그 사람을 암살 → 죽을 때까지 */
async function nightKill(t, joker, uuid) {
    await N.toTurn(t, 'JOKER');
    const reply = await N.botNight(t, joker, uuid);
    expect(reply?.ok, `밤 암살 답 ${JSON.stringify(reply)}`).toBe(true);
    await N.advanceUntilSettled(t, (s) => K.rowOf(s, uuid)?.alive === false);
}

/** 봇 표로 광대 봇 처형 → 시민 승으로 판 끝, 그 사람 화면이 결과 화면까지 → 끝난 판 요약 */
async function endByJoker(t, joker, page) {
    const end = await K.execute(t, U(joker));
    expect(end.phase, '광대 처형으로 판 끝').toBe('ENDED');
    if (page) {
        await K.pastExpulsion(page);
        await waitResult(page);
    }
    return end;
}

/** 단계를 바로 끝내기 (이미 끝났으면 손잡이가 거절해도 그냥 지나감) */
const advanceQuiet = (t) => t.advance().catch(() => null);

/** 판이 끝날 때까지 → 끝난 판 요약 */
async function waitEnded(t) {
    let last = null;
    await expect.poll(async () => { last = await t.state(); return last?.phase; }, { timeout: 30_000, message: '판 끝' }).toBe('ENDED');
    return last;
}

test('A10-H-004 사람 2 + 봇 4 = 6명 판, A 같은 브라우저 새 탭 /lobby → 새 탭 /ingame, 옛 탭 알림, 새 탭에서 투표 → B 화면에 A 산 채 @hard @game @smoke', async ({ user, players, table }) => {
    test.setTimeout(240_000);
    const a = user;
    const b = await players.add();
    const { t, joker } = await H.seatTable(table, [a, b], 4);
    await closeReveals([a.page, b.page]);

    let tab = null;
    const message = await ui.captureAlert(a.page, async () => {
        tab = await a.context.newPage();
        await tab.goto('/lobby');
    }, { timeoutMs: 15_000 });
    expect(message).toBe(SAME_BROWSER);
    await expect(tab).toHaveURL(/\/ingame/, { timeout: 15_000 });
    await expectAliveIn(t, U(a));

    await K.toVote(t);
    await voteUi(tab, nick(joker));
    await expect(K.cardOf(b.page, nick(a))).toHaveAttribute('data-ingame-player-status', 'alive');
    await expectAliveIn(t, U(a));
});

test('A10-H-005 사람 2 + 봇 5 = 7명 판, A 다른 브라우저 로그인 → /lobby → /ingame 같은 판, 옛 브라우저 /login, 판 끝까지 A 산 채 @hard @game', async ({ user, players, table }) => {
    test.setTimeout(300_000);
    const a = user;
    const b = await players.add();
    const { t, joker } = await H.seatTable(table, [a, b], 5);
    await closeReveals([a.page, b.page]);

    let a2 = null;
    const message = await ui.captureAlert(a.page, async () => {
        // 같은 계정으로 다른 브라우저(따로 쿠키) 로그인, 로비 주소로 감
        a2 = await players.add({ account: a.account, lobby: false });
        await a2.page.goto('/lobby');
    }, { timeoutMs: 15_000 });
    expect(message).toBe(OTHER_LOGIN);
    await expect(a2.page).toHaveURL(/\/ingame/, { timeout: 15_000 });
    await expect(a.page).toHaveURL(/\/login/, { timeout: 15_000 });
    await expectAliveIn(t, U(a));

    const end = await endByJoker(t, joker, a2.page);
    const row = K.rowOf(end, U(a));
    expect(row?.alive, '판 끝까지 산 채').toBe(true);
    expect(row?.isParticipating, '판 끝까지 남음').toBe(true);
});

test('A10-H-006 사람 2 + 봇 6 = 8명 판, A 처형 → /lobby → A 방 만들기 됨, B 판 끝까지 → A 지갑 +1·장부 GAME_REWARD 1줄 @hard @game', async ({ user, players, table }) => {
    test.setTimeout(300_000);
    const a = user;
    const b = await players.add();
    const goldBefore = Number((await store.wallet(U(a))).gold);
    const { t, joker } = await H.seatTable(table, [a, b], 6);
    await closeReveals([a.page, b.page]);

    await K.execute(t, U(a));
    await ui.gotoLobby(a.page);
    await expectReleased(t, U(a));
    await makeRoom(a);

    await endByJoker(t, joker, b.page);
    // 골드는 판 끝 저장 뒤 따로 지급됨
    await expect.poll(async () => Number((await store.wallet(U(a))).gold), { timeout: 30_000, message: 'A 지갑 골드' }).toBe(goldBefore + 1);
    const rows = await db.query("SELECT amount FROM economy_ledger_entries WHERE user_id = ? AND reason = 'GAME_REWARD'", [U(a)]);
    expect(rows, 'A 판 보상 장부 줄').toHaveLength(1);
    expect(Number(rows[0].amount)).toBe(1);
});

test('A10-H-007 사람 2 + 봇 4 = 6명 판, 방장 A 처형 → /lobby → 판 끝 → B "대기방으로" → B 화면에 방장 단추 @hard @game', async ({ user, players, bots }) => {
    test.setTimeout(300_000);
    const a = user;
    const b = await players.add();
    // A가 화면으로 방을 만든 방장, B가 먼저 들어온 손님
    const { t, joker } = await H.seatHosted(bots, a, [b], 4);
    await closeReveals([a.page, b.page]);

    await K.execute(t, U(a));
    await ui.gotoLobby(a.page);
    await expectReleased(t, U(a));

    await endByJoker(t, joker, b.page);
    await H.pressReturn(b.page);
    await expect.poll(async () => (await e2e.roomOf(U(b)))?.hostUuid, { message: '다시 연 방 방장' }).toBe(U(b));
    await expect(H.startButton(b.page)).toBeVisible({ timeout: 15_000 });
    await expectReadable(H.startButton(b.page).getByText('게임시작', { exact: true }));
    await expectReadable(b.page.getByRole('button', { name: '방 설정 변경' }).getByText('방 설정 변경', { exact: true }));
});

test('A10-H-008 판 1(사람 2 + 봇 4) A 처형 → /lobby → A 새 방 + 봇 4 → 판 2 → A 화면엔 판 2 단계만, 판 1이 2일로 가도 안 뜸 @hard @game', async ({ user, players, table, bots }) => {
    test.setTimeout(300_000);
    const a = user;
    const b = await players.add();
    const { t: t1 } = await H.seatTable(table, [a, b], 4);
    await closeReveals([a.page, b.page]);
    await K.execute(t1, U(a));
    await ui.gotoLobby(a.page);
    await expectReleased(t1, U(a));

    const fresh = await bots.spawn(4);
    const t2 = await hostGame({ host: a, botList: fresh, roles: H.rolesFor([a], [fresh.at(-1)]), settings: { maxPlayers: 5 } });
    expect(t2.gameId).not.toBe(t1.gameId);
    await closeReveals([a.page]);
    await t2.advanceUntil('DAY');
    // A 화면 = 판 2 첫 낮, 판 2 사람 카드
    await expect(a.page.locator('[aria-label="제 1일 시간 흐름"]')).toHaveCount(1, { timeout: 20_000 });
    for (const bot of fresh) await expect(K.cardOf(a.page, bot.nickname)).toHaveCount(1);

    // 판 1만 밤 → 2일 낮으로
    await N.advanceUntilSettled(t1, (s) => s.phase === 'DAY' && s.dayIndex === 2);
    expect((await t2.state()).dayIndex, '판 2는 아직 1일').toBe(1);
    await expect(a.page.locator('[aria-label="제 1일 시간 흐름"]')).toHaveCount(1);
    await expect(a.page.locator('[aria-label="제 2일 시간 흐름"]')).toHaveCount(0);
    await expect(a.page.locator(`[data-ingame-player-nickname="${nick(b)}"]`), '판 1 사람 카드').toHaveCount(0);
    await expect(P.phaseNotice(a.page).getByText(P.TEXT.NIGHT)).toHaveCount(0);
});

test('A10-H-015 사람 2 + 봇 7 = 9명 판, A 탭 닫음 → 30초 뒤 새 탭 /lobby → /ingame 이어서 함, 닫은 뒤 70초에도 B 화면에 A 탈락 없음 @hard @game @realtime', async ({ user, players, table }) => {
    // 진짜 시간으로 70초 넘게 기다림 → 이 시험만 늘림
    test.setTimeout(300_000);
    const a = user;
    const b = await players.add();
    const { t } = await H.seatTable(table, [a, b], 7);
    await closeReveals([a.page, b.page]);

    const since = Date.now();
    await a.page.close();
    const dropAt = await K.droppedAt(t, U(a), since);
    await K.sleepUntil(dropAt + 30_000);
    const tab = await a.context.newPage();
    await lobbyBouncesToGame(tab);
    await K.returnedAt(t, U(a), dropAt);

    await K.sleepUntil(dropAt + 70_000);
    await expect(K.cardOf(b.page, nick(a))).toHaveAttribute('data-ingame-player-status', 'alive');
    await expectAliveIn(t, U(a));
    const eliminated = t.bots.some((bot) => bot.events.some((r) => r.event === 'player_eliminated' && r.at >= since && r.payload?.victimUuid === U(a)));
    expect(eliminated, 'A 탈락 알림').toBe(false);
});

test('A10-H-016 사람 2 + 봇 7 = 9명 판, 재판 피고 A가 /lobby → /ingame 재판 창, B 유죄 누름 → 판정 @hard @game', async ({ user, players, table }) => {
    test.setTimeout(300_000);
    const a = user;
    const b = await players.add();
    // 재판이 저절로 안 끝나게 시간을 길게 둠 (판정은 손잡이로)
    const { t } = await H.seatTable(table, [a, b], 7, P.LONG_TIMES);
    await closeReveals([a.page, b.page]);

    const { state, voters } = await K.voteOut(t, U(a));
    expect(state.phase).toBe('TRIBUNAL');
    expect(state.tribunal?.defendantUuid).toBe(U(a));

    await lobbyBouncesToGame(a.page);
    await P.expectTribunal(a.page, nick(a));
    await P.expectTribunal(b.page, nick(a));
    await P.press(b.page, P.TEXT.GUILTY);
    await K.botsJudge(t, voters, 'GUILTY');
    await advanceQuiet(t);
    await expect.poll(async () => {
        const s = await t.state();
        return s?.tribunal?.resolved === true || s?.phase !== 'TRIBUNAL';
    }, { message: '재판 판정', timeout: 20_000 }).toBe(true);
    await expect.poll(async () => K.rowOf(await t.state(), U(a))?.alive, { message: '유죄 → 처형' }).toBe(false);
});

test('A10-H-017 사람 3 + 봇 7 = 10명 판, A(산) /lobby → /ingame, B(죽음) /lobby 그대로·방 만들기 됨, C 판 끝까지 @hard @game', async ({ user, players, table }) => {
    test.setTimeout(300_000);
    const a = user;
    const b = await players.add();
    const c = await players.add();
    const { t, joker } = await H.seatTable(table, [a, b, c], 7);
    await closeReveals([a.page, b.page, c.page]);

    await K.execute(t, U(b));
    await lobbyBouncesToGame(a.page);
    await expectAliveIn(t, U(a));
    await ui.gotoLobby(b.page);
    await expectReleased(t, U(b));
    await expect(b.page).toHaveURL(/\/lobby/);
    await makeRoom(b);

    const end = await endByJoker(t, joker, c.page);
    expect(K.rowOf(end, U(c))?.isParticipating, 'C 판 끝까지').toBe(true);
    expect(K.rowOf(end, U(a))?.isParticipating, 'A 판 끝까지').toBe(true);
});

test('A10-H-018 사람 5 = 5명 판 (봇 없음), 3명이 차례로 /lobby → 모두 /ingame, 판 끝까지 5명 참여 그대로 @hard @game', async ({ user, players }) => {
    test.setTimeout(420_000);
    const people = [user];
    for (let i = 0; i < 4; i += 1) people.push(await players.add());
    const [host, ...guests] = people;
    const joker = people[4];
    const roles = H.rolesFor(people, [joker]);
    const t = await hostGame({ host, guests, botList: [], roles, settings: { maxPlayers: 5 } });
    await H.expectRoles(t.gameId, roles);
    await closeReveals(people.map((p) => p.page));

    for (const p of people.slice(0, 3)) {
        await lobbyBouncesToGame(p.page);
        await expectAliveIn(t, U(p));
    }

    // 시민 넷이 화면으로 광대에게 투표 → 재판 → 넷 다 유죄 → 처형 → 시민 승
    await K.toVote(t);
    const citizens = people.slice(0, 4);
    for (const p of citizens) await voteUi(p.page, nick(joker));
    await advanceQuiet(t);
    await expect.poll(async () => (await t.state())?.phase, { message: '투표 마감 뒤 재판' }).toBe('TRIBUNAL');
    for (const p of citizens) await P.press(p.page, P.TEXT.GUILTY);
    await advanceQuiet(t);
    const end = await waitEnded(t);
    for (const p of people) expect(K.rowOf(end, U(p))?.isParticipating, `${nick(p)} 판 끝까지 남음`).toBe(true);
    expect(K.rowOf(end, U(joker))?.alive, '광대 처형').toBe(false);
    for (const p of citizens) expect(K.rowOf(end, U(p))?.alive, `${nick(p)} 산 채`).toBe(true);
});

test('A10-H-027 사람 2 + 봇 5 = 7명 판, A 암살 → 탭 닫음 → B 판 계속 → A 새 탭 /lobby → 봇이 만든 다른 방 코드 입장, B 판은 끝까지 @hard @game', async ({ user, players, table, bots }) => {
    test.setTimeout(300_000);
    const a = user;
    const b = await players.add();
    const [other] = await bots.spawn(1);
    const otherRoom = await other.createRoom();
    const { t, joker } = await H.seatTable(table, [a, b], 5);
    await closeReveals([a.page, b.page]);

    await nightKill(t, joker, U(a));
    const since = Date.now();
    await a.page.close();
    await K.droppedAt(t, U(a), since);
    expect((await t.state())?.phase, 'B 판 계속').not.toBe('ENDED');

    const tab = await a.context.newPage();
    await ui.gotoLobby(tab);
    await expectReleased(t, U(a));
    await ui.joinRoomByCodeUi(tab, otherRoom.roomCode);
    await expect.poll(async () => (await e2e.roomOf(U(a)))?.hostUuid, { message: 'A가 들어간 방' }).toBe(other.uuid);

    await endByJoker(t, joker, b.page);
});

test('A10-H-028 사람 2 + 봇 4 = 6명 판, A 탭 닫음 → 진짜 60초 → B 화면 A 탈락 → A 새 탭 /lobby 그대로, 방 만들기 → 탈주 안내 글이 읽힘 @hard @game @realtime', async ({ user, players, table }) => {
    // 진짜 시간으로 60초 넘게 기다림 → 이 시험만 늘림
    test.setTimeout(300_000);
    const a = user;
    const b = await players.add();
    const { t } = await H.seatTable(table, [a, b], 4);
    await closeReveals([a.page, b.page]);

    const since = Date.now();
    await a.page.close();
    const dropAt = await K.droppedAt(t, U(a), since);
    const outAt = await K.eliminatedAt(t, U(a), since, { timeoutMs: 75_000 });
    // 끊긴 때부터 60초 (허용 폭 ±1.5초, 늘려서 덮지 않음)
    expect(outAt - dropAt).toBeGreaterThanOrEqual(K.GRACE_MS - K.SLACK_MS);
    expect(outAt - dropAt).toBeLessThanOrEqual(K.GRACE_MS + K.SLACK_MS);
    await expect(K.cardOf(b.page, nick(a))).toHaveAttribute('data-ingame-player-status', 'dead', { timeout: 15_000 });

    const tab = await a.context.newPage();
    await ui.gotoLobby(tab);
    await expect(tab).toHaveURL(/\/lobby/);
    expect(await K.createRoomAlert(tab)).toMatch(K.COOLDOWN_FIRST);
    await expect(tab).toHaveURL(/\/game-setup/);
    await expectReadable(tab.getByTestId('entry-failure-notice').getByText(K.COOLDOWN_FIRST));
});

test('A10-H-029 사람 2 + 봇 4 = 6명 판 두 번, 판 1 끝 → A /lobby → 새 방 → 판 2 중 A /lobby → /ingame 판 2 @hard @game', async ({ user, players, table, bots }) => {
    test.setTimeout(360_000);
    const a = user;
    const b = await players.add();
    const { t: t1, joker } = await H.seatTable(table, [a, b], 4);
    await closeReveals([a.page, b.page]);
    await H.jokerLeaves(t1, joker);
    await H.allAtResult([a, b]);
    await ui.gotoLobby(a.page);
    await ui.gotoLobby(b.page);

    // 판 2: A가 화면으로 방장, B 손님, 새 봇 4
    const fresh = await bots.spawn(4);
    const t2 = await hostGame({ host: a, guests: [b], botList: fresh, roles: H.rolesFor([a, b], [fresh.at(-1)]) });
    expect(t2.gameId).not.toBe(t1.gameId);
    await closeReveals([a.page, b.page]);

    await lobbyBouncesToGame(a.page);
    await expectAliveIn(t2, U(a));
});

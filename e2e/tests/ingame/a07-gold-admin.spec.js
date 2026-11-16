'use strict';

// 관리자가 판 골드 값을 바꿀 때·같은 방에서 판을 이어 할 때의 판 골드 브라우저 시험 (PC, 어려움) — 돌던 판은 시작 값 그대로, 다음 판부터 새 값, 판마다 장부 한 줄
// 목록 A07-승패-결과-골드.md 번호 A07-H-011~013 (011·013은 서버 전체 값을 바꿔서 @serial, 끝에 1로 되돌림), 돌리지 않고 모임만: npx playwright test --list --no-deps tests/ingame/a07-gold-admin.spec.js
const { test, expect, E2E } = require('../../helpers/fixtures');
const { Table } = require('../../helpers/game');
const { e2e } = require('../../helpers/internal');
const { query } = require('../../helpers/db');
const { readyUi } = require('../../helpers/ui');
const { createAdmin, loginAsAdmin } = require('../../helpers/adminAccounts');
const { hostGame, botsJoinAndReady, expectPartyCount, resultRow, closeReveals } = require('../room/roomHelpers');
const { wallet } = require('../store/store-tools');

// ── 이 파일 도우미 (공용으로 올릴 후보: A07 승패·결과 묶음) ──

const U = (x) => x.account.uuid;
const nick = (x) => x.account.nickname;
const resultBoard = (page) => page.getByRole('region', { name: '가면무도회 참가자 정체' });

// 봇 방장 판은 단계 시간을 가장 길게 둠 — 단계는 손잡이·"다 내면 5초"로만 넘어감 (화면을 누르거나 기다리는 동안 진짜 마감이 먼저 오면 흐름이 엇갈림)
const PACE = Object.freeze({ dayDiscussionTime: 150, dayVoteTime: 90, tribunalTime: 120, nightActionTime: 120 });
const goldChip = (page) => page.getByTestId('game-result-gold-reward');
const myChip = (who) => resultRow(who.page, nick(who)).getByTestId('game-result-gold-reward');
const rewardRef = (gameId) => `game-reward:${gameId}`;

// 서버가 정한 직업이 바라는 대로인지 (예약이 가끔 못 맞음 → 판이 다른 쪽으로 끝나는 것 막기)
function expectRoles(s, wanted) {
    for (const [uuid, role] of Object.entries(wanted)) {
        expect(s.players.find((p) => p.uuid === uuid)?.role, `미리 정한 직업 (${uuid})`).toBe(role);
    }
}

// 판 요약이 조건에 맞을 때까지 (단계는 안 넘김)
async function waitState(t, match, message, timeout = 20_000) {
    let last = null;
    await expect.poll(async () => { last = await t.state(); return last ? match(last) : false; }, { timeout, message }).toBe(true);
    return last;
}

// 광대 봇이 나가 시민 승으로 판을 끝냄 (하나뿐인 광대가 나가면 바로 승패가 남)
async function endByJokerLeaving(t, jokerBot) {
    const reply = await jokerBot.request('leave_game_session', { gameId: t.gameId });
    expect(reply?.ok, `봇 나가기 거절: ${reply?.code ?? '답 없음'}`).toBe(true);
    const end = await waitState(t, (g) => g.phase === 'ENDED', '광대가 나가 판 끝');
    expect(end.winResult?.winner, '서버 승자').toBe('CITIZEN');
    return end;
}

// 영상 연출 셋 (암살 영상·추방 연출·결과 영상) — "건너뛰기"는 이 안에서만 찾음 (밤 차례의 "건너뛰기" 단추와 안 섞이게)
const VIDEO_COVERS = '[data-ingame-night-success-kill], [data-ingame-tribunal-expulsion], [data-game-result-intro]';

// 화면을 막는 연출 넘기기: 영상이 못 돌 때 뜨는 "건너뛰기", 낮 시작 연출 글 창 "확인"
async function passCovers(page) {
    const skip = page.locator(VIDEO_COVERS).getByRole('button', { name: '건너뛰기' }).first();
    if (await skip.isVisible().catch(() => false)) await skip.click({ timeout: 1000 }).catch(() => {});
    const dawnOk = page.locator('[data-ingame-dawn-report]').getByRole('button', { name: '확인' });
    if (await dawnOk.count() > 0) await dawnOk.first().click({ timeout: 1000 }).catch(() => {});
}

// 결과판이 보일 때까지: 가는 길을 막는 연출만 넘김
async function toResult(page, { timeout = 60_000 } = {}) {
    const list = resultBoard(page);
    await expect(async () => {
        await passCovers(page);
        await expect(list).toBeVisible({ timeout: 1000 });
    }).toPass({ timeout });
    await expect(page).toHaveURL(/\/gameresult/);
    return list;
}

// 결과 화면 → "대기방으로" → 대기방 화면
async function backToRoom(page) {
    await toResult(page);
    await page.getByRole('button', { name: '대기방으로' }).click();
    await expect(page).toHaveURL(/\/game-matching/, { timeout: 20_000 });
}

// 같은 방에서 다음 판 시작: 새 봇 입장·준비 → 직업 다시 정하기 → 손님·방장 준비 → 게임시작 → 새 판
async function startAgain(host, guests, { newBots, roles, prevGameId }) {
    const room = await e2e.roomOf(U(host));
    expect(room?.roomCode, '돌아온 대기방').toBeTruthy();
    await botsJoinAndReady(newBots, U(host), room.roomCode);
    await e2e.setRoles(roles, { roomId: room.roomId });
    await expectPartyCount(host.page, 1 + guests.length + newBots.length);
    for (const who of [...guests, host]) {
        await readyUi(who.page);
        await expect(who.page.getByRole('button', { name: '준비취소' })).toBeVisible();
    }
    await host.page.getByRole('button', { name: '게임시작' }).click();
    for (const who of [host, ...guests]) await expect(who.page).toHaveURL(/\/ingame/, { timeout: 20_000 });
    const game = await e2e.gameOf(U(host));
    expect(game?.gameId, '새 판').toBeTruthy();
    expect(game.gameId, '앞 판과 다른 판').not.toBe(prevGameId);
    const t = new Table({ room, bots: newBots, humans: [host, ...guests] });
    t.gameId = game.gameId;
    expectRoles(await t.state(), roles);
    return t;
}

// 지갑 골드 (DB) · 그 값이 될 때까지 (판 골드는 판 끝 저장 뒤에 들어옴)
const goldOf = async (uuid) => (await wallet(uuid)).gold;
async function expectGold(uuid, amount) {
    await expect.poll(() => goldOf(uuid), { timeout: 30_000, message: '지갑 골드' }).toBe(amount);
}

// 그 사람이 받은 판 골드 장부 줄의 참조 id (정렬) — 판마다 game-reward:<판 id> 한 줄
async function rewardRefsOf(uuid) {
    const rows = await query("SELECT reference_event_id FROM economy_ledger_entries WHERE user_id = ? AND reason = 'GAME_REWARD'", [uuid]);
    return rows.map((r) => r.reference_event_id).sort();
}

// 판 전적이 DB에 저장될 때까지 (판 골드는 그 뒤에 들어옴 → "안 들어옴"을 볼 때 먼저 기다림)
async function expectRecorded(gameId) {
    await expect.poll(async () => (await query('SELECT id FROM game_results WHERE id = ?', [gameId])).length, {
        timeout: 30_000, message: '판 전적 저장',
    }).toBe(1);
}

// 관리자 창 하나 (PC 크기·관리자 주소) 열고 시험 관리자로 로그인 → { context, page }
async function openAdmin(browser) {
    const context = await browser.newContext({ baseURL: E2E.adminUrl, viewport: { width: 1280, height: 800 }, locale: 'ko-KR', timezoneId: 'Asia/Seoul' });
    const page = await context.newPage();
    await loginAsAdmin(page, await createAdmin());
    return { context, page };
}

// 관리자 API로 판 골드 값 바꾸기 (시작 값 맞추기·되돌리기용, 화면이 보내는 것과 같은 요청)
async function setGoldByApi(adminPage, goldReward) {
    const me = await adminPage.request.get(`${E2E.adminUrl}/admin-api/auth/me`);
    expect(me.ok(), '관리자 로그인 확인').toBe(true);
    const { csrfToken } = await me.json();
    const res = await adminPage.request.put(`${E2E.adminUrl}/admin-api/game-settings`, {
        data: { goldReward },
        headers: { 'x-admin-csrf': csrfToken, origin: E2E.adminUrl },
    });
    expect(res.status(), `판 골드 값 ${goldReward} 저장`).toBe(200);
}

// 관리자 화면 "판 설정"에서 값 바꾸기: 칸에 넣고 "바꾸기" → 확인 창 "바꾸기" → 지금 값 글이 바뀔 때까지
async function setGoldByUi(adminPage, value) {
    await adminPage.goto('/game-settings');
    await adminPage.getByLabel('판마다 주는 골드').fill(String(value));
    await adminPage.getByRole('button', { name: '바꾸기', exact: true }).click();
    const dialog = adminPage.getByRole('dialog', { name: '판 골드를 바꿀까요?' });
    await expect(dialog).toContainText(`골드 → ${value}골드`);
    await dialog.getByRole('button', { name: '바꾸기', exact: true }).click();
    await expect(adminPage.getByTestId('game-settings-gold')).toHaveText(`${value}골드`);
}

// ── 시험 ──

test('A07-H-011 사람 1 + 봇 4 = 5명 판 중에 관리자 화면에서 2로 바꿈 → 이 판은 "+1골드", 같은 방 다음 판은 "+2골드", 지갑 합 +3 @game @hard @serial', async ({ browser, user, bots }) => {
    test.setTimeout(420_000);
    const me = U(user);
    const admin = await openAdmin(browser);
    try {
        await setGoldByApi(admin.page, 1);
        const before = await goldOf(me);

        // 첫 판: 사람이 방장 (같은 방에서 다음 판을 하려고), 값 1일 때 시작
        const firstBots = await bots.spawn(4);
        const firstRoles = { [me]: 'CITIZEN', [U(firstBots[0])]: 'JOKER' };
        const first = await hostGame({ host: user, botList: firstBots, roles: firstRoles });
        expectRoles(await first.state(), firstRoles);
        await closeReveals([user.page]);

        // 판이 도는 중에 관리자가 화면에서 2로 바꿈
        await setGoldByUi(admin.page, 2);

        // 이 판은 시작할 때 값 그대로
        await endByJokerLeaving(first, firstBots[0]);
        await toResult(user.page);
        await expect(myChip(user)).toHaveText('+1골드');

        // 같은 방 다음 판 (값 2일 때 시작)
        await backToRoom(user.page);
        const secondBots = await bots.spawn(4);
        const second = await startAgain(user, [], {
            newBots: secondBots,
            roles: { [me]: 'CITIZEN', [U(secondBots[0])]: 'JOKER' },
            prevGameId: first.gameId,
        });
        await closeReveals([user.page]);
        await endByJokerLeaving(second, secondBots[0]);
        await toResult(user.page);
        await expect(myChip(user)).toHaveText('+2골드');

        await expectGold(me, before + 3);
    } finally {
        await setGoldByApi(admin.page, 1);
        await admin.context.close();
    }
});

test('A07-H-012 사람 2 + 봇 4 = 6명 판 끝 → 둘 다 "대기방으로" → 같은 방 두 번째 판 끝 → 사람마다 판 골드 장부 2줄, 참조 id가 판마다 다름 @game @hard @smoke', async ({ players, bots }) => {
    test.setTimeout(420_000);
    const host = await players.add();
    const guest = await players.add();
    const humanRoles = { [U(host)]: 'CITIZEN', [U(guest)]: 'CITIZEN' };

    const firstBots = await bots.spawn(4);
    const firstRoles = { ...humanRoles, [U(firstBots[0])]: 'JOKER' };
    const first = await hostGame({ host, guests: [guest], botList: firstBots, roles: firstRoles });
    expectRoles(await first.state(), firstRoles);
    await closeReveals([host.page, guest.page]);
    await endByJokerLeaving(first, firstBots[0]);

    for (const who of [host, guest]) await backToRoom(who.page);
    const secondBots = await bots.spawn(4);
    const second = await startAgain(host, [guest], {
        newBots: secondBots,
        roles: { ...humanRoles, [U(secondBots[0])]: 'JOKER' },
        prevGameId: first.gameId,
    });
    await closeReveals([host.page, guest.page]);
    await endByJokerLeaving(second, secondBots[0]);

    for (const who of [host, guest]) {
        await toResult(who.page);
        await expect(myChip(who)).toHaveText('+1골드');
        // 판마다 한 줄씩, 참조 id는 그 판 것
        await expect.poll(() => rewardRefsOf(U(who)), { timeout: 30_000, message: '판 골드 장부 줄' })
            .toEqual([rewardRef(first.gameId), rewardRef(second.gameId)].sort());
    }
});

test('A07-H-013 관리자 화면에서 0 저장 → 그 뒤 시작한 사람 1 + 봇 6 = 7명 판 끝 골드 칸 없음, 지갑 그대로 @game @hard @serial', async ({ browser, user, table }) => {
    test.setTimeout(300_000);
    const me = U(user);
    const admin = await openAdmin(browser);
    try {
        await setGoldByApi(admin.page, 1);
        await setGoldByUi(admin.page, 0);
        const before = await goldOf(me);

        const t = await table.setup({
            humans: [user],
            bots: 6,
            settings: PACE,
            roles: ({ bots: list }) => ({ [me]: 'CITIZEN', [U(list[0])]: 'JOKER' }),
        });
        expectRoles(await t.state(), { [me]: 'CITIZEN', [U(t.bots[0])]: 'JOKER' });
        await closeReveals([user.page]);
        await endByJokerLeaving(t, t.bots[0]);

        // 결과판은 다 그려지고 (7줄) 골드 칸만 없음
        const list = await toResult(user.page);
        await expect(list.getByRole('listitem')).toHaveCount(7);
        await expect(goldChip(user.page)).toHaveCount(0);

        await expectRecorded(t.gameId);
        const rows = await query("SELECT user_id FROM economy_ledger_entries WHERE reason = 'GAME_REWARD' AND reference_event_id = ?", [rewardRef(t.gameId)]);
        expect(rows, '장부에 판 골드 줄 없음').toHaveLength(0);
        expect(await goldOf(me), '지갑 그대로').toBe(before);
    } finally {
        await setGoldByApi(admin.page, 1);
        await admin.context.close();
    }
});

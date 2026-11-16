'use strict';

// 판이 끝나는 순간에 다른 일이 겹칠 때의 판 골드 브라우저 시험 (PC, 어려움) — 관리자 값 바꾸기·상점 구매·탭 닫기·동시에 "로비로"·새 기기 로그인·바로 다음 판, 어느 때도 판마다 사람마다 한 번만
// 목록 A07-승패-결과-골드.md 번호 A07-H-034~040 (034는 서버 전체 값을 바꿔서 @serial, 끝에 1로 되돌림), 돌리지 않고 모임만: npx playwright test --list --no-deps tests/ingame/a07-gold-race.spec.js
const crypto = require('node:crypto');
const { test, expect, E2E } = require('../../helpers/fixtures');
const { expectReadable } = require('../../helpers/visible');
const { Table } = require('../../helpers/game');
const { e2e } = require('../../helpers/internal');
const { query } = require('../../helpers/db');
const { readyUi } = require('../../helpers/ui');
const { createAdmin, loginAsAdmin } = require('../../helpers/adminAccounts');
const { hostGame, expectPartyCount, resultRow, closeReveals } = require('../room/roomHelpers');
const { wallet, grant, owned } = require('../store/store-tools');
const N = require('./b-night/_night');

// ── 이 파일 도우미 (공용으로 올릴 후보: A07 승패·결과 묶음) ──

const U = (x) => x.account.uuid;
const nick = (x) => x.account.nickname;
const resultBoard = (page) => page.getByRole('region', { name: '가면무도회 참가자 정체' });

// 봇 방장 판은 단계 시간을 가장 길게 둠 — 단계는 손잡이·"다 내면 5초"로만 넘어감 (화면을 누르거나 기다리는 동안 진짜 마감이 먼저 오면 흐름이 엇갈림)
const PACE = Object.freeze({ dayDiscussionTime: 150, dayVoteTime: 90, tribunalTime: 120, nightActionTime: 120 });
const myChip = (who) => resultRow(who.page, nick(who)).getByTestId('game-result-gold-reward');
const rewardRef = (gameId) => `game-reward:${gameId}`;

// 상점에서 골드로 살 수 있는 가장 싼 것 (프로필 테두리 "남작" 200골드) — 목록의 "1골드 상품"은 없어서 이걸로 값 경계를 만듦
const SHOP_ITEM = 'profile-border-남작';
const SHOP_PRICE = 200;

async function openHumans(players, n) {
    const out = [];
    for (let i = 0; i < n; i += 1) out.push(await players.add());
    return out;
}

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

// 봇 요청 하나 보내고 서버가 받았는지 확인
async function botDo(bot, event, payload, what) {
    const reply = await bot.request(event, payload);
    expect(reply?.ok, `${what} 거절: ${reply?.code ?? '답 없음'}`).toBe(true);
    return reply;
}

// 광대 봇이 나가 시민 승으로 판을 끝냄 (하나뿐인 광대가 나가면 바로 승패가 남)
async function endByJokerLeaving(t, jokerBot) {
    await botDo(jokerBot, 'leave_game_session', { gameId: t.gameId }, '봇 나가기');
    const end = await waitState(t, (g) => g.phase === 'ENDED', '광대가 나가 판 끝');
    expect(end.winResult?.winner, '서버 승자').toBe('CITIZEN');
    return end;
}

// 사람 5명 판 차리기: 첫 사람이 방장, 앞 둘이 광대 → { t, roles }
async function startFive(people) {
    const roles = Object.fromEntries(people.map((h, i) => [U(h), i < 2 ? 'JOKER' : 'CITIZEN']));
    const t = await hostGame({ host: people[0], guests: people.slice(1), roles, settings: { jokers: 2 } });
    expectRoles(await t.state(), roles);
    return { t, roles };
}

// 사람 5명 판 끝내기: 1일 밤 광대 둘이 화면으로 같은 시민(셋째 사람)을 암살 → 광대 2 : 나머지 2 → 광대 승 (다섯 다 판 끝까지 있음)
async function jokersKillToEnd(t, people) {
    await N.toTurn(t, 'JOKER', { dayIndex: 1 });
    for (const j of people.slice(0, 2)) await N.nightActUi(j.page, nick(people[2]), '암살');
    const end = await N.toEnd(t);
    expect(end?.winResult?.winner, '서버 승자').toBe('JOKER');
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

// 결과 화면 "로비로" → 브라우저 확인 창 수락 → 로비
async function lobbyFromResult(page) {
    await toResult(page);
    page.once('dialog', (dialog) => { dialog.accept().catch(() => {}); });
    await page.getByRole('button', { name: '로비로', exact: true }).click();
    await expect(page).toHaveURL(/\/lobby/, { timeout: 15_000 });
}

// 결과 화면 "대기방으로" → 대기방 화면
async function roomFromResult(page) {
    await toResult(page);
    await page.getByRole('button', { name: '대기방으로' }).click();
    await expect(page).toHaveURL(/\/game-matching/, { timeout: 20_000 });
}

// 같은 방에서 다음 판 시작 (사람만): 직업 다시 정하기 → 손님·방장 준비 → 게임시작 → 새 판
async function startAgain(host, guests, { roles, prevGameId }) {
    const room = await e2e.roomOf(U(host));
    expect(room?.roomId, '돌아온 대기방').toBeTruthy();
    await e2e.setRoles(roles, { roomId: room.roomId });
    await expectPartyCount(host.page, 1 + guests.length);
    for (const who of [...guests, host]) {
        await readyUi(who.page);
        await expect(who.page.getByRole('button', { name: '준비취소' })).toBeVisible();
    }
    await host.page.getByRole('button', { name: '게임시작' }).click();
    for (const who of [host, ...guests]) await expect(who.page).toHaveURL(/\/ingame/, { timeout: 20_000 });
    const game = await e2e.gameOf(U(host));
    expect(game?.gameId, '새 판').toBeTruthy();
    expect(game.gameId, '앞 판과 다른 판').not.toBe(prevGameId);
    const t = new Table({ room, bots: [], humans: [host, ...guests] });
    t.gameId = game.gameId;
    expectRoles(await t.state(), roles);
    return t;
}

// 지갑 골드 (DB) · 그 값이 될 때까지 (판 골드는 판 끝 저장 뒤에 들어옴)
const goldOf = async (uuid) => (await wallet(uuid)).gold;
async function expectGold(uuid, amount) {
    await expect.poll(() => goldOf(uuid), { timeout: 30_000, message: '지갑 골드' }).toBe(amount);
}

// 그 판 판 골드 장부 줄을 받은 사람 uuid (정렬, 같은 사람이 두 줄이면 두 번 나옴)
async function rewardedUuids(gameId) {
    const rows = await query("SELECT user_id FROM economy_ledger_entries WHERE reason = 'GAME_REWARD' AND reference_event_id = ?", [rewardRef(gameId)]);
    return rows.map((r) => r.user_id).sort();
}
async function expectRewarded(gameId, uuids) {
    await expect.poll(() => rewardedUuids(gameId), { timeout: 30_000, message: '판 골드 장부 줄' }).toEqual([...uuids].sort());
}

// 그 사람이 받은 판 골드 장부 줄의 참조 id (정렬) — 판마다 game-reward:<판 id> 한 줄
async function rewardRefsOf(uuid) {
    const rows = await query("SELECT reference_event_id FROM economy_ledger_entries WHERE user_id = ? AND reason = 'GAME_REWARD'", [uuid]);
    return rows.map((r) => r.reference_event_id).sort();
}

// 그 사람 골드 장부 줄 전부 [{ reason, amount, balance_after }]
const goldRowsOf = (uuid) => query("SELECT reason, amount, balance_after FROM economy_ledger_entries WHERE user_id = ? AND currency = 'GOLD'", [uuid]);

// 지갑 골드 − 골드 장부 합 (늘 같아야 해서 앞뒤로 이 값이 안 바뀌는지 봄)
async function walletMinusLedger(uuid) {
    const rows = await goldRowsOf(uuid);
    return (await goldOf(uuid)) - rows.reduce((sum, r) => sum + Number(r.amount), 0);
}

// 로그인된 브라우저 쿠키로 아이템 하나 사기 요청 (서버의 한 개 사기 길) → { status, body }
async function buy(context, itemId) {
    const res = await context.request.fetch(`${E2E.apiUrl}/economy/purchase`, {
        method: 'POST',
        data: { itemId, referenceEventId: `e2e-a07:${crypto.randomUUID()}` },
        headers: { origin: E2E.desktopUrl },
    });
    return { status: res.status(), body: await res.json().catch(() => null) };
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

// ── 시험 ──

test('A07-H-034 사람 1 + 봇 5 = 6명 판 마지막 처형과 같은 순간 관리자가 3으로 저장 → 그 판은 시작 값 "+1골드" @game @hard @serial', async ({ browser, user, table }) => {
    test.setTimeout(300_000);
    const page = user.page;
    const me = U(user);
    const admin = await openAdmin(browser);
    try {
        await setGoldByApi(admin.page, 1);
        const before = await goldOf(me);
        const t = await table.setup({ humans: [user], bots: 5, settings: PACE, roles: ({ bots }) => ({ [me]: 'CITIZEN', [U(bots[0])]: 'JOKER' }) });
        const [jokerBot, ...voters] = t.bots;
        expectRoles(await t.state(), { [me]: 'CITIZEN', [U(jokerBot)]: 'JOKER' });
        await closeReveals([page]);

        // 처형 바로 앞까지: 봇 넷이 광대 봇을 찍어 재판 (표 4 > 기권 2) → 봇 넷 유죄까지 내 둠
        await t.assertBotsCanExecute(U(jokerBot));
        await t.advanceUntil('DAY_VOTE');
        for (const bot of voters) await botDo(bot, 'cast_day_vote', { gameId: t.gameId, targetId: U(jokerBot) }, '봇 낮 표');
        await t.advance();
        const tribunal = await waitState(t, (g) => g.phase === 'TRIBUNAL' && g.tribunal?.defendantUuid === U(jokerBot), '재판이 열림');
        for (const bot of voters) {
            await botDo(bot, 'cast_tribunal_vote', { gameId: t.gameId, dayIndex: tribunal.dayIndex, vote: 'GUILTY' }, '봇 재판 표');
        }

        // 관리자 화면: 3을 넣고 확인 창까지 열어 둠
        await admin.page.goto('/game-settings');
        await admin.page.getByLabel('판마다 주는 골드').fill('3');
        await admin.page.getByRole('button', { name: '바꾸기', exact: true }).click();
        const confirm = admin.page.getByRole('dialog', { name: '판 골드를 바꿀까요?' }).getByRole('button', { name: '바꾸기', exact: true });
        await expect(confirm).toBeVisible();

        // 같은 순간: 재판 마감(처형 → 판 끝)과 관리자 저장
        await Promise.all([t.advance(), confirm.click()]);
        await expect(admin.page.getByTestId('game-settings-gold')).toHaveText('3골드');
        const end = await waitState(t, (g) => g.phase === 'ENDED', '처형으로 판 끝');
        expect(end.winResult?.winner, '서버 승자').toBe('CITIZEN');

        // 이 판은 시작할 때 값(1) 그대로: 결과판·장부·지갑
        await toResult(page);
        await expect(myChip(user)).toHaveText('+1골드');
        await expectGold(me, before + 1);
        const rows = await query("SELECT amount FROM economy_ledger_entries WHERE user_id = ? AND reference_event_id = ?", [me, rewardRef(t.gameId)]);
        expect(rows.map((r) => Number(r.amount)), '장부 금액').toEqual([1]);
    } finally {
        await setGoldByApi(admin.page, 1);
        await admin.context.close();
    }
});

test('A07-H-035 사람 2 + 봇 3 = 5명 판 끝과 같은 순간 상점 구매 (잔액이 값보다 1 모자람) → 지갑 = 장부 합, 잔액 음수 없음 @game @hard', async ({ players, table }) => {
    test.setTimeout(300_000);
    const people = await openHumans(players, 2);
    const humanRoles = Object.fromEntries(people.map((h) => [U(h), 'CITIZEN']));
    // 값(200)보다 하나 모자라게 채움 → 판 골드 1이 먼저 들어와야 살 수 있음
    const gap = [];
    for (const h of people) {
        gap.push(await walletMinusLedger(U(h)));
        await grant(U(h), 'GOLD', SHOP_PRICE - 1 - await goldOf(U(h)));
        expect(await goldOf(U(h)), '시작 잔액').toBe(SHOP_PRICE - 1);
    }

    const t = await table.setup({ humans: people, bots: 3, settings: PACE, roles: ({ bots }) => ({ [U(bots[0])]: 'JOKER', ...humanRoles }) });
    const jokerBot = t.bots[0];
    expectRoles(await t.state(), { [U(jokerBot)]: 'JOKER', ...humanRoles });
    await closeReveals(people.map((h) => h.page));

    // 같은 순간: 판 끝(광대 봇 나감)과 두 사람의 구매 요청
    const [left, ...bought] = await Promise.all([
        jokerBot.request('leave_game_session', { gameId: t.gameId }),
        ...people.map((h) => buy(h.context, SHOP_ITEM)),
    ]);
    expect(left?.ok, `봇 나가기 거절: ${left?.code}`).toBe(true);
    await waitState(t, (g) => g.phase === 'ENDED', '판 끝');
    await expectRewarded(t.gameId, [...people, ...t.bots.slice(1)].map(U));

    for (const [i, h] of people.entries()) {
        const uuid = U(h);
        const gold = await goldOf(uuid);
        const rows = await goldRowsOf(uuid);
        // 어느 쪽이 먼저였든: 지갑 = 장부 합, 장부 어느 줄도 잔액이 음수가 아님
        expect(await walletMinusLedger(uuid), '지갑 = 장부 합').toBe(gap[i]);
        expect(Math.min(...rows.map((r) => Number(r.balance_after))), '잔액 음수 없음').toBeGreaterThanOrEqual(0);
        if (bought[i].status === 201) {
            // 판 골드가 먼저 들어와 딱 맞게 삼: 199 + 1 − 200 = 0
            expect(gold, '산 뒤 잔액').toBe(0);
            expect(await owned(uuid)).toContain(SHOP_ITEM);
        } else {
            // 구매가 먼저라 모자라서 거절: 199 + 1 = 200, 안 가짐
            expect(bought[i].status, '구매 답').toBe(400);
            expect(bought[i].body?.code).toBe('INSUFFICIENT_BALANCE');
            expect(gold, '거절 뒤 잔액').toBe(SHOP_PRICE);
            expect(await owned(uuid)).not.toContain(SHOP_ITEM);
        }
    }
});

test('A07-H-036 사람 2 + 봇 5 = 7명 판 끝 직전 산 사람이 탭을 닫음 (60초 기다림 중 판 끝) → 그 사람도 장부 한 줄 @game @hard @smoke', async ({ players, table }) => {
    test.setTimeout(300_000);
    const [stayer, closer] = await openHumans(players, 2);
    const t = await table.setup({
        humans: [stayer, closer],
        bots: 5,
        settings: PACE,
        roles: ({ bots }) => ({ [U(bots[0])]: 'JOKER', [U(stayer)]: 'CITIZEN', [U(closer)]: 'CITIZEN' }),
    });
    const jokerBot = t.bots[0];
    expectRoles(await t.state(), { [U(jokerBot)]: 'JOKER', [U(stayer)]: 'CITIZEN', [U(closer)]: 'CITIZEN' });
    const before = await goldOf(U(closer));
    await closeReveals([stayer.page, closer.page]);
    await t.advanceUntil('DAY');

    // ㄴ 탭 닫음 → 남은 사람 화면에 끊김 표시 (60초 기다림 시작, 아직 탈락 아님)
    await closer.page.close();
    await N.expectCard(stayer.page, nick(closer), 'disconnected');
    expect((await t.player(U(closer)))?.alive, '기다림 중엔 살아 있음').toBe(true);

    // 기다림 중에 판이 끝남 → 판 끝까지 있던 사람으로 셈
    await endByJokerLeaving(t, jokerBot);
    await expectRewarded(t.gameId, [stayer, closer, ...t.bots.slice(1)].map(U));
    await expectGold(U(closer), before + 1);
});

test('A07-H-037 사람 3 + 봇 5 = 8명 판 끝나자마자 셋 다 "로비로" (나가기와 저장이 겹침) → 셋 다 지갑 +1 @game @hard', async ({ players, table }) => {
    test.setTimeout(300_000);
    const people = await openHumans(players, 3);
    const humanRoles = Object.fromEntries(people.map((h) => [U(h), 'CITIZEN']));
    const before = [];
    for (const h of people) before.push(await goldOf(U(h)));
    const t = await table.setup({ humans: people, bots: 5, settings: PACE, roles: ({ bots }) => ({ [U(bots[0])]: 'JOKER', ...humanRoles }) });
    expectRoles(await t.state(), { [U(t.bots[0])]: 'JOKER', ...humanRoles });
    await closeReveals(people.map((h) => h.page));

    // 판 끝 → 결과판이 뜨는 대로 셋이 한꺼번에 "로비로"
    await endByJokerLeaving(t, t.bots[0]);
    await Promise.all(people.map((h) => lobbyFromResult(h.page)));

    for (const [i, h] of people.entries()) await expectGold(U(h), before[i] + 1);
    await expectRewarded(t.gameId, [...people, ...t.bots.slice(1)].map(U));
});

test('A07-H-038 사람 5명 판 끝 뒤 다섯이 같은 순간 "로비로" → 다섯 다 지갑 +1, 장부 사람마다 한 줄 @game @hard', async ({ players }) => {
    test.setTimeout(420_000);
    const people = await openHumans(players, 5);
    const before = [];
    for (const h of people) before.push(await goldOf(U(h)));
    const { t } = await startFive(people);
    await jokersKillToEnd(t, people);

    // 다섯 화면 모두 결과판까지 온 뒤 한꺼번에 누름
    for (const h of people) await toResult(h.page);
    await Promise.all(people.map((h) => lobbyFromResult(h.page)));

    for (const [i, h] of people.entries()) await expectGold(U(h), before[i] + 1);
    await expectRewarded(t.gameId, people.map(U));
});

test('A07-H-039 사람 2 + 봇 4 = 6명 판 중에 한 사람이 새 기기로 로그인해 이어 함 → 판 끝 장부는 그 사람 한 줄, 새 기기 결과판 "+1골드" @game @hard', async ({ players, table }) => {
    test.setTimeout(300_000);
    const [other, mover] = await openHumans(players, 2);
    const t = await table.setup({
        humans: [other, mover],
        bots: 4,
        settings: PACE,
        roles: ({ bots }) => ({ [U(bots[0])]: 'JOKER', [U(other)]: 'CITIZEN', [U(mover)]: 'CITIZEN' }),
    });
    const jokerBot = t.bots[0];
    expectRoles(await t.state(), { [U(jokerBot)]: 'JOKER', [U(other)]: 'CITIZEN', [U(mover)]: 'CITIZEN' });
    await closeReveals([other.page, mover.page]);
    await t.advanceUntil('DAY');

    // 같은 계정으로 새 기기(새 브라우저)에서 로그인 → 로비에 오면 하던 판 화면으로 이어짐
    const device = await players.add({ account: mover.account, lobby: false });
    await device.page.goto('/lobby');
    await expect(device.page).toHaveURL(/\/ingame/, { timeout: 20_000 });
    const row = await t.player(U(mover));
    expect(row?.alive, '이어서 하는 사람은 살아 있음').toBe(true);
    expect(row?.isParticipating, '판에 그대로').not.toBe(false);

    // 판 끝 → 새 기기 결과판에 "+1골드", 장부는 그 사람 한 줄뿐 (기기가 둘이어도 한 번)
    await endByJokerLeaving(t, jokerBot);
    await toResult(device.page);
    const chip = resultRow(device.page, nick(mover)).getByTestId('game-result-gold-reward');
    await expect(chip).toHaveText('+1골드');
    await expectReadable(chip);
    await expectRewarded(t.gameId, [other, mover, ...t.bots.slice(1)].map(U));
    expect(await rewardRefsOf(U(mover)), '그 사람 판 골드 장부').toEqual([rewardRef(t.gameId)]);
});

test('A07-H-040 사람 5명 판 끝 → 바로 전원 "대기방으로"·준비·시작 → 앞 판 장부 한 줄씩, 새 판 끝에 또 한 줄 @game @hard', async ({ players }) => {
    test.setTimeout(600_000);
    const people = await openHumans(players, 5);
    const { t: first, roles } = await startFive(people);
    await jokersKillToEnd(first, people);

    // 결과 화면이 뜨는 대로 다섯 다 "대기방으로" → 준비 → 시작 (앞 판 저장과 겹침)
    await Promise.all(people.map((h) => roomFromResult(h.page)));
    const second = await startAgain(people[0], people.slice(1), { roles, prevGameId: first.gameId });

    // 새 판이 도는 동안 앞 판 장부는 사람마다 한 줄
    await expectRewarded(first.gameId, people.map(U));

    await jokersKillToEnd(second, people);
    await expectRewarded(second.gameId, people.map(U));
    for (const h of people) {
        await toResult(h.page);
        await expect(myChip(h)).toHaveText('+1골드');
        expect(await rewardRefsOf(U(h)), '판마다 한 줄').toEqual([rewardRef(first.gameId), rewardRef(second.gameId)].sort());
    }
});

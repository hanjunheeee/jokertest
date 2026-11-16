'use strict';

// 서버 2대에서의 판 골드 브라우저 시험 (어려움) — 한 서버가 받은 값 바꾸기를 다른 서버 판이 씀, 두 서버에 나뉘어 있던 사람들의 판도 장부는 사람마다 한 줄
// 목록 A07-승패-결과-골드.md 번호 A07-H-014~015 (E2E_NODES=2에서만 돎, 014는 서버 전체 값을 바꿔서 @serial), 돌리지 않고 모임만: E2E_NODES=2 npx playwright test --list --no-deps tests/multinode/a07-gold-reload.spec.js
const mn = require('./_mn');
const { ui } = require('../../helpers/fixtures');
const { Table } = require('../../helpers/game');
const { query } = require('../../helpers/db');
const { createAdmin, loginAsAdmin } = require('../../helpers/adminAccounts');
const { resultRow, closeReveals } = require('../room/roomHelpers');
const { wallet } = require('../store/store-tools');

const { test, expect, E2E, NODE_IDS, botsOn, gameNodeOf, e2e } = mn;

// ── 이 파일 도우미 (공용으로 올릴 후보: A07 승패·결과 묶음) ──

const U = (x) => x.account.uuid;
const nick = (x) => x.account.nickname;
const resultBoard = (page) => page.getByRole('region', { name: '가면무도회 참가자 정체' });

// 봇 방장 판은 단계 시간을 가장 길게 둠 — 단계는 손잡이·"다 내면 5초"로만 넘어감 (화면을 누르거나 기다리는 동안 진짜 마감이 먼저 오면 흐름이 엇갈림)
const PACE = Object.freeze({ dayDiscussionTime: 150, dayVoteTime: 90, tribunalTime: 120, nightActionTime: 120 });
const myChip = (who) => resultRow(who.page, nick(who)).getByTestId('game-result-gold-reward');

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

// 봇 방장 판 차리기 (판은 방장 봇이 붙은 서버에서 돎): 봇·사람 코드 입장 → 준비 → 직업 예약 → 시작 → 판
// 다른 서버에 붙어 있던 봇·사람은 입장할 때 방이 있는 서버로 옮겨 붙음
async function startGameOn({ hostBot, otherBots, people, roles }) {
    const room = await hostBot.createRoom({ maxPlayers: 1 + otherBots.length + people.length, ...PACE });
    for (const bot of otherBots) await bot.joinByCode(room.roomCode);
    for (const who of people) await ui.joinRoomByCodeUi(who.page, room.roomCode);
    for (const bot of [hostBot, ...otherBots]) await bot.setReady(room.roomId, room.settingsVersion);
    for (const who of people) await ui.readyUi(who.page);
    await e2e.setRoles(roles, { roomId: room.roomId });
    const started = await hostBot.startGame(room.roomId, room.settingsVersion);
    for (const who of people) await expect(who.page).toHaveURL(/\/ingame/, { timeout: 20_000 });
    const t = new Table({ room, bots: [hostBot, ...otherBots], humans: people });
    t.gameId = started.gameId;
    expectRoles(await t.state(), roles);
    return t;
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

// 지갑 골드 (DB) · 그 값이 될 때까지 (판 골드는 판 끝 저장 뒤에 들어옴)
const goldOf = async (uuid) => (await wallet(uuid)).gold;
async function expectGold(uuid, amount) {
    await expect.poll(() => goldOf(uuid), { timeout: 30_000, message: '지갑 골드' }).toBe(amount);
}

// 그 판 판 골드 장부 줄을 받은 사람 uuid (정렬, 같은 사람이 두 줄이면 두 번 나옴) — 참조 id는 game-reward:<판 id>
async function rewardedUuids(gameId) {
    const rows = await query(
        "SELECT user_id FROM economy_ledger_entries WHERE reason = 'GAME_REWARD' AND reference_event_id = ?",
        [`game-reward:${gameId}`],
    );
    return rows.map((r) => r.user_id).sort();
}

// 관리자 창 하나 (PC 크기·관리자 주소) 열고 시험 관리자로 로그인 → { context, page }
async function openAdmin(browser) {
    const context = await browser.newContext({ baseURL: E2E.adminUrl, viewport: { width: 1280, height: 800 }, locale: 'ko-KR', timezoneId: 'Asia/Seoul' });
    const page = await context.newPage();
    await loginAsAdmin(page, await createAdmin());
    return { context, page };
}

// 관리자 API로 판 골드 값 바꾸기, node를 주면 앞단이 그 서버로 보냄 (?node=) → 답 { settings, nodes, partial }
async function setGoldByApi(adminPage, goldReward, { node } = {}) {
    const me = await adminPage.request.get(`${E2E.adminUrl}/admin-api/auth/me`);
    expect(me.ok(), '관리자 로그인 확인').toBe(true);
    const { csrfToken } = await me.json();
    const where = node ? `?node=${encodeURIComponent(node)}` : '';
    const res = await adminPage.request.put(`${E2E.adminUrl}/admin-api/game-settings${where}`, {
        data: { goldReward },
        headers: { 'x-admin-csrf': csrfToken, origin: E2E.adminUrl },
    });
    expect(res.status(), `판 골드 값 ${goldReward} 저장`).toBe(200);
    return res.json();
}

// ── 시험 ──

test('A07-H-014 서버 2대: 값 2 저장은 한 서버가 받고 5명 판은 다른 서버에서 → 그 판 "+2골드" @game @hard @serial', async ({ browser, onNode, bots }) => {
    test.setTimeout(300_000);
    const [near, far] = NODE_IDS;
    const admin = await openAdmin(browser);
    try {
        await setGoldByApi(admin.page, 1, { node: near });
        // 값 바꾸기는 가까운 서버(ㄱ)가 받음
        const saved = await setGoldByApi(admin.page, 2, { node: near });
        expect(saved.settings?.goldReward, '저장된 값').toBe(2);

        // 판은 다른 서버(ㄴ): 사람도 방장 봇도 ㄴ에 붙음
        const person = await onNode.person(far);
        const before = await goldOf(U(person));
        const list = await botsOn(bots, 4, far);
        const [hostBot, jokerBot] = list;
        const t = await startGameOn({
            hostBot,
            otherBots: list.slice(1),
            people: [person],
            roles: { [U(person)]: 'CITIZEN', [U(jokerBot)]: 'JOKER' },
        });
        expect(await gameNodeOf(U(person)), '판이 도는 서버').toBe(far);
        await closeReveals([person.page]);

        await endByJokerLeaving(t, jokerBot);
        await toResult(person.page);
        await expect(myChip(person)).toHaveText('+2골드');
        await expectGold(U(person), before + 2);
    } finally {
        await setGoldByApi(admin.page, 1);
        await admin.context.close();
    }
});

test('A07-H-015 서버 2대: 두 서버에 나뉘어 있던 사람 2 + 봇 4 = 6명 판 끝 → 끝까지 있던 사람마다 판 골드 장부 한 줄 @game @hard @smoke', async ({ onNode, bots }) => {
    test.setTimeout(300_000);
    const [near, far] = NODE_IDS;
    // 사람 하나·봇 둘은 ㄱ, 사람 하나·봇 둘은 ㄴ
    const nearPerson = await onNode.person(near);
    const farPerson = await onNode.person(far);
    const nearBots = await botsOn(bots, 2, near);
    const farBots = await botsOn(bots, 2, far);
    const hostBot = nearBots[0];
    const jokerBot = farBots[0];

    const t = await startGameOn({
        hostBot,
        otherBots: [nearBots[1], ...farBots],
        people: [nearPerson, farPerson],
        roles: { [U(jokerBot)]: 'JOKER', [U(nearPerson)]: 'CITIZEN', [U(farPerson)]: 'CITIZEN' },
    });
    // 판은 방을 만든 서버(ㄱ)에서 돎 — ㄴ에 있던 사람도 그 판 사람
    expect(await gameNodeOf(U(nearPerson)), '판이 도는 서버').toBe(near);
    expect(await gameNodeOf(U(farPerson)), '다른 서버에 있던 사람의 판').toBe(near);
    await closeReveals([nearPerson.page, farPerson.page]);

    await endByJokerLeaving(t, jokerBot);
    for (const who of [nearPerson, farPerson]) {
        await toResult(who.page);
        await expect(myChip(who)).toHaveText('+1골드');
    }

    // 산 채로 나간 광대 봇만 빼고 다섯 명이 딱 한 줄씩 (두 서버가 같은 판을 두 번 지급하지 않음)
    const expected = [nearPerson, farPerson, nearBots[0], nearBots[1], farBots[1]].map(U).sort();
    await expect.poll(() => rewardedUuids(t.gameId), { timeout: 30_000, message: '판 골드 장부 줄' }).toEqual(expected);
});

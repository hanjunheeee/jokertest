'use strict';

// 결과 화면에서 무엇을 누르든 판 골드는 받는지 보는 브라우저 시험 (PC, 어려움) — "로비로"·"대기방으로"·새로고침·그대로 머묾, 같은 방 둘째 판 결과판
// 목록 A07-승패-결과-골드.md 번호 A07-H-021~023 (판 골드는 결과 화면 선택과 상관없음), 돌리지 않고 모임만: npx playwright test --list tests/result/a07-gold-after-buttons.spec.js
const { test, expect } = require('../../helpers/fixtures');
const { expectReadable } = require('../../helpers/visible');
const { Table, customRoleSettings } = require('../../helpers/game');
const { e2e } = require('../../helpers/internal');
const { query } = require('../../helpers/db');
const { readyUi } = require('../../helpers/ui');
const { hostGame, botsJoinAndReady, expectPartyCount, resultRow, closeReveals } = require('../room/roomHelpers');
const { wallet } = require('../store/store-tools');
const N = require('../ingame/b-night/_night');

// ── 이 파일 도우미 (공용으로 올릴 후보: A07 승패·결과 묶음) ──

const U = (x) => x.account.uuid;
const nick = (x) => x.account.nickname;
const resultBoard = (page) => page.getByRole('region', { name: '가면무도회 참가자 정체' });

// 봇 방장 판은 단계 시간을 가장 길게 둠 — 단계는 손잡이·"다 내면 5초"로만 넘어감 (화면을 누르거나 기다리는 동안 진짜 마감이 먼저 오면 흐름이 엇갈림)
const PACE = Object.freeze({ dayDiscussionTime: 150, dayVoteTime: 90, tribunalTime: 120, nightActionTime: 120 });
const myChip = (who) => resultRow(who.page, nick(who)).getByTestId('game-result-gold-reward');

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

// 결과 화면 "대기방으로" → 대기방 화면
async function roomFromResult(page) {
    await toResult(page);
    await page.getByRole('button', { name: '대기방으로' }).click();
    await expect(page).toHaveURL(/\/game-matching/, { timeout: 20_000 });
}

// 결과 화면 "로비로" → 브라우저 확인 창 수락 → 로비
async function lobbyFromResult(page) {
    await toResult(page);
    page.once('dialog', (dialog) => { dialog.accept().catch(() => {}); });
    await page.getByRole('button', { name: '로비로', exact: true }).click();
    await expect(page).toHaveURL(/\/lobby/, { timeout: 15_000 });
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

// 그 판 판 골드 장부 줄을 받은 사람 uuid (정렬, 같은 사람이 두 줄이면 두 번 나옴) — 참조 id는 game-reward:<판 id>
async function rewardedUuids(gameId) {
    const rows = await query(
        "SELECT user_id FROM economy_ledger_entries WHERE reason = 'GAME_REWARD' AND reference_event_id = ?",
        [`game-reward:${gameId}`],
    );
    return rows.map((r) => r.user_id).sort();
}

// ── 시험 ──

test('A07-H-021 사람 5명 판 끝 뒤 1명 "로비로"·4명 "대기방으로" → 다섯 다 지갑 +1 @game @hard', async ({ players }) => {
    test.setTimeout(420_000);
    const people = await openHumans(players, 5);
    const [j1, j2, victim, , toLobby] = people;
    const before = [];
    for (const h of people) before.push(await goldOf(U(h)));

    // ㄱ 방장, ㄱ·ㄴ 광대 → 1일 밤 둘이 화면으로 같은 시민을 암살 → 광대 2 : 나머지 2 → 광대 승
    const roles = Object.fromEntries(people.map((h, i) => [U(h), i < 2 ? 'JOKER' : 'CITIZEN']));
    const t = await hostGame({ host: j1, guests: people.slice(1), roles, settings: { jokers: 2 } });
    expectRoles(await t.state(), roles);
    await N.toTurn(t, 'JOKER', { dayIndex: 1 });
    for (const j of [j1, j2]) await N.nightActUi(j.page, nick(victim), '암살');
    const end = await N.toEnd(t);
    expect(end?.winResult?.winner, '서버 승자').toBe('JOKER');

    // 사람마다 다른 선택: 한 명은 "로비로", 나머지 넷은 "대기방으로"
    await lobbyFromResult(toLobby.page);
    for (const h of people.filter((x) => x !== toLobby)) await roomFromResult(h.page);

    for (const [i, h] of people.entries()) await expectGold(U(h), before[i] + 1);
    expect(await rewardedUuids(t.gameId), '장부는 사람마다 한 줄').toEqual(people.map(U).sort());
});

test('A07-H-022 사람 3 + 봇 3 = 6명 판 결과 화면에서 1명 새로고침·1명 "로비로"·1명 그대로 → 셋 다 지갑 +1 @game @hard @smoke', async ({ players, table }) => {
    test.setTimeout(300_000);
    const [refresher, leaver, stayer] = await openHumans(players, 3);
    const people = [refresher, leaver, stayer];
    const humanRoles = Object.fromEntries(people.map((h) => [U(h), 'CITIZEN']));
    const before = [];
    for (const h of people) before.push(await goldOf(U(h)));

    const t = await table.setup({
        humans: people,
        bots: 3,
        settings: customRoleSettings({ JOKER: 1 }, PACE),
        roles: ({ bots }) => ({ [U(bots[0])]: 'JOKER', ...humanRoles }),
    });
    expectRoles(await t.state(), { [U(t.bots[0])]: 'JOKER', ...humanRoles });
    await closeReveals(people.map((h) => h.page));
    await endByJokerLeaving(t, t.bots[0]);
    for (const h of people) await toResult(h.page);

    // ㄱ 새로고침 → 결과는 다시 못 봄
    await refresher.page.reload();
    await expectReadable(refresher.page.getByText('게임 결과를 확인할 수 없습니다', { exact: true }), { timeout: 20_000 });
    // ㄴ "로비로"
    await lobbyFromResult(leaver.page);
    // ㄷ 그대로 결과 화면
    await expect(stayer.page).toHaveURL(/\/gameresult/);
    await expect(myChip(stayer)).toHaveText('+1골드');

    for (const [i, h] of people.entries()) await expectGold(U(h), before[i] + 1);
});

test('A07-H-023 사람 2 + 봇 6 = 8명 판 같은 방 두 번째 판 결과판 → 8줄·"MVP" 없음·"+1골드", 지갑 +2 @game @hard', async ({ players, bots }) => {
    test.setTimeout(420_000);
    const [host, guest] = await openHumans(players, 2);
    const humanRoles = { [U(host)]: 'CITIZEN', [U(guest)]: 'CITIZEN' };
    const before = [await goldOf(U(host)), await goldOf(U(guest))];

    const firstBots = await bots.spawn(6);
    const firstRoles = { ...humanRoles, [U(firstBots[0])]: 'JOKER' };
    const first = await hostGame({ host, guests: [guest], botList: firstBots, roles: firstRoles });
    expectRoles(await first.state(), firstRoles);
    await closeReveals([host.page, guest.page]);
    await endByJokerLeaving(first, firstBots[0]);
    for (const who of [host, guest]) await roomFromResult(who.page);

    const secondBots = await bots.spawn(6);
    const second = await startAgain(host, [guest], {
        newBots: secondBots,
        roles: { ...humanRoles, [U(secondBots[0])]: 'JOKER' },
        prevGameId: first.gameId,
    });
    await closeReveals([host.page, guest.page]);
    await endByJokerLeaving(second, secondBots[0]);

    for (const [i, who] of [host, guest].entries()) {
        const list = await toResult(who.page);
        await expect(list.getByRole('listitem')).toHaveCount(8);
        await expect(who.page.getByText(/MVP/i)).toHaveCount(0);
        await expect(myChip(who)).toHaveText('+1골드');
        await expectReadable(myChip(who));
        await expectGold(U(who), before[i] + 2);
    }
});

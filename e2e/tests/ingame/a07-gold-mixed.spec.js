'use strict';

// 판 골드를 받는 사람·못 받는 사람이 한 판에 섞인 브라우저 시험 (PC, 어려움) — 산 사람·처형된 사람·죽은 뒤 나간 사람은 받고, 산 채로 나간 사람·60초 탈락한 사람만 못 받음
// 목록 A07-승패-결과-골드.md 번호 A07-H-006~010 (007·008은 끊김 60초를 진짜로 기다림 @realtime), 돌리지 않고 모임만: npx playwright test --list tests/ingame/a07-gold-mixed.spec.js
const { test, expect } = require('../../helpers/fixtures');
const { expectReadable } = require('../../helpers/visible');
const { customRoleSettings } = require('../../helpers/game');
const { e2e } = require('../../helpers/internal');
const { query } = require('../../helpers/db');
const { sleep } = require('../../helpers/wait');
const ui = require('../../helpers/ui');
const { resultRow, closeReveals, createRoomUi, expectPartyCount } = require('../room/roomHelpers');
const { wallet } = require('../store/store-tools');
const N = require('./b-night/_night');

// ── 이 파일 도우미 (공용으로 올릴 후보: A07 승패·결과 묶음) ──

const U = (x) => x.account.uuid;
const nick = (x) => x.account.nickname;
const resultBoard = (page) => page.getByRole('region', { name: '가면무도회 참가자 정체' });
const myChip = (who) => resultRow(who.page, nick(who)).getByTestId('game-result-gold-reward');

// 끊김 기다림 60초 (결정 "판 도중 끊김"), 허용 폭 ±1.5초
const GRACE_MS = 60_000;
const SLACK_MS = 1_500;

// 봇 방장 판은 단계 시간을 가장 길게 둠 — 단계는 손잡이·"다 내면 5초"로만 넘어감 (화면을 누르거나 기다리는 동안 진짜 마감이 먼저 오면 흐름이 엇갈림)
const PACE = Object.freeze({ dayDiscussionTime: 150, dayVoteTime: 90, tribunalTime: 120, nightActionTime: 120 });

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

const isDead = (s, uuid) => s.players.find((p) => p.uuid === uuid)?.alive === false;

// 봇 요청 하나 보내고 서버가 받았는지 확인
async function botDo(bot, event, payload, what) {
    const reply = await bot.request(event, payload);
    expect(reply?.ok, `${what} 거절: ${reply?.code ?? '답 없음'}`).toBe(true);
    return reply;
}

// 봇이 판에서 나가기 (산 채로 나가면 죽은 것으로 바뀌고 바로 승패 확인)
const botLeave = (t, bot) => botDo(bot, 'leave_game_session', { gameId: t.gameId }, '봇 나가기');

// 사람이 화면으로 낮 표: 그 사람 카드 메뉴 "투표하기" → 다시 연 메뉴가 "투표취소"면 서버가 받은 것 (막는 안내 창은 카드 메뉴 열기가 닫음)
// 사람을 찍어도 기권 단추는 안 잠김 (기권으로 바꾸기 됨, 사용자 결정 2026-11-18) → 기권 단추로는 못 봄
async function voteUi(page, nickname) {
    const menu = await N.openCardMenu(page, nickname);
    await menu.getByRole('menuitem', { name: '투표하기' }).click();
    await expect(menu).toBeHidden();
    await expect(async () => {
        const again = await N.openCardMenu(page, nickname);
        await expect(again.getByRole('menuitem', { name: '투표취소', exact: true })).toBeVisible({ timeout: 1500 });
    }).toPass({ timeout: 15_000 });
    await page.keyboard.press('Escape');
    await expect(menu).toBeHidden();
}

// 낮 투표 단계에서 한 사람 처형: 사람 몇은 화면으로·산 봇은 소켓으로 그 사람을 찍음 → 마감(손잡이) → 재판에서 산 봇 전원 유죄 → 마감 → 죽을 때까지
// 최다 득표가 기권보다 많아야 재판이 열림 → 부르는 쪽이 표 수를 맞춰 둠
async function executeAtVote(t, targetUuid, targetNick, uiVoters = []) {
    const s = await t.state();
    expect(s.dayPhase, '낮 투표 단계').toBe('DAY_VOTE');
    const voters = t.bots.filter((b) => U(b) !== targetUuid && s.players.find((p) => p.uuid === U(b))?.alive);
    for (const h of uiVoters) await voteUi(h.page, targetNick);
    for (const bot of voters) await botDo(bot, 'cast_day_vote', { gameId: t.gameId, targetId: targetUuid }, '봇 낮 표');
    await t.advance();
    const tribunal = await waitState(t, (g) => g.phase === 'TRIBUNAL' && g.tribunal?.defendantUuid === targetUuid, '재판이 열림');
    for (const bot of voters) {
        await botDo(bot, 'cast_tribunal_vote', { gameId: t.gameId, dayIndex: tribunal.dayIndex, vote: 'GUILTY' }, '봇 재판 표');
    }
    await t.advance();
    return waitState(t, (g) => isDead(g, targetUuid), '처형됨');
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

// 브라우저 확인 창(window.confirm)을 수락하며 fn을 돌림 (나가기 확인)
async function acceptingConfirm(page, fn) {
    const onDialog = (dialog) => { dialog.accept().catch(() => {}); };
    page.on('dialog', onDialog);
    try {
        return await fn();
    } finally {
        page.off('dialog', onDialog);
    }
}

// 산 사람이 판에서 나가기: 위 줄 "게임 나가기" → 확인 창 수락 → 방 찾기 화면 (막는 안내 창은 닫으면서)
async function leaveAliveUi(page) {
    await acceptingConfirm(page, () => expect(async () => {
        if (!/\/multiplay/.test(page.url())) {
            await passCovers(page);
            await ui.closeOverlays(page, { keepWatching: false, rounds: 2, clickTimeoutMs: 1000 });
            await page.locator('[aria-label="인게임 컨트롤"]').getByRole('button', { name: '게임 나가기' }).click({ timeout: 1500 }).catch(() => {});
        }
        await expect(page).toHaveURL(/\/multiplay/, { timeout: 4000 });
    }).toPass({ timeout: 30_000 }));
}

// 죽은 뒤 나가기: "사망 후 선택" 창의 "게임 나가기" → 확인 창 수락 → 방 찾기 화면 (처형 연출이 창을 잠깐 가려서 눌릴 때까지)
async function leaveDeadUi(page) {
    const dialog = page.getByRole('dialog', { name: '사망 후 선택' });
    await acceptingConfirm(page, () => expect(async () => {
        if (!/\/multiplay/.test(page.url())) {
            await passCovers(page);
            await ui.closeOverlays(page, { keepWatching: false, rounds: 2, clickTimeoutMs: 1000 });
            await dialog.getByRole('button', { name: '게임 나가기' }).click({ timeout: 2000 }).catch(() => {});
        }
        await expect(page).toHaveURL(/\/multiplay/, { timeout: 4000 });
    }).toPass({ timeout: 45_000 }));
}

// 죽은 뒤 관전: "사망 후 선택" 창의 "관전 계속하기" (처형 연출이 창을 잠깐 가려서 눌릴 때까지)
async function keepWatchingUi(page) {
    const dialog = page.getByRole('dialog', { name: '사망 후 선택' });
    await expect(async () => {
        await passCovers(page);
        await dialog.getByRole('button', { name: '관전 계속하기' }).click({ timeout: 2000 });
    }).toPass({ timeout: 45_000 });
    await expect(dialog).toBeHidden();
}

// 지갑 골드 (DB) · 그 값이 될 때까지 (판 골드는 판 끝 저장 뒤에 들어옴)
const goldOf = async (uuid) => (await wallet(uuid)).gold;
async function expectGold(uuid, amount) {
    await expect.poll(() => goldOf(uuid), { timeout: 30_000, message: '지갑 골드' }).toBe(amount);
}

// 그 판 판 골드 장부 줄을 받은 사람 uuid (정렬) — 참조 id는 game-reward:<판 id>
async function rewardedUuids(gameId) {
    const rows = await query(
        "SELECT user_id FROM economy_ledger_entries WHERE reason = 'GAME_REWARD' AND reference_event_id = ?",
        [`game-reward:${gameId}`],
    );
    return rows.map((r) => r.user_id).sort();
}
async function expectRewarded(gameId, uuids) {
    await expect.poll(() => rewardedUuids(gameId), { timeout: 30_000, message: '판 골드 장부 줄' }).toEqual([...uuids].sort());
}

// 그 판 전적 줄의 승패 (uuid → true·false·null)
async function wonByUuid(gameId) {
    const rows = await query('SELECT user_id, won FROM game_result_players WHERE game_id = ?', [gameId]);
    return new Map(rows.map((r) => [r.user_id, r.won === null ? null : Boolean(r.won)]));
}

// ── 시험 ──

test('A07-H-006 사람 5 + 봇 3 = 8명 판 받는 사람 섞임 → 이긴 편 산·진 편 산·처형된 사람은 결과판 "+1골드", 처형 뒤 나간 사람 지갑 +1, 산 채로 나간 사람 지갑 그대로·장부 0 @game @hard', async ({ players, table }) => {
    test.setTimeout(540_000);
    const people = await openHumans(players, 5);
    const [winner, loser, executed, deadLeaver, deserter] = people;
    const citizens = Object.fromEntries([loser, executed, deadLeaver, deserter].map((h) => [U(h), 'CITIZEN']));
    const t = await table.setup({
        humans: people,
        bots: 3,
        settings: customRoleSettings({ JOKER: 2 }, PACE),
        roles: ({ bots }) => ({ [U(winner)]: 'JOKER', [U(bots[0])]: 'JOKER', ...citizens }),
    });
    const [jokerBot, leaverBot, stayBot] = t.bots;
    expectRoles(await t.state(), { [U(winner)]: 'JOKER', [U(jokerBot)]: 'JOKER', ...citizens });
    const before = new Map();
    for (const h of people) before.set(U(h), await goldOf(U(h)));

    // 1일: 사람 둘(화면) + 봇 셋이 ㄷ을 찍음 (표 5 > 기권 3) → 재판 유죄 → ㄷ 처형, 관전 계속
    await closeReveals(people.map((h) => h.page));
    await t.advanceUntil('DAY_VOTE');
    await executeAtVote(t, U(executed), nick(executed), [winner, loser]);
    await keepWatchingUi(executed.page);

    // 2일: 같은 방법으로 ㄹ 처형 (표 5 > 기권 2) → ㄹ은 "사망 후 선택"에서 나감
    await t.advanceUntil((s) => s.phase === 'DAY' && s.dayPhase === 'DAY_VOTE' && s.dayIndex === 2, { maxSteps: 60 });
    await executeAtVote(t, U(deadLeaver), nick(deadLeaver), [winner, loser]);
    await leaveDeadUi(deadLeaver.page);

    // ㅁ은 산 채로 나감 → 광대 2 : 나머지 3 → 아직 안 끝남
    await leaveAliveUi(deserter.page);
    const afterDesert = await waitState(t, (g) => isDead(g, U(deserter)), '나간 사람은 죽은 것으로 바뀜');
    expect(afterDesert.winResult, '2 : 3은 판 계속').toBeNull();

    // 시민 봇 하나가 나가 광대 2 : 나머지 2 → 광대 승
    await botLeave(t, leaverBot);
    const end = await waitState(t, (g) => g.phase === 'ENDED', '수가 같아져 판 끝');
    expect(end.winResult?.winner, '서버 승자').toBe('JOKER');

    // 판 끝까지 있던 세 사람 결과판: 이긴 편 산(ㄱ)·진 편 산(ㄴ)·처형돼 관전(ㄷ) 모두 "+1골드"
    for (const [h, banner] of [[winner, '승리'], [loser, '패배'], [executed, '패배']]) {
        await toResult(h.page);
        await expectReadable(h.page.getByText(banner, { exact: true }), { large: true });
        await expect(myChip(h)).toHaveText('+1골드');
        await expectReadable(myChip(h));
    }

    // 장부: 끝까지 있던 사람(죽은 사람·죽은 뒤 나간 사람 포함)만 한 줄씩, 산 채로 나간 ㅁ·봇은 없음
    await expectRewarded(t.gameId, [winner, loser, executed, deadLeaver, jokerBot, stayBot].map(U));
    await expectGold(U(deadLeaver), before.get(U(deadLeaver)) + 1);
    expect(await goldOf(U(deserter)), '산 채로 나간 사람 지갑 그대로').toBe(before.get(U(deserter)));
});

test('A07-H-007 사람 2 + 봇 4 = 6명 판 진짜 60초 탈락 — 광대인 사람이 탭을 닫고 안 돌아옴 → 60초 뒤 탈락·판 끝, 그 사람 장부 0·남은 사람 +1 @game @hard @realtime', async ({ players, table }) => {
    test.setTimeout(240_000);
    const [stayer, closer] = await openHumans(players, 2);
    const t = await table.setup({
        humans: [stayer, closer],
        bots: 4,
        settings: customRoleSettings({ JOKER: 1 }, PACE),
        roles: () => ({ [U(closer)]: 'JOKER', [U(stayer)]: 'CITIZEN' }),
    });
    expectRoles(await t.state(), { [U(closer)]: 'JOKER', [U(stayer)]: 'CITIZEN' });
    const before = { stayer: await goldOf(U(stayer)), closer: await goldOf(U(closer)) };
    await closeReveals([stayer.page, closer.page]);

    // 탭 닫음 → 60초 기다림 시작 (손잡이로 안 넘김)
    await closer.page.close();
    const closedAt = Date.now();
    let eliminatedAt = null;
    await expect.poll(async () => {
        const row = await t.player(U(closer));
        if (row?.alive === false && eliminatedAt === null) eliminatedAt = Date.now();
        return row?.alive;
    }, { timeout: GRACE_MS + 15_000, intervals: [250], message: '끊긴 사람 탈락' }).toBe(false);
    // 60초 전엔 탈락 아님, 60초에 탈락 (허용 폭 ±1.5초, 더 늘려서 덮지 않음)
    expect(eliminatedAt - closedAt).toBeGreaterThanOrEqual(GRACE_MS - SLACK_MS);
    expect(eliminatedAt - closedAt).toBeLessThanOrEqual(GRACE_MS + SLACK_MS);

    // 하나뿐인 광대가 탈락 → 시민 승
    const end = await waitState(t, (g) => g.phase === 'ENDED', '탈락으로 판 끝');
    expect(end.winResult?.winner, '서버 승자').toBe('CITIZEN');
    await toResult(stayer.page);
    await expect(myChip(stayer)).toHaveText('+1골드');

    // 탈락한 사람은 장부·지갑에 없음, 남은 사람·봇만 한 줄씩
    await expectRewarded(t.gameId, [stayer, ...t.bots].map(U));
    await expectGold(U(stayer), before.stayer + 1);
    expect(await goldOf(U(closer)), '60초 탈락한 사람 지갑 그대로').toBe(before.closer);
});

test('A07-H-008 사람 2 + 봇 3 = 5명 판 탭을 닫았다 59초에 다시 엶 → 탈락 안 하고 이어서 함 → 판 끝 "+1골드" @game @hard @realtime', async ({ players, table }) => {
    test.setTimeout(240_000);
    const [stayer, returner] = await openHumans(players, 2);
    const t = await table.setup({
        humans: [stayer, returner],
        bots: 3,
        settings: PACE,
        roles: ({ bots }) => ({ [U(bots[0])]: 'JOKER', [U(stayer)]: 'CITIZEN', [U(returner)]: 'CITIZEN' }),
    });
    const jokerBot = t.bots[0];
    expectRoles(await t.state(), { [U(jokerBot)]: 'JOKER', [U(stayer)]: 'CITIZEN', [U(returner)]: 'CITIZEN' });
    await closeReveals([stayer.page, returner.page]);

    // 탭 닫음 → 57초까지 진짜로 기다렸다가 같은 브라우저에서 다시 엶 (59초쯤 다시 붙음, 60초 규칙을 보는 시험이라 손잡이 안 씀)
    await returner.page.close();
    const closedAt = Date.now();
    await sleep(Math.max(0, closedAt + GRACE_MS - 3_000 - Date.now()));
    const page = await returner.context.newPage();
    await page.goto('/lobby');
    // 판 중인 산 사람은 로비에 오면 판 화면으로 되돌아감
    await expect(page).toHaveURL(/\/ingame/, { timeout: 15_000 });
    expect(Date.now() - closedAt, '60초 안에 돌아옴').toBeLessThan(GRACE_MS);

    // 60초가 지나도 탈락 안 함 (살아서 판에 그대로)
    await sleep(Math.max(0, closedAt + GRACE_MS + SLACK_MS - Date.now()));
    const row = await t.player(U(returner));
    expect(row?.alive, '돌아온 사람은 살아 있음').toBe(true);
    expect(row?.isParticipating, '돌아온 사람은 판에 그대로').not.toBe(false);

    // 광대 봇이 나가 시민 승 → 돌아온 화면 결과판에 "+1골드", 장부에도 한 줄
    await botLeave(t, jokerBot);
    await waitState(t, (g) => g.phase === 'ENDED', '판 끝');
    await toResult(page);
    const chip = resultRow(page, nick(returner)).getByTestId('game-result-gold-reward');
    await expect(chip).toHaveText('+1골드');
    await expectReadable(chip);
    await expectRewarded(t.gameId, [stayer, returner, ...t.bots.slice(1)].map(U));
});

test('A07-H-009 사람 3 + 봇 4 = 7명 판 시민 사람이 산 채로 나감 → 시민 승이어도 그 사람만 패, 남은 사람 화면 "승리" @game @hard @smoke', async ({ players, table }) => {
    test.setTimeout(300_000);
    const [a, b, deserter] = await openHumans(players, 3);
    const humanRoles = Object.fromEntries([a, b, deserter].map((h) => [U(h), 'CITIZEN']));
    const t = await table.setup({
        humans: [a, b, deserter],
        bots: 4,
        settings: customRoleSettings({ JOKER: 1 }, PACE),
        roles: ({ bots }) => ({ [U(bots[0])]: 'JOKER', ...humanRoles }),
    });
    const jokerBot = t.bots[0];
    expectRoles(await t.state(), { [U(jokerBot)]: 'JOKER', ...humanRoles });
    await closeReveals([a, b, deserter].map((h) => h.page));
    await t.advanceUntil('DAY');

    // 시민 ㄷ이 산 채로 나감 (판은 계속) → 광대 봇이 나가 시민 승
    await leaveAliveUi(deserter.page);
    const mid = await waitState(t, (g) => isDead(g, U(deserter)), '나간 사람은 죽은 것으로 바뀜');
    expect(mid.winResult, '광대가 살아 있어 판 계속').toBeNull();
    await botLeave(t, jokerBot);
    const end = await waitState(t, (g) => g.phase === 'ENDED', '판 끝');
    expect(end.winResult?.winner, '서버 승자').toBe('CITIZEN');

    for (const h of [a, b]) {
        await toResult(h.page);
        await expectReadable(h.page.getByText('승리', { exact: true }), { large: true });
    }

    // 전적: 편은 이겼지만 산 채로 나간 사람은 패, 끝까지 있던 두 사람은 승
    await expect.poll(async () => (await wonByUuid(t.gameId)).size, { timeout: 30_000, message: '전적 줄 저장' }).toBe(7);
    const won = await wonByUuid(t.gameId);
    expect(won.get(U(deserter)), '산 채로 나간 시민').toBe(false);
    expect(won.get(U(a))).toBe(true);
    expect(won.get(U(b))).toBe(true);
});

test('A07-H-010 사람 2 + 봇 4 = 6명 판 처형된 뒤 나가 새 방을 만든 사람 → 옛 판이 끝나면 지갑 +1, 새 방은 그대로 @game @hard', async ({ players, table }) => {
    test.setTimeout(300_000);
    const [stayer, mover] = await openHumans(players, 2);
    const t = await table.setup({
        humans: [stayer, mover],
        bots: 4,
        settings: customRoleSettings({ JOKER: 1 }, PACE),
        roles: ({ bots }) => ({ [U(bots[0])]: 'JOKER', [U(stayer)]: 'CITIZEN', [U(mover)]: 'CITIZEN' }),
    });
    const jokerBot = t.bots[0];
    expectRoles(await t.state(), { [U(jokerBot)]: 'JOKER', [U(stayer)]: 'CITIZEN', [U(mover)]: 'CITIZEN' });
    const before = await goldOf(U(mover));
    await closeReveals([stayer.page, mover.page]);

    // 봇 넷이 ㄴ을 찍어 처형 (표 4 > 기권 2) → 판은 계속 (광대 1 : 나머지 4)
    await t.assertBotsCanExecute(U(mover));
    await t.advanceUntil('DAY_VOTE');
    const afterExecution = await executeAtVote(t, U(mover), nick(mover));
    expect(afterExecution.winResult, '시민이 처형돼도 판 계속').toBeNull();

    // ㄴ: "사망 후 선택"에서 나감 → 화면으로 새 방을 만듦 (죽은 사람은 탈주가 아니라 바로 됨)
    await leaveDeadUi(mover.page);
    const room = await createRoomUi(mover, {});
    await expectPartyCount(mover.page, 1);

    // 옛 판이 끝남 (광대 봇이 나가 시민 승) → 옛 판 골드가 ㄴ에게도 들어옴
    await botLeave(t, jokerBot);
    await waitState(t, (g) => g.phase === 'ENDED', '옛 판 끝');
    await expectRewarded(t.gameId, [stayer, mover, ...t.bots.slice(1)].map(U));
    await expectGold(U(mover), before + 1);

    // 새 방은 그대로: 같은 방·방장 그대로·화면도 대기방
    const still = await e2e.roomOf(U(mover));
    expect(still?.roomId, '새 방이 남아 있음').toBe(room.roomId);
    expect(still?.hostUuid).toBe(U(mover));
    await expect(mover.page).toHaveURL(/\/game-matching/);
    await expectPartyCount(mover.page, 1);
});

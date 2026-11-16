'use strict';

// 여러 판에 걸친 전적·판 골드·업적 브라우저 시험 (PC, 어려움) — 3판 연달아 뒤 판 수 업적, 탈주한 판은 골드 없음, 점검으로 끝난 판은 아무도 못 받음, 방 둘이 같이 끝나도 장부는 판마다
// 목록 A07-승패-결과-골드.md 번호 A07-H-024~028 (026·027은 점검을 켜서 @serial, 끝에 꼭 끔), 돌리지 않고 모임만: npx playwright test --list --no-deps tests/ingame/a07-records-multi.spec.js
const { test, expect } = require('../../helpers/fixtures');
const { Table } = require('../../helpers/game');
const { e2e } = require('../../helpers/internal');
const { query } = require('../../helpers/db');
const ui = require('../../helpers/ui');
const { hostGame, expectPartyCount, resultRow, closeReveals } = require('../room/roomHelpers');
const { wallet } = require('../store/store-tools');
const { setMaintenance, clearMaintenance, notice, noticeButton } = require('../maintenance/_maint');
const N = require('./b-night/_night');

// ── 이 파일 도우미 (공용으로 올릴 후보: A07 승패·결과 묶음) ──

const U = (x) => x.account.uuid;
const nick = (x) => x.account.nickname;
const resultBoard = (page) => page.getByRole('region', { name: '가면무도회 참가자 정체' });

// 봇 방장 판은 단계 시간을 가장 길게 둠 — 단계는 손잡이·"다 내면 5초"로만 넘어감 (화면을 누르거나 기다리는 동안 진짜 마감이 먼저 오면 흐름이 엇갈림)
const PACE = Object.freeze({ dayDiscussionTime: 150, dayVoteTime: 90, tribunalTime: 120, nightActionTime: 120 });
const myChip = (who) => resultRow(who.page, nick(who)).getByTestId('game-result-gold-reward');
const rewardRef = (gameId) => `game-reward:${gameId}`;

// 끝까지 한 판 3번 업적 (업적 정의 id), 보상 골드 50
const THREE_GAMES_ACHIEVEMENT = 'record-1-masquerade';
const THREE_GAMES_GOLD = 50;

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

// 결과 화면 "로비로" → 브라우저 확인 창 수락 → 로비 (로비에 오면 끝난 판 자리가 정리돼 다음 방에 들어갈 수 있음)
async function lobbyFromResult(page) {
    await toResult(page);
    page.once('dialog', (dialog) => { dialog.accept().catch(() => {}); });
    await page.getByRole('button', { name: '로비로', exact: true }).click();
    await expect(page).toHaveURL(/\/lobby/, { timeout: 15_000 });
}

// 같은 방에서 다음 판 시작 (사람만): 직업 다시 정하기 → 손님·방장 준비 → 게임시작 → 새 판
async function startAgain(host, guests, { roles, prevGameId }) {
    const room = await e2e.roomOf(U(host));
    expect(room?.roomId, '돌아온 대기방').toBeTruthy();
    await e2e.setRoles(roles, { roomId: room.roomId });
    await expectPartyCount(host.page, 1 + guests.length);
    for (const who of [...guests, host]) {
        await ui.readyUi(who.page);
        await expect(who.page.getByRole('button', { name: '준비취소' })).toBeVisible();
    }
    await host.page.getByRole('button', { name: '게임시작' }).click();
    for (const who of [host, ...guests]) await expect(who.page).toHaveURL(/\/ingame/, { timeout: 20_000 });
    const game = await e2e.gameOf(U(host));
    expect(game?.gameId, '새 판').toBeTruthy();
    expect(game.gameId, '앞 판과 다른 판').not.toBe(prevGameId);
    const t = new Table({ room, bots: [], humans: [host, ...guests] });
    t.gameId = game.gameId;
    return t;
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

// 그 사람 골드 장부 줄 전부 [{ reason, amount, reference_event_id }]
const goldRowsOf = (uuid) => query("SELECT reason, amount, reference_event_id FROM economy_ledger_entries WHERE user_id = ? AND currency = 'GOLD'", [uuid]);

// 지갑 골드 − 골드 장부 합 (늘 같아야 해서 판 앞뒤로 이 값이 안 바뀌는지 봄)
async function walletMinusLedger(uuid) {
    const rows = await goldRowsOf(uuid);
    return (await goldOf(uuid)) - rows.reduce((sum, r) => sum + Number(r.amount), 0);
}

// 받은 업적 id 목록
async function achievementsOf(uuid) {
    const rows = await query('SELECT achievement_id FROM achievement_grants WHERE user_id = ?', [uuid]);
    return rows.map((r) => r.achievement_id);
}

// ── 시험 ──

test('A07-H-024 사람 5명이 같은 방에서 3판 연달아 → 3판째 끝에 판 수 업적·알림, 골드 = 판 3 + 업적 50, 장부 판 골드 3줄·업적 보상 1줄, 지갑 = 장부 합 @game @hard', async ({ players }) => {
    test.setTimeout(900_000);
    const people = await openHumans(players, 5);
    const [j1, j2, victim] = people;
    const roles = Object.fromEntries(people.map((h, i) => [U(h), i < 2 ? 'JOKER' : 'CITIZEN']));
    const base = new Map();
    for (const h of people) base.set(U(h), { gold: await goldOf(U(h)), gap: await walletMinusLedger(U(h)) });

    // 판 하나: ㄱ·ㄴ 광대가 1일 밤 화면으로 같은 시민을 암살 → 광대 2 : 나머지 2 → 광대 승 (다섯 다 판 끝까지 있음)
    const gameIds = [];
    let t = await hostGame({ host: j1, guests: people.slice(1), roles, settings: { jokers: 2 } });
    for (let round = 1; round <= 3; round += 1) {
        expectRoles(await t.state(), roles);
        if (round === 3) {
            // 2판까지는 업적 없음 (기준 3판)
            await expectRewarded(gameIds[1], people.map(U));
            for (const h of people) expect(await achievementsOf(U(h)), '2판 뒤엔 아직 없음').not.toContain(THREE_GAMES_ACHIEVEMENT);
        }
        await N.toTurn(t, 'JOKER', { dayIndex: 1 });
        for (const j of [j1, j2]) await N.nightActUi(j.page, nick(victim), '암살');
        const end = await N.toEnd(t);
        expect(end?.winResult?.winner, `${round}판째 서버 승자`).toBe('JOKER');
        gameIds.push(t.gameId);
        if (round < 3) {
            for (const h of people) await roomFromResult(h.page);
            t = await startAgain(j1, people.slice(1), { roles, prevGameId: t.gameId });
        }
    }
    expect(new Set(gameIds).size, '서로 다른 판 3개').toBe(3);

    for (const h of people) {
        const uuid = U(h);
        await toResult(h.page);
        await expect(myChip(h)).toHaveText('+1골드');

        // 3판째 끝에 판 수 업적 + 알림 줄
        await expect.poll(() => achievementsOf(uuid), { timeout: 30_000, message: '판 수 업적' }).toContain(THREE_GAMES_ACHIEVEMENT);
        const notices = await query('SELECT title FROM notifications WHERE user_id = ? AND source_key = ?', [uuid, `achievement:${THREE_GAMES_ACHIEVEMENT}:granted`]);
        expect(notices.map((r) => r.title), '업적 알림').toEqual(['업적 달성']);

        // 골드 장부: 판 골드 3줄(판마다 하나, 1골드씩) + 업적 보상 1줄(50골드)
        await expectGold(uuid, base.get(uuid).gold + 3 + THREE_GAMES_GOLD);
        const rows = await goldRowsOf(uuid);
        const gameRows = rows.filter((r) => r.reason === 'GAME_REWARD');
        expect(gameRows.map((r) => r.reference_event_id).sort()).toEqual(gameIds.map(rewardRef).sort());
        expect(gameRows.map((r) => Number(r.amount))).toEqual([1, 1, 1]);
        const achievementRows = rows.filter((r) => r.reason === 'ACHIEVEMENT_REWARD');
        expect(achievementRows.map((r) => Number(r.amount)), '업적 보상 골드 줄').toEqual([THREE_GAMES_GOLD]);

        // 지갑 = 장부 합 (판 앞과 같은 차이)
        expect(await walletMinusLedger(uuid)).toBe(base.get(uuid).gap);
    }
});

test('A07-H-025 사람 1 + 봇 5 = 6명 판 3판 중 마지막 판을 산 채로 나감 → 판 골드 장부는 끝까지 한 2판 것만 @game @hard @smoke', async ({ user, table }) => {
    test.setTimeout(480_000);
    const page = user.page;
    const me = U(user);
    const gameIds = [];
    for (let round = 1; round <= 3; round += 1) {
        const t = await table.setup({
            humans: [user],
            bots: 5,
            settings: PACE,
            roles: ({ bots }) => ({ [me]: 'CITIZEN', [U(bots[0])]: 'JOKER' }),
        });
        expectRoles(await t.state(), { [me]: 'CITIZEN', [U(t.bots[0])]: 'JOKER' });
        gameIds.push(t.gameId);
        await closeReveals([page]);

        if (round < 3) {
            // 끝까지 한 판: 광대 봇이 나가 시민 승 → "로비로"
            await endByJokerLeaving(t, t.bots[0]);
            await expectRewarded(t.gameId, [me, ...t.bots.slice(1).map(U)]);
            await lobbyFromResult(page);
        } else {
            // 탈주한 판: 내가 산 채로 나간 뒤에 판이 끝남 → 끝까지 있던 봇 4만 받음
            await t.advanceUntil('DAY');
            await leaveAliveUi(page);
            await waitState(t, (g) => g.players.find((p) => p.uuid === me)?.alive === false, '나간 사람은 죽은 것으로 바뀜');
            await endByJokerLeaving(t, t.bots[0]);
            await expectRewarded(t.gameId, t.bots.slice(1).map(U));
        }
    }
    expect(await rewardRefsOf(me), '내 판 골드 장부').toEqual([rewardRef(gameIds[0]), rewardRef(gameIds[1])].sort());
});

test('A07-H-026 사람 2 + 봇 3 = 5명 판 중 점검 시각이 됨 → 판이 승패 없이 끝남(결과 화면 아님), 지갑·업적 그대로 @game @hard @serial @shutdown', async ({ players, table, internal }) => {
    test.setTimeout(300_000);
    const [a, b] = await openHumans(players, 2);
    const pages = [a.page, b.page];
    const before = [];
    for (const h of [a, b]) before.push({ gold: await goldOf(U(h)), achievements: await achievementsOf(U(h)) });

    const t = await table.setup({
        humans: [a, b],
        bots: 3,
        settings: PACE,
        roles: ({ bots }) => ({ [U(bots[0])]: 'JOKER', [U(a)]: 'CITIZEN', [U(b)]: 'CITIZEN' }),
    });
    await closeReveals(pages);
    try {
        // 점검 시작 8초 뒤로 예약 → 그 시각에 도는 판이 강제로 끝남
        await setMaintenance(internal, { enabled: true, startsInMs: 8_000 });
        for (const page of pages) {
            await expect(notice(page)).toContainText('점검으로 판이 끝났어요', { timeout: 45_000 });
            // 결과 화면으로 안 감
            await expect(page).not.toHaveURL(/\/gameresult/);
            await expect(resultBoard(page)).toHaveCount(0);
        }

        // 전적은 승패 없는 판으로 남고 판 골드·업적은 없음
        await expect.poll(async () => (await query('SELECT win_reason FROM game_results WHERE id = ?', [t.gameId]))[0]?.win_reason, {
            timeout: 30_000, message: '점검으로 끝난 판 전적',
        }).toBe('MAINTENANCE');
        expect(await rewardedUuids(t.gameId), '판 골드 장부 줄 없음').toEqual([]);
        for (const [i, h] of [a, b].entries()) {
            expect(await goldOf(U(h)), '지갑 그대로').toBe(before[i].gold);
            expect(await achievementsOf(U(h)), '업적 그대로').toEqual(before[i].achievements);
        }

        for (const page of pages) {
            await noticeButton(page, '로비로 가기').click();
            await expect(page).toHaveURL(/\/lobby/, { timeout: 15_000 });
        }
    } finally {
        await clearMaintenance(internal);
    }
});

test('A07-H-027 사람 2 + 봇 4 = 6명 판이 끝나 결과 화면일 때 점검 시각이 됨 → 그 판 골드는 그대로 (지갑 +1) @game @hard @serial', async ({ players, table, internal }) => {
    test.setTimeout(300_000);
    const [a, b] = await openHumans(players, 2);
    const before = [await goldOf(U(a)), await goldOf(U(b))];

    const t = await table.setup({
        humans: [a, b],
        bots: 4,
        settings: PACE,
        roles: ({ bots }) => ({ [U(bots[0])]: 'JOKER', [U(a)]: 'CITIZEN', [U(b)]: 'CITIZEN' }),
    });
    await closeReveals([a.page, b.page]);
    await endByJokerLeaving(t, t.bots[0]);
    const receivers = [a, b, ...t.bots.slice(1)].map(U);
    for (const [i, h] of [a, b].entries()) {
        await toResult(h.page);
        await expect(myChip(h)).toHaveText('+1골드');
        await expectGold(U(h), before[i] + 1);
    }
    await expectRewarded(t.gameId, receivers);

    try {
        // 결과 화면에 있는 동안 점검이 시작됨 (5초 뒤 예약 → 서버 점검 상태가 "점검 중"이 될 때까지 다시 읽어 봄)
        await setMaintenance(internal, { enabled: true, startsInMs: 5_000 });
        await expect.poll(async () => (await internal.reloadMaintenance())?.maintenance?.active, {
            timeout: 30_000, intervals: [1000], message: '점검 시작',
        }).toBe(true);

        // 이미 승패가 난 판은 안 건드림: 전적·장부·지갑 그대로
        const [row] = await query('SELECT winner, win_reason FROM game_results WHERE id = ?', [t.gameId]);
        expect(row?.winner, '승자 그대로').toBe('CITIZEN');
        expect(row?.win_reason, '점검으로 끝난 판이 아님').not.toBe('MAINTENANCE');
        expect(await rewardedUuids(t.gameId), '장부 그대로').toEqual([...receivers].sort());
        for (const [i, h] of [a, b].entries()) expect(await goldOf(U(h)), '지갑 +1 그대로').toBe(before[i] + 1);
        for (const h of [a, b]) await expect(h.page.getByText('점검으로 판이 끝났어요')).toHaveCount(0);
    } finally {
        await clearMaintenance(internal);
    }
});

test('A07-H-028 사람 2 + 봇 8, 5명 판 둘이 거의 같은 순간 끝남 → 판 골드 장부는 판마다 따로, 사람마다 자기 판 한 줄 @game @hard', async ({ players, table }) => {
    test.setTimeout(300_000);
    const [a, b] = await openHumans(players, 2);
    const setup = (who) => table.setup({
        humans: [who],
        bots: 4,
        settings: PACE,
        roles: ({ bots }) => ({ [U(who)]: 'CITIZEN', [U(bots[0])]: 'JOKER' }),
    });
    const ta = await setup(a);
    const tb = await setup(b);
    expectRoles(await ta.state(), { [U(a)]: 'CITIZEN', [U(ta.bots[0])]: 'JOKER' });
    expectRoles(await tb.state(), { [U(b)]: 'CITIZEN', [U(tb.bots[0])]: 'JOKER' });
    await closeReveals([a.page, b.page]);

    // 두 방의 광대 봇이 같은 순간 나감 → 두 판이 같이 끝남
    const [leftA, leftB] = await Promise.all([
        ta.bots[0].request('leave_game_session', { gameId: ta.gameId }),
        tb.bots[0].request('leave_game_session', { gameId: tb.gameId }),
    ]);
    expect(leftA?.ok, `봇 나가기 거절: ${leftA?.code}`).toBe(true);
    expect(leftB?.ok, `봇 나가기 거절: ${leftB?.code}`).toBe(true);
    await waitState(ta, (g) => g.phase === 'ENDED', '첫 방 판 끝');
    await waitState(tb, (g) => g.phase === 'ENDED', '둘째 방 판 끝');

    // 판마다 그 판 사람만 한 줄씩 (다른 판 사람이 섞이지 않음)
    await expectRewarded(ta.gameId, [a, ...ta.bots.slice(1)].map(U));
    await expectRewarded(tb.gameId, [b, ...tb.bots.slice(1)].map(U));
    expect(await rewardRefsOf(U(a)), 'ㄱ은 자기 판 한 줄').toEqual([rewardRef(ta.gameId)]);
    expect(await rewardRefsOf(U(b)), 'ㄴ은 자기 판 한 줄').toEqual([rewardRef(tb.gameId)]);

    for (const who of [a, b]) {
        await toResult(who.page);
        await expect(myChip(who)).toHaveText('+1골드');
    }
});

'use strict';

// 서버끼리 잇는 저장소(Redis)가 멈췄다 살아나는 브라우저 시험 (어려움) + 점검 시각 — 멈춘 동안 판은 끝까지·다른 서버 방 입장은 "잠시 후"·탈주는 살아난 뒤 다른 서버도 앎, 점검 시각엔 두 서버 판이 다 끝남
// 목록 A17-서버-여러대.md 번호 A17-H-021~024 (서버 전체에 걸려 하나씩만 돎 @serial, Redis는 시험 컨테이너만 멈추고 끝에 꼭 풂, E2E_NODES=2에서만 돎), 모임만: E2E_NODES=2 npx playwright test --list --no-deps tests/multinode/a17-redis-stall.spec.js
const K = require('./_a17-kit');
const { ui } = require('../../helpers/fixtures');
const { expectReadable } = require('../../helpers/visible');
const db = require('../../helpers/db');
const maint = require('../maintenance/_maint');
const N = require('../ingame/b-night/_night');
const K8 = require('../result/_a08-hard-kit');
const K9 = require('../ingame/_a09-simple-kit');

const { test, expect, e2e, internal, mn, N1, N2, U, nick } = K;

// 시험이 중간에 실패해도 Redis는 꼭 풀고, 두 서버가 다시 이어진 것까지 본 뒤 다음 시험
test.afterEach(async () => {
    K.resumeRedis();
    await K.waitRedis('up', [N1, N2], 30_000);
    await K.settleNodes();
});

test('A17-H-021 서버 ㄱ 5명 판 중 Redis 멈춤 → 판 끝까지 → 살아남 → 같은 방 코드에 서버 ㄱ·ㄴ 사람이 모여 새 판 시작 @game @hard @serial @smoke', async ({ crowd, bots }) => {
    test.setTimeout(480_000);
    const a = await crowd.on(N1);
    const b = await crowd.on(N2);
    const [hostBot, ...otherBots] = await mn.botsOn(bots, 3, N1);
    const { t, joker } = await K.startGame({ hostBot, otherBots, people: [a, b] });
    expect(await mn.gameNodeOf(U(a)), '판이 도는 서버').toBe(N1);
    await N.toDay(t, { dayIndex: 1 });

    K.pauseRedis();
    try {
        await K.waitRedis('down', [N1]);
        // 멈춘 동안에도 판은 넘어가고 끝남 (판 서버에 바로 물음 — 다른 서버는 판 서버에 못 물음)
        await K.advanceAt(N1, t.gameId);
        await expect.poll(async () => (await K.gameAt(N1, t.gameId))?.dayPhase, { message: '멈춘 동안 낮 투표로 넘어감' }).toBe('DAY_VOTE');
        await K8.jokerLeaves(t, joker);
        await expect.poll(async () => (await K.gameAt(N1, t.gameId))?.phase ?? 'GONE', { timeout: 20_000, message: '멈춘 동안 판 끝' }).toBe('ENDED');
        await K8.allAtResult([a, b]);
    } finally {
        K.resumeRedis();
    }
    await K.waitRedis('up');

    // 멈춘 채 끝난 판도 같은 코드로 방을 다시 엶 (결정 2026-11-16 오전 둘째 10번) → ㄱ "대기방으로", 방장 봇·남은 봇도 돌아옴
    await K8.pressReturn(a.page);
    const stayed = t.bots.filter((bot) => bot !== joker);
    for (const bot of stayed) await K8.botReturn(bot, t.gameId);
    expect((await e2e.roomOf(U(a)))?.roomCode, '같은 방 코드').toBe(t.roomCode);

    // ㄴ은 로비로 갔다가 서버 ㄴ 로비에서 같은 코드로, 새 봇 하나도 서버 ㄴ에서 코드로 → 다섯이 모임
    await K8.leaveToLobby(b.page);
    await K.lobbyOn(b, N2);
    await ui.joinRoomByCodeUi(b.page, t.roomCode);
    const [extra] = await mn.botsOn(bots, 1, N2);
    await extra.joinByCode(t.roomCode);
    for (const p of [a, b]) await K8.expectParty(p.page, 5);

    // 원래 방장 봇이 새 판 시작 → 두 사람 다 판 화면, 새 판도 서버 ㄱ
    const botList = [...stayed, extra];
    const next = await K8.startByBot(hostBot, [a, b], botList, K8.rolesFor([a, b], [extra]));
    expect(next.gameId, '새 판').not.toBe(t.gameId);
    for (const p of [a, b]) expect(await mn.gameNodeOf(U(p)), `${nick(p)} 새 판 서버`).toBe(N1);
    expect((await e2e.game(next.gameId))?.players.length, '새 판 인원').toBe(5);
});

test('A17-H-022 Redis 멈춘 동안 서버 ㄴ 사람이 서버 ㄱ 방 코드 입력 → "지금은 방 위치를 확인할 수 없습니다…" → 살아남 → 다시 → 대기방 화면 @hard @serial', async ({ crowd, bots }) => {
    test.setTimeout(240_000);
    const [host] = await mn.botsOn(bots, 1, N1);
    const room = await host.createRoom();
    expect(await K.roomNodeOf(U(host)), '방이 있는 서버').toBe(N1);
    const me = await crowd.on(N2);

    K.pauseRedis();
    try {
        await K.waitRedis('down');
        const text = await K8.codeEntryAlert(me.page, room.roomCode);
        expect(text).toBe(K.TEXT.clusterDown);
        await expectReadable(K.entryNotice(me.page).getByText(K.TEXT.clusterDown, { exact: true }));
        await expect(me.page).not.toHaveURL(/\/game-matching/);
    } finally {
        K.resumeRedis();
    }
    await K.waitRedis('up');

    // 살아난 뒤 같은 코드 → 방이 있는 서버로 옮겨 들어감
    await ui.joinRoomByCodeUi(me.page, room.roomCode);
    await K8.expectParty(me.page, 2);
    expect((await e2e.roomOf(U(me)))?.hostUuid, '들어간 방 방장').toBe(U(host));
    expect(await K.roomNodeOf(U(me)), '방이 있는 서버').toBe(N1);
});

test('A17-H-023 Redis 멈춘 동안 서버 ㄱ 7명 판에서 ㄱ이 산 채로 나감 → 살아남 → ㄱ 서버 ㄴ 로비 "게임 만들기" → 탈주 막힘 글 @game @hard @serial', async ({ crowd, bots }) => {
    test.setTimeout(360_000);
    const a = await crowd.on(N1);
    const b = await crowd.on(N1);
    const [hostBot, ...otherBots] = await mn.botsOn(bots, 5, N1);
    const { t } = await K.startGame({ hostBot, otherBots, people: [a, b] });
    expect(await mn.gameNodeOf(U(a)), '판이 도는 서버').toBe(N1);
    await N.toDay(t, { dayIndex: 1 });

    K.pauseRedis();
    try {
        await K.waitRedis('down', [N1]);
        await K9.leaveAlive(a.page);
        // 판에서 빠진 것은 판 서버가 앎 (ㄴ과 봇은 그대로 판 중)
        await expect.poll(async () => K9.rowOf(await K.gameAt(N1, t.gameId), U(a))?.isParticipating, { message: 'ㄱ 판에서 빠짐' }).toBe(false);
    } finally {
        K.resumeRedis();
    }
    await K.waitRedis('up');
    // 판 서버가 ㄱ의 옛 위치 기록(판 = 서버 ㄱ)을 지울 때까지 (안 그러면 서버 ㄴ이 ㄱ을 서버 ㄱ으로 돌려보냄)
    await K.waitLocCleared(U(a));

    // 살아난 뒤 다른 서버도 막힘을 앎
    await K.lobbyOn(a, N2);
    const text = await K9.createRoomAlert(a.page);
    expect(text).toMatch(K.TEXT.desertedFirst);
    await expectReadable(K.entryNotice(a.page).getByText(K.TEXT.desertedFirst));
    await expect(a.page).toHaveURL(/\/game-setup/);
    expect(await e2e.roomOf(U(a)), '방 안 생김').toBeNull();
    // ㄴ은 그대로 판 화면
    await expect(b.page).toHaveURL(/\/ingame/);
});

test('A17-H-024 서버 ㄱ·ㄴ에 5명 판 하나씩 → 점검 시각이 됨 → 두 판 다 끝남, 두 쪽 사람 모두 점검 안내 @game @hard @serial', async ({ crowd, bots }) => {
    test.setTimeout(360_000);
    const a = await crowd.on(N1);
    const b = await crowd.on(N2);
    const [host1, ...others1] = await mn.botsOn(bots, 4, N1);
    const [host2, ...others2] = await mn.botsOn(bots, 4, N2);
    const near = await K.startGame({ hostBot: host1, otherBots: others1, people: [a] });
    const far = await K.startGame({ hostBot: host2, otherBots: others2, people: [b] });
    expect(await mn.gameNodeOf(U(a)), 'ㄱ 판 서버').toBe(N1);
    expect(await mn.gameNodeOf(U(b)), 'ㄴ 판 서버').toBe(N2);

    const reasonOf = async (gameId) => (await db.query('SELECT win_reason FROM game_results WHERE id = ?', [gameId]))[0]?.win_reason ?? null;
    try {
        // 3초 뒤 시작하는 점검: 점검 줄은 DB에 쓰고 서버 ㄱ만 다시 읽음 → 서버끼리 알림으로 서버 ㄴ도 알아야 함
        const startsAt = Date.now() + 3000;
        await db.query(
            'UPDATE maintenance_state SET is_enabled = 1, message = ?, starts_at = ?, ends_at = ?, updated_at = NOW() WHERE id = 1',
            ['시험 점검이에요 (서버 2대)', db.sqlTime(startsAt), db.sqlTime(startsAt + 3600e3)],
        );
        const reloaded = await K.internalOn(N1, 'POST', '/internal/maintenance/reload');
        expect(reloaded.ok, `서버 ㄱ 점검 다시 읽기 (${reloaded.status})`).toBe(true);

        // 점검 시각 → 두 서버 판이 다 점검으로 끝남
        for (const { t } of [near, far]) {
            await expect.poll(() => reasonOf(t.gameId), { timeout: 45_000, message: '점검으로 끝난 판 전적' }).toBe('MAINTENANCE');
        }
        // 두 쪽 사람 모두 점검 안내 (결과 화면 없이 판을 지움 — 결정 2026-11-16 아침 5번)
        for (const p of [a, b]) {
            await expect(maint.notice(p.page)).toContainText(K.TEXT.maintenanceEnded, { timeout: 45_000 });
            await expectReadable(maint.notice(p.page).getByText(K.TEXT.maintenanceEnded), { timeout: 5000 });
            await expect(p.page).not.toHaveURL(/\/gameresult/);
        }
    } finally {
        await maint.clearMaintenance(internal);
    }
    for (const { t } of [near, far]) {
        await expect.poll(async () => (await e2e.game(t.gameId)) === null, { timeout: 20_000, message: '판이 서버에서 지워짐' }).toBe(true);
    }
});

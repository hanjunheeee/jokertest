'use strict';

// 서버 2대 둘째 판 브라우저 시험 (어려움) — 판 끝 뒤 같은 코드 방에 다른 서버 새 사람이 합류해 둘째 판까지, 죽은 뒤 다른 서버에서 새 판을 해도 옛 판 알림은 안 오고 옛 판 골드는 받음
// 목록 A17-서버-여러대.md 번호 A17-H-037~038 (E2E_NODES=2에서만 돎), 모임만: E2E_NODES=2 npx playwright test --list --no-deps tests/multinode/a17-second-game.spec.js
const K = require('./_a17-kit');
const { ui } = require('../../helpers/fixtures');
const { expectReadable } = require('../../helpers/visible');
const { closeReveals } = require('../room/roomHelpers');
const N = require('../ingame/b-night/_night');
const C = require('../ingame/c-chat/_lib');
const K8 = require('../result/_a08-hard-kit');
const K9 = require('../ingame/_a09-simple-kit');
const { wallet } = require('../store/store-tools');

const { test, expect, e2e, mn, N1, N2, U, nick } = K;

test('A17-H-037 10명 판 끝 → "대기방으로" → 서버 ㄴ 새 사람이 코드로 합류 → 방장이 시작 → 10명 둘째 판 끝까지, 방 코드 그대로 @game @hard @smoke', async ({ crowd, bots }) => {
    test.setTimeout(600_000);
    const a = await crowd.on(N1);
    const b = await crowd.on(N1);
    const [hostBot, ...otherBots] = await mn.botsOn(bots, 8, N1);
    // 첫 판: 사람 2 + 봇 8 = 10명, 서버 ㄱ
    const { t, joker } = await K.startGame({ hostBot, otherBots, people: [a, b] });
    expect(await mn.gameNodeOf(U(a)), '첫 판이 도는 서버').toBe(N1);
    await K.endByJoker(t, joker);
    await K8.allAtResult([a, b]);

    // 나간 광대 봇만 빼고 아홉이 "대기방으로" → 원래 방장 봇이 방장
    for (const p of [a, b]) await K8.pressReturn(p.page);
    const stayed = t.bots.filter((bot) => bot !== joker);
    for (const bot of stayed) await K8.botReturn(bot, t.gameId);
    for (const p of [a, b]) await K8.expectParty(p.page, 9);

    // 서버 ㄴ 로비의 새 사람 ㄷ이 같은 코드로 합류 → 다시 10명
    const c = await crowd.on(N2);
    await ui.joinRoomByCodeUi(c.page, t.roomCode);
    const people = [a, b, c];
    for (const p of people) await K8.expectParty(p.page, 10);
    const room = await e2e.roomOf(U(c));
    expect(room.roomCode, '같은 방 코드').toBe(t.roomCode);
    expect(room.hostUuid, '방장 = 원래 방장 봇').toBe(U(hostBot));
    expect(await K.roomNodeOf(U(c)), '방이 있는 서버').toBe(N1);

    // 둘째 판: 시작 조건은 처음과 같음 (모두 준비 → 방장 시작), 사람 3 + 봇 7 = 10명
    const next = await K8.startByBot(hostBot, people, stayed, K8.rolesFor(people, [stayed.at(-1)]));
    expect(next.gameId, '새 판').not.toBe(t.gameId);
    expect((await e2e.game(next.gameId))?.players.length, '둘째 판 인원').toBe(10);
    for (const p of people) expect(await mn.gameNodeOf(U(p)), `${nick(p)} 둘째 판 서버`).toBe(N1);
    const nextJoker = await K8.findJokerBot(next, stayed, { not: hostBot });
    await closeReveals(people.map((p) => p.page));
    await K.endByJoker(next, nextJoker);
    await K8.allAtResult(people);

    // 둘째 판이 끝나도 같은 코드 방으로 돌아감
    await K8.pressReturn(c.page);
    await K8.expectRoomCodeShown(c.page, t.roomCode);
    expect((await e2e.roomOf(U(c)))?.roomCode, '둘째 판 뒤에도 같은 방 코드').toBe(t.roomCode);
});

test('A17-H-038 서버 ㄱ 5명 판에서 처형된 ㄱ이 로비 → 서버 ㄴ 방에서 새 5명 판 → ㄱ 화면에 옛 판 알림 없음 → 옛 판이 끝나면 ㄱ 판 골드 +1 @game @hard', async ({ crowd, bots }) => {
    test.setTimeout(480_000);
    const a = await crowd.on(N1);
    const b = await crowd.on(N1);
    const goldBefore = (await wallet(U(a))).gold;

    // 옛 판: 사람 2 + 봇 3 = 5명, 서버 ㄱ → 봇 3표로 ㄱ 처형 (ㄴ과 봇 셋은 계속)
    const [host1, ...others1] = await mn.botsOn(bots, 3, N1);
    const old = await K.startGame({ hostBot: host1, otherBots: others1, people: [a, b] });
    expect(await mn.gameNodeOf(U(a)), '옛 판이 도는 서버').toBe(N1);
    await K9.execute(old.t, U(a));

    // ㄱ: 로비로 가면 벌 없이 풀림 → 서버 ㄴ 봇 방에 코드로 → 새 판 (이때부터 ㄱ 화면이 받는 알림을 적어 둠)
    const frames = C.watchSocket(a.page);
    await a.pin(N2);
    await ui.gotoLobby(a.page);
    await expect.poll(async () => K9.rowOf(await e2e.game(old.t.gameId), U(a))?.isParticipating, { message: 'ㄱ 옛 판에서 풀림' }).toBe(false);
    const [host2, ...others2] = await mn.botsOn(bots, 4, N2);
    const fresh = await K.startGame({ hostBot: host2, otherBots: others2, people: [a] });
    expect(await mn.gameNodeOf(U(a)), '새 판이 도는 서버').toBe(N2);
    const freshStartedAt = Date.now();
    await N.toDay(fresh.t, { dayIndex: 1 });

    // 옛 판을 밤까지 넘기고 끝냄 (광대 봇이 나가 시민 승) → 그동안 ㄱ 화면은 새 판 그대로
    await old.t.advanceUntil('NIGHT');
    await K.endByJoker(old.t, old.joker);
    await K8.allAtResult([b]);
    await expect(a.page).toHaveURL(/\/ingame/);
    expect((await e2e.gameOf(U(a)))?.gameId, 'ㄱ은 새 판에 그대로').toBe(fresh.t.gameId);
    await expect(async () => {
        await K9.clear(a.page);
        await expectReadable(N.cardStatus(a.page, nick(a)).getByText(nick(a), { exact: true }), { timeout: 2000 });
    }).toPass({ timeout: 30_000 });
    // 새 판을 시작한 뒤 ㄱ 화면 소켓에 옛 판 번호가 실린 판 알림이 하나도 없음
    // 뺌: 계정 캐시 무효화(account_cache_invalidated) — 옛 판이 끝나 판 골드·기록이 바뀌었으니 지갑을 다시 읽으라는 내 계정 알림, 판에서 빠진 원 참가자에게도 보냄(서버 persist.js invalidateAccountCaches)
    // 아래에서 보는 "옛 판 골드 +1"이 화면에 닿는 길이라 오는 게 맞음
    const fromOld = frames.filter((r) => r.at >= freshStartedAt && r.payload?.gameId === old.t.gameId && r.event !== 'account_cache_invalidated');
    expect(fromOld.map((r) => r.event), '새 판 중 받은 옛 판 알림').toEqual([]);

    // 죽은 뒤 풀린 사람도 옛 판 골드는 받음: 장부 한 줄, 지갑 +1
    await expect.poll(async () => (await K.rewardedUuids(old.t.gameId)).filter((u) => u === U(a)).length, { timeout: 30_000, message: 'ㄱ 옛 판 골드 장부 줄' }).toBe(1);
    await expect.poll(async () => (await wallet(U(a))).gold, { timeout: 30_000, message: 'ㄱ 지갑 골드' }).toBe(goldBefore + 1);
});

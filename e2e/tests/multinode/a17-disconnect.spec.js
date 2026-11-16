'use strict';

// 서버 2대 판 중 끊김 브라우저 시험 (어려움) — 탭을 닫은 사람이 60초 안에 다른 서버 힌트로 돌아오면 산 채로 이어 하고, 60초를 넘기면 탈락해 다른 서버 로비에서도 탈주 글로 막힘
// 목록 A17-서버-여러대.md 번호 A17-H-011~012 (끊김 60초 규칙이라 손잡이 없이 진짜로 기다림 @realtime, E2E_NODES=2에서만 돎), 모임만: E2E_NODES=2 npx playwright test --list --no-deps tests/multinode/a17-disconnect.spec.js
const K = require('./_a17-kit');
const { ui } = require('../../helpers/fixtures');
const { expectReadable } = require('../../helpers/visible');
const N = require('../ingame/b-night/_night');
const A4 = require('../ingame/_a04-multi');
const K9 = require('../ingame/_a09-simple-kit');
const H9 = require('../ingame/_a09-hard-kit');

const { test, expect, e2e, mn, N1, N2, U, nick } = K;

// 서버 ㄱ에서 사람 2(ㄱ·ㄴ) + 봇 n-2 판 → 첫 낮 → ㄱ이 탭을 닫음 → 서버가 끊김을 안 때(ms)
async function closeTabInGame(crowd, bots, n) {
    const a = await crowd.on(N1);
    const b = await crowd.on(N1);
    const [hostBot, ...otherBots] = await mn.botsOn(bots, n - 2, N1);
    const { t } = await K.startGame({ hostBot, otherBots, people: [a, b] });
    expect(await mn.gameNodeOf(U(a)), '판이 도는 서버').toBe(N1);
    await N.toDay(t, { dayIndex: 1 });
    await K9.clear(b.page);
    const since = Date.now();
    await a.page.close();
    const dropAt = await K9.droppedAt(t, U(a), since);
    await H9.expectStatus(b.page, nick(a), 'disconnected');
    return { a, b, t, dropAt };
}

test('A17-H-011 5명 판(사람 2 + 봇 3) ㄱ 탭 닫음 → 30초 뒤 서버 ㄴ 힌트로 새로 엶 → 판 화면, 산 채, 투표 됨 @game @hard @realtime @smoke', async ({ crowd, bots }) => {
    test.setTimeout(300_000);
    const { a, b, t, dropAt } = await closeTabInGame(crowd, bots, 5);

    // 끊긴 지 30초에 (60초 안) 다른 서버 힌트로 새 탭 → 서버가 판 서버로 돌려보내 판 화면
    await K9.sleepUntil(dropAt + 30_000);
    await a.pin(N2);
    const tab = await a.context.newPage();
    await tab.goto('/lobby');
    await expect(tab).toHaveURL(/\/ingame/, { timeout: 20_000 });
    await expect.poll(() => K.hintOf(tab), { timeout: 15_000, message: '판 서버로 바뀐 힌트' }).toBe(N1);

    // 산 채로 이어 함: ㄴ 화면 ㄱ 카드가 다시 산 사람, 서버도 산 채·판에 남음
    await H9.expectStatus(b.page, nick(a), 'alive');
    const row = await t.player(U(a));
    expect(row?.alive, '산 채').toBe(true);
    expect(row?.isParticipating, '판에 남음').toBe(true);

    // 끊긴 지 60초가 지나도 그대로 (기다림이 풀렸음)
    await K9.sleepUntil(dropAt + K9.GRACE_MS + K9.SLACK_MS);
    expect((await t.player(U(a)))?.alive, '60초 뒤에도 산 채').toBe(true);

    // 낮 투표: ㄱ이 새 탭에서 봇 하나를 찍음 → 기권 단추가 꺼지면 표가 들어간 것
    await K9.toVote(t);
    await A4.dayVoteUi(tab, t.bots[0].nickname);
    await expect(tab.getByRole('button', { name: '기권' }).first()).toBeDisabled();
});

test('A17-H-012 6명 판(사람 2 + 봇 4) ㄱ 탭 닫음 → 61초 → ㄴ 화면에 ㄱ 탈락 → ㄱ이 서버 ㄴ 로비 "게임 만들기" → 탈주 막힘 글 @game @hard @realtime', async ({ crowd, bots }) => {
    test.setTimeout(300_000);
    const { a, b, t, dropAt } = await closeTabInGame(crowd, bots, 6);

    // 59초까지는 끊긴 표시 그대로 (손잡이 안 씀)
    await K9.sleepUntil(dropAt + K9.GRACE_MS - K9.SLACK_MS);
    await H9.expectStatus(b.page, nick(a), 'disconnected', 1000);
    // 61초: 못 돌아와 탈락 → ㄴ 화면 ㄱ 카드 사망
    await K9.sleepUntil(dropAt + K9.GRACE_MS + K9.SLACK_MS);
    await H9.expectStatus(b.page, nick(a), 'dead', 5000);
    expect((await t.player(U(a)))?.isParticipating, '판에서 빠짐').toBe(false);

    // ㄱ: 서버 ㄴ 힌트로 새 탭 로비 → 방 만들기는 탈주 글로 막힘
    const tab = await a.context.newPage();
    await a.pin(N2);
    await ui.gotoLobby(tab);
    await expect(tab).toHaveURL(/\/lobby/);
    const text = await K9.createRoomAlert(tab);
    expect(text).toMatch(K.TEXT.desertedFirst);
    await expectReadable(K.entryNotice(tab).getByText(K.TEXT.desertedFirst));
    await expect(tab).toHaveURL(/\/game-setup/);
    expect(await e2e.roomOf(U(a)), '방 안 생김').toBeNull();
});

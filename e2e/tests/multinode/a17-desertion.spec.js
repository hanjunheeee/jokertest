'use strict';

// 서버 2대 탈주 막힘 브라우저 시험 — 한 서버 판에서 산 채로 나간 사람은 다른 서버 로비에서도 방 만들기·코드 입장이 "탈주로 ○분 ○초 뒤에…" 글로 막힘
// 목록 A17-서버-여러대.md 번호 A17-E-011~012 (E2E_NODES=2에서만 돎), 모임만: E2E_NODES=2 npx playwright test --list --no-deps tests/multinode/a17-desertion.spec.js
const K = require('./_a17-kit');
const { expectReadable } = require('../../helpers/visible');
const N = require('../ingame/b-night/_night');
const K9 = require('../ingame/_a09-simple-kit');

const { test, expect, e2e, mn, N1, N2, U } = K;

// 서버 ㄱ에서 사람 1 + 봇 n-1 판 → 첫 낮에 산 채로 나감 → 서버 ㄴ 로비로
async function desertOnFirstNode(crowd, bots, n) {
    const me = await crowd.on(N1);
    const [hostBot, ...otherBots] = await mn.botsOn(bots, n - 1, N1);
    const { t } = await K.startGame({ hostBot, otherBots, people: [me] });
    expect(await mn.gameNodeOf(U(me)), '판이 도는 서버').toBe(N1);
    await N.toDay(t, { dayIndex: 1 });
    await K9.leaveAlive(me.page);
    await K.lobbyOn(me, N2);
    return { me, t };
}

test('A17-E-011 서버 ㄱ 5명 판에서 산 채로 나감 → 서버 ㄴ 로비 "게임 만들기" → "탈주로 4분 …초 뒤에 참여할 수 있습니다." @game @smoke', async ({ crowd, bots }) => {
    test.setTimeout(180_000);
    const { me } = await desertOnFirstNode(crowd, bots, 5);

    const text = await K9.createRoomAlert(me.page);
    expect(text).toMatch(K.TEXT.desertedFirst);
    // PC는 알림 창을 닫은 뒤에도 까닭 글이 화면 띠에 남음 → 그 글이 사람 눈에 읽히는지
    await expectReadable(K.entryNotice(me.page).getByText(K.TEXT.desertedFirst));
    await expect(me.page).toHaveURL(/\/game-setup/);
    expect(await e2e.roomOf(U(me)), '방 안 생김').toBeNull();
});

test('A17-E-012 서버 ㄱ 7명 판에서 산 채로 나감 → 서버 ㄴ 로비에서 다른 방 코드 입력 → 같은 탈주 글 @game', async ({ crowd, bots }) => {
    test.setTimeout(180_000);
    // 들어가 볼 다른 방은 서버 ㄴ에 미리 만들어 둠
    const [other] = await mn.botsOn(bots, 1, N2);
    const otherRoom = await other.createRoom();
    const { me } = await desertOnFirstNode(crowd, bots, 7);

    const text = await K9.joinByCodeAlert(me.page, otherRoom.roomCode);
    expect(text).toMatch(K.TEXT.desertedFirst);
    await expectReadable(K.entryNotice(me.page).getByText(K.TEXT.desertedFirst));
    await expect(me.page).not.toHaveURL(/\/game-matching/);
    expect(await e2e.roomOf(U(me)), '방에 안 들어감').toBeNull();
});

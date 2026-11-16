'use strict';

// 서버 2대 판 길잡이 브라우저 시험 — 판 중 새로고침·다른 서버 힌트·로비 주소로 가도 판이 도는 서버의 판 화면으로 돌아옴, 죽은 사람은 로비에서 풀려 방 만들기 됨
// 목록 A17-서버-여러대.md 번호 A17-E-004~007 (사람은 다른 서버 로비에서 출발, E2E_NODES=2에서만 돎), 모임만: E2E_NODES=2 npx playwright test --list --no-deps tests/multinode/a17-game-node.spec.js
const K = require('./_a17-kit');
const { ui } = require('../../helpers/fixtures');
const { expectReadable } = require('../../helpers/visible');
const N = require('../ingame/b-night/_night');
const K9 = require('../ingame/_a09-simple-kit');
const H9 = require('../ingame/_a09-hard-kit');

const { test, expect, e2e, mn, N1, N2, U, nick } = K;

// 판 화면 시민 직업 이름 (공용 ui.ROLE_LABELS는 옛 이름 "시민")
const CITIZEN_ROLE_NAME = '귀족';

// 판은 서버 ㄱ(봇 전부), 사람은 서버 ㄴ 로비에서 출발 → 사람 1 + 봇 n-1 판, 첫 낮까지
async function seatFromOtherNode(crowd, bots, n) {
    const me = await crowd.on(N2);
    const [hostBot, ...otherBots] = await mn.botsOn(bots, n - 1, N1);
    const { t } = await K.startGame({ hostBot, otherBots, people: [me] });
    expect(await mn.gameNodeOf(U(me)), '판이 도는 서버').toBe(N1);
    await N.toDay(t, { dayIndex: 1 });
    return { me, t };
}

// 판 화면 내 카드의 닉네임 글이 사람 눈에 읽힘 (연출 창을 닫으면서)
async function expectMyCard(page, nickname) {
    await expect(async () => {
        await K9.clear(page);
        await expectReadable(N.cardStatus(page, nickname).getByText(nickname, { exact: true }), { timeout: 2000 });
    }).toPass({ timeout: 30_000 });
}

// 서버 판 값에서 나는 산 채로 그 판에 그대로
async function expectAliveIn(t, uuid) {
    const g = await e2e.gameOf(uuid);
    expect(g?.gameId, '내 판').toBe(t.gameId);
    const row = K9.rowOf(g, uuid);
    expect(row?.alive, '산 채').toBe(true);
    expect(row?.isParticipating, '판에 남음').toBe(true);
}

test('A17-E-004 5명 판 낮에 힌트 없이 새로고침 → 판 화면 그대로, 같은 판·내 직업 시민(화면 이름 "귀족") 그대로 @game @smoke', async ({ crowd, bots }) => {
    test.setTimeout(180_000);
    const { me, t } = await seatFromOtherNode(crowd, bots, 5);
    // 힌트를 지우고 다시 엶 → 앞단이 아무 서버로 보내도 서버가 판 서버로 돌려보냄
    await me.unpin();
    await K.dropHint(me.page);
    await me.page.reload();

    await expect(me.page).toHaveURL(/\/ingame/, { timeout: 20_000 });
    await expectMyCard(me.page, nick(me));
    await expectAliveIn(t, U(me));
    // 내 역할 보기 창의 시민 직업 이름은 "귀족" (화면 ingameRoleRevealData.js, 결정 2026-11-16 셋째)
    await H9.expectMyRole(me.page, CITIZEN_ROLE_NAME);
    expect((await t.player(U(me)))?.role, '서버 직업').toBe('CITIZEN');
});

test('A17-E-005 8명 판 중 힌트를 다른 서버로 바꾸고 새로고침 → 판 화면 그대로, 힌트는 판 서버로 돌아옴 @game', async ({ crowd, bots }) => {
    test.setTimeout(180_000);
    const { me, t } = await seatFromOtherNode(crowd, bots, 8);
    // 판은 서버 ㄱ, 힌트는 서버 ㄴ으로 고정한 채 다시 엶
    await me.pin(N2);
    await me.page.reload();

    await expect(me.page).toHaveURL(/\/ingame/, { timeout: 20_000 });
    await expectMyCard(me.page, nick(me));
    await expectAliveIn(t, U(me));
    await expect.poll(() => K.hintOf(me.page), { timeout: 15_000, message: '판 서버로 바뀐 힌트' }).toBe(N1);
});

test('A17-E-006 7명 판 산 사람이 주소 /lobby로 감 → /ingame으로 돌아옴, 산 채 그대로 @game', async ({ crowd, bots }) => {
    test.setTimeout(180_000);
    const { me, t } = await seatFromOtherNode(crowd, bots, 7);
    await me.page.goto('/lobby');

    await expect(me.page).toHaveURL(/\/ingame/, { timeout: 15_000 });
    await expectMyCard(me.page, nick(me));
    await expectAliveIn(t, U(me));
});

test('A17-E-007 8명 판 처형된 사람이 /lobby로 감 → 로비에 남음 → "게임 만들기" → 대기방 화면 @game', async ({ crowd, bots }) => {
    test.setTimeout(240_000);
    const { me, t } = await seatFromOtherNode(crowd, bots, 8);
    // 봇 7표로 나를 재판에 세워 처형 (나는 안 냄 = 기권 1)
    await K9.execute(t, U(me));

    await ui.gotoLobby(me.page);
    await expect(me.page).toHaveURL(/\/lobby$/);
    // 죽은 사람은 로비에 오면 판에서 풀림 (판은 봇끼리 계속)
    await expect.poll(async () => K9.rowOf(await e2e.game(t.gameId), U(me))?.isParticipating, { message: '판에서 풀림' }).toBe(false);
    expect((await e2e.game(t.gameId))?.phase, '판은 계속').not.toBe('ENDED');

    await K9.createRoomOk(me.page);
    await expect(me.page.getByRole('button', { name: '게임시작' })).toBeVisible();
    await expect.poll(async () => (await e2e.roomOf(U(me)))?.hostUuid, { message: '새 방 방장 = 나' }).toBe(U(me));
});

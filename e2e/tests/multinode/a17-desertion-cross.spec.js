'use strict';

// 서버 2대 탈주 막힘 브라우저 시험 (어려움) — 탈주한 사람은 다른 서버에서 친구 초대를 수락해도 막히고, 같은 날 두 번째 탈주는 다른 서버 판이어도 30분
// 목록 A17-서버-여러대.md 번호 A17-H-013~014 (014는 첫 막힘 5분을 진짜로 기다림 @realtime — 이 시험만 쓰는 계정, E2E_NODES=2에서만 돎), 모임만: E2E_NODES=2 npx playwright test --list --no-deps tests/multinode/a17-desertion-cross.spec.js
const crypto = require('node:crypto');
const K = require('./_a17-kit');
const { ui } = require('../../helpers/fixtures');
const { expectReadable } = require('../../helpers/visible');
const { api, makeFriends } = require('../../helpers/friends');
const { createRoomUi } = require('../room/roomHelpers');
const N = require('../ingame/b-night/_night');
const K9 = require('../ingame/_a09-simple-kit');

const { test, expect, e2e, mn, N1, N2, U, nick } = K;

// "탈주로 4분 57초 뒤에…" → 남은 초 297
function secondsLeft(text) {
    const m = /^탈주로 (\d+)분 (\d+)초 뒤에 참여할 수 있습니다\.$/.exec(text);
    if (!m) throw new Error(`탈주 글 모양이 아님: ${text}`);
    return Number(m[1]) * 60 + Number(m[2]);
}

// 그 사람이 앉은 방 명단 (uuid 목록)
async function seatsOf(person) {
    return ((await e2e.roomOf(U(person)))?.players ?? []).map((p) => p.uuid);
}

test('A17-H-013 7명 판(사람 2 + 봇 5) ㄱ이 산 채로 나감 → 처형돼 풀린 ㄴ이 서버 ㄴ 방에서 ㄱ 초대 → ㄱ 수락 → 탈주 막힘 글 @game @hard @smoke', async ({ crowd, bots }) => {
    test.setTimeout(360_000);
    const a = await crowd.on(N1);
    const b = await crowd.on(N1);
    // 친구는 판에 들어가기 전에 맺어 둠
    await makeFriends(a, b);
    const [hostBot, ...otherBots] = await mn.botsOn(bots, 5, N1);
    const { t } = await K.startGame({ hostBot, otherBots, people: [a, b] });
    expect(await mn.gameNodeOf(U(a)), '판이 도는 서버').toBe(N1);

    // ㄴ: 봇 5표로 처형 → 죽은 사람은 로비로 가면 벌 없이 풀림 → 서버 ㄴ에서 새 방
    await K9.execute(t, U(b));
    // 죽은 채 판에 묶여 있는 동안은 서버가 판 서버로 먼저 돌려보냄 → 힌트만 바꾸고 로비를 엶 (풀린 뒤 방 만들기 화면을 열 때 서버 ㄴ으로 붙음)
    await b.pin(N2);
    await ui.gotoLobby(b.page);
    await expect.poll(async () => K9.rowOf(await e2e.game(t.gameId), U(b))?.isParticipating, { message: 'ㄴ 판에서 풀림' }).toBe(false);
    await createRoomUi(b, {});
    expect(await K.roomNodeOf(U(b)), 'ㄴ 방이 있는 서버').toBe(N2);

    // ㄱ: 산 채로 나감(탈주) → 서버 ㄴ 로비
    await K9.leaveAlive(a.page);
    await K.lobbyOn(a, N2);

    // ㄴ이 ㄱ을 초대 → ㄱ이 수락 → 그 초대 줄에 탈주 글, 대기방으로 안 들어감
    await api(b, 'POST', '/friends/invites', { receiverId: U(a), creationKey: crypto.randomUUID() });
    const row = await K.acceptInviteUi(a.page, nick(b));
    const refusal = row.locator('[data-invite-error]');
    await expect(refusal).toHaveText(K.TEXT.desertedFirst);
    await expectReadable(refusal);
    await expect(a.page).not.toHaveURL(/\/game-matching/);
    expect(await e2e.roomOf(U(a)), 'ㄱ은 방에 안 들어감').toBeNull();
    expect(await seatsOf(b), 'ㄴ 방 명단은 ㄴ뿐').toEqual([U(b)]);
});

test('A17-H-014 서버 ㄱ 5명 판 탈주 → 5분 진짜 기다림 → 서버 ㄴ 5명 판 들어가 또 탈주 → 서버 ㄱ 로비 "게임 만들기" → 남은 시간 29분대 글 @game @hard @realtime', async ({ crowd, bots }) => {
    test.setTimeout(780_000);
    // 이 시험만 쓰는 새 계정 (오늘 탈주 0번에서 시작)
    const me = await crowd.on(N1);

    // 첫 탈주: 서버 ㄱ 판
    const [host1, ...others1] = await mn.botsOn(bots, 4, N1);
    const first = await K.startGame({ hostBot: host1, otherBots: others1, people: [me] });
    expect(await mn.gameNodeOf(U(me)), '첫 판이 도는 서버').toBe(N1);
    await N.toDay(first.t, { dayIndex: 1 });
    await K9.leaveAlive(me.page);
    const firstText = await K9.createRoomAlert(me.page);
    const firstAt = Date.now();
    expect(firstText).toMatch(K.TEXT.desertedFirst);

    // 첫 막힘 5분이 끝날 때까지 진짜로 기다림 (손잡이 없음)
    await K9.sleepUntil(firstAt + secondsLeft(firstText) * 1000 + K9.SLACK_MS);

    // 둘째 탈주: 서버 ㄴ 판 (막힘이 풀려 코드 입장이 됨)
    await K.lobbyOn(me, N2);
    const [host2, ...others2] = await mn.botsOn(bots, 4, N2);
    const second = await K.startGame({ hostBot: host2, otherBots: others2, people: [me] });
    expect(await mn.gameNodeOf(U(me)), '둘째 판이 도는 서버').toBe(N2);
    await N.toDay(second.t, { dayIndex: 1 });
    await K9.leaveAlive(me.page);

    // 서버 ㄱ 로비에서 방 만들기 → 같은 날 두 번째라 30분 막힘 (방금 나가 29분대)
    await K.lobbyOn(me, N1);
    const text = await K9.createRoomAlert(me.page);
    expect(text).toMatch(K.TEXT.desertedSecond);
    await expectReadable(K.entryNotice(me.page).getByText(K.TEXT.desertedSecond));
    await expect(me.page).toHaveURL(/\/game-setup/);
    expect(await e2e.roomOf(U(me)), '방 안 생김').toBeNull();
});

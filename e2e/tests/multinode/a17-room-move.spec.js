'use strict';

// 서버 2대 방 입장 브라우저 시험 — 다른 서버 로비에 있던 사람이 코드·공개 목록으로 들어가면 방이 있는 서버로 옮겨 붙음, 두 서버 방이 한 목록에 보임
// 목록 A17-서버-여러대.md 번호 A17-E-001~003 (E2E_NODES=2에서만 돎), 모임만: E2E_NODES=2 npx playwright test --list --no-deps tests/multinode/a17-room-move.spec.js
const K = require('./_a17-kit');
const { ui } = require('../../helpers/fixtures');
const { expectReadable } = require('../../helpers/visible');
const { openRoomList, findRoomRow } = require('../room/roomHelpers');
const K8 = require('../result/_a08-hard-kit');

const { test, expect, e2e, mn, N1, N2, U } = K;

test('A17-E-001 서버 ㄱ 방(봇 5)에 서버 ㄴ 로비 사람이 코드로 입장 → 대기방 6명, 나는 준비 안 됨 @smoke', async ({ crowd, bots }) => {
    const list = await mn.botsOn(bots, 5, N1);
    const room = await list[0].createRoom({ maxPlayers: 6 });
    for (const bot of list.slice(1)) await bot.joinByCode(room.roomCode);

    const me = await crowd.on(N2);
    await ui.joinRoomByCodeUi(me.page, room.roomCode);
    await K8.expectParty(me.page, 6);
    // 준비를 안 눌렀으니 내 단추는 "준비완료" 그대로 (누르면 "준비취소"로 바뀜)
    await expectReadable(me.page.getByRole('button', { name: '준비완료' }), { contrast: false });
    await expect(me.page.getByRole('button', { name: '준비취소' })).toHaveCount(0);

    const live = await e2e.roomOf(U(me));
    expect(live.players.map((p) => p.uuid), '서버 방 명단 (들어온 순서)').toEqual([...list.map(U), U(me)]);
    expect(live.players.find((p) => p.uuid === U(me)).isReady, '나는 준비 안 됨').toBe(false);
    // 방은 그대로 서버 ㄱ에 있고, 나는 그 서버로 옮겨 붙음
    expect(await K.roomNodeOf(U(me)), '방이 있는 서버').toBe(N1);
    await expect.poll(() => K.hintOf(me.page), { message: '옮겨 붙은 서버 힌트' }).toBe(N1);
});

test('A17-E-002 서버 ㄱ 공개 방(봇 4)을 서버 ㄴ 사람이 목록에서 골라 입장 → 대기방 5명', async ({ crowd, bots }) => {
    const list = await mn.botsOn(bots, 4, N1);
    const [host] = list;
    const room = await host.createRoom({ accessType: 'open', maxPlayers: 5 });
    for (const bot of list.slice(1)) await bot.joinByCode(room.roomCode);

    const me = await crowd.on(N2);
    await openRoomList(me.page);
    const title = `${host.nickname}의 방`;
    const row = await findRoomRow(me.page, title, { timeoutMs: 20_000 });
    expect(row, `서버 ㄴ 목록에 "${title}" 줄`).not.toBeNull();
    await row.click();
    await me.page.getByRole('button', { name: '선택한 방 입장' }).click();

    await expect(me.page).toHaveURL(/\/game-matching/, { timeout: 20_000 });
    await K8.expectParty(me.page, 5);
    expect((await e2e.roomOf(U(me)))?.hostUuid, '들어간 방 방장').toBe(U(host));
    expect(await K.roomNodeOf(U(me)), '방이 있는 서버').toBe(N1);
});

test('A17-E-003 서버 ㄱ 공개 방 1·서버 ㄴ 공개 방 1 → 서버 ㄱ 사람 목록에 둘 다 보임', async ({ crowd, bots }) => {
    const [near] = await mn.botsOn(bots, 1, N1);
    const [far] = await mn.botsOn(bots, 1, N2);
    await near.createRoom({ accessType: 'open', maxPlayers: 6 });
    await far.createRoom({ accessType: 'open', maxPlayers: 6 });
    expect(await K.roomNodeOf(U(near)), '첫 방이 있는 서버').toBe(N1);
    expect(await K.roomNodeOf(U(far)), '둘째 방이 있는 서버').toBe(N2);

    const me = await crowd.on(N1);
    await openRoomList(me.page);
    for (const host of [near, far]) {
        const title = `${host.nickname}의 방`;
        const row = await findRoomRow(me.page, title, { timeoutMs: 20_000 });
        expect(row, `목록에 "${title}" 줄`).not.toBeNull();
        await expectReadable(row.getByText(title, { exact: true }));
    }
});

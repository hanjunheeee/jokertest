'use strict';

// 서버 2대 동시에 누르기 브라우저 시험 (어려움) — 마지막 한 자리를 두 서버 사람이 같이 눌러도 한 명만, 옮기는 중 두 번 눌러도 한 번만, 판 끝 직후 여럿이 겹쳐 들어와도 원래 방장 자리는 남음
// 목록 A17-서버-여러대.md 번호 A17-H-029~031 (E2E_NODES=2에서만 돎), 모임만: E2E_NODES=2 npx playwright test --list --no-deps tests/multinode/a17-race.spec.js
const K = require('./_a17-kit');
const { expectReadable } = require('../../helpers/visible');
const K8 = require('../result/_a08-hard-kit');

const { test, expect, e2e, mn, N1, N2, U } = K;

/**
 * 코드가 적힌 화면에서 "참여하기" 누르고 끝 모습까지: 대기방에 들어갔거나(joined) 거절 알림이 떴거나(text)
 * PC 거절 글은 브라우저 알림 창이라 뜨는 대로 받아 닫음
 */
async function pressJoin(page) {
    let refused = null;
    const onDialog = (dialog) => { refused = dialog.message(); dialog.accept().catch(() => {}); };
    page.on('dialog', onDialog);
    try {
        await page.getByRole('button', { name: '참여하기' }).click();
        await expect.poll(() => (/\/game-matching/.test(page.url()) ? 'joined' : refused), { timeout: 20_000, message: '입장 끝 모습' }).not.toBeNull();
    } finally {
        page.off('dialog', onDialog);
    }
    return /\/game-matching/.test(page.url()) ? { joined: true, text: null } : { joined: false, text: refused };
}

test('A17-H-029 서버 ㄱ 정원 5 방에 4명 → 서버 ㄱ 사람·서버 ㄴ 사람이 같은 순간 코드 입장 → 한 명만 대기방, 한 명은 "방 정원이 가득 찼습니다." @hard @smoke', async ({ crowd, bots }) => {
    const list = await mn.botsOn(bots, 4, N1);
    const room = await list[0].createRoom({ maxPlayers: 5 });
    for (const bot of list.slice(1)) await bot.joinByCode(room.roomCode);
    const a = await crowd.on(N1);
    const b = await crowd.on(N2);
    // 둘 다 코드를 적어 두고 같은 순간에 누름
    for (const p of [a, b]) await K8.typeRoomCode(p.page, room.roomCode);
    const [ra, rb] = await Promise.all([pressJoin(a.page), pressJoin(b.page)]);

    expect([ra.joined, rb.joined].filter(Boolean), '들어간 사람은 한 명').toHaveLength(1);
    const [winner, loser, lost] = ra.joined ? [a, b, rb] : [b, a, ra];
    expect(lost.text).toBe(K.TEXT.full);
    // 못 들어간 사람: 까닭 글이 화면 띠에 남아 읽힘, 방 자리 없음
    await expectReadable(K.entryNotice(loser.page).getByText(K.TEXT.full, { exact: true }));
    expect(await e2e.roomOf(U(loser)), '못 들어간 사람 방 자리').toBeNull();
    // 들어간 사람: 5명 대기방
    await K8.expectParty(winner.page, 5);
    const live = await e2e.roomOf(U(winner));
    expect(live.players.map((p) => p.uuid), '서버 방 명단').toEqual([...list.map(U), U(winner)]);
});

test('A17-H-030 서버 ㄴ 사람이 서버 ㄱ 방 코드 입장을 빠르게 두 번 누름 → 명단에 내 이름 한 번, 오류 글 없음 @hard', async ({ crowd, bots }) => {
    const [host] = await mn.botsOn(bots, 1, N1);
    const room = await host.createRoom();
    const me = await crowd.on(N2);
    const said = K.collectDialogs(me.page);
    await K8.typeRoomCode(me.page, room.roomCode);
    const join = me.page.getByRole('button', { name: '참여하기' });
    await join.click();
    // 서버를 옮겨 붙는 사이 한 번 더 (이미 대기방으로 넘어갔으면 단추가 없어 그냥 지나감)
    await join.click({ timeout: 1000 }).catch(() => {});

    await expect(me.page).toHaveURL(/\/game-matching/, { timeout: 20_000 });
    await K8.expectParty(me.page, 2);
    const live = await e2e.roomOf(U(me));
    expect(live.players.map((p) => p.uuid), '서버 방 명단 (내 이름 한 번)').toEqual([U(host), U(me)]);
    expect(said, '뜬 알림 글').toEqual([]);
    await expect(K.entryNotice(me.page)).toHaveCount(0);
    expect(await K.roomNodeOf(U(me)), '방이 있는 서버').toBe(N1);
});

test('A17-H-031 정원 7 · 7명 판(사람 3 + 봇 4) 끝 직후 5명 "대기방으로" + 서버 ㄴ 새 사람 코드 입장이 겹침 → 6명까지 차고 방장 자리는 남음 → 원래 방장 들어가 방장 @game @hard', async ({ crowd, bots }) => {
    test.setTimeout(420_000);
    const a = await crowd.on(N1);
    const b = await crowd.on(N1);
    const c = await crowd.on(N2);
    const botList = await mn.botsOn(bots, 4, N1);
    const { t, joker } = await K.startHosted({ host: a, guests: [b, c], botList, settings: { maxPlayers: 7 } });
    await K.endByJoker(t, joker);
    await K8.allAtResult([a, b, c]);

    // 판 밖 새 사람 ㄹ은 서버 ㄴ 로비에서 코드를 적어 둠
    const d = await crowd.on(N2);
    await K8.typeRoomCode(d.page, t.roomCode);
    const stayed = botList.filter((bot) => bot !== joker);

    // 원래 방장 ㄱ은 결과 화면에 둔 채: ㄴ·ㄷ·봇 3 "대기방으로" + ㄹ 코드 입장을 같은 순간에
    const [, , , , , joined] = await Promise.all([
        K8.pressReturn(b.page),
        K8.pressReturn(c.page),
        ...stayed.map((bot) => K8.botReturn(bot, t.gameId)),
        pressJoin(d.page),
    ]);
    expect(joined.joined, `ㄹ 입장 (거절 글: ${joined.text})`).toBe(true);

    // 여섯 자리가 차고 일곱째(원래 방장 자리)는 남음, 아직 방장 없음
    for (const p of [b, c, d]) await K8.expectParty(p.page, 6);
    await expectReadable(K8.hostSeat(b.page).getByText('방장 자리', { exact: true }), { uncovered: false });
    const before = await e2e.roomOf(U(b));
    expect([...before.players.map((p) => p.uuid)].sort(), '서버 방 명단 6명').toEqual([b, c, d, ...stayed].map(U).sort());
    expect(before.hostUuid, '서버 방장 칸 비어 있음').toBeNull();
    expect(before.roomCode, '같은 방 코드').toBe(t.roomCode);

    // 원래 방장 ㄱ이 들어오면 일곱 명·방장 ㄱ
    await K8.pressReturn(a.page);
    await expectReadable(K8.startButton(a.page), { contrast: false });
    for (const p of [a, b, c, d]) await K8.expectParty(p.page, 7);
    for (const p of [b, c, d]) await expect(K8.hostSeat(p.page)).toHaveCount(0);
    const after = await e2e.roomOf(U(a));
    expect(after.hostUuid, '서버 방장 = ㄱ').toBe(U(a));
    expect(after.players, '서버 방 7명').toHaveLength(7);
});

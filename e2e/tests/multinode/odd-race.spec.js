// Node 여러 개 — 서로 다른 서버 사람끼리 같은 순간 (이상한 순서·동시): 마지막 자리 두 서버 동시 입장, 같은 세션 창 둘을 두 서버에 동시에
// E2E_NODES=2에서만 돎, 입장 봇은 옮긴 뒤 다시 보내기(부모 Bot)를 기다리게 이 파일 도우미로 들어감 (E2eBot.joinByCode는 첫 ROOM_ON_OTHER_NODE에 바로 실패)
const mn = require('./_mn');
const { openPerson, ui } = require('../../helpers/fixtures');
const { sleep } = require('../../helpers/wait');

const { test, expect, e2e, NODE_IDS } = mn;
const [N1, N2] = NODE_IDS;

// 코드 입장 → { ok:true } 또는 { ok:false, code } (ROOM_ON_OTHER_NODE는 부모 Bot이 옮긴 뒤 한 번 다시 보내므로 끝 답이 아님)
async function joinFollow(bot, roomCode) {
    const since = Date.now();
    const joined = bot.waitForEvent('room_joined', { since, timeoutMs: 25000 })
        .then(() => ({ ok: true }), () => ({ ok: false, code: 'TIMEOUT' }));
    const failed = bot.waitForEvent('room_join_failed', { since, timeoutMs: 25000, match: (p) => p?.code !== 'ROOM_ON_OTHER_NODE' })
        .then((p) => ({ ok: false, code: p?.code ?? null }), () => ({ ok: false, code: 'TIMEOUT' }));
    bot.emit('join_room_by_code', { roomCode });
    return Promise.race([joined, failed]);
}

// [겹침: 마지막 자리 + 두 서버 + 옮긴 뒤 다시 보냄]
test('n1 방 마지막 한 자리에 n2 로비 둘이 같은 순간 코드 입장 → 둘 다 n1로 옮긴 뒤 하나만 들어가고 다른 하나는 꽉 참', async ({ bots }) => {
    const [host, ...guests] = await mn.botsOn(bots, 4, N1);
    const room = await host.createRoom({ maxPlayers: 5 });
    for (const g of guests) expect((await joinFollow(g, room.roomCode)).ok, `봇${g.index} 입장`).toBe(true);
    expect((await e2e.roomOf(host.uuid))?.players?.length).toBe(4);

    const contenders = await mn.botsOn(bots, 2, N2);
    const results = await Promise.all(contenders.map((b) => joinFollow(b, room.roomCode)));
    expect(results.filter((r) => r.ok).length, JSON.stringify(results)).toBe(1);
    const loserIndex = results.findIndex((r) => !r.ok);
    expect(results[loserIndex].code).toBe('ROOM_FULL');
    // 명단 5명, 진 쪽은 어느 방에도 없음 (반쯤 들어간 유령 없음)
    const live = await e2e.roomOf(host.uuid);
    expect(live?.players?.length).toBe(5);
    expect(await e2e.roomOf(contenders[loserIndex].uuid)).toBeFalsy();
    expect((await e2e.roomOf(contenders[1 - loserIndex].uuid))?.roomId).toBe(room.roomId);
});

// [겹침: 같은 세션 창 둘 + 두 서버 + 같은 순간 접속]
test('같은 계정 같은 세션 창 둘을 n1·n2로 같은 순간 열면 → 한 창만 "다른 창에서 접속" 안내를 받고 로그인 화면으로 안 감 (번갈아 끊김 없음)', async ({ browser }) => {
    const opened = [];
    try {
        const a = await openPerson(browser, { mobile: false, lobby: false, onContext: (c) => opened.push(c) });
        const b = await openPerson(browser, { mobile: false, account: a.account, login: false, lobby: false, onContext: (c) => opened.push(c) });
        // 같은 세션 = 같은 쿠키 (다른 브라우저 창 흉내)
        await b.context.addCookies(await a.context.cookies());
        await mn.pinContext(a.context, a.account.uuid, N1);
        await mn.pinContext(b.context, a.account.uuid, N2);
        const dialogs = { a: [], b: [] };
        for (const [name, page] of [['a', a.page], ['b', b.page]]) {
            page.on('dialog', (d) => { dialogs[name].push(d.message()); d.accept().catch(() => {}); });
        }

        await Promise.all([ui.gotoLobby(a.page), ui.gotoLobby(b.page)]);
        await expect.poll(() => dialogs.a.length + dialogs.b.length, { timeout: 15000 }).toBeGreaterThan(0);
        // 없음 확인 창: 남은 창이 뒤늦게 밀리거나 밀린 창이 다시 붙어 번갈아 끊기면 여기서 안내가 하나 더 옴
        await sleep(3000);
        expect(dialogs.a.length + dialogs.b.length, JSON.stringify(dialogs)).toBe(1);
        const kicked = dialogs.a.length ? a : b;
        expect([...dialogs.a, ...dialogs.b][0]).toMatch(/같은 브라우저의 다른 창/);
        // 같은 세션 밀림은 로그아웃하지 않음 (로그인 화면으로 가면 쿠키로 다시 붙어 번갈아 끊김)
        expect(kicked.page.url()).not.toMatch(/\/login/);
    } finally {
        await Promise.all(opened.map((c) => c.close().catch(() => {})));
    }
});

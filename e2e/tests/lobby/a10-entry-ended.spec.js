'use strict';

// 로비 입장 정리 브라우저 시험 (PC, 끝난 판) — 결과 화면에 머문 채 로비·방 목록 주소로 가면 끝난 판에서 빠져 방 만들기·다른 방 입장·같은 방 코드로 다시 들어오기 됨
// 목록 A10-로비-입장-방어.md 번호 A10-E-033·034·036·051 (판은 봇 방장, 봇 표로 광대 처형 → 시민 승 — 쓰는 동안 안 돌림)
const { test, expect, ui, e2e } = require('../../helpers/fixtures');
const { openSetup } = require('../room/roomHelpers');
const K = require('../ingame/_a09-simple-kit');
const H = require('../result/_a08-hard-kit');

const ALREADY_IN_ROOM = '이미 참여 중인 방이 있습니다.';
const U = (x) => x.account?.uuid ?? x.uuid;

/** 방 만들기 → 대기방까지, 방장 = 나 ("이미 참여 중인 방" 거절 글이 안 떠야 함) */
async function makeRoom(person) {
    const page = person.page;
    const said = [];
    const onDialog = (d) => { said.push(d.message()); d.accept().catch(() => {}); };
    page.on('dialog', onDialog);
    try {
        await openSetup(page);
        await page.getByRole('button', { name: '게임 만들기' }).click();
        await expect(page).toHaveURL(/\/game-matching/, { timeout: 15_000 });
    } finally {
        page.off('dialog', onDialog);
    }
    expect(said, '방 만들기 때 뜬 알림').not.toContain(ALREADY_IN_ROOM);
    await expect.poll(async () => (await e2e.roomOf(U(person)))?.hostUuid, { message: '새 방 방장 = 나' }).toBe(U(person));
}

// 결과 화면에서 로비 주소 → 방 만들기 (인원 5·8)
const ENDED_SIZES = [
    { no: '033', n: 5, smoke: true },
    { no: '034', n: 8 },
];

for (const { no, n, smoke } of ENDED_SIZES) {
    test(`A10-E-${no} PC ${n}명 판 끝 → 결과 화면에서 주소 /lobby → 방 만들기 → 대기방 @game${smoke ? ' @smoke' : ''}`, async ({ user, table }) => {
        test.setTimeout(240_000);
        const page = user.page;
        const t = await K.seat(table, user, { n });
        await K.toCitizenWin(t, page);
        await ui.gotoLobby(page);
        await expect(page).toHaveURL(/\/lobby/);
        await makeRoom(user);
    });
}

test('A10-E-036 PC 7명 판 끝, 봇 "대기방으로" → 사람 /lobby → 같은 방 코드 입력 → 그 대기방 @game', async ({ user, table }) => {
    test.setTimeout(240_000);
    const page = user.page;
    const t = await K.seat(table, user, { n: 7 });
    const { joker } = await K.toCitizenWin(t, page);
    const back = t.bots.find((b) => b !== joker);
    const room = await H.botReturn(back, t.gameId);
    await ui.gotoLobby(page);
    await ui.joinRoomByCodeUi(page, room.roomCode);
    await expect.poll(async () => (await e2e.roomOf(U(user)))?.roomId, { message: '들어간 방' }).toBe(room.roomId);
    expect(await H.seatsOf(back.uuid)).toContain(U(user));
});

test('A10-E-051 PC 6명 판 끝 → 결과 화면에서 주소 /multiplay → 다른 공개 방 입장 → 대기방 @game', async ({ user, table, bots }) => {
    test.setTimeout(240_000);
    const page = user.page;
    const [host] = await bots.spawn(1);
    await host.createRoom({ accessType: 'open' });
    const t = await K.seat(table, user, { n: 6 });
    await K.toCitizenWin(t, page);
    await K.pickPublicRoom(page, `${host.nickname}의 방`);
    await K.enterPicked(page).click();
    await expect(page).toHaveURL(/\/game-matching/, { timeout: 15_000 });
    await expect.poll(async () => (await e2e.roomOf(U(user)))?.hostUuid, { message: '들어간 방 방장' }).toBe(host.uuid);
});

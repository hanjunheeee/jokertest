'use strict';

// 처리 중 입장과 로비 입장이 겹칠 때 시험 (PC) — 코드 입장·방 만들기·"대기방으로"를 누르자마자 로비 주소로 가면 그 입장이 되돌려져 자리가 안 남음
// 목록 A10-로비-입장-방어.md 번호 A10-E-054·055·056 (쓰는 동안 안 돌림)
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

/** 로비 주소로 바로 감 (누른 요청 답을 안 기다림), 인트로까지 넘김 */
async function rushToLobby(page) {
    await page.goto('/lobby');
    await ui.skipIntro(page);
}

test('A10-E-054 PC 봇 방장 5명 방 코드 입력 → "참여하기" 누르자마자 /lobby → 그 방 명단에 나 없음 @smoke', async ({ user, bots }) => {
    const page = user.page;
    const [host, ...rest] = await bots.spawn(4);
    const room = await host.createRoom({ maxPlayers: 5 });
    for (const bot of rest) await bot.joinByCode(room.roomCode);
    await H.typeRoomCode(page, room.roomCode);
    await page.getByRole('button', { name: '참여하기' }).click();
    await rushToLobby(page);
    // 정리 뒤 (기본 10초 — 끊김 15초 유예로 늦게 빠지는 것과 갈라 봄)
    await expect.poll(async () => (await H.seatsOf(host.uuid)).includes(U(user)), { message: '그 방 명단에 나' }).toBe(false);
    expect(await H.seatsOf(host.uuid)).toHaveLength(4);
    expect(await e2e.roomOf(U(user))).toBeNull();
});

test('A10-E-055 PC "게임 만들기" 누르자마자 /lobby → 내 방 없음, 공개 목록에 내 방 없음', async ({ user, bots }) => {
    const page = user.page;
    const [watcher] = await bots.spawn(1);
    const title = `${user.account.nickname}의 방`;
    await openSetup(page);
    await page.getByRole('button', { name: '게임 만들기' }).click();
    await rushToLobby(page);
    await expect.poll(() => e2e.roomOf(U(user)), { message: '내 대기방 자리' }).toBeNull();
    await expect.poll(async () => ((await watcher.request('get_public_rooms', {}))?.rooms ?? []).some((r) => r.title === title), {
        message: '공개 목록에 내 방',
    }).toBe(false);
});

test('A10-E-056 PC 6명 판 끝 → "대기방으로" 누르자마자 /lobby → 다시 연 방 명단에 나 없음, 방 만들기 됨 @game', async ({ user, table }) => {
    test.setTimeout(240_000);
    const page = user.page;
    const t = await K.seat(table, user, { n: 6 });
    const { joker } = await K.toCitizenWin(t, page);
    // 봇 하나가 먼저 돌아가 다시 연 방을 봄
    const back = t.bots.find((b) => b !== joker);
    await H.botReturn(back, t.gameId);
    await H.returnButton(page).click();
    await rushToLobby(page);
    await expect.poll(async () => (await H.seatsOf(back.uuid)).includes(U(user)), { message: '다시 연 방 명단에 나' }).toBe(false);
    await makeRoom(user);
});

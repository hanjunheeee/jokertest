'use strict';

// 같은 계정 중복 접속 어려움 시험 (PC, 받은 버그 4) — 방장이 새 탭·다른 브라우저로 로비에 오면 남은 사람 화면에 방장이 넘어가고 그대로 판 시작 됨, 공개 방은 남의 방 목록에서 사라짐
// 목록 A10-로비-입장-방어.md 번호 A10-H-001~003 (사람 2~3 + 봇, 쓰는 동안 안 돌림)
const { test, expect, ui, e2e } = require('../../helpers/fixtures');
const { expectReadable } = require('../../helpers/visible');
const { createRoomUi, openSetup, openRoomList, findRoomRow } = require('../room/roomHelpers');
const H = require('../result/_a08-hard-kit');

const SAME_BROWSER = '같은 브라우저의 다른 창에서 접속해 현재 창의 연결이 종료되었습니다.';
const OTHER_LOGIN = '다른 기기 또는 브라우저에서 로그인되어 현재 접속이 종료되었습니다.';
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

/** 같은 브라우저 새 탭으로 로비 → { tab, message } (message = 옛 탭에 뜬 알림 글) */
async function twinToLobby(person) {
    let tab = null;
    const message = await ui.captureAlert(person.page, async () => {
        tab = await person.context.newPage();
        await ui.gotoLobby(tab);
    }, { timeoutMs: 15_000 });
    return { tab, message };
}

/** 대기방 화면에 방장 단추(게임시작·방 설정 변경)가 사람 눈에 보임 (단추 글은 그림 위에 겹친 글) */
async function expectHostButtons(page) {
    const start = H.startButton(page);
    await expect(start).toBeVisible({ timeout: 15_000 });
    await expectReadable(start.getByText('게임시작', { exact: true }));
    const settings = page.getByRole('button', { name: '방 설정 변경' });
    await expectReadable(settings.getByText('방 설정 변경', { exact: true }));
}

test('A10-H-001 [버그 4] 사람 2 + 봇 3 = 5명 방, 방장 A 새 탭 /lobby → B 화면에 방장 단추, A 새 탭 방 만들기 됨 @hard @smoke', async ({ user, players, bots }) => {
    test.setTimeout(180_000);
    const a = user;
    const b = await players.add();
    const room = await createRoomUi(a, {});
    // B가 먼저 들어오고 봇 셋이 뒤에
    await ui.joinRoomByCodeUi(b.page, room.roomCode);
    for (const bot of await bots.spawn(3)) await bot.joinByCode(room.roomCode);
    await H.expectParty(b.page, 5);
    await expect(H.startButton(b.page), 'B는 아직 손님').toHaveCount(0);

    const { tab, message } = await twinToLobby(a);
    expect(message).toBe(SAME_BROWSER);
    await expect.poll(async () => (await e2e.roomOf(U(b)))?.hostUuid, { message: '새 방장' }).toBe(U(b));
    await H.expectParty(b.page, 4);
    await expectHostButtons(b.page);
    await makeRoom({ page: tab, account: a.account });
});

test('A10-H-002 [버그 4] 사람 3 + 봇 2, 방장 A 다른 브라우저 로그인 → A 옛 화면 /login, B 방장 → 새 봇 들어와 5명 → 전원 준비 → 시작 → 판 열림 @hard @game', async ({ user, players, bots }) => {
    test.setTimeout(300_000);
    const a = user;
    const b = await players.add();
    const c = await players.add();
    const room = await createRoomUi(a, {});
    await ui.joinRoomByCodeUi(b.page, room.roomCode);
    await ui.joinRoomByCodeUi(c.page, room.roomCode);
    const firstBots = await bots.spawn(2);
    for (const bot of firstBots) await bot.joinByCode(room.roomCode);
    await H.expectParty(b.page, 5);

    const message = await ui.captureAlert(a.page, async () => {
        // 같은 계정으로 다른 브라우저(따로 쿠키) 로그인 → 로비
        await players.add({ account: a.account });
    }, { timeoutMs: 15_000 });
    expect(message).toBe(OTHER_LOGIN);
    await expect(a.page).toHaveURL(/\/login/, { timeout: 15_000 });
    await expect.poll(async () => (await e2e.roomOf(U(b)))?.hostUuid, { message: '새 방장' }).toBe(U(b));
    await H.expectParty(b.page, 4);

    // 새 봇 하나 → 5명, B가 화면으로 시작 (직업 고정: 사람 시민, 새 봇 광대)
    const [late] = await bots.spawn(1);
    await late.joinByCode(room.roomCode);
    await H.expectParty(b.page, 5);
    const botList = [...firstBots, late];
    const t = await H.startByHuman(b, [c], botList, H.rolesFor([b, c], [late]));
    const s = await t.state();
    expect(s.players, '판 인원').toHaveLength(5);
    expect(s.players.map((p) => p.uuid), 'A는 판에 없음').not.toContain(U(a));
});

test('A10-H-003 [버그 4] 사람 2, A 공개 방 혼자 → B 방 목록에 "A의 방" → A 새 탭 /lobby → B 목록에서 사라짐 @hard', async ({ user, players }) => {
    test.setTimeout(180_000);
    const a = user;
    const b = await players.add();
    await createRoomUi(a, { code: false });
    const title = `${a.account.nickname}의 방`;
    await openRoomList(b.page);
    expect(await findRoomRow(b.page, title, { timeoutMs: 15_000 }), 'B 목록에 A의 방').not.toBeNull();

    await twinToLobby(a);
    await expect.poll(() => e2e.roomOf(U(a)), { message: 'A 방 자리' }).toBeNull();
    // B는 화면을 안 바꿈 — 목록이 알아서 다시 그려져야 함
    await expect.poll(async () => (await findRoomRow(b.page, title, { timeoutMs: 1000 })) === null, {
        message: 'B 목록에서 A의 방', timeout: 15_000,
    }).toBe(true);
    await expect(b.page).toHaveURL(/\/multiplay/);
});

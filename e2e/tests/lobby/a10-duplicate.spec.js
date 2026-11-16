'use strict';

// 같은 계정 중복 접속 시험 (PC, 받은 버그 4) — 방을 만든 채 같은 브라우저 새 탭·다른 브라우저로 로비·방 목록에 오면 옛 방이 없어지고 새 쪽에서 방 만들기 됨, 대기방 주소로 오면 방 그대로, 밀린 옛 탭은 추방 단추가 꺼진 까닭 글을 보임
// 목록 A10-로비-입장-방어.md 번호 A10-E-040·041·043·044·046·047 (판 없음, 쓰는 동안 안 돌림)
const { test, expect, ui, e2e } = require('../../helpers/fixtures');
const { expectReadable } = require('../../helpers/visible');
const { createRoomUi, openSetup } = require('../room/roomHelpers');
const H = require('../result/_a08-hard-kit');

// 화면 문구 (서버 connection/replace.js·화면 useSocket.js, roomMessages.js)
const SAME_BROWSER = '같은 브라우저의 다른 창에서 접속해 현재 창의 연결이 종료되었습니다.';
const OTHER_LOGIN = '다른 기기 또는 브라우저에서 로그인되어 현재 접속이 종료되었습니다.';
const KICK_OFFLINE = '서버와 연결되어 있지 않아 추방할 수 없습니다.';
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
    await expect(page.getByText(ALREADY_IN_ROOM)).toHaveCount(0);
    await expect.poll(async () => (await e2e.roomOf(U(person)))?.hostUuid, { message: '새 방 방장 = 나' }).toBe(U(person));
}

/**
 * 같은 브라우저(같은 쿠키) 새 탭으로 그 주소 열기 → { tab, message } (message = 옛 탭에 뜬 알림 글)
 * 로비면 인트로까지 넘김, alert:false면 옛 탭 알림을 안 기다림
 */
async function openTwinTab(person, path, { alert = true } = {}) {
    let tab = null;
    const open = async () => {
        tab = await person.context.newPage();
        if (path === '/lobby') await ui.gotoLobby(tab);
        else await tab.goto(path);
    };
    // 옛 탭 알림을 안 보는 케이스는 그냥 엶 (PC 알림 창은 Playwright가 알아서 닫음)
    if (!alert) {
        await open();
        return { tab, message: null };
    }
    const message = await ui.captureAlert(person.page, open, { timeoutMs: 15_000 });
    return { tab, message };
}

/** 서버에 내 방 자리가 없어질 때까지 (기본 10초) */
async function expectNoRoom(person) {
    await expect.poll(() => e2e.roomOf(U(person)), { message: '내 대기방 자리' }).toBeNull();
}

test('A10-E-040 [버그 4] PC 방 만든 채 같은 브라우저 새 탭 /lobby → 옛 탭 알림, 방 없음, 새 탭 방 만들기 됨 @smoke', async ({ user }) => {
    await createRoomUi(user, {});
    const { tab, message } = await openTwinTab(user, '/lobby');
    expect(message).toBe(SAME_BROWSER);
    await expectNoRoom(user);
    await makeRoom({ page: tab, account: user.account });
});

test('A10-E-041 [버그 4] PC 공개 방 만든 채 새 탭 /lobby → 봇이 받은 공개 목록에 그 방 없음', async ({ user, bots }) => {
    const [watcher] = await bots.spawn(1);
    const room = await createRoomUi(user, { code: false });
    // 처음엔 목록에 있음
    await expect.poll(async () => ((await watcher.request('get_public_rooms', {}))?.rooms ?? []).some((r) => r.id === room.roomId), {
        message: '처음 공개 목록',
    }).toBe(true);
    const since = Date.now();
    await openTwinTab(user, '/lobby', { alert: false });
    await expectNoRoom(user);
    await expect.poll(async () => ((await watcher.request('get_public_rooms', {}))?.rooms ?? []).some((r) => r.id === room.roomId), {
        message: '정리 뒤 공개 목록',
    }).toBe(false);
    // 방송으로 받은 마지막 목록에도 없음
    await expect.poll(() => {
        const last = [...watcher.events].reverse().find((r) => r.event === 'public_rooms_updated' && r.at >= since);
        return last ? last.payload.rooms.some((r) => r.id === room.roomId) : null;
    }, { message: '방송 받은 공개 목록' }).toBe(false);
});

test('A10-E-043 [버그 4] PC 방장이 다른 브라우저에서 새 로그인 → 옛 브라우저 알림 + /login, 방 없음, 새 브라우저 방 만들기 됨', async ({ user, players }) => {
    await createRoomUi(user, {});
    let other = null;
    const message = await ui.captureAlert(user.page, async () => {
        // 같은 계정으로 다른 브라우저(따로 쿠키) 로그인 → 로비
        other = await players.add({ account: user.account });
    }, { timeoutMs: 15_000 });
    expect(message).toBe(OTHER_LOGIN);
    await expect(user.page).toHaveURL(/\/login/, { timeout: 15_000 });
    await expectNoRoom(user);
    await makeRoom(other);
});

test('A10-E-044 [버그 4] PC 방 만든 채 새 탭이 방 목록 주소로 바로 → 방 없음', async ({ user }) => {
    await createRoomUi(user, {});
    const { tab } = await openTwinTab(user, '/multiplay', { alert: false });
    await expect(tab.getByRole('region', { name: '공개 방 목록' })).toBeVisible();
    await expectNoRoom(user);
    await expect(tab).toHaveURL(/\/multiplay/);
});

test('A10-E-046 PC 방 만든 채 새 탭이 대기방 주소로 바로 → 대기방 화면에 내 방 코드, 방 그대로', async ({ user }) => {
    const room = await createRoomUi(user, {});
    const { tab } = await openTwinTab(user, '/game-matching', { alert: false });
    await expect(tab).toHaveURL(/\/game-matching/);
    await H.expectRoomCodeShown(tab, room.roomCode);
    const now = await e2e.roomOf(U(user));
    expect(now?.roomId, '같은 방').toBe(room.roomId);
    expect(now?.hostUuid, '방장 그대로').toBe(U(user));
});

test('A10-E-047 PC 밀린 옛 탭 대기방: "참가자 추방" 꺼짐 + 까닭 글이 읽힘', async ({ user }) => {
    await createRoomUi(user, {});
    const old = user.page;
    const kick = old.getByRole('button', { name: '참가자 추방' });
    await expect(kick, '밀리기 전엔 켜짐').toBeEnabled({ timeout: 15_000 });
    const { message } = await openTwinTab(user, '/game-matching');
    expect(message).toBe(SAME_BROWSER);
    await expect(kick).toBeDisabled();
    const reason = old.getByTestId('kick-locked-reason');
    await expect(reason).toHaveText(KICK_OFFLINE);
    await expect(kick).toHaveAttribute('aria-describedby', await reason.getAttribute('id'));
    await expectReadable(reason);
});

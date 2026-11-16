'use strict';

// 친구 접속 표시 브라우저 시험 (PC) — 친구 봇이 들어오고 나가면 새로고침 없이 "접속 중"·"오프라인", 두 글이 읽힘, 일반 폴더 접속 수, 새 탭으로 옮겨도 친구에게 "오프라인" 안 감
// 목록 A13-친구-알림-초대.md 번호 A13-E-021~025 (판 없음, 쓰는 동안 안 돌림 — npx playwright test --list tests/social/a13-presence.spec.js)
const { test, expect } = require('../../helpers/fixtures');
const { expectReadable } = require('../../helpers/visible');
const ui = require('../../helpers/ui');
const friends = require('../../helpers/friends');
const K = require('./_a13-kit');

const { U, TEXT } = K;

/** 봇 n개를 친구로 맺고 소켓을 끊어 둠 (오프라인에서 시작) → 봇 목록 */
async function offlineFriends(bots, user, n) {
    const list = await bots.spawn(n);
    for (const bot of list) await K.befriendBot(user, bot);
    for (const bot of list) bot.socket.disconnect();
    return list;
}

/** 봇 소켓 다시 붙이기 (같은 쿠키) */
async function reconnect(bot) {
    const back = new Promise((resolve) => bot.socket.once('connect', resolve));
    bot.socket.connect();
    await back;
}

/** 오프라인 폴더를 펼쳐 그 줄 → 줄 */
async function offlineRow(page, bot) {
    const folder = await K.openFolder(page, '오프라인');
    return folder.locator(`li[data-friend-id="${U(bot)}"]`);
}

test('A13-E-021 오프라인 친구 봇이 소켓 연결 → 새로고침 없이 그 줄 "접속 중" @smoke', async ({ user, bots }) => {
    const page = user.page;
    const [bot] = await offlineFriends(bots, user, 1);
    await K.showList(page);
    await expect(await offlineRow(page, bot)).toContainText(TEXT.offline);

    await reconnect(bot);
    const normal = K.folderOf(page, '일반');
    await expect(normal.locator(`li[data-friend-id="${U(bot)}"]`)).toContainText(TEXT.online);
});

test('A13-E-022 접속 중인 친구 봇이 소켓 끊음 → 그 줄 "오프라인"', async ({ user, bots }) => {
    const page = user.page;
    const [bot] = await bots.spawn(1);
    await K.befriendBot(user, bot);
    await K.showList(page);
    await expect(K.friendRow(page, U(bot))).toContainText(TEXT.online);

    bot.socket.disconnect();
    await expect(K.folderHead(page, '오프라인')).toHaveAccessibleName('오프라인 (1)');
    await expect(await offlineRow(page, bot)).toContainText(TEXT.offline);
});

test('A13-E-023 "접속 중"·"오프라인" 두 글 다 읽힘 (오프라인 흐린 글도 대비 4.5)', async ({ user, bots }) => {
    const page = user.page;
    const [on, off] = await bots.spawn(2);
    await K.befriendBot(user, on);
    await K.befriendBot(user, off);
    off.socket.disconnect();
    await K.showList(page);

    await expectReadable(K.friendRow(page, U(on)).getByText(TEXT.online, { exact: true }));
    const row = await offlineRow(page, off);
    await expectReadable(row.getByText(TEXT.offline, { exact: true }));
});

test('A13-E-024 봇 친구 3명 접속 0 → "일반 (0/3)", 봇 1명 접속 → "일반 (1/3)"', async ({ user, bots }) => {
    const page = user.page;
    const list = await offlineFriends(bots, user, 3);
    await K.showList(page);
    await expect(K.folderHead(page, '일반')).toHaveAccessibleName('일반 (0/3)');

    await reconnect(list[0]);
    await expect(K.folderHead(page, '일반')).toHaveAccessibleName('일반 (1/3)');
});

test('A13-E-025 사람이 같은 계정으로 새 탭을 열어도 친구 봇이 받은 friend_status_change 중 OFFLINE 0번', async ({ user, bots }) => {
    const page = user.page;
    const [bot] = await bots.spawn(1);
    await K.befriendBot(user, bot);
    const since = Date.now();

    // 새 탭이 옛 탭을 밀어냄 → 옛 탭에 알림 글이 뜰 때까지 (밀어내기가 끝남)
    await ui.captureAlert(page, async () => {
        const tab = await user.context.newPage();
        await ui.gotoLobby(tab);
    }, { timeoutMs: 15_000 });
    // 서버가 사람을 접속 중으로 보고 있음 (봇 친구 목록 기준)
    await expect.poll(async () => (await friends.botApi(bot, 'GET', '/friends')).find((f) => f.id === U(user))?.status, { message: '봇이 보는 사람 상태' }).toBe('ONLINE');

    const offline = bot.events.filter((r) => r.at >= since && r.event === 'friend_status_change' && r.payload?.uuid === U(user) && r.payload?.status === 'OFFLINE');
    expect(offline, '친구가 받은 OFFLINE').toHaveLength(0);
});

'use strict';

// 로비 입장 정리 브라우저 시험 (PC, 진행 중 판) — 산 사람이 네 화면 주소로 가면 판 화면으로 되돌아옴, 죽은 사람은 로비에 남고 판에서 풀려 방 만들기 됨, 60초 탈락한 사람은 탈주 안내
// 목록 A10-로비-입장-방어.md 번호 A10-E-016~023·026~030·032·052·053 (판은 봇 방장, 직업은 내 것만 시민으로 고정 — 쓰는 동안 안 돌림)
const { test, expect, ui, e2e } = require('../../helpers/fixtures');
const { expectReadable } = require('../../helpers/visible');
const { openSetup } = require('../room/roomHelpers');
const K = require('../ingame/_a09-simple-kit');
const N = require('../ingame/b-night/_night');
const A5 = require('../mobile/_a05a-kit');

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

/** 판 화면 내 카드의 닉네임 글이 사람 눈에 읽힘 (연출 창을 닫으면서) */
async function expectMyCard(page, nickname) {
    await expect(async () => {
        await K.clear(page);
        await expectReadable(N.cardStatus(page, nickname).getByText(nickname, { exact: true }), { timeout: 2000 });
    }).toPass({ timeout: 30_000 });
}

/** 서버 판 값에서 나는 산 채로 그 판에 참여 중 */
async function expectAliveIn(t, uuid) {
    const g = await e2e.gameOf(uuid);
    expect(g?.gameId, '내 판').toBe(t.gameId);
    const row = K.rowOf(g, uuid);
    expect(row?.alive, '산 채').toBe(true);
    expect(row?.isParticipating, '판에 남음').toBe(true);
}

/** 죽은 사람이 그 판에서 풀렸는지 (서버 판 명단에서 참여 중 아님) */
async function expectReleased(t, uuid) {
    await expect.poll(async () => K.rowOf(await e2e.game(t.gameId), uuid)?.isParticipating, { message: '판에서 풀림' }).toBe(false);
}

/** 판이 끝나지 않고 계속 (봇 쪽에서 봄) */
async function expectGameGoesOn(t) {
    const g = await e2e.gameOf(U(t.bots[0]));
    expect(g?.gameId, '봇 판').toBe(t.gameId);
    expect(g?.phase, '판 계속').not.toBe('ENDED');
}

/** 광대 봇이 첫 밤에 그 사람을 암살 → 죽을 때까지 (낮엔 아무도 안 내 재판 없이 밤으로 감) */
async function nightKill(t, uuid) {
    const joker = K.botOf(t, await t.state(), 'JOKER');
    await N.toTurn(t, 'JOKER');
    const reply = await N.botNight(t, joker, uuid);
    expect(reply?.ok, `밤 암살 답 ${JSON.stringify(reply)}`).toBe(true);
    await N.advanceUntilSettled(t, (s) => K.rowOf(s, uuid)?.alive === false);
}

/** 탭을 닫고 서버가 끊김을 알 때까지 기다린 뒤 같은 브라우저 새 탭 */
async function closeAndReopen(t, user) {
    const since = Date.now();
    await user.page.close();
    await K.droppedAt(t, U(user), since);
    return user.context.newPage();
}

// 산 사람 + 로비 주소 → 판 화면 (인원 5·6·7·8·10)
const ALIVE_SIZES = [
    { no: '016', n: 5, smoke: true },
    { no: '017', n: 6 },
    { no: '018', n: 7 },
    { no: '019', n: 8 },
    { no: '020', n: 10 },
];

for (const { no, n, smoke } of ALIVE_SIZES) {
    test(`A10-E-${no} PC ${n}명 판 산 사람 → 주소 /lobby → /ingame, 내 카드 보임, 산 채 그대로 @game${smoke ? ' @smoke' : ''}`, async ({ user, table }) => {
        test.setTimeout(180_000);
        const page = user.page;
        const t = await K.seat(table, user, { n });
        await page.goto('/lobby');
        await expect(page).toHaveURL(/\/ingame/, { timeout: 15_000 });
        await expectMyCard(page, user.account.nickname);
        await expectAliveIn(t, U(user));
    });
}

// 산 사람 + 로비가 아닌 세 화면 (결정「버그 4」: 로비가 아닌 화면도 같은 정리)
const OTHER_PAGES = [
    { no: '021', path: '/multiplay' },
    { no: '022', path: '/gameMode' },
    { no: '023', path: '/game-setup' },
];

for (const { no, path } of OTHER_PAGES) {
    test(`A10-E-${no} PC 6명 판 산 사람 → 주소 ${path} → /ingame @game`, async ({ user, table }) => {
        test.setTimeout(180_000);
        const page = user.page;
        const t = await K.seat(table, user, { n: 6 });
        await page.goto(path);
        await expect(page).toHaveURL(/\/ingame/, { timeout: 15_000 });
        await expectAliveIn(t, U(user));
    });
}

test('A10-E-026 PC 8명 판 /ingame 새로고침 → 판 화면 그대로, 산 채 @game', async ({ user, table }) => {
    test.setTimeout(180_000);
    const page = user.page;
    const t = await K.seat(table, user, { n: 8 });
    await page.reload();
    await expect(page).toHaveURL(/\/ingame/);
    await expectMyCard(page, user.account.nickname);
    await expectAliveIn(t, U(user));
});

test('A10-E-027 PC 7명 판 투표 중 /lobby → /ingame → 투표 누름 → 서버가 표 받음 @game', async ({ user, table }) => {
    test.setTimeout(180_000);
    const page = user.page;
    const t = await K.seat(table, user, { n: 7 });
    await K.toVote(t);
    await page.goto('/lobby');
    await expect(page).toHaveURL(/\/ingame/, { timeout: 15_000 });

    // 봇 셋이 X를 찍음 → 내 표까지 4 : 기권 3이면 재판, 내 표가 안 들어가면 3 : 4라 재판 없이 밤 (기권이 많으면 재판 없음)
    const [target, ...rest] = t.bots;
    await K.botsVote(t, rest.slice(0, 3), U(target));
    const menu = await N.openCardMenu(page, target.nickname);
    await A5.menuItem(menu, '투표하기').click();
    await expect(menu).toBeHidden();
    // 서버가 받은 표시: 다시 연 X 카드 메뉴가 "투표취소" (사람을 찍어도 기권 단추는 안 잠김, 2026-11-18)
    await expect(async () => {
        const again = await N.openCardMenu(page, target.nickname);
        await expect(again.getByRole('menuitem', { name: '투표취소', exact: true })).toBeVisible({ timeout: 1500 });
    }).toPass({ timeout: 15_000 });
    await page.keyboard.press('Escape');
    await expect(page.getByRole('menu', { name: '플레이어 행동' })).toBeHidden();

    // 투표 마감은 손잡이로 (5초 규칙을 보는 케이스가 아님)
    await t.advance();
    await expect.poll(async () => (await t.state())?.phase, { message: '투표 마감 뒤 재판' }).toBe('TRIBUNAL');
    expect((await t.state()).tribunal?.defendantUuid, '피고 = 내가 찍은 봇').toBe(U(target));
});

// 죽은 사람 + 로비 → 로비 그대로·판에서 풀림 (처형·밤 암살)
const DEAD_CASES = [
    { no: '028', n: 6, how: 'execute', label: '처형' },
    { no: '029', n: 7, how: 'night', label: '밤 암살' },
    { no: '030', n: 10, how: 'execute', label: '처형' },
];

for (const { no, n, how, label } of DEAD_CASES) {
    test(`A10-E-${no} PC ${n}명 판 ${label}된 사람 → /lobby 그대로, 판에서 풀림, 방 만들기 → 대기방, 판은 계속 @game`, async ({ user, table }) => {
        test.setTimeout(240_000);
        const page = user.page;
        const me = U(user);
        const t = await K.seat(table, user, { n });
        if (how === 'execute') await K.execute(t, me);
        else await nightKill(t, me);
        await ui.gotoLobby(page);
        await expectReleased(t, me);
        await expect(page).toHaveURL(/\/lobby/);
        await makeRoom(user);
        await expectGameGoesOn(t);
    });
}

test('A10-E-032 PC 6명 판 처형된 사람 → /multiplay → 다른 공개 방 입장 → 대기방 @game', async ({ user, table, bots }) => {
    test.setTimeout(240_000);
    const page = user.page;
    const me = U(user);
    const [host] = await bots.spawn(1);
    await host.createRoom({ accessType: 'open' });
    const t = await K.seat(table, user, { n: 6 });
    await K.execute(t, me);
    await K.pickPublicRoom(page, `${host.nickname}의 방`);
    await expectReleased(t, me);
    await K.enterPicked(page).click();
    await expect(page).toHaveURL(/\/game-matching/, { timeout: 15_000 });
    await expect.poll(async () => (await e2e.roomOf(me))?.hostUuid, { message: '들어간 방 방장' }).toBe(host.uuid);
});

test('A10-E-052 PC 7명 판 산 사람 탭 닫음 → 60초 손잡이 → 새 탭 /lobby 그대로, 방 만들기 → 탈주 안내 글이 읽힘 @game', async ({ user, table }) => {
    test.setTimeout(240_000);
    const me = U(user);
    const t = await K.seat(table, user, { n: 7 });
    const since = Date.now();
    await user.page.close();
    await K.droppedAt(t, me, since);
    // 60초 규칙 자체를 보는 케이스가 아니라 손잡이로 탈락시킴
    await K.expire(t, me);
    const tab = await user.context.newPage();
    await ui.gotoLobby(tab);
    await expect(tab).toHaveURL(/\/lobby/);
    expect(await K.createRoomAlert(tab)).toMatch(K.COOLDOWN_FIRST);
    await expect(tab).toHaveURL(/\/game-setup/);
    // 알림 창을 닫은 뒤에도 화면 위 안내 띠에 같은 글
    await expectReadable(tab.getByTestId('entry-failure-notice').getByText(K.COOLDOWN_FIRST));
});

test('A10-E-053 PC 8명 판 처형된 사람 탭 닫음 → 새 탭 /lobby → 방 만들기 됨 @game', async ({ user, table }) => {
    test.setTimeout(240_000);
    const me = U(user);
    const t = await K.seat(table, user, { n: 8 });
    await K.execute(t, me);
    const tab = await closeAndReopen(t, user);
    await ui.gotoLobby(tab);
    await expectReleased(t, me);
    await expect(tab).toHaveURL(/\/lobby/);
    await makeRoom({ page: tab, account: user.account });
});

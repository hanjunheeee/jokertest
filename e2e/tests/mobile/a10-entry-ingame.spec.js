'use strict';

// 로비 입장 정리 브라우저 시험 (모바일, 진행 중 판) — 산 사람이 로비·방 목록 주소로 가면 판 화면으로 되돌아옴, 죽은 사람은 그 화면에 남고 판에서 풀려 방 만들기 됨
// 목록 A10-로비-입장-방어.md 번호 A10-E-024·025·031·057·058 (판은 봇 방장, 내 직업만 시민으로 고정 — 쓰는 동안 안 돌림)
const { test, expect, ui, e2e } = require('../../helpers/fixtures');
const K = require('../ingame/_a09-simple-kit');
const N = require('../ingame/b-night/_night');

const ALREADY_IN_ROOM = '이미 참여 중인 방이 있습니다.';
const U = (x) => x.account?.uuid ?? x.uuid;

/** 폰 게임 설정 화면에서 처음 값으로 방 만들기 → 대기방, 방장 = 나 (거절 안내 창 글이 없어야 함) */
async function makeRoom(person) {
    const page = person.page;
    await page.goto('/game-setup');
    const make = page.getByRole('button', { name: '게임 만들기' });
    await expect(make).toBeEnabled();
    await make.click();
    await expect(page).toHaveURL(/\/game-matching/, { timeout: 15_000 });
    await expect(page.getByText(ALREADY_IN_ROOM)).toHaveCount(0);
    await expect.poll(async () => (await e2e.roomOf(U(person)))?.hostUuid, { message: '새 방 방장 = 나' }).toBe(U(person));
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

/** 광대 봇이 첫 밤에 그 사람을 암살 → 죽을 때까지 */
async function nightKill(t, uuid) {
    const joker = K.botOf(t, await t.state(), 'JOKER');
    await N.toTurn(t, 'JOKER');
    const reply = await N.botNight(t, joker, uuid);
    expect(reply?.ok, `밤 암살 답 ${JSON.stringify(reply)}`).toBe(true);
    await N.advanceUntilSettled(t, (s) => K.rowOf(s, uuid)?.alive === false);
}

// 산 사람 + 로비 주소 → 판 화면 (옛 talk-reconnect:60 케이스)
const ALIVE_SIZES = [
    { no: '024', n: 5, smoke: true },
    { no: '025', n: 7 },
];

for (const { no, n, smoke } of ALIVE_SIZES) {
    test(`A10-E-${no} 모바일 ${n}명 판 산 사람 → 주소 /lobby → /ingame, 산 채 그대로 @game${smoke ? ' @smoke' : ''}`, async ({ user, table }) => {
        test.setTimeout(180_000);
        const page = user.page;
        const t = await K.seat(table, user, { n });
        await page.goto('/lobby');
        await expect(page).toHaveURL(/\/ingame/, { timeout: 15_000 });
        await expectAliveIn(t, U(user));
    });
}

test('A10-E-031 모바일 8명 판 밤 암살된 사람 → /lobby 그대로, 판에서 풀림, 방 만들기 됨 @game', async ({ user, table }) => {
    test.setTimeout(240_000);
    const page = user.page;
    const me = U(user);
    const t = await K.seat(table, user, { n: 8 });
    await nightKill(t, me);
    await ui.gotoLobby(page);
    await expectReleased(t, me);
    await expect(page).toHaveURL(/\/lobby/);
    await makeRoom(user);
});

test('A10-E-057 모바일 6명 판 산 사람 → 주소 /multiplay → /ingame @game', async ({ user, table }) => {
    test.setTimeout(180_000);
    const page = user.page;
    const t = await K.seat(table, user, { n: 6 });
    await page.goto('/multiplay');
    await expect(page).toHaveURL(/\/ingame/, { timeout: 15_000 });
    await expectAliveIn(t, U(user));
});

test('A10-E-058 모바일 7명 판 처형된 사람 → 주소 /gameMode 그대로, 판에서 풀림, 방 만들기 됨 @game', async ({ user, table }) => {
    test.setTimeout(240_000);
    const page = user.page;
    const me = U(user);
    const t = await K.seat(table, user, { n: 7 });
    await K.execute(t, me);
    await page.goto('/gameMode');
    await expectReleased(t, me);
    await expect(page).toHaveURL(/\/gameMode$/);
    await makeRoom(user);
});

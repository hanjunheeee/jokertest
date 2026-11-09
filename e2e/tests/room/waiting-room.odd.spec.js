// 대기방 이상한 순서·동시 화면 시험: 버튼 따닥(만들기·준비·시작), 두 창 마지막 자리, 방장 행동과 손님 준비가 겹칠 때
// 서버 시험으로 못 보는 화면 쪽만 봄 (버튼 연타 뒤 화면 글자와 서버 값이 같은지, 두 브라우저가 같은 순간 누를 때)
const { test, expect, ui, e2e } = require('../../helpers/fixtures');
const h = require('./roomHelpers');

// 화면 알림 모으기: 브라우저 기본 창(alert)은 글을 적고 닫음, 양피지 안내 창은 글을 읽음
function watchAlerts(page) {
    const native = [];
    page.on('dialog', (d) => { native.push(d.message()); d.accept().catch(() => {}); });
    return {
        native,
        async text() {
            const parchment = page.getByRole('alertdialog', { name: '안내' }).last();
            const shown = await parchment.isVisible().catch(() => false)
                ? await parchment.innerText().catch(() => '')
                : '';
            return [...native, shown].join(' | ');
        },
    };
}

const readyButton = (page) => page.getByRole('button', { name: /^준비(완료|취소)$/ });

// 화면 준비 버튼 글자와 서버 준비 값이 같아질 때까지 기다림 → '준비취소|true' 또는 '준비완료|false'
async function expectReadyAgrees(page, hostUuid, myUuid) {
    await expect.poll(async () => {
        const label = (await readyButton(page).innerText().catch(() => '')).trim();
        const room = await e2e.roomOf(hostUuid);
        const server = room?.players.find((p) => p.uuid === myUuid)?.isReady;
        return `${label}|${server}`;
    }, { timeout: 10000 }).toMatch(/^(준비취소\|true|준비완료\|false)$/);
}

test.describe('대기방 이상한 순서·동시', () => {
    test('[따닥] 게임 만들기를 두 번 빠르게 누르면 → 대기방 하나만, 오류 알림 없음, 방 지우면 남는 방 없음', async ({ user }) => {
        const alerts = watchAlerts(user.page);
        await h.openSetup(user.page);
        await user.page.getByRole('button', { name: '게임 만들기' }).dblclick();
        await expect(user.page).toHaveURL(/\/game-matching/);
        await expect(user.page.getByRole('button', { name: '게임시작' })).toBeVisible();
        const room = await h.waitRoom(user.account.uuid);
        expect(room.hostUuid).toBe(user.account.uuid);
        expect(room.players).toHaveLength(1);
        await h.expectPartyCount(user.page, 1);
        expect(await alerts.text()).not.toMatch(/처리 중|실패|이미 참여/);

        // 방 삭제 확인 창은 watchAlerts가 이미 받아 수락함
        await user.page.getByRole('button', { name: '방 삭제하기' }).click();
        await expect(user.page).toHaveURL(/\/multiplay$/);
        await expect.poll(() => e2e.roomOf(user.account.uuid)).toBeNull();
    });

    test('[따닥] 손님이 준비 버튼을 세 번 빠르게 누르면 → 끝 화면 글자와 서버 준비 값이 같고, 방장 화면 실루엣도 그 값', async ({ user, players }) => {
        const room = await h.createRoomUi(user, { jokers: 1 });
        const guest = await players.add();
        await ui.joinRoomByCodeUi(guest.page, room.roomCode);
        await h.expectPartyCount(user.page, 2);
        const btn = readyButton(guest.page);
        await btn.dblclick();
        await btn.click();
        await expectReadyAgrees(guest.page, user.account.uuid, guest.account.uuid);
        const finalReady = (await e2e.roomOf(user.account.uuid)).players.find((p) => p.uuid === guest.account.uuid).isReady;
        await expect(h.readySilhouettes(user.page)).toHaveCount(finalReady ? 1 : 0);
    });

    test('[따닥] 모두 준비하고 방장이 게임시작을 두 번 빠르게 누르면 → 판은 하나, 둘 다 같은 판, 시작 막힘 창 없음 @game', async ({ user, bots }) => {
        const room = await h.createRoomUi(user, { jokers: 1 });
        const [b] = await bots.spawn(1);
        await h.botsJoinAndReady([b], user.account.uuid, room.roomCode);
        await h.expectPartyCount(user.page, 2);
        await ui.readyUi(user.page);
        await expect(user.page.getByRole('button', { name: '준비취소' })).toBeVisible();
        await user.page.getByRole('button', { name: '게임시작' }).dblclick();
        await expect(user.page).toHaveURL(/\/ingame/, { timeout: 20000 });
        const mine = await e2e.gameOf(user.account.uuid);
        const botGame = await e2e.gameOf(b.uuid);
        expect(mine?.gameId).toBeTruthy();
        expect(botGame?.gameId).toBe(mine.gameId);
        expect(mine.players).toHaveLength(2);
        await expect(h.blockedDialog(user.page)).toHaveCount(0);
    });

    test('[두 창 동시] 마지막 한 자리에 두 사람이 같은 순간 참여하기를 누르면 → 한 사람만 들어가고, 진 사람은 정원 알림 + 코드 화면 그대로', async ({ players, bots }) => {
        const [host, ...fill] = await bots.spawn(3);
        const room = await host.createRoom({ maxPlayers: 4 });
        for (const x of fill) await x.joinByCode(room.roomCode);
        const a = await players.add();
        const b = await players.add();
        const alertsA = watchAlerts(a.page);
        const alertsB = watchAlerts(b.page);
        for (const p of [a, b]) {
            await p.page.goto('/roomInvite');
            await p.page.getByRole('textbox', { name: /방 코드/ }).first().click();
            await p.page.keyboard.type(room.roomCode);
        }
        await Promise.all([a, b].map((p) => p.page.getByRole('button', { name: '참여하기' }).click({ noWaitAfter: true })));

        let inA = null;
        let inB = null;
        await expect.poll(async () => {
            inA = await e2e.roomOf(a.account.uuid);
            inB = await e2e.roomOf(b.account.uuid);
            return [inA, inB].filter(Boolean).length;
        }, { timeout: 10000 }).toBe(1);
        const [winner, loser, loserAlerts] = inA ? [a, b, alertsB] : [b, a, alertsA];
        await expect(winner.page).toHaveURL(/\/game-matching/);
        await expect.poll(() => loserAlerts.text(), { timeout: 10000 }).toMatch(/가득/);
        await expect(loser.page).toHaveURL(/\/roomInvite$/);
        expect((await e2e.roomOf(host.uuid)).players).toHaveLength(4);
        // 조금 뒤에도 진 사람은 여전히 방 밖
        await expect.poll(() => e2e.roomOf(loser.account.uuid)).toBeNull();
    });

    test('[이상한 순서] 방장이 방을 지우는 순간 손님이 준비완료를 누르면 → 손님은 방 목록으로, 서버에도 소속 없음', async ({ user, bots }) => {
        const [host] = await bots.spawn(1);
        const room = await host.createRoom({ maxPlayers: 5 });
        await ui.joinRoomByCodeUi(user.page, room.roomCode);
        await h.expectPartyCount(user.page, 2);
        await Promise.all([
            readyButton(user.page).click({ noWaitAfter: true }).catch(() => {}),
            host.request('delete_room', {}),
        ]);
        await expect(user.page).toHaveURL(/\/multiplay$/, { timeout: 10000 });
        await expect.poll(() => e2e.roomOf(user.account.uuid)).toBeNull();
        expect(await e2e.roomOf(host.uuid)).toBeNull();
        await expect(readyButton(user.page)).toHaveCount(0);
    });

    test('[동시] 방장이 설정을 바꾸는 순간 손님이 준비완료를 누르면 → 손님 화면 글자와 서버 준비 값이 같음 (설정이 바뀌면 준비는 풀림)', async ({ user, bots }) => {
        const [host] = await bots.spawn(1);
        const room = await host.createRoom({ maxPlayers: 5 });
        await ui.joinRoomByCodeUi(user.page, room.roomCode);
        await h.expectPartyCount(user.page, 2);
        const [, saved] = await Promise.all([
            readyButton(user.page).click({ noWaitAfter: true }),
            h.botUpdateSettings(host, { accessType: 'open' }),
        ]);
        expect(saved?.ok).toBe(true);
        await expectReadyAgrees(user.page, host.uuid, user.account.uuid);
        // 다시 누르면 새 설정 기준으로 준비가 됨
        if ((await readyButton(user.page).innerText()).trim() === '준비완료') await readyButton(user.page).click();
        await expect.poll(async () => (await e2e.roomOf(host.uuid)).players.find((p) => p.uuid === user.account.uuid)?.isReady).toBe(true);
        await expect(readyButton(user.page)).toHaveText('준비취소');
    });
});

// 개발 최소 인원 규칙 (시험 서버 = 개발 규칙, GAME_DEV_MIN_PLAYERS=1): 정원 4까지 받음·광대보다 사람이 많으면 시작·역할 구성이 인원에 맞아야 시작
const { test, expect, ui, e2e } = require('../../helpers/fixtures');
const { FAST_ROOM_SETTINGS } = require('../../helpers/bots');
const h = require('./roomHelpers');

test.describe('개발 최소 인원', () => {
    test('개발 서버에서 정원 4로 방을 만들면(봇 요청) → 받아 줌', async ({ bots }) => {
        const [b] = await bots.spawn(1);
        const room = await b.createRoom({ maxPlayers: 4 });
        expect(room.roomCode).toMatch(/^[A-Z0-9]{6}$/);
        expect((await e2e.roomOf(b.uuid)).settings.maxPlayers).toBe(4);
    });

    test('정원 3으로 방을 만들면(봇 요청) → "최대 플레이어 수가 올바르지 않습니다." 거절', async ({ bots }) => {
        const [b] = await bots.spawn(1);
        const reply = await b.request('create_room', { ...FAST_ROOM_SETTINGS, maxPlayers: 3 });
        expect(reply.ok).toBe(false);
        expect(reply.message).toBe('최대 플레이어 수가 올바르지 않습니다.');
    });

    test('재판 시간 20초(15초 간격 아님)로 방을 만들면(봇 요청) → "재판 시간 값이 올바르지 않습니다." 거절', async ({ bots }) => {
        const [b] = await bots.spawn(1);
        const reply = await b.request('create_room', { ...FAST_ROOM_SETTINGS, tribunalTime: 20 });
        expect(reply.ok).toBe(false);
        expect(reply.message).toBe('재판 시간 값이 올바르지 않습니다.');
    });

    test('광대 1·사람 2명이 모두 준비하면 → 정원 10이어도 개발 규칙으로 시작됨 @game', async ({ user, bots }) => {
        const [b] = await bots.spawn(1);
        const t = await h.hostGame({ host: user, botList: [b] });
        expect(t.gameId).toBeTruthy();
        const s = await t.state();
        expect(s.players).toHaveLength(2);
    });

    test('광대 2인 방에 사람이 2명뿐이면 → 모두 준비해도 인원 조건 안내로 막힘', async ({ user, bots }) => {
        const { page } = user;
        const room = await h.createRoomUi(user, { jokers: 2 });
        const [b] = await bots.spawn(1);
        await h.botsJoinAndReady([b], user.account.uuid, room.roomCode);
        await ui.readyUi(page);
        await expect(h.readySilhouettes(page)).toHaveCount(2);
        await page.getByRole('button', { name: '게임시작' }).click();
        await expect(h.blockedDialog(page).getByRole('alert')).toHaveText('게임을 시작하기 위한 인원 조건을 아직 충족하지 못했습니다.');
    });

    test('광대 2인 방에 사람이 3명이면 → 시작됨 @game', async ({ user, bots }) => {
        const list = await bots.spawn(2);
        const t = await h.hostGame({ host: user, botList: list, settings: { jokers: 2 } });
        const s = await t.state();
        expect(s.players.filter((p) => p.role === 'JOKER')).toHaveLength(2);
    });

    test('직접 지정(광대1·의사1·경비원1)인데 2명이면 → "설정한 역할 구성이 현재 인원과 맞지 않습니다" 안내', async ({ user, bots }) => {
        const { page } = user;
        const room = await h.createRoomUi(user, { maxPlayers: 5, custom: { JOKER: 1, DOCTOR: 1, GUARD: 1 } });
        const [b] = await bots.spawn(1);
        await h.botsJoinAndReady([b], user.account.uuid, room.roomCode);
        await ui.readyUi(page);
        await expect(h.readySilhouettes(page)).toHaveCount(2);
        await page.getByRole('button', { name: '게임시작' }).click();
        await expect(h.blockedDialog(page).getByRole('alert')).toHaveText('설정한 역할 구성이 현재 인원과 맞지 않습니다. 인원을 더 모아주세요.');
    });

    test('직접 지정(광대1·의사1)에 사람 3명이면 → 시작되고 광대·의사가 한 명씩 @game', async ({ user, bots }) => {
        const list = await bots.spawn(2);
        const t = await h.hostGame({ host: user, botList: list, settings: { maxPlayers: 5, custom: { JOKER: 1, DOCTOR: 1 } } });
        const s = await t.state();
        expect(s.players.filter((p) => p.role === 'JOKER')).toHaveLength(1);
        expect(s.players.filter((p) => p.role === 'DOCTOR')).toHaveLength(1);
    });

});

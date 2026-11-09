// 방 목록: 공개 방 줄·인원·설정 요약(재판 시간은 낮 투표와 다를 때만)·마감(인원 참)·시작하면 사라짐·고르기·입장 버튼
const { test, expect, ui } = require('../../helpers/fixtures');
const h = require('./roomHelpers');

// 봇이 방 만들고, 다른 사람이 목록에서 그 줄 찾기
async function botRoomRow(bots, players, settings = {}) {
    const [b] = await bots.spawn(1);
    const room = await b.createRoom({ accessType: 'open', maxPlayers: 6, ...settings });
    const viewer = await players.add();
    await h.openRoomList(viewer.page);
    const row = await h.findRoomRow(viewer.page, `${b.nickname}의 방`);
    expect(row, '목록에 방이 있어야 함').not.toBeNull();
    return { b, room, viewer, row, title: `${b.nickname}의 방` };
}

test.describe('방 목록', () => {
    test('공개 방을 만들면 → 다른 사람 방 목록에 "닉네임의 방, 1/정원명" 줄이 보임', async ({ bots, players }) => {
        const { row } = await botRoomRow(bots, players);
        await expect(row).toHaveAccessibleName(/의 방, 1\/6명/);
    });

    test('방 줄 요약에 → 광대 수와 토론·투표·밤 시간이 나옴', async ({ bots, players }) => {
        const { row } = await botRoomRow(bots, players, { jokerCount: 1, dayDiscussionTime: 90, dayVoteTime: 60, tribunalTime: 60, nightActionTime: 30 });
        await expect(row).toHaveAccessibleName(/직업 구성 광대 1, 토론 90초 · 투표 60초 · 밤 30초/);
    });

    test('재판 시간이 낮 투표 시간과 다르면 → 요약에 "재판 N초"가 붙음', async ({ bots, players }) => {
        const { row } = await botRoomRow(bots, players, { dayVoteTime: 60, tribunalTime: 45 });
        await expect(row).toHaveAccessibleName(/투표 60초 · 재판 45초 · 밤/);
    });

    test('재판 시간이 낮 투표 시간과 같으면 → 요약에 재판이 안 나옴', async ({ bots, players }) => {
        const { row } = await botRoomRow(bots, players, { dayVoteTime: 30, tribunalTime: 30 });
        await expect(row).not.toHaveAccessibleName(/재판/);
    });

    test('직접 지정 구성 방이면 → 요약에 1명 이상인 직업만(광대·의사) 나옴', async ({ bots, players }) => {
        const { row } = await botRoomRow(bots, players, {
            jokerCount: 1, roleCompositionMode: 'custom', roleCounts: { JOKER: 1, DOCTOR: 1, GUARD: 0, WITCH_HUNTER: 0 },
        });
        await expect(row).toHaveAccessibleName(/직업 구성 광대 1 · 의사 1,/);
        await expect(row).not.toHaveAccessibleName(/경비원/);
    });

    test('누가 그 방에 들어오면 → 목록 인원이 2/정원으로 바뀜', async ({ bots, players }) => {
        const { room, viewer, title } = await botRoomRow(bots, players);
        const [b2] = await bots.spawn(1);
        await b2.joinByCode(room.roomCode);
        await expect.poll(async () => (await h.findRoomRow(viewer.page, title))?.getAttribute('aria-label')).toMatch(/2\/6명/);
    });

    test('정원이 다 차면 → 줄에 "마감"이 붙고 누를 수 없음', async ({ bots, players }) => {
        const [b] = await bots.spawn(1);
        const room = await b.createRoom({ accessType: 'open', maxPlayers: 4 });
        for (const x of await bots.spawn(3)) await x.joinByCode(room.roomCode);
        const viewer = await players.add();
        await h.openRoomList(viewer.page);
        const row = await h.findRoomRow(viewer.page, `${b.nickname}의 방`);
        await expect(row).toHaveAccessibleName(/4\/4명.*마감/);
        await expect(row).toBeDisabled();
    });

    test('방장이 방을 지우면 → 목록에서 그 줄이 사라짐', async ({ bots, players }) => {
        const { b, viewer, title } = await botRoomRow(bots, players);
        await b.request('delete_room', {});
        await expect.poll(async () => (await h.findRoomRow(viewer.page, title, { timeoutMs: 1500 })) === null, { timeout: 15000 }).toBe(true);
    });

    test('방에서 게임이 시작되면 → 목록에서 그 줄이 사라짐 @game', async ({ user, bots, players }) => {
        const viewer = await players.add();
        const [b] = await bots.spawn(1);
        await h.hostGame({ host: user, botList: [b] });
        await h.openRoomList(viewer.page);
        expect(await h.findRoomRow(viewer.page, `${user.account.nickname}의 방`, { timeoutMs: 1500 })).toBeNull();
    });

    test('공개 방 줄을 누르면 → 골라지고 아래 버튼이 "입장하기"로 풀림', async ({ bots, players }) => {
        const { row, viewer } = await botRoomRow(bots, players);
        const enter = viewer.page.getByRole('button', { name: '선택한 방 입장' });
        await expect(enter).toBeDisabled();
        await row.click();
        await expect(row).toHaveAttribute('aria-pressed', 'true');
        await expect(enter).toBeEnabled();
        await expect(enter).toHaveText('입장하기');
    });

    test('공개 방을 골라 입장하기를 누르면 → 그 방 대기방으로 들어감', async ({ bots, players, e2e }) => {
        const { b, row, viewer } = await botRoomRow(bots, players);
        await row.click();
        await viewer.page.getByRole('button', { name: '선택한 방 입장' }).click();
        await expect(viewer.page).toHaveURL(/\/game-matching/);
        await h.expectPartyCount(viewer.page, 2);
        expect((await e2e.roomOf(viewer.account.uuid))?.hostUuid).toBe(b.uuid);
    });

    test('코드 방을 고르면 → 버튼이 "코드 입력"이 되고 누르면 코드 입력 화면으로 감', async ({ bots, players }) => {
        const { row, viewer } = await botRoomRow(bots, players, { accessType: 'code' });
        await row.click();
        const btn = viewer.page.getByRole('button', { name: '코드 입력' });
        await expect(btn).toBeEnabled();
        await btn.click();
        await expect(viewer.page).toHaveURL(/\/roomInvite$/);
    });

    test('목록에서 고른 코드 방에 맞는 코드를 넣으면 → 그 방에 들어감', async ({ bots, players }) => {
        const { room, row, viewer } = await botRoomRow(bots, players, { accessType: 'code' });
        await row.click();
        await viewer.page.getByRole('button', { name: '코드 입력' }).click();
        await viewer.page.getByRole('textbox', { name: /방 코드/ }).first().click();
        await viewer.page.keyboard.type(room.roomCode);
        await viewer.page.getByRole('button', { name: '참여하기' }).click();
        await expect(viewer.page).toHaveURL(/\/game-matching/);
    });

    test('방 설정이 바뀌면 → 목록 요약도 새 값으로 바뀜', async ({ bots, players }) => {
        const { b, room, viewer, title } = await botRoomRow(bots, players, { dayDiscussionTime: 30 });
        const reply = await h.botUpdateSettings(b, { dayDiscussionTime: 120 });
        expect(reply?.ok, JSON.stringify(reply)).toBe(true);
        await expect.poll(async () => (await h.findRoomRow(viewer.page, title))?.getAttribute('aria-label')).toMatch(/토론 120초/);
    });

});

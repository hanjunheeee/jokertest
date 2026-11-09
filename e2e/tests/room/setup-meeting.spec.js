// 방 만들기 설정(회의&투표 탭): 낮 토론·낮 투표·재판 시간(기본 = 낮 투표, 15~120초 15초 간격)·밤 시간·직업별 밤 시간·투표 공개
const { test, expect } = require('../../helpers/fixtures');
const h = require('./roomHelpers');

// 화살표로 끝까지 가며 본 값 목록
async function walkValues(page, label) {
    await h.selectTab(page, '회의&투표');
    const dec = page.getByRole('button', { name: `${label} 감소`, exact: true });
    while (await dec.isEnabled()) await dec.click();
    const seen = [await h.stepperValue(page, label)];
    const inc = page.getByRole('button', { name: `${label} 증가`, exact: true });
    while (await inc.isEnabled()) {
        await inc.click();
        seen.push(await h.stepperValue(page, label));
    }
    return seen;
}

test.describe('방 만들기 회의&투표 탭', () => {
    test('회의&투표 탭을 누르면 → 처음 값(토론 60·투표 60·재판 60·밤 90·직업별 90·투표 공개 켜짐)이 보임', async ({ user }) => {
        const { page } = user;
        await h.openSetup(page);
        await h.selectTab(page, '회의&투표');
        await expect(page.getByRole('button', { name: '회의&투표' })).toHaveAttribute('aria-pressed', 'true');
        expect(await h.stepperValue(page, '낮 토론 시간 조절')).toBe('60초');
        expect(await h.stepperValue(page, '낮 투표 시간 조절')).toBe('60초');
        expect(await h.stepperValue(page, '재판 시간 조절')).toBe('60초');
        expect(await h.stepperValue(page, '밤 행동 시간 조절')).toBe('90초');
        for (const r of ['광대', '의사', '경비원', '마녀사냥꾼']) expect(await h.stepperValue(page, `${r} 밤 시간 조절`)).toBe('90초');
        await expect(page.getByRole('checkbox', { name: '투표 공개 여부' })).toHaveAttribute('aria-checked', 'true');
    });

    test('낮 투표 시간 화살표를 끝까지 움직이면 → 30~90초 30초 간격만 나옴', async ({ user }) => {
        await h.openSetup(user.page);
        expect(await walkValues(user.page, '낮 투표 시간 조절')).toEqual(['30초', '60초', '90초']);
    });

    test('재판 시간 화살표를 끝까지 움직이면 → 15~120초 15초 간격 8개가 나옴', async ({ user }) => {
        await h.openSetup(user.page);
        expect(await walkValues(user.page, '재판 시간 조절')).toEqual(['15초', '30초', '45초', '60초', '75초', '90초', '105초', '120초']);
    });

    test('재판 시간을 안 건드리고 낮 투표를 30초로 바꾸면 → 재판 시간도 30초로 따라감', async ({ user }) => {
        const { page } = user;
        await h.openSetup(page);
        await h.fillSettings(page, { vote: 30 });
        expect(await h.stepperValue(page, '재판 시간 조절')).toBe('30초');
    });

    test('재판 시간을 먼저 45초로 바꾼 뒤 낮 투표를 바꾸면 → 재판 시간은 45초 그대로', async ({ user }) => {
        const { page } = user;
        await h.openSetup(page);
        await h.fillSettings(page, { tribunal: 45 });
        await h.setStepper(page, '낮 투표 시간 조절', 90);
        expect(await h.stepperValue(page, '재판 시간 조절')).toBe('45초');
    });

    test('재판 시간을 낮 투표와 같게 두고 만들면 → 서버 방에 재판 칸이 없음(낮 투표 시간을 따름)', async ({ user }) => {
        const room = await h.createRoomUi(user, { vote: 90 });
        expect(room.settings.dayVoteTime).toBe(90);
        expect(room.settings.tribunalTime).toBeUndefined();
    });

    test('재판 시간을 15초로 바꾸고 만들면 → 서버 방 재판 시간 15초', async ({ user }) => {
        const room = await h.createRoomUi(user, { tribunal: 15 });
        expect(room.settings.tribunalTime).toBe(15);
        expect(room.settings.dayVoteTime).toBe(60);
    });

    test('재판 시간 75 → 60(낮 투표와 같음)으로 되돌려 만들면 → 서버 방에 재판 칸 없음', async ({ user }) => {
        const { page } = user;
        await h.openSetup(page);
        await h.fillSettings(page, { tribunal: 75 });
        await h.setStepper(page, '재판 시간 조절', 60);
        await page.getByRole('button', { name: '게임 만들기' }).click();
        await expect(page).toHaveURL(/\/game-matching/);
        const room = await h.waitRoom(user.account.uuid);
        expect(room.settings.tribunalTime).toBeUndefined();
    });

    test('낮 토론 150초·낮 투표 30초·밤 120초로 만들면 → 서버 방 시간이 그대로 저장됨', async ({ user }) => {
        const room = await h.createRoomUi(user, { discussion: 150, vote: 30, night: 120 });
        expect(room.settings).toMatchObject({ dayDiscussionTime: 150, dayVoteTime: 30, nightActionTime: 120 });
    });

    test('밤 행동 시간을 60초로 바꾸면 → 안 건드린 직업별 밤 시간도 모두 60초로 따라감', async ({ user }) => {
        const { page } = user;
        await h.openSetup(page);
        await h.fillSettings(page, { night: 60 });
        for (const r of ['광대', '의사', '경비원', '마녀사냥꾼']) expect(await h.stepperValue(page, `${r} 밤 시간 조절`)).toBe('60초');
    });

    test('광대 밤 시간을 먼저 30초로 바꾼 뒤 밤 행동 시간을 바꾸면 → 광대만 30초 그대로, 나머지는 따라감', async ({ user }) => {
        const { page } = user;
        await h.openSetup(page);
        await h.fillSettings(page, { roleNights: { JOKER: 30 } });
        await h.setStepper(page, '밤 행동 시간 조절', 120);
        expect(await h.stepperValue(page, '광대 밤 시간 조절')).toBe('30초');
        expect(await h.stepperValue(page, '의사 밤 시간 조절')).toBe('120초');
    });

    test('의사 밤 시간만 30초로 바꾸고 만들면 → 서버 방 직업별 밤 시간에 의사 30초만 따로 실림', async ({ user }) => {
        const room = await h.createRoomUi(user, { roleNights: { DOCTOR: 30 } });
        expect(room.settings.roleNightActionTimes?.DOCTOR).toBe(30);
        expect(room.settings.roleNightActionTimes?.JOKER).toBeUndefined();
    });

    test('투표 공개 여부를 끄고 만들면 → 서버 방 voteReveal 꺼짐', async ({ user }) => {
        const room = await h.createRoomUi(user, { voteReveal: false });
        expect(room.settings.voteReveal).toBe(false);
    });

    test('일반·회의 두 탭을 다 바꾸고 만들면 → 서버 방에 두 탭 값이 다 들어감', async ({ user }) => {
        const room = await h.createRoomUi(user, { maxPlayers: 8, jokers: 1, discussion: 30, vote: 30, tribunal: 90, night: 30 });
        expect(room.settings).toMatchObject({ maxPlayers: 8, jokerCount: 1, dayDiscussionTime: 30, dayVoteTime: 30, tribunalTime: 90, nightActionTime: 30 });
    });
});

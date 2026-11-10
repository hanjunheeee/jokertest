// 모바일 방 화면 (375×812 세로): 게임 모드 → 방 목록(카드 요약·재판 시간) → 코드 입장(한 칸) → 방 만들기(재판 시간) → 대기방
const { test, expect, ui } = require('../../helpers/fixtures');
const { overflowX } = require('./_talk');

const roomCard = (page, nickname) => page.getByRole('region', { name: '공개 방 목록' }).getByRole('button', { name: new RegExp(`^${nickname}의 방`) });

test.describe('게임 모드·방 목록', () => {
    test('게임플레이를 누르면 → 게임 모드 화면에 방 찾기·비밀연회장이 있고 랜덤 매칭은 준비중으로 꺼져 있음', async ({ user }) => {
        await user.page.getByRole('navigation', { name: '로비 메뉴' }).getByRole('button', { name: '게임플레이' }).click();
        await expect(user.page).toHaveURL(/\/gameMode$/);
        const group = user.page.getByRole('group', { name: '게임 모드 선택' });
        await expect(group.getByRole('button', { name: '방 찾기' })).toBeEnabled();
        await expect(group.getByRole('button', { name: '비밀연회장' })).toBeEnabled();
        await expect(group.getByRole('button', { name: /랜덤 매칭/ })).toBeDisabled();
        expect(await overflowX(user.page)).toBeLessThanOrEqual(0);
    });

    test('게임 모드에서 "비밀연회장"을 누르면 → 방 코드 입력 화면으로 감', async ({ user }) => {
        await user.page.goto('/gameMode');
        await user.page.getByRole('button', { name: '비밀연회장' }).click();
        await expect(user.page).toHaveURL(/\/roomInvite$/);
    });

    test('게임 모드에서 "방 찾기"를 누르면 → 멀티플레이 방 목록 화면으로 감', async ({ user }) => {
        await user.page.goto('/gameMode');
        await user.page.getByRole('button', { name: '방 찾기' }).click();
        await expect(user.page).toHaveURL(/\/multiplay$/);
        await expect(user.page.getByRole('heading', { name: '멀티플레이' })).toBeVisible();
        await expect(user.page.getByRole('button', { name: '선택한 방 입장' })).toBeDisabled();
    });

    test('봇이 방을 만들면 → 방 목록에 "닉네임의 방" 카드로 인원·코드 필요·시간 요약이 보임', async ({ user, bots }) => {
        const [bot] = await bots.spawn(1);
        await bot.createRoom({});
        await user.page.goto('/multiplay');
        const card = roomCard(user.page, bot.nickname);
        await expect(card).toBeVisible();
        await expect(card).toHaveAccessibleName(/1\/5명/);
        await expect(card).toHaveAccessibleName(/코드 필요/);
        await expect(card).toHaveAccessibleName(/토론 30초 · 투표 30초/);
    });

    test('재판 시간이 낮 투표 시간과 다른 방이면 → 카드 요약에 "재판 45초"가 보임', async ({ user, bots }) => {
        const [bot] = await bots.spawn(1);
        await bot.createRoom({ tribunalTime: 45, dayVoteTime: 30 });
        await user.page.goto('/multiplay');
        await expect(roomCard(user.page, bot.nickname)).toHaveAccessibleName(/재판 45초/);
    });

    test('재판 시간이 낮 투표 시간과 같은 방이면 → 카드 요약에 재판 시간이 따로 안 나옴', async ({ user, bots }) => {
        const [bot] = await bots.spawn(1);
        await bot.createRoom({ tribunalTime: 30, dayVoteTime: 30 });
        await user.page.goto('/multiplay');
        const card = roomCard(user.page, bot.nickname);
        await expect(card).toBeVisible();
        await expect(card).not.toHaveAccessibleName(/재판/);
    });

    test('방 목록 카드들은 → 375 폭 안에 들어오고 화면이 가로로 안 넘침', async ({ user, bots }) => {
        const [bot] = await bots.spawn(1);
        await bot.createRoom({});
        await user.page.goto('/multiplay');
        const card = roomCard(user.page, bot.nickname);
        await expect(card).toBeVisible();
        const box = await card.boundingBox();
        expect(box.x).toBeGreaterThanOrEqual(0);
        expect(box.x + box.width).toBeLessThanOrEqual(375);
        expect(await overflowX(user.page)).toBeLessThanOrEqual(0);
    });

    test('방 카드를 누르면 → 아래 입장 막대가 켜짐', async ({ user, bots }) => {
        const [bot] = await bots.spawn(1);
        // 봇 방 기본값이 코드 방이라 막대 글이 '코드 입력'으로 바뀜 → 열린 방으로 만들어 '입장하기' 막대를 봄
        await bot.createRoom({ accessType: 'open' });
        await user.page.goto('/multiplay');
        await expect(user.page.getByRole('button', { name: '선택한 방 입장' })).toBeDisabled();
        await roomCard(user.page, bot.nickname).click();
        // 고르면 아래 입장 막대가 눌 수 있게 됨
        await expect(user.page.getByRole('button', { name: '선택한 방 입장' })).toBeEnabled();
    });

    test('방 목록에서 "코드로 참가"를 누르면 → 방 코드 한 칸 입력 화면으로 감', async ({ user }) => {
        await user.page.goto('/multiplay');
        await user.page.getByRole('button', { name: '코드로 참가' }).click();
        await expect(user.page).toHaveURL(/\/roomInvite$/);
        await expect(user.page.getByRole('textbox', { name: /방 코드/ })).toHaveCount(1);
    });
});

test.describe('코드 입장', () => {
    test('방 코드 한 칸에 봇 방 코드를 넣고 참여하면 → 그 대기방에 들어감', async ({ user, bots, e2e }) => {
        const [bot] = await bots.spawn(1);
        const room = await bot.createRoom({});
        await ui.joinRoomByCodeUi(user.page, room.roomCode);
        const mine = await e2e.roomOf(user.account.uuid);
        expect(mine.roomCode).toBe(room.roomCode);
        await expect(user.page.getByRole('button', { name: '준비완료' })).toBeVisible();
    });

    test('방 코드 칸은 → 화면에 한 칸이고 6자리까지만 들어감', async ({ user }) => {
        await user.page.goto('/roomInvite');
        const box = user.page.getByRole('textbox', { name: '방 코드 6자리' });
        await box.click();
        await user.page.keyboard.type('ABCDEFGH');
        await expect(box).toHaveValue(/^[A-Z0-9]{0,6}$/);
        expect((await box.inputValue()).length).toBeLessThanOrEqual(6);
        expect(await overflowX(user.page)).toBeLessThanOrEqual(0);
    });

    test('없는 방 코드로 참여하면 → 안내가 뜨고 대기방으로 안 감', async ({ user }) => {
        await user.page.goto('/roomInvite');
        await user.page.getByRole('textbox', { name: '방 코드 6자리' }).fill('ZZZZZ9');
        await user.page.getByRole('button', { name: '참여하기' }).click();
        await expect(user.page.getByRole('alertdialog').or(user.page.getByRole('alert')).first()).toBeVisible({ timeout: 10000 });
        await expect(user.page).toHaveURL(/\/roomInvite$/);
    });
});

test.describe('방 만들기·대기방', () => {
    test('방 만들기 "회의&투표" 탭엔 → 재판 시간 조절이 있고 늘리면 값이 바뀜', async ({ user }) => {
        await user.page.goto('/game-setup');
        await user.page.getByRole('button', { name: '회의&투표' }).click();
        const group = user.page.getByRole('group', { name: '재판 시간 조절' });
        await expect(group).toBeVisible();
        const before = await group.innerText();
        await group.getByRole('button', { name: '재판 시간 조절 증가' }).click();
        await expect(group).not.toHaveText(before);
        expect(await overflowX(user.page)).toBeLessThanOrEqual(0);
    });

    test('방 만들기에서 재판 시간을 바꿔 만들면 → 서버 대기방 설정에 그 재판 시간이 들어감', async ({ user, e2e }) => {
        await user.page.goto('/game-setup');
        await user.page.getByRole('button', { name: '회의&투표' }).click();
        const group = user.page.getByRole('group', { name: '재판 시간 조절' });
        await group.getByRole('button', { name: '재판 시간 조절 증가' }).click();
        const seconds = Number((await group.innerText()).match(/(\d+)초/)[1]);
        await user.page.getByRole('button', { name: '게임 만들기' }).click();
        await expect(user.page).toHaveURL(/\/game-matching/);
        const room = await e2e.roomOf(user.account.uuid);
        expect(room.settings.tribunalTime).toBe(seconds);
    });

    test('방을 만들면 → 모바일 대기방에 준비완료·게임시작·방 삭제하기와 방장 버튼이 보이고 가로로 안 넘침', async ({ user }) => {
        await user.page.goto('/game-setup');
        await user.page.getByRole('button', { name: '게임 만들기' }).click();
        await expect(user.page).toHaveURL(/\/game-matching/);
        for (const name of ['준비완료', '게임시작', '방 삭제하기', '방 설정 변경', '참가자 추방', '초대코드 공유']) {
            await expect(user.page.getByRole('button', { name })).toBeVisible();
        }
        await expect(user.page.getByRole('complementary', { name: '광고' })).toBeVisible();
        expect(await overflowX(user.page)).toBeLessThanOrEqual(0);
    });

    test('대기방에서 "초대코드 공유"를 누르면 → 방 코드가 보이는 창이 뜸', async ({ user, e2e }) => {
        await user.page.goto('/game-setup');
        await user.page.getByRole('button', { name: '게임 만들기' }).click();
        await expect(user.page).toHaveURL(/\/game-matching/);
        const room = await e2e.roomOf(user.account.uuid);
        await user.page.getByRole('button', { name: '초대코드 공유' }).click();
        await expect(user.page.getByText(room.roomCode).first()).toBeVisible();
    });

    test('혼자인 대기방에서 "게임시작"을 누르면 → 시작할 수 없다는 안내가 뜸', async ({ user }) => {
        await user.page.goto('/game-setup');
        await user.page.getByRole('button', { name: '게임 만들기' }).click();
        await expect(user.page).toHaveURL(/\/game-matching/);
        await user.page.getByRole('button', { name: '게임시작' }).click();
        await expect(user.page.getByRole('alertdialog').or(user.page.getByRole('dialog')).first()).toBeVisible();
        await expect(user.page).toHaveURL(/\/game-matching/);
    });
});

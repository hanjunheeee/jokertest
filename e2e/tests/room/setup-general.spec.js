// 방 만들기 설정(일반 탭): 처음 값·칸 범위·체크·역할 구성 → 만든 방의 서버 설정
const { test, expect } = require('../../helpers/fixtures');
const h = require('./roomHelpers');

test.describe('방 만들기 일반 탭', () => {
    test('설정 화면을 열면 → 일반 탭이 골라져 있고 처음 값(코드 꺼짐·10명·광대 2·자동)이 보임', async ({ user }) => {
        const { page } = user;
        await h.openSetup(page);
        await expect(page.getByRole('button', { name: '일반', exact: true })).toHaveAttribute('aria-pressed', 'true');
        await expect(page.getByRole('checkbox', { name: '코드로만 참가' })).toHaveAttribute('aria-checked', 'false');
        expect(await h.stepperValue(page, '최대 플레이어 수')).toBe('10');
        expect(await h.stepperValue(page, '광대(마피아) 플레이어 수')).toBe('2');
        await expect(page.getByRole('checkbox', { name: '불이 꺼진 무도회' })).toHaveAttribute('aria-checked', 'false');
        await expect(page.getByRole('checkbox', { name: '영혼의 베팅 활성화' })).toHaveAttribute('aria-checked', 'false');
        expect(await h.stepperValue(page, '역할 구성')).toBe('자동');
    });

    test('아무것도 안 바꾸고 게임 만들기를 누르면 → 서버 방도 처음 값(공개·10명·광대 2·자동)으로 생김', async ({ user }) => {
        const room = await h.createRoomUi(user);
        expect(room.settings).toMatchObject({ maxPlayers: 10, jokerCount: 2, lightsOut: false, soulBetting: false, roleCompositionMode: 'auto' });
        expect(room.hostUuid).toBe(user.account.uuid);
        expect(room.players).toHaveLength(1);
    });

    test('최대 인원을 끝까지 줄이면 → 5에서 멈추고 감소 화살표가 잠김 (화면 최소 5명)', async ({ user }) => {
        const { page } = user;
        await h.openSetup(page);
        for (let i = 0; i < 7; i += 1) {
            const dec = page.getByRole('button', { name: '최대 플레이어 수 감소' });
            if (await dec.isDisabled()) break;
            await dec.click();
        }
        expect(await h.stepperValue(page, '최대 플레이어 수')).toBe('5');
        await expect(page.getByRole('button', { name: '최대 플레이어 수 감소' })).toBeDisabled();
    });

    test('최대 인원을 7로 바꾸고 만들면 → 서버 방 정원이 7', async ({ user }) => {
        const room = await h.createRoomUi(user, { maxPlayers: 7 });
        expect(room.settings.maxPlayers).toBe(7);
    });

    test('광대 수는 1~2만 고를 수 있음 → 2에서 증가 잠김, 1에서 감소 잠김', async ({ user }) => {
        const { page } = user;
        await h.openSetup(page);
        await expect(page.getByRole('button', { name: '광대(마피아) 플레이어 수 증가' })).toBeDisabled();
        await page.getByRole('button', { name: '광대(마피아) 플레이어 수 감소' }).click();
        expect(await h.stepperValue(page, '광대(마피아) 플레이어 수')).toBe('1');
        await expect(page.getByRole('button', { name: '광대(마피아) 플레이어 수 감소' })).toBeDisabled();
        await expect(page.getByRole('button', { name: '광대(마피아) 플레이어 수 증가' })).toBeEnabled();
    });

    test('광대 수를 1로 바꾸고 만들면 → 서버 방 광대 수가 1', async ({ user }) => {
        const room = await h.createRoomUi(user, { jokers: 1 });
        expect(room.settings.jokerCount).toBe(1);
    });

    test('코드로만 참가를 켜고 만들면 → 방 목록에 코드 필요 표시로 나옴', async ({ user, players }) => {
        await h.createRoomUi(user, { code: true });
        const other = await players.add();
        await h.openRoomList(other.page);
        const row = await h.findRoomRow(other.page, `${user.account.nickname}의 방`);
        expect(row).not.toBeNull();
        await expect(row).toHaveAccessibleName(/코드 필요|코드 [A-Z0-9]{6}/);
    });

    test('불이 꺼진 무도회를 켜고 만들면 → 서버 방 lightsOut 켜짐', async ({ user }) => {
        const room = await h.createRoomUi(user, { lightsOut: true });
        expect(room.settings.lightsOut).toBe(true);
    });

    test('영혼의 베팅을 켜고 만들면 → 서버 방 soulBetting 켜짐', async ({ user }) => {
        const room = await h.createRoomUi(user, { soulBetting: true });
        expect(room.settings.soulBetting).toBe(true);
    });

    test('역할 구성을 직접 지정으로 바꾸면 → 광대 수 줄이 숨고 역할별 인원 줄·시민 자동 계산 글이 보임', async ({ user }) => {
        const { page } = user;
        await h.openSetup(page);
        await h.setChoice(page, '역할 구성', '직접 지정');
        await expect(h.stepperRow(page, '광대(마피아) 플레이어 수')).toHaveCount(0);
        for (const label of ['광대 인원', '의사 인원', '경비원 인원', '마녀사냥꾼 인원']) await expect(h.stepperRow(page, label)).toBeVisible();
        await expect(page.getByText(/시민: \d+명 \(자동 계산\)/)).toBeVisible();
    });

    test('직접 지정으로 바꾸면 → 광대 인원이 자동 탭의 광대 수(2)를 이어받음', async ({ user }) => {
        const { page } = user;
        await h.openSetup(page);
        await h.setChoice(page, '역할 구성', '직접 지정');
        expect(await h.stepperValue(page, '광대 인원')).toBe('2명');
    });

    test('직접 지정에서 의사 1·경비원 1을 고르면 → 시민 수와 지정 합계 글이 맞게 바뀜', async ({ user }) => {
        const { page } = user;
        await h.openSetup(page);
        await h.setStepper(page, '최대 플레이어 수', 8);
        await h.setChoice(page, '역할 구성', '직접 지정');
        await h.setStepper(page, '광대 인원', 1);
        await h.setStepper(page, '의사 인원', 1);
        await h.setStepper(page, '경비원 인원', 1);
        await expect(page.getByText('시민: 5명 (자동 계산)')).toBeVisible();
        await expect(page.getByText('지정한 인원 합계: 3 / 8명')).toBeVisible();
    });

    test('정원 5에 광대2·의사2·경비원2를 지정하면 → 합계 넘침 안내가 뜨고 게임 만들기가 잠김', async ({ user }) => {
        const { page } = user;
        await h.openSetup(page);
        await h.setStepper(page, '최대 플레이어 수', 5);
        await h.setChoice(page, '역할 구성', '직접 지정');
        await h.setStepper(page, '광대 인원', 2);
        await h.setStepper(page, '의사 인원', 2);
        await h.setStepper(page, '경비원 인원', 2);
        await expect(page.getByText('지정한 역할 인원의 합이 최대 플레이어 수를 넘습니다.')).toBeVisible();
        await expect(page.getByRole('button', { name: '게임 만들기' })).toBeDisabled();
    });

    test('직접 지정(광대1·의사1·마녀사냥꾼1)으로 만들면 → 서버 방에 custom 구성과 광대 수 1이 저장됨', async ({ user }) => {
        const room = await h.createRoomUi(user, { maxPlayers: 6, custom: { JOKER: 1, DOCTOR: 1, WITCH_HUNTER: 1 } });
        expect(room.settings.roleCompositionMode).toBe('custom');
        expect(room.settings.roleCounts).toMatchObject({ JOKER: 1, DOCTOR: 1, GUARD: 0, WITCH_HUNTER: 1 });
        expect(room.settings.jokerCount).toBe(1);
    });

    test('직접 지정했다가 자동으로 돌리면 → 광대 수 줄이 다시 보이고 서버 방은 auto', async ({ user }) => {
        const { page } = user;
        await h.openSetup(page);
        await h.setChoice(page, '역할 구성', '직접 지정');
        await h.setChoice(page, '역할 구성', '자동');
        await expect(h.stepperRow(page, '광대(마피아) 플레이어 수')).toBeVisible();
        await page.getByRole('button', { name: '게임 만들기' }).click();
        await expect(page).toHaveURL(/\/game-matching/);
        const room = await h.waitRoom(user.account.uuid);
        expect(room.settings.roleCompositionMode).toBe('auto');
    });

    test('설정 화면에서 뒤로 가기를 누르면 → 방 목록 화면으로 가고 방은 안 생김', async ({ user, e2e }) => {
        const { page } = user;
        await h.openSetup(page);
        await page.getByRole('button', { name: '멀티플레이 선택으로 돌아가기' }).click();
        await expect(page).toHaveURL(/\/multiplay$/);
        expect(await e2e.roomOf(user.account.uuid)).toBeNull();
    });

    test('방 찾기 화면의 방 만들기 버튼을 누르면 → 설정 화면으로 감', async ({ user }) => {
        await h.openRoomList(user.page);
        await user.page.getByRole('navigation', { name: '방 목록 작업' }).getByRole('button', { name: '방 만들기' }).click();
        await expect(user.page).toHaveURL(/\/game-setup$/);
    });
});

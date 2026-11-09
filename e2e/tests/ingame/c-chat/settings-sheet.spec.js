// 인게임 설정 시트: 채팅 탭(글자 크기·시간 표시·닉네임 색)·사운드 탭(음량·효과음 음소거)·타이머 위치·방 코드 보기·닫기
// 봇이 방장이라 방관리 탭은 안 보임 (방장 전용)
const { test, expect } = require('../../../helpers/fixtures');
const c = require('./_lib');

const panel = (page) => page.getByRole('dialog', { name: '인게임 설정' });
const tabs = (page) => panel(page).getByRole('navigation', { name: '인게임 설정 탭' });

async function solo({ user, table, phase = 'DAY' }) {
    const t = await c.startGame(table, { humans: [user], bots: 3, roles: ({ bots: b }) => ({ [user.account.uuid]: 'CITIZEN', [b[0].account.uuid]: 'JOKER' }) });
    await c.phaseTo(t, phase);
    await c.readyToChat(user.page);
    return t;
}
async function openSettings(page, tab = null) {
    await c.dismissOverlays(page);
    await page.getByRole('button', { name: '인게임 설정', exact: true }).click();
    await expect(panel(page)).toBeVisible();
    if (tab) await tabs(page).getByRole('button', { name: tab }).click();
}
async function closeSettings(page) {
    await panel(page).getByRole('button', { name: '인게임 설정 닫기' }).click();
    await expect(panel(page)).toHaveCount(0);
}

test.describe('열고 닫기·탭', () => {
    test('인게임 설정을 누르면 → 설정 창이 뜨고 채팅 탭이 눌린 채 열림 @game', async ({ user, table }) => {
        await solo({ user, table });
        await openSettings(user.page);
        await expect(tabs(user.page).getByRole('button', { name: '채팅' })).toHaveAttribute('aria-pressed', 'true');
    });

    test('방장이 아니면 → 방관리 탭이 안 보임 @game', async ({ user, table }) => {
        await solo({ user, table });
        await openSettings(user.page);
        await expect(tabs(user.page).getByRole('button', { name: '방관리' })).toHaveCount(0);
    });

    test('사운드 탭을 누르면 → 음량 셋과 효과음 음소거가 보임 @game', async ({ user, table }) => {
        await solo({ user, table });
        await openSettings(user.page, '사운드');
        for (const name of ['Master Volume', '배경음', '효과음']) await expect(panel(user.page).getByRole('slider', { name })).toBeVisible();
        await expect(panel(user.page).getByRole('checkbox', { name: '효과음 음소거' })).toBeVisible();
    });

    test('닫기 버튼을 누르면 → 설정 창이 닫힘 @game', async ({ user, table }) => {
        await solo({ user, table });
        await openSettings(user.page);
        await closeSettings(user.page);
    });

    test('Esc를 누르면 → 설정 창이 닫힘 @game', async ({ user, table }) => {
        await solo({ user, table });
        await openSettings(user.page);
        await user.page.keyboard.press('Escape');
        await expect(panel(user.page)).toHaveCount(0);
    });

    test('설정 창이 열린 채 단계가 밤으로 바뀌어도 → 다시 열면 그대로 쓸 수 있음 @game', async ({ user, table }) => {
        const t = await solo({ user, table });
        await openSettings(user.page);
        await c.phaseTo(t, 'NIGHT');
        await c.dismissOverlays(user.page);
        if (!(await panel(user.page).isVisible())) await openSettings(user.page);
        await expect(tabs(user.page).getByRole('button', { name: '사운드' })).toBeVisible();
    });

    test('죽은 뒤에도 → 설정 창을 열 수 있음 @game', async ({ user, table }) => {
        const t = await c.startGame(table, { humans: [user], bots: 4, roles: ({ bots: b }) => ({ [user.account.uuid]: 'CITIZEN', [b[0].account.uuid]: 'JOKER' }) });
        await c.phaseTo(t, 'DAY');
        await c.executeByBots(t, user.account.uuid);
        await c.readyToChat(user.page);
        await openSettings(user.page);
        await expect(panel(user.page)).toBeVisible();
    });
});

test.describe('사운드', () => {
    test('처음 사운드 값은 → 전체 100·배경음 80·효과음 80·음소거 꺼짐 @game', async ({ user, table }) => {
        await solo({ user, table });
        await openSettings(user.page, '사운드');
        await expect(panel(user.page).getByRole('slider', { name: 'Master Volume' })).toHaveValue('100');
        await expect(panel(user.page).getByRole('slider', { name: '배경음' })).toHaveValue('80');
        await expect(panel(user.page).getByRole('slider', { name: '효과음' })).toHaveValue('80');
        await expect(panel(user.page).getByRole('checkbox', { name: '효과음 음소거' })).not.toBeChecked();
    });

    test('배경음 슬라이더를 왼쪽 키로 줄이면 → 숫자가 80보다 작아짐 @game', async ({ user, table }) => {
        await solo({ user, table });
        await openSettings(user.page, '사운드');
        const slider = panel(user.page).getByRole('slider', { name: '배경음' });
        await slider.focus();
        for (let i = 0; i < 5; i += 1) await user.page.keyboard.press('ArrowLeft');
        await expect.poll(async () => Number(await slider.inputValue())).toBeLessThan(80);
    });

    test('효과음 음소거를 켜면 → 체크됨으로 바뀜 @game', async ({ user, table }) => {
        await solo({ user, table });
        await openSettings(user.page, '사운드');
        const box = panel(user.page).getByRole('checkbox', { name: '효과음 음소거' });
        await box.click();
        await expect(box).toBeChecked();
    });

    test('음소거를 켜고 닫았다 다시 열면 → 켜진 채 남아 있음 @game', async ({ user, table }) => {
        await solo({ user, table });
        await openSettings(user.page, '사운드');
        await panel(user.page).getByRole('checkbox', { name: '효과음 음소거' }).click();
        await closeSettings(user.page);
        await openSettings(user.page, '사운드');
        await expect(panel(user.page).getByRole('checkbox', { name: '효과음 음소거' })).toBeChecked();
    });

    test('Master Volume을 끝(Home)까지 내리면 → 0이 됨 @game', async ({ user, table }) => {
        await solo({ user, table });
        await openSettings(user.page, '사운드');
        const slider = panel(user.page).getByRole('slider', { name: 'Master Volume' });
        await slider.focus();
        await user.page.keyboard.press('Home');
        await expect(slider).toHaveValue('0');
    });
});

test.describe('채팅 탭', () => {
    test('처음 채팅 값은 → 글자 크기 100·시간 표시 꺼짐·닉네임 색 켜짐 @game', async ({ user, table }) => {
        await solo({ user, table });
        await openSettings(user.page);
        await expect(panel(user.page).getByRole('slider', { name: '채팅 글자 크기' })).toHaveValue('100');
        await expect(panel(user.page).getByRole('checkbox', { name: '채팅 시간 표시' })).not.toBeChecked();
        await expect(panel(user.page).getByRole('checkbox', { name: '닉네임 색상 표시' })).toBeChecked();
    });

    test('시간 표시가 꺼져 있으면 → 채팅 줄에 시:분이 안 보임 @game', async ({ user, table }) => {
        const t = await solo({ user, table });
        const text = c.uniq('시간없음');
        await c.botSay(t, 1, text);
        await c.expectLine(user.page, t.bots[1].nickname, text);
        const row = c.chatLog(user.page).getByRole('listitem').filter({ hasText: text });
        await expect(row).not.toContainText(/\d\d:\d\d/);
    });

    test('채팅 시간 표시를 켜면 → 채팅 줄 앞에 시:분이 보임 @game', async ({ user, table }) => {
        const t = await solo({ user, table });
        await openSettings(user.page);
        await panel(user.page).getByRole('checkbox', { name: '채팅 시간 표시' }).click();
        await closeSettings(user.page);
        const text = c.uniq('시간있음');
        await c.botSay(t, 1, text);
        const row = c.chatLog(user.page).getByRole('listitem').filter({ hasText: text });
        await expect(row).toContainText(/^\d\d:\d\d/);
    });

    test('시간 표시를 켜면 → 이미 있던 줄에도 시각이 붙음 @game', async ({ user, table }) => {
        const t = await solo({ user, table });
        const text = c.uniq('먼저');
        await c.botSay(t, 1, text);
        await c.expectLine(user.page, t.bots[1].nickname, text);
        await openSettings(user.page);
        await panel(user.page).getByRole('checkbox', { name: '채팅 시간 표시' }).click();
        await closeSettings(user.page);
        await expect(c.chatLog(user.page).getByRole('listitem').filter({ hasText: text })).toContainText(/\d\d:\d\d/);
    });

    test('닉네임 색상 표시를 끄면 → 두 봇 줄 글자색이 같아짐 @game', async ({ user, table }) => {
        const t = await solo({ user, table });
        const a = c.uniq('봇하나'); const b = c.uniq('봇둘');
        await c.botSay(t, 1, a);
        await c.botSay(t, 2, b);
        await c.expectLine(user.page, t.bots[2].nickname, b);
        await openSettings(user.page);
        await panel(user.page).getByRole('checkbox', { name: '닉네임 색상 표시' }).click();
        await closeSettings(user.page);
        expect(await c.lineColor(user.page, a)).toBe(await c.lineColor(user.page, b));
    });

    test('채팅 글자 크기를 0으로 내리면 → 채팅 줄 글자가 작아짐 @game', async ({ user, table }) => {
        const t = await solo({ user, table });
        const text = c.uniq('크기');
        await c.botSay(t, 1, text);
        const row = c.chatLog(user.page).getByRole('listitem').filter({ hasText: text });
        await expect(row).toBeVisible();
        const before = await row.locator('span').last().evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
        await openSettings(user.page);
        const slider = panel(user.page).getByRole('slider', { name: '채팅 글자 크기' });
        await slider.focus();
        await user.page.keyboard.press('Home');
        await expect(slider).toHaveValue('0');
        await closeSettings(user.page);
        await expect.poll(() => row.locator('span').last().evaluate((el) => parseFloat(getComputedStyle(el).fontSize))).toBeLessThan(before);
    });

    test('시간 표시를 켜고 새로고침하면 → 켜진 값이 남아 있음 @game', async ({ user, table }) => {
        await solo({ user, table });
        await openSettings(user.page);
        await panel(user.page).getByRole('checkbox', { name: '채팅 시간 표시' }).click();
        await closeSettings(user.page);
        await user.page.reload();
        await c.readyToChat(user.page);
        await openSettings(user.page);
        await expect(panel(user.page).getByRole('checkbox', { name: '채팅 시간 표시' })).toBeChecked();
    });
});

test.describe('타이머 위치·방 코드', () => {
    test('처음엔 → 타이머가 채팅 틀 안에 있음 @game', async ({ user, table }) => {
        await solo({ user, table });
        await expect(user.page.getByRole('complementary', { name: '채팅' }).getByRole('timer')).toBeVisible();
    });

    test('타이머 위치 전환을 누르면 → 버튼 이름이 "현재 시간바 확대"로 바뀜 @game', async ({ user, table }) => {
        await solo({ user, table });
        await openSettings(user.page);
        await panel(user.page).getByRole('button', { name: /타이머 위치 전환/ }).click();
        await expect(panel(user.page).getByRole('button', { name: '타이머 위치 전환, 현재 시간바 확대' })).toBeVisible();
    });

    test('타이머를 시간바로 옮기면 → 채팅 틀 안 타이머가 사라짐 @game', async ({ user, table }) => {
        await solo({ user, table });
        await openSettings(user.page);
        await panel(user.page).getByRole('button', { name: /타이머 위치 전환/ }).click();
        await closeSettings(user.page);
        await expect(user.page.getByRole('complementary', { name: '채팅' }).getByRole('timer')).toHaveCount(0);
    });

    test('타이머 위치 전환을 두 번 누르면 → 다시 채팅 틀 안으로 돌아옴 @game', async ({ user, table }) => {
        await solo({ user, table });
        await openSettings(user.page);
        const btn = panel(user.page).getByRole('button', { name: /타이머 위치 전환/ });
        await btn.click();
        await btn.click();
        await expect(panel(user.page).getByRole('button', { name: '타이머 위치 전환, 현재 채팅 프레임 안' })).toBeVisible();
    });

    test('방 코드 보기를 누르면 → 이 판 방 코드가 창에 보임 @game', async ({ user, table }) => {
        const t = await solo({ user, table });
        await openSettings(user.page);
        await panel(user.page).getByRole('button', { name: '방 코드 보기' }).click();
        const dialog = user.page.getByRole('dialog', { name: '방코드' });
        await expect(dialog).toBeVisible();
        await expect(dialog).toContainText(t.roomCode);
    });

    test('방 코드 창 닫기를 누르면 → 방 코드 창만 닫히고 설정 창은 남음 @game', async ({ user, table }) => {
        await solo({ user, table });
        await openSettings(user.page);
        await panel(user.page).getByRole('button', { name: '방 코드 보기' }).click();
        const dialog = user.page.getByRole('dialog', { name: '방코드' });
        await dialog.getByRole('button', { name: '방코드 팝업 닫기' }).click();
        await expect(dialog).toHaveCount(0);
        await expect(panel(user.page)).toBeVisible();
    });
});

test('닉네임 색상 표시를 끄고 새로고침하면 → 꺼진 값이 남아 있음 @game', async ({ user, table }) => {
    await solo({ user, table });
    await openSettings(user.page);
    await panel(user.page).getByRole('checkbox', { name: '닉네임 색상 표시' }).click();
    await closeSettings(user.page);
    await user.page.reload();
    await c.readyToChat(user.page);
    await openSettings(user.page);
    await expect(panel(user.page).getByRole('checkbox', { name: '닉네임 색상 표시' })).not.toBeChecked();
});

test('채팅 글자 크기 슬라이더를 움직이면 → 옆 숫자도 같이 바뀜 @game', async ({ user, table }) => {
    await solo({ user, table });
    await openSettings(user.page);
    const slider = panel(user.page).getByRole('slider', { name: '채팅 글자 크기' });
    await slider.focus();
    await user.page.keyboard.press('Home');
    await expect(panel(user.page).getByText('0', { exact: true })).toBeVisible();
});

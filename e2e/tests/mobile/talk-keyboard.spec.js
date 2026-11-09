// 모바일 카톡형 입력칸·키보드: 낮은 화면에서 입력하면 진행 바·초상 띠를 접어 채팅방 자리를 냄, 연출 창 동안 입력 잠금
const { test, expect } = require('../../helpers/fixtures');
const { talk, startTalkGame, toDay, toVote, clearOverlays, say } = require('./_talk');

// 키보드가 올라온 폰처럼 보이는 높이 (앱 기준 600px 아래면 접음)
const KEYBOARD_UP = { width: 375, height: 520 };

async function dayGame(table, user) {
    const t = await startTalkGame(table, user, { bots: 2 });
    t.playBots({ readyForVote: false, dayVote: 'skip', tribunal: 'skip', night: 'skip' });
    await toDay(t, user.page);
    return t;
}

test.describe('키보드 올라옴 (낮은 화면)', () => {
    test('키보드로 화면이 낮아진 채 입력칸을 누르면 → 초상 띠가 접혀 안 보임 @game', async ({ user, table }) => {
        await dayGame(table, user);
        await user.page.setViewportSize(KEYBOARD_UP);
        await talk.input(user.page).focus();
        await expect(talk.boardSlotArea(user.page)).toBeHidden();
        await expect(user.page.locator('[data-compact-typing]')).toHaveCount(1);
    });

    test('키보드로 접힌 동안 → 채팅방이 입력 전보다 커짐 @game', async ({ user, table }) => {
        await dayGame(table, user);
        await user.page.setViewportSize(KEYBOARD_UP);
        const before = (await talk.chat(user.page).boundingBox()).height;
        await talk.input(user.page).focus();
        await expect(talk.boardSlotArea(user.page)).toBeHidden();
        expect((await talk.chat(user.page).boundingBox()).height).toBeGreaterThan(before + 30);
    });

    test('진행 바를 펼쳐 둔 채 낮은 화면에서 입력하면 → 진행 바도 잠깐 접힘 @game', async ({ user, table }) => {
        await dayGame(table, user);
        await talk.phaseLine(user.page).click();
        await expect(talk.timebarSlot(user.page)).toBeVisible();
        await user.page.setViewportSize(KEYBOARD_UP);
        await talk.input(user.page).focus();
        await expect(talk.timebarSlot(user.page)).toBeHidden();
    });

    test('입력을 끝내 초점이 빠지면 → 접혔던 초상 띠·펼친 진행 바가 다시 보임 @game', async ({ user, table }) => {
        await dayGame(table, user);
        await talk.phaseLine(user.page).click();
        await user.page.setViewportSize(KEYBOARD_UP);
        await talk.input(user.page).focus();
        await expect(talk.boardSlotArea(user.page)).toBeHidden();
        await talk.input(user.page).blur();
        await expect(talk.boardSlotArea(user.page)).toBeVisible();
        await expect(talk.timebarSlot(user.page)).toBeVisible();
        await expect(user.page.locator('[data-compact-typing]')).toHaveCount(0);
    });

    test('키보드가 내려가 화면 높이가 돌아오면 → 초점이 있어도 초상 띠가 다시 보임 @game', async ({ user, table }) => {
        await dayGame(table, user);
        await user.page.setViewportSize(KEYBOARD_UP);
        await talk.input(user.page).focus();
        await expect(talk.boardSlotArea(user.page)).toBeHidden();
        await user.page.setViewportSize({ width: 375, height: 812 });
        await expect(talk.boardSlotArea(user.page)).toBeVisible();
    });

    test('키 큰 화면(812)에서 입력칸을 누르면 → 자리가 넉넉해서 초상 띠를 안 접음 @game', async ({ user, table }) => {
        await dayGame(table, user);
        await talk.input(user.page).focus();
        await expect(talk.input(user.page)).toBeFocused();
        await expect(talk.boardSlotArea(user.page)).toBeVisible();
        await expect(user.page.locator('[data-compact-typing]')).toHaveCount(0);
    });

    test('키보드로 접힌 동안에도 → 위 단계 줄·행동 줄·입력칸은 화면 안에 보임 @game', async ({ user, table }) => {
        await dayGame(table, user);
        await user.page.setViewportSize(KEYBOARD_UP);
        await talk.input(user.page).focus();
        await expect(talk.boardSlotArea(user.page)).toBeHidden();
        await expect(talk.phaseLine(user.page)).toBeInViewport();
        await expect(talk.actionRow(user.page)).toBeInViewport();
        await expect(talk.input(user.page)).toBeInViewport();
    });

    test('키보드로 접힌 채 말을 보내면 → 말풍선이 채팅방에 보이고 초점이 그대로라 계속 접혀 있음 @game', async ({ user, table }) => {
        await dayGame(table, user);
        await user.page.setViewportSize(KEYBOARD_UP);
        await talk.input(user.page).fill('접힌 채 보냄');
        await talk.send(user.page).click();
        await expect(talk.mine(user.page).filter({ hasText: '접힌 채 보냄' })).toBeInViewport();
        await expect(talk.boardSlotArea(user.page)).toBeHidden();
    });

});

test.describe('입력 잠금', () => {
    test('단계 전환 안내 창이 떠 있는 동안 → 입력칸 묶음이 잠겨(inert) 글을 못 씀 @game', async ({ user, table }) => {
        const t = await startTalkGame(table, user, { bots: 2 });
        await t.advanceUntil('DAY');
        await expect(user.page.getByRole('dialog', { name: '단계 전환 안내' })).toBeVisible({ timeout: 15000 });
        await expect(user.page.locator('[data-chat-composer]')).toHaveAttribute('inert', '');
    });

    test('입력 중에 단계 전환 안내 창이 뜨면 → 입력칸 초점이 빠져 키보드가 내려감 @game', async ({ user, table }) => {
        const t = await startTalkGame(table, user, { bots: 2 });
        await talk.input(user.page).focus();
        await expect(talk.input(user.page)).toBeFocused();
        await t.advanceUntil('DAY');
        await expect(user.page.getByRole('dialog', { name: '단계 전환 안내' })).toBeVisible({ timeout: 15000 });
        await expect(talk.input(user.page)).not.toBeFocused();
    });

    test('단계 전환 안내를 확인으로 닫으면 → 입력칸 잠금이 풀려 바로 말할 수 있음 @game', async ({ user, table }) => {
        const t = await startTalkGame(table, user, { bots: 2 });
        await t.advanceUntil('DAY');
        const dialog = user.page.getByRole('dialog', { name: '단계 전환 안내' });
        await expect(dialog).toBeVisible({ timeout: 15000 });
        await expect(dialog).toContainText('낮이 되었습니다');
        await dialog.getByRole('button', { name: '확인' }).click();
        await expect(user.page.locator('[data-chat-composer]')).not.toHaveAttribute('inert', '');
        await say(user.page, '잠금 풀린 말');
    });

    test('토론 중 쓰던 글은 → 낮 투표로 넘어가도 입력칸에 그대로 남음 @game', async ({ user, table }) => {
        const t = await dayGame(table, user);
        await talk.input(user.page).fill('쓰던 글');
        await toVote(t, user.page);
        await clearOverlays(user.page);
        await expect(talk.input(user.page)).toHaveValue('쓰던 글');
    });
});

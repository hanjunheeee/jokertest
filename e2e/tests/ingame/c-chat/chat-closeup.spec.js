// 채팅 크게 보기(클로즈업): 채팅 틀 빈 곳 누르기·키보드로 열기, 같은 내역·보내기, Esc·닫기 버튼·뒤 막으로 닫기, 재판 연출 뜨면 닫힘, 죽은 사람 표시
// 평소 채팅 입력 동작(빈 글·150자·Enter)도 여기서 확인
const { test, expect } = require('../../../helpers/fixtures');
const c = require('./_lib');

const closeup = (page) => page.getByRole('dialog', { name: '채팅 클로즈업' });

async function solo({ user, table, phase = 'DAY', bots = 3 }) {
    const t = await c.startGame(table, { humans: [user], bots, roles: ({ bots: b }) => ({ [user.account.uuid]: 'CITIZEN', [b[0].account.uuid]: 'JOKER' }) });
    await c.phaseTo(t, phase);
    await c.readyToChat(user.page);
    return t;
}
async function openByKeyboard(page) {
    await page.getByRole('button', { name: '채팅 크게 보기' }).focus();
    await page.keyboard.press('Enter');
    await expect(closeup(page)).toBeVisible();
}

test.describe('열기·닫기', () => {
    test('채팅 크게 보기 버튼에 Tab으로 가서 Enter → 클로즈업 창이 열림 @game', async ({ user, table }) => {
        await solo({ user, table });
        await openByKeyboard(user.page);
    });

    test('채팅 틀의 빈 곳(단계 글)을 누르면 → 클로즈업 창이 열림 @game', async ({ user, table }) => {
        await solo({ user, table });
        await user.page.getByRole('complementary', { name: '채팅' }).getByText(/\[낮-/).click();
        await expect(closeup(user.page)).toBeVisible();
    });

    test('채팅 입력칸을 누르면 → 클로즈업이 안 열리고 입력칸에 커서 @game', async ({ user, table }) => {
        await solo({ user, table });
        await c.chatBox(user.page).click();
        await c.sleep(400);
        await expect(closeup(user.page)).toHaveCount(0);
        await expect(c.chatBox(user.page)).toBeFocused();
    });

    test('클로즈업에서 Esc → 닫힘 @game', async ({ user, table }) => {
        await solo({ user, table });
        await openByKeyboard(user.page);
        await user.page.keyboard.press('Escape');
        await expect(closeup(user.page)).toHaveCount(0);
    });

    test('클로즈업 닫기 버튼 → 닫힘 @game', async ({ user, table }) => {
        await solo({ user, table });
        await openByKeyboard(user.page);
        await closeup(user.page).getByRole('button', { name: '채팅 클로즈업 닫기' }).click();
        await expect(closeup(user.page)).toHaveCount(0);
    });

    test('클로즈업 바깥 뒤 막을 누르면 → 닫힘 @game', async ({ user, table }) => {
        await solo({ user, table });
        await openByKeyboard(user.page);
        await user.page.mouse.click(10, 400);
        await expect(closeup(user.page)).toHaveCount(0);
    });

    test('클로즈업이 열린 채 재판이 시작되면 → 클로즈업이 닫히고 재판 창이 뜸 @game', async ({ user, table }) => {
        const t = await solo({ user, table, bots: 4 });
        await openByKeyboard(user.page);
        await c.replan(t, { dayVote: t.bots[1].account.uuid, tribunal: 'skip', night: 'skip', pollMs: 200 });
        await t.advanceUntil('TRIBUNAL', { stepDelayMs: 900 });
        await expect(user.page.getByRole('dialog', { name: '재판' })).toBeVisible({ timeout: 15000 });
        await expect(closeup(user.page)).toHaveCount(0);
    });
});

test.describe('클로즈업 안 채팅', () => {
    test('클로즈업을 열면 → 이미 있던 채팅 줄이 같이 보임 @game', async ({ user, table }) => {
        const t = await solo({ user, table });
        const text = c.uniq('이전줄');
        await c.botSay(t, 1, text);
        await c.expectLine(user.page, t.bots[1].nickname, text);
        await openByKeyboard(user.page);
        await expect(closeup(user.page).getByRole('log', { name: '채팅 내역' })).toContainText(c.line(t.bots[1].nickname, text));
    });

    test('클로즈업에서 보내면 → 봇이 받고 클로즈업 내역에 내 줄이 보임 @game', async ({ user, table }) => {
        const t = await solo({ user, table });
        await openByKeyboard(user.page);
        const box = closeup(user.page).getByRole('textbox', { name: '채팅 입력' });
        const text = c.uniq('크게보냄');
        await box.fill(text);
        await box.press('Enter');
        await expect(closeup(user.page).getByRole('log', { name: '채팅 내역' })).toContainText(c.line(user.account.nickname, text));
        await expect.poll(() => c.botGot(t, 1, 'day_chat_message_received', text)).toBe(true);
    });

    test('클로즈업이 열린 동안 온 채팅 → 클로즈업 내역에도 바로 보임 @game', async ({ user, table }) => {
        const t = await solo({ user, table });
        await openByKeyboard(user.page);
        const text = c.uniq('열린동안');
        await c.botSay(t, 1, text);
        await expect(closeup(user.page).getByRole('log', { name: '채팅 내역' })).toContainText(c.line(t.bots[1].nickname, text));
    });

    test('클로즈업 입력칸에 쓰던 글 → 닫으면 작은 채팅 입력칸에 그대로 남음 @game', async ({ user, table }) => {
        await solo({ user, table });
        await openByKeyboard(user.page);
        await closeup(user.page).getByRole('textbox', { name: '채팅 입력' }).fill('쓰다만글');
        await user.page.keyboard.press('Escape');
        await expect(c.chatBox(user.page)).toHaveValue('쓰다만글');
    });

    test('클로즈업에서 보내기 버튼을 눌러도 → 보내짐 @game', async ({ user, table }) => {
        const t = await solo({ user, table });
        await openByKeyboard(user.page);
        const text = c.uniq('크게버튼');
        await closeup(user.page).getByRole('textbox', { name: '채팅 입력' }).fill(text);
        await closeup(user.page).getByRole('button', { name: '채팅 보내기' }).click();
        await expect.poll(() => c.botGot(t, 1, 'day_chat_message_received', text)).toBe(true);
    });

    test('밤에 클로즈업을 열면 → 같은 직업 밤 채팅을 보내고 받음 @game', async ({ user, table }) => {
        const t = await solo({ user, table, phase: 'NIGHT' });
        await openByKeyboard(user.page);
        const text = c.uniq('밤크게');
        await closeup(user.page).getByRole('textbox', { name: '채팅 입력' }).fill(text);
        await closeup(user.page).getByRole('textbox', { name: '채팅 입력' }).press('Enter');
        await expect.poll(() => c.botGot(t, 1, 'joker_chat_message', text)).toBe(true);
    });

    test('클로즈업 안에도 → 단계 타이머가 보임 @game', async ({ user, table }) => {
        await solo({ user, table });
        await openByKeyboard(user.page);
        await expect(closeup(user.page).getByRole('timer')).toBeVisible();
    });

    test('죽은 뒤 클로즈업을 열면 → 클로즈업에도 "죽은 사람끼리" 표시가 보임 @game', async ({ user, table }) => {
        const t = await solo({ user, table, bots: 4 });
        await c.executeByBots(t, user.account.uuid);
        await c.readyToChat(user.page);
        await openByKeyboard(user.page);
        await expect(closeup(user.page).getByText('죽은 사람끼리', { exact: true })).toBeVisible();
    });

    test('죽은 뒤 클로즈업에서 보내면 → 죽은 사람 줄(DEAD)로 들어감 @game', async ({ user, table }) => {
        const t = await solo({ user, table, bots: 4 });
        await c.executeByBots(t, user.account.uuid);
        await c.readyToChat(user.page);
        await openByKeyboard(user.page);
        const text = c.uniq('죽은크게');
        await closeup(user.page).getByRole('textbox', { name: '채팅 입력' }).fill(text);
        await closeup(user.page).getByRole('textbox', { name: '채팅 입력' }).press('Enter');
        const row = closeup(user.page).getByRole('listitem').filter({ hasText: text });
        await expect(row).toHaveAttribute('data-chat-channel', 'DEAD');
    });
});

test.describe('낮 채팅 입력', () => {
    test('빈 글로 Enter → "메시지를 입력해주세요." 오류가 뜸 @game', async ({ user, table }) => {
        await solo({ user, table });
        await c.chatBox(user.page).fill('');
        await c.chatBox(user.page).press('Enter');
        await expect(user.page.getByRole('alert').filter({ hasText: '메시지를 입력해주세요.' })).toBeVisible();
    });

    test('151자를 보내면 → 150자 오류가 뜨고 글은 입력칸에 남음 @game', async ({ user, table }) => {
        await solo({ user, table });
        const long = '다'.repeat(151);
        await c.say(user.page, long, { expectCleared: false });
        await expect(user.page.getByRole('alert').filter({ hasText: '메시지는 150자 이하로 입력해주세요.' })).toBeVisible();
        await expect(c.chatBox(user.page)).toHaveValue(long);
    });

    test('오류가 난 뒤 바른 글을 보내면 → 오류 줄이 사라짐 @game', async ({ user, table }) => {
        await solo({ user, table });
        await c.chatBox(user.page).fill('');
        await c.chatBox(user.page).press('Enter');
        await expect(user.page.getByRole('alert').filter({ hasText: '메시지를 입력해주세요.' })).toBeVisible();
        await c.say(user.page, c.uniq('바른글'));
        await expect(user.page.getByRole('alert').filter({ hasText: '메시지를 입력해주세요.' })).toHaveCount(0);
    });

    test('보내면 → 입력칸이 비고 내 줄이 맨 아래에 붙음 @game', async ({ user, table }) => {
        const t = await solo({ user, table });
        await c.botSay(t, 1, c.uniq('먼저온말'));
        const text = c.uniq('내말');
        await c.say(user.page, text);
        await expect(c.chatLog(user.page).getByRole('listitem').last()).toHaveText(c.line(user.account.nickname, text));
    });

    test('봇이 0.5초 안에 낮 채팅을 두 번 보내면 → 두 번째는 거절되고 내 화면에 하나만 @game', async ({ user, table }) => {
        const t = await solo({ user, table });
        const a = c.uniq('빠른1'); const b = c.uniq('빠른2');
        expect((await c.botSay(t, 1, a))?.ok).toBe(true);
        expect((await c.botSay(t, 1, b))?.ok).toBe(false);
        await c.expectLine(user.page, t.bots[1].nickname, a);
        await c.expectNoText(user.page, b, { waitMs: 800 });
    });

    test('스크립트 글을 보내면 → 실행되지 않고 글자 그대로 보임 @game', async ({ user, table }) => {
        await solo({ user, table });
        let fired = false;
        user.page.on('dialog', (d) => { fired = true; d.dismiss().catch(() => {}); });
        const text = `<img src=x onerror=alert(1)>${c.uniq('')}`;
        await c.say(user.page, text);
        await c.expectLine(user.page, user.account.nickname, text);
        await c.sleep(500);
        expect(fired).toBe(false);
    });
});

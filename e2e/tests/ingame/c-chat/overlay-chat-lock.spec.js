// 덮개 창과 채팅: 단계 안내 창은 채팅 칸을 잠그고(inert) 확인하면 풀림, 밤 역할 안내·역할 보기 창은 뒤 막이 덮어 막음, 재판 연출 동안 채팅 자리 바뀜
// 죽은 사람은 밤 연출 대기 창이 안 덮음 (63300196 고친 것), 역할 공개 단계엔 채팅이 아무 데도 안 감
const { test, expect } = require('../../../helpers/fixtures');
const c = require('./_lib');

const inert = (page) => c.chatBox(page).evaluate((el) => Boolean(el.closest('[inert]')));
// 채팅 칸 가운데를 눌렀을 때 받는 게 채팅 칸인지 (덮개 창 뒤 막이 덮으면 false)
const chatTakesClick = (page) => c.chatBox(page).evaluate((el) => {
    const r = el.getBoundingClientRect();
    const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return Boolean(hit && el.contains(hit));
});

async function solo({ user, table, role = 'CITIZEN', bots = 3 }) {
    return c.startGame(table, { humans: [user], bots, roles: ({ bots: b }) => (role === 'JOKER' ? { [user.account.uuid]: 'JOKER' } : { [user.account.uuid]: role, [b[0].account.uuid]: 'JOKER' }) });
}

test('낮이 되어 "낮이 되었습니다" 창이 떠 있으면 → 채팅 칸이 잠겨 있음 @game', async ({ user, table }) => {
    const t = await solo({ user, table });
    await t.advanceUntil('DAY');
    const notice = user.page.getByRole('dialog', { name: '단계 전환 안내' });
    await expect(notice).toContainText('낮이 되었습니다', { timeout: 15000 });
    expect(await inert(user.page)).toBe(true);
});

test('"낮이 되었습니다" 창에서 확인을 누르면 → 채팅 칸이 풀려 보낼 수 있음 @game', async ({ user, table }) => {
    const t = await solo({ user, table });
    await t.advanceUntil('DAY');
    const notice = user.page.getByRole('dialog', { name: '단계 전환 안내' });
    await notice.getByRole('button', { name: '확인' }).click({ timeout: 15000 });
    await expect.poll(() => inert(user.page)).toBe(false);
    const text = c.uniq('확인뒤');
    await c.say(user.page, text);
    await expect.poll(() => c.botGot(t, 1, 'day_chat_message_received', text)).toBe(true);
});

test('단계 안내 창은 → Esc로도 닫힘 @game', async ({ user, table }) => {
    const t = await solo({ user, table });
    await t.advanceUntil('DAY');
    const notice = user.page.getByRole('dialog', { name: '단계 전환 안내' });
    await expect(notice).toBeVisible({ timeout: 15000 });
    await user.page.keyboard.press('Escape');
    await expect(notice).toHaveCount(0);
});

test('밤이 되면 → "밤이 되었습니다" 안내 뒤 "광대의 시간입니다" 밤 역할 안내가 시민에게도 뜸 @game', async ({ user, table }) => {
    const t = await solo({ user, table });
    await c.phaseTo(t, 'NIGHT');
    const notice = user.page.getByRole('dialog', { name: '단계 전환 안내' });
    await expect(notice).toContainText('밤이 되었습니다', { timeout: 15000 });
    await notice.getByRole('button', { name: '확인' }).click();
    await expect(user.page.getByRole('dialog', { name: '밤 역할 안내' })).toContainText('광대의 시간입니다', { timeout: 15000 });
});

// 밤 역할 안내·역할 공개 창은 화면을 inert로 안 잠그고 창 뒤 막이 덮어서 막는 게 처음부터 정한 동작임
// (b76fa84f useInGameOverlayStack "역할 공개 재열람이나 밤 역할 턴 안내는 아래 화면을 잠그지 않는다", 화면 단위 시험 useInGameOverlayStack.nightTurn.test.js가 고정)
test('밤 역할 안내 창이 떠 있으면 → 뒤 막이 채팅 칸을 덮어 못 누르고, 확인하면 누를 수 있음 @game', async ({ user, table }) => {
    const t = await solo({ user, table, role: 'JOKER' });
    await c.phaseTo(t, 'NIGHT');
    const notice = user.page.getByRole('dialog', { name: '단계 전환 안내' });
    await notice.getByRole('button', { name: '확인' }).click({ timeout: 15000 });
    const night = user.page.getByRole('dialog', { name: '밤 역할 안내' });
    await expect(night).toBeVisible({ timeout: 15000 });
    expect(await chatTakesClick(user.page)).toBe(false);
    await night.getByRole('button', { name: '확인' }).click();
    await expect(night).toHaveCount(0);
    await expect.poll(() => chatTakesClick(user.page)).toBe(true);
    expect(await inert(user.page)).toBe(false);
});

test('역할 공개 창이 떠 있는 동안 → 뒤 막이 채팅 칸을 덮어 못 누름 @game', async ({ user, table }) => {
    await table.setup({ humans: [user], bots: 1, roles: { [user.account.uuid]: 'JOKER' } });
    await expect(user.page.getByRole('dialog', { name: '내 역할 보기' })).toBeVisible({ timeout: 20000 });
    expect(await chatTakesClick(user.page)).toBe(false);
});

test('역할 공개 단계에서 채팅을 보내도 → 봇에게 안 감 (낮 채널 열리기 전) @game', async ({ user, table }) => {
    const t = await table.setup({ humans: [user], bots: 2, roles: { [user.account.uuid]: 'CITIZEN' } });
    await c.dismissOverlays(user.page);
    const text = c.uniq('공개중');
    await c.chatBox(user.page).fill(text);
    await c.chatBox(user.page).press('Enter');
    expect((await t.state()).phase).toBe('ROLE_REVEAL');
    await c.sleep(1200);
    expect(c.botGot(t, 0, 'day_chat_message_received', text)).toBe(false);
});

test('"내 역할 보기"를 다시 누르면 → 역할 창이 다시 열리고 확인으로 닫힘 @game', async ({ user, table }) => {
    const t = await solo({ user, table, role: 'JOKER' });
    await c.phaseTo(t, 'DAY');
    await c.readyToChat(user.page);
    await user.page.getByRole('button', { name: '내 역할 보기', exact: true }).click();
    const dialog = user.page.getByRole('dialog', { name: '내 역할 보기' });
    await expect(dialog).toContainText('광대');
    await dialog.getByRole('button', { name: '확인' }).click();
    await expect(dialog).toHaveCount(0);
});

test('재판 연출이 뜨면 → 바깥 채팅 틀이 숨고 재판 창 안 채팅만 보임 @game', async ({ user, table }) => {
    const t = await solo({ user, table, bots: 4 });
    await c.phaseTo(t, 'DAY');
    await c.replan(t, (bot) => ({ dayVote: bot === t.bots[1] ? 'abstain' : t.bots[1].account.uuid, tribunal: 'skip', night: 'skip', pollMs: 200 }));
    await t.advanceUntil('TRIBUNAL', { stepDelayMs: 900 });
    await expect(user.page.getByRole('dialog', { name: '재판' })).toBeVisible({ timeout: 15000 });
    await expect(user.page.getByRole('complementary', { name: '채팅' })).toHaveCount(0);
    await c.readyToChat(user.page);
    await expect(c.chatBox(user.page)).toHaveCount(1);
});

test('재판 중 한 말은 → 재판이 끝나고 채팅 틀이 돌아와도 그대로 보임 @game', async ({ user, table }) => {
    const t = await solo({ user, table, bots: 4 });
    await c.phaseTo(t, 'DAY');
    await c.replan(t, (bot) => ({ dayVote: bot === t.bots[1] ? 'abstain' : t.bots[1].account.uuid, tribunal: 'NOT_GUILTY', night: 'skip', pollMs: 200 }));
    await t.advanceUntil('TRIBUNAL', { stepDelayMs: 900 });
    const text = c.uniq('재판말');
    await c.say(user.page, text);
    await t.advanceUntil((s) => s.phase !== 'TRIBUNAL', { stepDelayMs: 900 });
    await t.stopBots();
    // 무죄 → 밤: 낮 대화는 다음 낮에 다시 보임
    await c.phaseTo(t, 'DAY');
    await c.readyToChat(user.page);
    await expect(user.page.getByRole('complementary', { name: '채팅' })).toBeVisible();
    await c.expectLine(user.page, user.account.nickname, text);
});

test('죽은 나는 밤에 다른 사람이 암살돼도 → "진행을 기다리는 중입니다" 대기 창이 안 덮고 채팅이 됨 @game', async ({ user, table }) => {
    const t = await solo({ user, table, bots: 5 });
    await c.phaseTo(t, 'DAY');
    await c.executeByBots(t, user.account.uuid);
    const victim = t.bots[2].account.uuid;
    await c.replan(t, (bot, i) => ({ dayVote: 'abstain', tribunal: 'skip', night: i === 0 ? victim : 'skip', pollMs: 200 }));
    await t.advanceUntil((s) => c.isDead(s, victim) || (s.phase === 'NIGHT' && s.nightTurnRole !== 'JOKER'), { stepDelayMs: 600, maxSteps: 30 });
    const text = c.uniq('대기중죽은말');
    await c.say(user.page, text);
    expect(await c.lineChannel(user.page, text)).toBe('DEAD');
    await expect(user.page.getByText('진행을 기다리는 중입니다.')).toHaveCount(0);
});

test('봇이 처형되면 → 산 나에게 추방 연출 뒤 채팅 칸이 다시 풀림 @game', async ({ user, table }) => {
    const t = await solo({ user, table, bots: 4 });
    await c.phaseTo(t, 'DAY');
    await c.executeByBots(t, t.bots[1].account.uuid);
    await c.readyToChat(user.page, { timeoutMs: 30000 });
    expect(await inert(user.page)).toBe(false);
});

'use strict';

// 이모티콘 브라우저 시험 (PC) — 내 카드 우클릭 팔레트·말풍선 3초·1초 간격(진짜 시간)·죽은 사람·역할 확인·밤·재판·결과 화면·팔레트 칸·키보드
// 목록 A06-판중-채팅.md 번호 A06-E-088~100 (밤·재판 칸은 사용자 결정 "이모티콘은 낮에만"대로 "안 나감"으로 씀 — 모음 글 C-036)
const { test, expect, ui, E2E } = require('../../helpers/fixtures');
const { expectReadable } = require('../../helpers/visible');
const a = require('./a-day/_lib');
const c = require('./c-chat/_lib');
const n = require('./b-night/_night');
const k = require('./_a06-simple-kit');
const { waitResult } = require('../room/roomHelpers');

const EMOJI_EVT = 'emoji_shown';
// 기본 팔레트 8칸 (새 계정은 기본 이모티콘 8개가 다 들어 있음)
const DEFAULT_SLOTS = [
    'emoji-basic-reject', 'emoji-basic-tears', 'emoji-basic-anger', 'emoji-basic-love',
    'emoji-basic-grin', 'emoji-basic-hello', 'emoji-basic-surrender', 'emoji-basic-dizzy',
];
// 말풍선은 글이 없는 그림이고 눌림을 안 받는 칸 → 보임·크기·화면 안만 봄
const BUBBLE_READABLE = Object.freeze({ contrast: false, uncovered: false });

const palette = (page) => page.getByRole('group', { name: '이모티콘 팔레트' });
const slot = (page, name) => palette(page).getByRole('button', { name: `${name} 보내기`, exact: true });
// 판 카드(누르는 칸) 위 말풍선
const bubbleOn = (page, nickname) => n.cardButton(page, nickname).locator('[data-ingame-emoji-bubble]');
// 봇이 받은 그 사람 이모티콘 알림들
const emojiFrom = (bot, uuid) => bot.events.filter((r) => r.event === EMOJI_EVT && r.payload?.uuid === uuid);
const botEmoji = (t, botIndex, itemId) => t.bots[botIndex].request('send_emoji', { gameId: t.gameId, itemId });

// 자동 구성 판: 사람 시민, 봇 0 광대 (6명부터 봇 1 의사, 8명부터 봇 2 경비원) → 첫 낮 토론, 덮개 창 닫힘
async function dayTable(table, user, size) {
    const botRoles = ['JOKER'];
    if (size >= 6) botRoles.push('DOCTOR');
    if (size >= 8) botRoles.push('GUARD');
    const t = await k.deal(table, user, { bots: size - 1, me: 'CITIZEN', botRoles });
    await a.toDay(t);
    await c.readyToChat(user.page);
    return t;
}

// 내 카드 우클릭 → 팔레트
async function openPalette(page, nickname) {
    await n.cardButton(page, nickname).click({ button: 'right' });
    await expect(palette(page)).toBeVisible();
}

// 내 카드 우클릭 해 보고, 팔레트에 그 칸이 뜨면 누름 (막혀서 안 뜨면 아무것도 안 함) → 눌렀는지
async function tryEmoji(page, nickname, name) {
    await n.cardButton(page, nickname).click({ button: 'right', timeout: 5000 }).catch(() => {});
    const button = slot(page, name);
    if (!(await button.isVisible().catch(() => false))) return false;
    await button.click({ timeout: 5000 }).catch(() => {});
    return true;
}

// 팔레트 칸 바꾸기 (판 시작 전에 해야 그 판에 실림) → 바꾸기 전 팔레트 값
async function savePalette(context, slots) {
    const headers = { origin: E2E.desktopUrl };
    const current = await (await context.request.get(`${E2E.apiUrl}/user/me/emoji-palette`, { headers })).json();
    const saved = await context.request.put(`${E2E.apiUrl}/user/me/emoji-palette`, { headers, data: { slots, expectedRevision: current.revision } });
    expect(saved.ok(), '팔레트 저장').toBe(true);
    return current;
}

test('A06-E-088 낮 이모티콘 (5명 판) → 내 카드 우클릭 → 칸: 봇이 emoji_shown을 받고 내 카드 말풍선이 보임 @game @smoke', async ({ user, table }) => {
    const t = await dayTable(table, user, 5);
    const page = user.page;
    const me = user.account;
    await openPalette(page, me.nickname);
    await slot(page, '사랑').click();

    // 말풍선은 3초만 떠 있어서 먼저 봄
    const bubble = bubbleOn(page, me.nickname);
    await expect(bubble).toHaveAttribute('data-ingame-emoji-bubble', 'emoji-basic-love');
    await expectReadable(bubble, BUBBLE_READABLE);
    await expect.poll(
        () => t.bots.filter((b) => emojiFrom(b, me.uuid).some((r) => r.payload.itemId === 'emoji-basic-love')).length,
        { message: '이모티콘 알림을 받은 봇 수' },
    ).toBe(t.bots.length);
});

test('A06-E-089 봇 이모티콘 (5명 판) → 봇이 보내면 그 봇 카드 위에 말풍선 @game', async ({ user, table }) => {
    const t = await dayTable(table, user, 5);
    const page = user.page;
    expect((await botEmoji(t, 1, 'emoji-basic-grin'))?.ok, '봇 이모티콘').toBe(true);
    await expect(bubbleOn(page, t.bots[1].nickname)).toHaveAttribute('data-ingame-emoji-bubble', 'emoji-basic-grin');
    // 다른 카드엔 없음
    await expect(bubbleOn(page, user.account.nickname)).toHaveCount(0);
    await expect(bubbleOn(page, t.bots[2].nickname)).toHaveCount(0);
});

test('A06-E-090 말풍선 3초 뒤 사라짐 (5명 판) → 뜬 뒤 3초쯤(±1.5초)에 없어짐 [지금 동작] @game @realtime', async ({ user, table }) => {
    const t = await dayTable(table, user, 5);
    const page = user.page;
    const bubble = bubbleOn(page, t.bots[1].nickname);
    expect((await botEmoji(t, 1, 'emoji-basic-hello'))?.ok, '봇 이모티콘').toBe(true);
    await expect(bubble).toBeVisible();
    const shownAt = Date.now();
    // 진짜 시간으로 기다림: 4.5초 안에 사라지고, 1.5초 전에는 안 사라짐
    await expect(bubble).toHaveCount(0, { timeout: 4500 });
    const lasted = Date.now() - shownAt;
    expect(lasted, '말풍선이 떠 있던 시간(ms)').toBeGreaterThanOrEqual(1500);
    expect(lasted, '말풍선이 떠 있던 시간(ms)').toBeLessThanOrEqual(4500);
});

test('A06-E-091 죽은 사람 이모티콘은 아무 데도 안 뜸 (8명 판) → 처형된 사람이 보내려 해도 봇이 받은 emoji_shown 0, 판에 내 말풍선 없음 @game', async ({ user, table }) => {
    test.setTimeout(240_000);
    const t = await k.deal(table, user, { bots: 7, me: 'CITIZEN', botRoles: ['JOKER', 'DOCTOR', 'GUARD'] });
    const page = user.page;
    const me = user.account;
    await a.toDay(t);
    await k.execute(t, me.uuid);
    // 낮에 해 봄 (밤은 산 사람도 못 보내는 때라 죽은 사람 규칙만 따로 보려고)
    await c.phaseTo(t, 'DAY');
    await c.readyToChat(page, { timeoutMs: 60_000 });

    await tryEmoji(page, me.nickname, '사랑');
    // 그 뒤에 산 봇이 보낸 이모티콘이 화면에 뜸 → 내 것이 나갔다면 그보다 먼저 떴음
    expect((await botEmoji(t, 3, 'emoji-basic-grin'))?.ok, '산 봇 이모티콘').toBe(true);
    await expect(bubbleOn(page, t.bots[3].nickname)).toHaveAttribute('data-ingame-emoji-bubble', 'emoji-basic-grin');
    await expect(bubbleOn(page, me.nickname)).toHaveCount(0);

    // 그 뒤에 내가 보낸 죽은 사람 채팅이 돌아옴 → 내 이모티콘 요청은 그 앞에 서버가 다 처리함
    const marker = c.uniq('뒤글');
    await c.say(page, marker);
    await c.expectLine(page, me.nickname, marker);
    await k.settleBots(t);
    expect(t.bots.filter((b) => emojiFrom(b, me.uuid).length > 0).length, '내 이모티콘을 받은 봇 수').toBe(0);
});

// 이모티콘 1초 간격 (값 2) — 간격 규칙이라 진짜 시간으로 쉼
const EMOJI_GAPS = [
    ['A06-E-092', '1초 안 두 번', 500, 1],
    ['A06-E-093', '1.1초 간격 두 번', 1100, 2],
];
for (const [id, label, gapMs, expectedCount] of EMOJI_GAPS) {
    test(`${id} ${label} (6명 판) → ${gapMs / 1000}초 간격 두 번: 봇이 ${expectedCount}번 받음 @game @realtime`, async ({ user, table }) => {
        const t = await dayTable(table, user, 6);
        const page = user.page;
        const me = user.account;
        await openPalette(page, me.nickname);
        await slot(page, '사랑').click();
        const sentAt = Date.now();
        // 둘째 것은 팔레트를 미리 열어 두고 때맞춰 누름
        await openPalette(page, me.nickname);
        await c.sleep(Math.max(0, gapMs - (Date.now() - sentAt)));
        await slot(page, '안녕').click();
        const gap = Date.now() - sentAt;
        if (gapMs < 1000) expect(gap, '실제 간격(ms)').toBeLessThan(900);
        else expect(gap, '실제 간격(ms)').toBeGreaterThanOrEqual(gapMs);

        // 그 뒤에 내가 보낸 채팅이 돌아옴 → 이모티콘 두 번은 그 앞에 서버가 다 처리함
        const marker = c.uniq('뒤글');
        await c.say(page, marker);
        await c.expectLine(page, me.nickname, marker);
        await k.settleBots(t);
        for (const bot of t.bots) expect(emojiFrom(bot, me.uuid).length, `${bot.nickname}가 받은 수`).toBe(expectedCount);
    });
}

test('A06-E-094 역할 확인 중 이모티콘 (6명 판) → 역할 확인 10초 동안 보낸 이모티콘을 봇이 받음 @game', async ({ user, table }) => {
    const t = await k.deal(table, user, { bots: 5, me: 'CITIZEN', botRoles: ['JOKER', 'DOCTOR'] });
    const page = user.page;
    const me = user.account;
    await ui.readRoleReveal(page);
    await openPalette(page, me.nickname);
    await slot(page, '사랑').click();
    // 10초가 지나 낮이 돼 버렸으면 이 케이스를 본 게 아님
    expect((await t.state()).phase, '아직 역할 확인 단계').toBe('ROLE_REVEAL');
    await expect.poll(
        () => t.bots.filter((b) => emojiFrom(b, me.uuid).length === 1).length,
        { message: '이모티콘 알림을 받은 봇 수' },
    ).toBe(t.bots.length);
});

test('A06-E-095 밤 이모티콘 (7명 판) → 밤에 산 사람이 보내려 해도 봇이 받은 emoji_shown 0 (결정: 이모티콘은 낮에만) @game', async ({ user, table }) => {
    // 사람은 의사 (밤에 직업 채팅을 쓸 수 있어 "요청이 다 처리됐다"는 표시로 씀)
    const t = await k.deal(table, user, { bots: 6, me: 'DOCTOR', botRoles: ['JOKER'] });
    const page = user.page;
    const me = user.account;
    await a.toDay(t);
    await k.intoNight(t, page);
    await c.readyToChat(page);

    await tryEmoji(page, me.nickname, '사랑');
    // 그 뒤에 내가 보낸 밤 채팅이 돌아옴 → 이모티콘 요청은 그 앞에 서버가 다 처리함
    const marker = c.uniq('뒤글');
    await c.say(page, marker);
    await c.expectLine(page, me.nickname, marker);
    await expect(bubbleOn(page, me.nickname)).toHaveCount(0);
    await k.settleBots(t);
    expect(t.bots.filter((b) => emojiFrom(b, me.uuid).length > 0).length, '내 이모티콘을 받은 봇 수').toBe(0);
    expect((await t.state()).phase, '밤').toBe('NIGHT');
});

test('A06-E-096 재판 중 이모티콘 (7명 판) → 재판 중에 보내려 해도 봇이 받은 emoji_shown 0 (결정: 이모티콘은 낮에만) @game', async ({ user, table }) => {
    const t = await k.deal(table, user, { bots: 6, me: 'CITIZEN', botRoles: ['JOKER', 'DOCTOR'] });
    const page = user.page;
    const me = user.account;
    await a.toDay(t);
    await k.openTribunal(t, k.uid(t.bots[5]));
    await expect(k.tribunalDialog(page)).toBeVisible({ timeout: 30_000 });
    await c.readyToChat(page);

    // 재판 창이 판을 덮고 있음 → 사람이 하는 대로 내 카드 자리를 우클릭, 팔레트가 뜨면 칸도 누름
    const cardBox = await n.cardButton(page, me.nickname).boundingBox();
    if (cardBox) await page.mouse.click(cardBox.x + cardBox.width / 2, cardBox.y + cardBox.height / 2, { button: 'right' });
    const love = slot(page, '사랑');
    if (await love.isVisible().catch(() => false)) await love.click({ timeout: 5000 }).catch(() => {});

    // 그 뒤에 내가 보낸 재판 창 채팅이 돌아옴 → 이모티콘 요청은 그 앞에 서버가 다 처리함
    const marker = c.uniq('뒤글');
    await c.say(page, marker);
    await expect(k.logIn(k.tribunalChat(page))).toContainText(c.line(me.nickname, marker));
    await k.settleBots(t);
    expect(t.bots.filter((b) => emojiFrom(b, me.uuid).length > 0).length, '내 이모티콘을 받은 봇 수').toBe(0);
    expect((await t.state()).phase, '재판 중').toBe('TRIBUNAL');
});

test('A06-E-097 결과 화면 이모티콘 안 됨 (5명 판) → 결과 화면에서 보내려 해도 팔레트가 안 뜨고 받은 봇 0 @game', async ({ user, table }) => {
    const t = await dayTable(table, user, 5);
    const page = user.page;
    const me = user.account;
    // 광대 봇을 처형 → 시민 승으로 판 끝
    const end = await k.execute(t, k.uid(t.bots[0]));
    expect(end.phase, '판 끝').toBe('ENDED');
    const list = await waitResult(page);

    // 결과 화면의 내 줄을 우클릭 (판 카드가 없어 누를 곳이 여기뿐)
    await list.getByRole('listitem').filter({ hasText: me.nickname }).first().click({ button: 'right' });
    await expect(palette(page)).toHaveCount(0);
    await k.settleBots(t);
    expect(t.bots.filter((b) => emojiFrom(b, me.uuid).length > 0).length, '내 이모티콘을 받은 봇 수').toBe(0);
});

test('A06-E-098 팔레트엔 넣어 둔 것만 (5명 판) → 가졌지만 팔레트에서 뺀 이모티콘은 팔레트 칸에 없음 @game', async ({ user, table }) => {
    // 판 시작 전에 첫 칸(거절)을 비움 — 가진 것에는 그대로 있음
    const before = await savePalette(user.context, [null, ...DEFAULT_SLOTS.slice(1)]);
    expect(before.owned, '가진 이모티콘').toContain('emoji-basic-reject');

    await dayTable(table, user, 5);
    const page = user.page;
    await openPalette(page, user.account.nickname);
    // 넣어 둔 칸이 그려진 뒤에 봄
    await expect(slot(page, '사랑')).toBeVisible();
    await expect(slot(page, '거절')).toHaveCount(0);
    await expect(palette(page).getByRole('button', { name: '1번 칸 비어 있음' })).toBeDisabled();
    await expect(palette(page).getByRole('button', { name: /보내기$/ })).toHaveCount(7);
});

test('A06-E-099 남 카드 우클릭 (5명 판) → 봇 카드를 우클릭하면 팔레트가 안 뜸 [지금 동작] @game', async ({ user, table }) => {
    const t = await dayTable(table, user, 5);
    const page = user.page;
    await n.cardButton(page, t.bots[1].nickname).click({ button: 'right' });
    await expect(palette(page)).toHaveCount(0);
    // 같은 때 내 카드는 팔레트가 뜸 (팔레트가 뜰 수 있는 때였다는 표시)
    await openPalette(page, user.account.nickname);
});

test('A06-E-100 키보드로 이모티콘 (5명 판) → Tab으로 내 카드 → 메뉴 키로 팔레트 → Enter: 봇이 받음 [지금 동작] @game', async ({ user, table }) => {
    const t = await dayTable(table, user, 5);
    const page = user.page;
    const me = user.account;
    const card = n.cardButton(page, me.nickname);

    // Tab만 눌러 내 카드까지
    let reached = false;
    for (let i = 0; i < 80 && !reached; i += 1) {
        await page.keyboard.press('Tab');
        reached = await card.evaluate((el) => el === document.activeElement);
    }
    expect(reached, 'Tab으로 내 카드에 초점').toBe(true);

    // 메뉴 키(없는 키보드는 Shift+F10) = 초점 있는 곳의 우클릭
    await page.keyboard.press('ContextMenu');
    if (!(await palette(page).isVisible().catch(() => false))) await page.keyboard.press('Shift+F10');
    await expect(palette(page)).toBeVisible();

    // Tab으로 팔레트 칸에 가서 Enter
    await page.keyboard.press('Tab');
    const focused = palette(page).locator('button:focus');
    await expect(focused).toHaveCount(1);
    await expect(focused).toHaveAccessibleName(/보내기$/);
    await page.keyboard.press('Enter');
    await expect.poll(
        () => t.bots.filter((b) => emojiFrom(b, me.uuid).length === 1).length,
        { message: '이모티콘 알림을 받은 봇 수' },
    ).toBe(t.bots.length);
});

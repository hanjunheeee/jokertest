'use strict';

// 채팅 새로고침·새 탭 브라우저 시험 (PC) — 새로고침 뒤 낮 말이 다시 보임, 밤 시민 닫힘·밤 의사 채팅·죽은 사람 표시가 그대로, 같은 계정 새 탭으로 옮기면 옛 탭 글은 안 감
// 목록 A06-판중-채팅.md 번호 A06-E-108~112
const { test, expect } = require('../../helpers/fixtures');
const { expectReadable } = require('../../helpers/visible');
const { customRoleSettings } = require('../../helpers/game');
const a = require('./a-day/_lib');
const c = require('./c-chat/_lib');
const k = require('./_a06-simple-kit');

// 자동 구성 판: 사람 시민, 봇 0 광대 (6명부터 봇 1 의사, 8명부터 봇 2 경비원) → 첫 낮 토론
async function dayTable(table, user, size) {
    const botRoles = ['JOKER'];
    if (size >= 6) botRoles.push('DOCTOR');
    if (size >= 8) botRoles.push('GUARD');
    const t = await k.deal(table, user, { bots: size - 1, me: 'CITIZEN', botRoles });
    await a.toDay(t);
    return t;
}

test('A06-E-108 새로고침 뒤 낮 말 다시 보임 (5명 판) → 낮 3줄 뒤 새로고침해도 3줄이 보임 @game @smoke', async ({ user, table }) => {
    const t = await dayTable(table, user, 5);
    const page = user.page;
    const me = user.account;
    const mine = c.uniq('사람낮말');
    const botA = c.uniq('봇낮말');
    const botB = c.uniq('봇낮말');
    await c.say(page, mine);
    await k.botSayOk(t, 1, botA);
    await k.botSayOk(t, 2, botB);
    await c.expectLine(page, t.bots[2].nickname, botB);
    await expect(c.chatLog(page).getByRole('listitem')).toHaveCount(3);

    await page.reload();
    await c.readyToChat(page);
    await c.expectLine(page, me.nickname, mine);
    await c.expectLine(page, t.bots[1].nickname, botA);
    await c.expectLine(page, t.bots[2].nickname, botB);
    await expect(c.chatLog(page).getByRole('listitem')).toHaveCount(3);
});

test('A06-E-109 새로고침 뒤 밤 시민 닫힘 그대로 (6명 판) → 밤에 시민이 새로고침해도 까닭 글이 보이고 입력칸 없음 @game', async ({ user, table }) => {
    const t = await dayTable(table, user, 6);
    const page = user.page;
    await c.phaseTo(t, 'NIGHT');
    await k.readableOnceClear(page, k.closedNote(page));

    await page.reload();
    await k.readableOnceClear(page, k.closedNote(page));
    await expect(k.closedNote(page)).toHaveText(k.CLOSED_TEXT);
    await expect(c.chatBox(page)).toHaveCount(0);
    expect((await t.state()).phase, '아직 밤').toBe('NIGHT');
});

test('A06-E-110 새로고침 뒤 밤 의사 말함 (6명 판) → 밤에 의사가 새로고침한 뒤 보낸 글을 의사 봇이 받음 @game', async ({ user, table }) => {
    // 6명 판 직접 구성 의사 2: 사람 의사, 봇 0 광대, 봇 1 의사
    const t = await k.deal(table, user, {
        bots: 5, me: 'DOCTOR', botRoles: ['JOKER', 'DOCTOR'], settings: customRoleSettings({ JOKER: 1, DOCTOR: 2 }),
    });
    const page = user.page;
    const mate = t.bots[1];
    await a.toDay(t);
    await k.intoNight(t, page);

    await page.reload();
    const text = c.uniq('새로고침뒤');
    await c.say(page, text);
    await expect.poll(() => k.heard(mate, k.ROLE_EVT, text), { message: '의사 봇이 받음' }).toBe(true);
    await k.settleBots(t);
    expect(k.whoSaw(t.bots.filter((b) => b !== mate), text), '다른 봇이 받음').toEqual([]);
    expect((await t.state()).phase, '아직 밤').toBe('NIGHT');
});

test('A06-E-111 새로고침 뒤 죽은 사람 표시 그대로 (8명 판) → 죽은 사람이 새로고침해도 "죽은 사람끼리"가 보임 @game', async ({ user, table }) => {
    test.setTimeout(240_000);
    const t = await dayTable(table, user, 8);
    const page = user.page;
    await k.execute(t, user.account.uuid);
    await c.readyToChat(page, { timeoutMs: 60_000 });
    await expectReadable(c.deadBadge(page), k.BADGE_READABLE);

    await page.reload();
    await c.readyToChat(page, { timeoutMs: 60_000 });
    await expectReadable(c.deadBadge(page), k.BADGE_READABLE);
    await expect(c.chatBox(page)).toBeEditable();
});

test('A06-E-112 같은 계정 새 탭으로 옮김 (6명 판) → 새 탭에서 보낸 글은 봇이 받고, 옛 탭에서 보낸 글은 받은 봇 0 @game', async ({ user, table }) => {
    const t = await dayTable(table, user, 6);
    const page = user.page;
    await c.readyToChat(page);
    // 옛 탭은 밀려날 때 알림 창을 띄움 → 받아 닫고 글을 적어 둠
    const alerts = [];
    page.on('dialog', (dialog) => {
        alerts.push(dialog.message());
        dialog.accept().catch(() => {});
    });

    // 같은 브라우저(같은 쿠키) 새 탭에서 판 화면을 엶 → 판이 새 탭으로 이어짐
    const tab = await user.context.newPage();
    tab.on('dialog', (dialog) => dialog.accept().catch(() => {}));
    await tab.goto('/ingame');
    const fresh = c.uniq('새탭글');
    await c.say(tab, fresh);
    await expect.poll(() => t.bots.filter((b) => k.heard(b, k.DAY_EVT, fresh)).length, { message: '새 탭 글을 받은 봇 수' }).toBe(t.bots.length);

    // 옛 탭이 밀려난 걸 안 뒤 옛 탭에서 보냄
    await expect.poll(() => alerts.length, { message: '옛 탭에 뜬 알림 수', timeout: 20_000 }).toBeGreaterThan(0);
    const stale = c.uniq('옛탭글');
    await c.chatBox(page).fill(stale);
    await c.chatBox(page).press('Enter');

    // 옛 탭은 연결이 끊겨 아무것도 안 나감 → 새 탭 글이 한 번 더 오간 뒤에도 옛 탭 글은 어느 봇에도 없음
    const marker = c.uniq('새탭뒤글');
    await c.say(tab, marker);
    await expect.poll(() => t.bots.filter((b) => k.heard(b, k.DAY_EVT, marker)).length, { message: '새 탭 뒤 글을 받은 봇 수' }).toBe(t.bots.length);
    await k.settleBots(t);
    expect(k.whoSaw(t.bots, stale), '옛 탭 글을 받은 봇').toEqual([]);
});

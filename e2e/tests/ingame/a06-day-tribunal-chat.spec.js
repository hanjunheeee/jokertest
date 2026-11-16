'use strict';

// 낮·재판 창 채팅 브라우저 시험 (PC) — 낮 토론·투표 중 채팅, 재판 창 "최후의 반론" 채팅, 처형·무죄 뒤 채팅 칸, 역할 확인·결과 화면, 크게 보기 창, 새 글 스크롤
// 목록 A06-판중-채팅.md 번호 A06-E-055~070
const { test, expect } = require('../../helpers/fixtures');
const { expectReadable } = require('../../helpers/visible');
const a = require('./a-day/_lib');
const c = require('./c-chat/_lib');
const k = require('./_a06-simple-kit');
const { waitResult } = require('../room/roomHelpers');

// 자동 구성 판: 사람 시민, 봇 0 광대 (6명부터 봇 1 의사) → 첫 낮 토론
async function dayTable(table, user, size) {
    const t = await k.deal(table, user, { bots: size - 1, me: 'CITIZEN', botRoles: size >= 6 ? ['JOKER', 'DOCTOR'] : ['JOKER'] });
    await a.toDay(t);
    return t;
}

// 낮 채팅을 받은 봇 수가 봇 전원이 될 때까지
async function expectAllBotsHear(t, text) {
    await expect.poll(() => t.bots.filter((b) => k.heard(b, k.DAY_EVT, text)).length, { message: '낮 채팅을 받은 봇 수' }).toBe(t.bots.length);
}

// 채팅 크게 보기 창 열기 (채팅 틀의 키보드용 단추)
// 단계 안내·밤 차례 창이 뜨면 크게 보기가 닫히므로(결정 2026-11-16 판 화면 겹 창 닫기) 덮개 창이 다 닫힌 뒤에 엶
async function openCloseup(page) {
    await k.noOverlays(page);
    await page.getByRole('button', { name: '채팅 크게 보기' }).focus();
    await page.keyboard.press('Enter');
    await expect(k.closeupOf(page)).toBeVisible();
    return k.closeupOf(page);
}

// 채팅 목록에서 그 글 줄이 목록 칸 안(스크롤해서 보이는 자리)에 있는지
const rowInView = (page, text) => c.chatLog(page).getByRole('listitem').filter({ hasText: text }).first().evaluate((el) => {
    const box = el.closest('[role="log"]').getBoundingClientRect();
    const row = el.getBoundingClientRect();
    return row.top >= box.top - 1 && row.bottom <= box.bottom + 1;
});
// 목록 칸이 바닥에서 얼마나 떨어져 있는지 (px)
const distanceFromBottom = (page) => c.chatLog(page).evaluate((el) => el.scrollHeight - el.scrollTop - el.clientHeight);

// 봇들이 돌아가며 낮 채팅 count줄 → 마지막 줄 글
async function fillChat(t, count, prefix) {
    let last = null;
    for (let i = 0; i < count; i += 1) {
        last = `${prefix}-${i + 1}`;
        await k.botSayOk(t, i % t.bots.length, last);
    }
    return last;
}

test('A06-E-055 낮 토론 글 판 전원 (5명 판) → 사람이 보낸 글을 봇 4가 받고 자기 칸에도 보임 @game @smoke', async ({ user, table }) => {
    const t = await dayTable(table, user, 5);
    const text = c.uniq('낮토론');
    await c.say(user.page, text);
    await expectAllBotsHear(t, text);
    expect(t.bots).toHaveLength(4);
    await c.expectLine(user.page, user.account.nickname, text);
});

test('A06-E-056 봇 낮 글 닉네임과 같이 (5명 판) → 사람 칸에 봇 닉네임 + 글 @game', async ({ user, table }) => {
    const t = await dayTable(table, user, 5);
    await c.readyToChat(user.page);
    const text = c.uniq('봇낮말');
    await k.botSayOk(t, 2, text);
    await c.expectLine(user.page, t.bots[2].nickname, text);
});

test('A06-E-057 낮 투표 단계에도 말함 (6명 판) → 투표 단계에 보낸 글을 봇 전원이 받음 @game', async ({ user, table }) => {
    const t = await dayTable(table, user, 6);
    await a.toVote(t);
    const text = c.uniq('투표중');
    await c.say(user.page, text);
    await expectAllBotsHear(t, text);
    const s = await t.state();
    expect([s.phase, s.dayPhase], '투표 단계에 보냄').toEqual(['DAY', 'DAY_VOTE']);
});

test('A06-E-058 밤 → 낮 목록에 밤 말 안 섞임 (6명 판 사람 의사) → 밤 의사 글은 다음 낮 칸에 없고 낮 말만 @game', async ({ user, table }) => {
    test.setTimeout(240_000);
    const t = await k.deal(table, user, { bots: 5, me: 'DOCTOR', botRoles: ['JOKER'] });
    const page = user.page;
    await a.toDay(t);
    await k.intoNight(t, page);
    const nightText = c.uniq('밤의사말');
    await c.say(page, nightText);
    await c.expectLine(page, user.account.nickname, nightText);

    await k.intoDay(t, page);
    const dayText = c.uniq('다음낮말');
    await k.botSayOk(t, 2, dayText);
    await c.expectLine(page, t.bots[2].nickname, dayText);
    await expect(c.chatLog(page)).not.toContainText(nightText);
});

test('A06-E-059 재판 창 "최후의 반론" 채팅 (6명 판) → 재판 창 채팅 칸이 보이고 보낸 글을 봇 전원이 받음 @game', async ({ user, table }) => {
    const t = await dayTable(table, user, 6);
    const page = user.page;
    await k.openTribunal(t, k.uid(t.bots[4]));
    await expect(k.tribunalDialog(page)).toBeVisible({ timeout: 30_000 });
    await c.readyToChat(page);

    // 글칸은 글이 없어 대비를 못 셈 → 보임·화면 안·안 가려짐만, 보내기 단추도 같이
    const panel = k.tribunalChat(page);
    await expectReadable(k.inputIn(panel), { contrast: false });
    await expectReadable(panel.getByRole('button', { name: '채팅 보내기' }), { contrast: false });

    const text = c.uniq('최후반론');
    await c.say(page, text);
    await expectAllBotsHear(t, text);
    expect((await t.state()).phase, '재판 중에 보냄').toBe('TRIBUNAL');
});

test('A06-E-060 사람 피고가 말함 (7명 판) → 피고인 사람이 재판 창에서 보낸 글을 봇 전원이 받음 @game', async ({ user, table }) => {
    const t = await dayTable(table, user, 7);
    const page = user.page;
    await k.openTribunal(t, user.account.uuid);
    await expect(k.tribunalDialog(page)).toBeVisible({ timeout: 30_000 });

    const text = c.uniq('피고반론');
    await c.say(page, text);
    await expectAllBotsHear(t, text);
    const s = await t.state();
    expect([s.phase, s.tribunal?.defendantUuid], '사람이 피고인 재판 중에 보냄').toEqual(['TRIBUNAL', user.account.uuid]);
});

test('A06-E-061 봇 피고 글 (7명 판) → 피고 봇이 보낸 글이 사람 재판 창 목록에 보임 @game', async ({ user, table }) => {
    const t = await dayTable(table, user, 7);
    const page = user.page;
    const defendant = t.bots[5];
    await k.openTribunal(t, k.uid(defendant));
    await expect(k.tribunalDialog(page)).toBeVisible({ timeout: 30_000 });
    await c.readyToChat(page);

    const text = c.uniq('봇피고말');
    await k.botSayOk(t, 5, text);
    await expect(k.logIn(k.tribunalChat(page))).toContainText(c.line(defendant.nickname, text));
});

test('A06-E-062 무죄 → 밤, 시민 칸 닫힘 (6명 판) → 재판 무죄 뒤 밤에 사람 시민 칸에 까닭 글 @game', async ({ user, table }) => {
    const t = await dayTable(table, user, 6);
    const page = user.page;
    const defendant = t.bots[4];
    await k.openTribunal(t, k.uid(defendant));
    const after = await k.verdict(t, 'NOT_GUILTY');
    expect(after.phase, '무죄 뒤 밤').toBe('NIGHT');
    expect(after.players.find((p) => p.uuid === k.uid(defendant))?.alive, '피고는 살아 있음').toBe(true);

    await k.readableOnceClear(page, k.closedNote(page));
    await expect(k.closedNote(page)).toHaveText(k.CLOSED_TEXT);
    await expect(c.chatBox(page)).toHaveCount(0);
});

test('A06-E-063 사람이 처형되면 바로 죽은 사람 칸 (6명 판) → "죽은 사람끼리"가 보이고 보낸 글은 산 봇 0 @game', async ({ user, table }) => {
    test.setTimeout(240_000);
    const t = await dayTable(table, user, 6);
    const page = user.page;
    await k.execute(t, user.account.uuid);

    await c.readyToChat(page, { timeoutMs: 60_000 });
    await expectReadable(c.deadBadge(page), k.BADGE_READABLE);
    const text = c.uniq('처형직후');
    await c.say(page, text);
    // 내 글은 내 칸에 죽은 사람 줄로 옴 (글이 진짜 나갔다는 표시)
    await c.expectLine(page, user.account.nickname, text);
    expect(await c.lineChannel(page, text)).toBe('DEAD');
    await k.settleBots(t);
    expect(k.whoSaw(t.bots, text), '산 봇이 받음').toEqual([]);
});

test('A06-E-064 역할 확인 중 엔터 (5명 판) → 역할 확인 창이 떠 있는 동안 입력칸·보내기가 꺼져 있고 글 치고 엔터해도: 받은 봇 0, 칸에 줄 없음 @game', async ({ user, table }) => {
    const t = await k.deal(table, user, { bots: 4, me: 'CITIZEN', botRoles: ['JOKER'] });
    const page = user.page;
    await expect(page.getByRole('dialog', { name: '내 역할 보기' })).toBeVisible({ timeout: 20_000 });

    // 창을 안 닫은 채: 입력칸·보내기는 꺼져 있고 까닭이 붙어 있음 (frontend utils/inGameChatChannel.js)
    const text = c.uniq('확인창중');
    const box = c.chatBox(page);
    await expect(box, '역할 확인 중 입력칸').toBeDisabled({ timeout: 3000 });
    await expect(c.sendButton(page), '역할 확인 중 보내기 단추').toBeDisabled({ timeout: 3000 });
    await expect(box).toHaveAttribute('title', '역할 확인이 끝나면 채팅할 수 있습니다');
    // 그래도 글을 넣고 Enter 해 봄 (꺼진 칸이라 안 들어감)
    await box.fill(text, { force: true, timeout: 2000 }).catch(() => {});
    await box.press('Enter', { timeout: 2000 }).catch(() => {});
    // 10초가 지나 낮이 돼 버렸으면 이 케이스를 본 게 아님
    expect((await t.state()).phase, '아직 역할 확인 단계').toBe('ROLE_REVEAL');
    await k.settleBots(t);
    expect(k.whoSaw(t.bots, text), '글을 받은 봇').toEqual([]);
    expect(t.bots.filter((b) => k.chatFrom(b, user.account.uuid)).length, '사람 채팅을 받은 봇 수').toBe(0);
    await expect(c.chatLog(page).getByRole('listitem')).toHaveCount(0);
    await expect(page.getByText(text)).toHaveCount(0);
});

test('A06-E-065 첫 낮이 되면 말함 (5명 판) → 역할 확인 뒤 첫 낮에 보낸 글을 봇 전원이 받음 @game', async ({ user, table }) => {
    const t = await dayTable(table, user, 5);
    const s = await t.state();
    expect([s.phase, s.dayIndex], '첫 낮').toEqual(['DAY', 1]);
    const text = c.uniq('첫낮');
    await c.say(user.page, text);
    await expectAllBotsHear(t, text);
});

test('A06-E-066 결과 화면 엔터 (5명 판) → 판 끝 결과 화면에서 글 치고 엔터: 받은 봇 0 [지금 동작] @game', async ({ user, table }) => {
    const t = await dayTable(table, user, 5);
    const page = user.page;
    // 광대 봇을 처형 → 시민 승으로 판 끝
    const end = await k.execute(t, k.uid(t.bots[0]));
    expect(end.phase, '판 끝').toBe('ENDED');
    await waitResult(page);

    // 결과 화면엔 채팅 칸이 없음 → 키보드로 글을 치고 Enter
    await expect(c.chatBox(page)).toHaveCount(0);
    await page.keyboard.type(c.uniq('결과화면'));
    await page.keyboard.press('Enter');
    await k.settleBots(t);
    expect(t.bots.filter((b) => k.chatFrom(b, user.account.uuid)).length, '사람 채팅을 받은 봇 수').toBe(0);
});

test('A06-E-067 크게 보기 창 밤 시민 닫힘 (6명 판) → 낮에 연 크게 보기는 밤 안내가 뜨면 닫힘, 밤에 다시 열면 그 창에 까닭 글이 읽힘 @game', async ({ user, table }) => {
    const t = await dayTable(table, user, 6);
    const page = user.page;
    const closeup = await openCloseup(page);
    await expect(k.inputIn(closeup)).toBeVisible();

    // 밤 안내가 뜨면 크게 보기가 닫힘 (안내 글·"확인"을 가리지 않게)
    await c.phaseTo(t, 'NIGHT');
    await expect(closeup).toHaveCount(0, { timeout: 20_000 });
    // 밤 차례 안내가 이어 뜨면 또 닫히므로, 닫혀 있으면 다시 열어 가며 까닭 글을 봄
    await expect(async () => {
        if (!(await closeup.isVisible().catch(() => false))) await openCloseup(page);
        await expectReadable(k.closedNote(closeup), { timeout: 1500 });
    }).toPass({ timeout: 60_000 });
    await expect(k.closedNote(closeup)).toHaveText(k.CLOSED_TEXT);
    await expect(k.inputIn(closeup)).toHaveCount(0);
});

test('A06-E-068 크게 보기 창에서 보냄 (6명 판) → 낮에 크게 보기 창에서 보낸 글을 봇 전원이 받음 [지금 동작] @game', async ({ user, table }) => {
    const t = await dayTable(table, user, 6);
    const page = user.page;
    const closeup = await openCloseup(page);
    const text = c.uniq('크게보냄');
    const box = k.inputIn(closeup);
    await box.fill(text);
    await box.press('Enter');
    await expect(box).toHaveValue('');
    await expectAllBotsHear(t, text);
    await expect(k.logIn(closeup)).toContainText(c.line(user.account.nickname, text));
});

test('A06-E-069 바닥에서 새 글 오면 내려감 (5명 판) → 봇 30줄 뒤 새 글이 오면 마지막 줄이 목록 칸 안에 보임 @game', async ({ user, table }) => {
    const t = await dayTable(table, user, 5);
    const page = user.page;
    await c.readyToChat(page);
    const lastOfThirty = await fillChat(t, 30, c.uniq('줄'));
    await c.expectLine(page, t.bots[29 % t.bots.length].nickname, lastOfThirty);
    // 30줄이면 칸보다 길어 스크롤이 생김 (안 생기면 이 케이스를 본 게 아님)
    expect(await c.chatLog(page).evaluate((el) => el.scrollHeight > el.clientHeight), '목록이 칸보다 김').toBe(true);

    const text = c.uniq('새글');
    await k.botSayOk(t, 0, text);
    await c.expectLine(page, t.bots[0].nickname, text);
    await expect.poll(() => rowInView(page, text), { message: '새 글 줄이 목록 칸 안' }).toBe(true);
});

test('A06-E-070 읽는 중엔 안 내려감 (5명 판) → 위로 올려 읽는 중에 새 글이 와도 보던 자리 그대로 @game', async ({ user, table }) => {
    const t = await dayTable(table, user, 5);
    const page = user.page;
    await c.readyToChat(page);
    const lastOfThirty = await fillChat(t, 30, c.uniq('줄'));
    await c.expectLine(page, t.bots[29 % t.bots.length].nickname, lastOfThirty);

    // 마우스 휠로 맨 위까지 올림 (휠 움직임이 다 끝난 자리 = 맨 위) → 바닥에서 48px 넘게 떨어짐
    await c.chatLog(page).hover();
    await page.mouse.wheel(0, -5000);
    await expect.poll(() => c.chatLog(page).evaluate((el) => el.scrollTop), { message: '맨 위까지 올림' }).toBe(0);
    expect(await distanceFromBottom(page), '바닥에서 떨어진 거리').toBeGreaterThan(48);
    const before = 0;

    const text = c.uniq('읽는중새글');
    await k.botSayOk(t, 0, text);
    // 새 줄은 목록에 붙지만 (도착 표시) 화면은 안 내려감
    await expect(c.chatLog(page)).toContainText(c.line(t.bots[0].nickname, text));
    expect(await c.chatLog(page).evaluate((el) => el.scrollTop), '스크롤 자리').toBe(before);
    expect(await rowInView(page, text), '새 글 줄이 목록 칸 안').toBe(false);
});

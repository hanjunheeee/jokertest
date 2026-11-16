'use strict';

// 재판 창 채팅 브라우저 시험 (PC): 봇 글이 재판 창 채팅에 보임, 피고도 말함, 죽은 사람 글은 산 사람 화면에 없음, 죽은 사람 화면엔 "죽은 사람끼리", 5초 동안에도 채팅 됨
// 목록 docs/게임_의도_2026-11-15/시험목록/A04-재판.md A04-E-085·087·089·090·173
const { test, expect } = require('../../helpers/fixtures');
const c = require('./c-chat/_lib');
const K = require('./_a04-pc');

const { TEXT, uuidOf } = K;

// 재판 창 채팅 칸은 창이 뜨고 1초쯤 뒤에 옆에 열림 → 열릴 때까지
async function chatReady(page) {
    await expect(K.tribunalChatBox(page)).toBeVisible({ timeout: 10000 });
    return K.tribunalChatBox(page);
}

// 재판 창 채팅에 글 쓰고 Enter → 입력칸이 비면 서버가 받은 것
async function sayInTribunal(page, text) {
    const box = await chatReady(page);
    await box.fill(text);
    await box.press('Enter');
    await expect(box).toHaveValue('', { timeout: 8000 });
}

// 봇이 받은 알림 어디든 그 글이 있는지
const botHeard = (bot, text) => bot.events.some((r) => r.payload?.text === text);

test('A04-E-085 PC 7명 판 재판 중 산 봇이 글을 씀 → 재판 창 채팅에 보임 @game @smoke', async ({ user, table }) => {
    const t = await K.seat(table, user, { n: 7 });
    const page = user.page;
    await K.toFirstDay(t);
    await K.openTribunal(t, uuidOf(t.bots[2]));
    await K.expectTribunal(page);
    await chatReady(page);
    const text = c.uniq('재판봇글');
    expect((await K.day.botChat(t, t.bots[1], text))?.ok).toBe(true);
    const row = K.tribunalChatLog(page).getByRole('listitem').filter({ hasText: text });
    await expect(row).toContainText(t.bots[1].nickname);
    // 글 줄이 화면 안·안 가려진 채 보임 (글자색은 사람마다 달라 대비는 안 봄)
    await K.readable(row, { contrast: false });
});

test('A04-E-087 PC 6명 판 피고인 내가 재판 창 채팅에 글을 씀 → 써지고 봇이 받음 @game', async ({ user, table }) => {
    const t = await K.seat(table, user, { n: 6 });
    const page = user.page;
    await K.toFirstDay(t);
    await K.openTribunal(t, uuidOf(user));
    await K.expectTribunal(page, user.account.nickname);
    await K.expectNotice(page, TEXT.DEFENDANT);
    const text = c.uniq('최후반론');
    await sayInTribunal(page, text);
    await expect(K.tribunalChatLog(page)).toContainText(text);
    await expect.poll(() => botHeard(t.bots[1], text), { message: '봇이 피고 글을 받음' }).toBe(true);
});

test('A04-E-089 PC 8명 판 2일 재판 중 죽은 봇이 글을 씀 → 산 투표자인 내 재판 창 채팅엔 안 보임 @game', async ({ user, table }) => {
    const t = await K.seat(table, user, { n: 8 });
    const page = user.page;
    const [dead, alive, second] = [t.bots[2], t.bots[1], t.bots[3]];
    await K.toFirstDay(t);
    // 1일: 봇 표로 셋째 봇 처형
    await K.openTribunal(t, uuidOf(dead));
    await K.botsVerdict(t, 'GUILTY', t.bots.filter((b) => b !== dead));
    await K.closeTribunal(t);
    await K.passExpulsion(page);
    await K.toDayOf(t, 2);
    await K.openTribunal(t, uuidOf(second));
    await K.expectTribunal(page, second.nickname);
    await chatReady(page);
    const deadText = c.uniq('죽은글');
    const aliveText = c.uniq('산글');
    expect((await K.day.botChat(t, dead, deadText))?.ok).toBe(true);
    // 채팅 간격(0.5초)은 사람마다라 다른 봇은 바로 보냄 — 뒤에 보낸 산 봇 글이 보이면 앞 글은 올 만큼 온 것
    expect((await K.day.botChat(t, alive, aliveText))?.ok).toBe(true);
    await expect(K.tribunalChatLog(page)).toContainText(aliveText);
    await expect(K.tribunalChatLog(page)).not.toContainText(deadText);
    await K.expectVoteButtons(page);
});

test('A04-E-090 PC 7명 판 죽은 내가 2일 재판을 봄 → 재판 창 채팅에 "죽은 사람끼리" 표시가 읽힘 @game', async ({ user, table }) => {
    const t = await K.seat(table, user, { n: 7 });
    const page = user.page;
    await K.toFirstDay(t);
    await K.killHumanAtNight(t, user, t.bots[0]);
    await K.openTribunal(t, uuidOf(t.bots[2]));
    await K.expectTribunal(page);
    await K.expectNotice(page, TEXT.DEAD);
    await chatReady(page);
    // 표시 칸은 누름이 통과하는 칸이라 가려짐 검사는 뺌
    await K.readable(K.tribunal(page).getByText('죽은 사람끼리', { exact: true }), { uncovered: false });
    // 내 글은 죽은 사람끼리 채널로 감 → 산 봇은 못 받음
    const text = c.uniq('죽은내글');
    await sayInTribunal(page, text);
    const mine = K.tribunalChatLog(page).getByRole('listitem').filter({ hasText: text });
    await expect(mine).toHaveAttribute('data-chat-channel', 'DEAD');
    for (const bot of t.bots) expect(botHeard(bot, text)).toBe(false);
});

test('A04-E-173 PC 7명 판 재판 120초, 다 내서 5초로 당겨진 동안 → 채팅이 써지고 봇이 받음 @game @realtime', async ({ user, table }) => {
    const t = await K.seat(table, user, { n: 7, settings: { tribunalTime: 120 } });
    const page = user.page;
    const defendant = t.bots[2];
    const voters = t.bots.filter((b) => b !== defendant);
    await K.toFirstDay(t);
    await K.openTribunal(t, uuidOf(defendant));
    await K.expectTribunal(page, defendant.nickname);
    await chatReady(page);
    await K.press(page, TEXT.GUILTY);
    const since = Date.now();
    await K.botsVerdict(t, 'NOT_GUILTY', voters);
    const settle = await voters[0].waitForEvent('phase_settle_started', { match: (p) => p?.phase === 'TRIBUNAL', since, timeoutMs: 4000 });
    const text = c.uniq('5초안');
    await sayInTribunal(page, text);
    // 보낸 때가 당겨진 마감 전 (그 5초 안)
    expect(Date.now()).toBeLessThan(settle.deadline);
    await expect.poll(() => botHeard(voters[0], text), { message: '봇이 5초 안 글을 받음' }).toBe(true);
    // 판정은 당겨진 마감(±1.5초)에 그대로
    await expect(K.tribunal(page)).toBeHidden({ timeout: 8000 });
    expect(Math.abs(Date.now() - settle.deadline)).toBeLessThanOrEqual(1500);
});

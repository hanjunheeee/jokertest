'use strict';

// 채팅 글자 수·간격·가리기 브라우저 시험 (PC) — 150자 경계, 빈 글, 0.5초 간격(진짜 시간), 금지어 가림, 스크립트 글은 글자로만, 인터넷 끊김, 줄바꿈, 나쁜 글자
// 목록 A06-판중-채팅.md 번호 A06-E-071~087
const { test, expect } = require('../../helpers/fixtures');
const { expectReadable } = require('../../helpers/visible');
const { customRoleSettings } = require('../../helpers/game');
const a = require('./a-day/_lib');
const c = require('./c-chat/_lib');
const k = require('./_a06-simple-kit');

// 입력칸 아래 상태 줄에 뜨는 글 (화면 문구)
const TOO_LONG_TEXT = '메시지는 150자 이하로 입력해주세요.';
const EMPTY_TEXT = '메시지를 입력해주세요.';
const BAD_CHAR_TEXT = '사용할 수 없는 문자가 포함되어 있습니다.';
const OFFLINE_TEXT = '인터넷 연결이 끊겨 보내지 못했습니다. 연결되면 다시 보내 주세요.';

// 자동 구성 판: 사람 시민, 봇 0 광대 (6명부터 봇 1 의사) → 첫 낮 토론
async function dayTable(table, user, size) {
    const t = await k.deal(table, user, { bots: size - 1, me: 'CITIZEN', botRoles: size >= 6 ? ['JOKER', 'DOCTOR'] : ['JOKER'] });
    await a.toDay(t);
    return t;
}

// 사람 의사 + 의사 봇(봇 1)이 있는 판의 첫 밤
async function doctorNight(table, user, size) {
    const t = await k.deal(table, user, {
        bots: size - 1, me: 'DOCTOR', botRoles: ['JOKER', 'DOCTOR'], settings: customRoleSettings({ JOKER: 1, DOCTOR: 2 }),
    });
    await a.toDay(t);
    await k.intoNight(t, user.page);
    return t;
}

async function expectAllBotsHear(t, text) {
    await expect.poll(() => t.bots.filter((b) => k.heard(b, k.DAY_EVT, text)).length, { message: '낮 채팅을 받은 봇 수' }).toBe(t.bots.length);
}

// 앞글자 + 채움 글자로 딱 length자 글 (앞글자는 시험마다 달라 다른 글과 안 섞임)
const exactLength = (prefix, fill, length) => prefix + fill.repeat(length - prefix.length);
// 무작위 한글 count자 (한글만으로 된 글의 앞글자)
const randomHangul = (count) => Array.from({ length: count }, () => String.fromCharCode(0xac00 + Math.floor(Math.random() * 11172))).join('');

// 상태 줄 글이 그 글이고 사람 눈에 읽힘
async function expectStatus(page, text) {
    const alert = k.statusAlert(k.boardChat(page));
    await expect(alert).toHaveText(text);
    await expectReadable(alert, k.STATUS_READABLE);
}

/**
 * 같은 칸에서 두 글을 gapMs 간격으로 보냄 → 실제 간격(ms)
 * 간격 규칙을 보는 것이라 진짜 시간으로 쉼 (첫 글은 서버가 받아 칸이 비워진 뒤 둘째를 채움)
 */
async function sendTwice(box, first, second, gapMs) {
    await box.fill(first);
    await box.press('Enter');
    const sentAt = Date.now();
    await expect(box).toHaveValue('');
    await box.fill(second);
    await c.sleep(Math.max(0, gapMs - (Date.now() - sentAt)));
    await box.press('Enter');
    return Date.now() - sentAt;
}

test('A06-E-071 150자 보냄 (5명 판) → 봇이 150자 그대로 받음 @game @smoke', async ({ user, table }) => {
    const t = await dayTable(table, user, 5);
    const text = exactLength(c.uniq('L'), 'a', 150);
    expect(text).toHaveLength(150);
    await c.say(user.page, text);
    await expectAllBotsHear(t, text);
});

test('A06-E-072 151자 거절 글이 보임 (5명 판) → "메시지는 150자 이하로 입력해주세요."가 읽히고 받은 봇 0 @game', async ({ user, table }) => {
    const t = await dayTable(table, user, 5);
    const page = user.page;
    const box = await c.readyToChat(page);
    const text = exactLength(c.uniq('L'), 'a', 151);
    expect(text).toHaveLength(151);
    // 151자째도 입력칸에는 들어감 (보낼 때만 막음)
    await box.fill(text);
    await expect(box).toHaveValue(text);
    await box.press('Enter');
    await expectStatus(page, TOO_LONG_TEXT);
    await k.settleBots(t);
    expect(k.whoSaw(t.bots, text), '글을 받은 봇').toEqual([]);
    expect(t.bots.filter((b) => k.chatFrom(b, user.account.uuid)).length, '사람 채팅을 받은 봇 수').toBe(0);
});

// 합친 뒤 지금 동작: 빈 글은 안내 글 없이 조용히 막음 (화면 isSilentChatSendSanitizeCode, 화면 시험 A06-F-133과 같음 — 반장 결정 2026-11-25)
test('A06-E-073 빈 엔터 (5명 판) → 안내 글 없이 조용히 막힘("메시지를 입력해주세요." 없음), 받은 봇 0 @game', async ({ user, table }) => {
    const t = await dayTable(table, user, 5);
    const page = user.page;
    const box = await c.readyToChat(page);
    await expect(box).toHaveValue('');
    await box.press('Enter');
    // 상태 줄에 안내 글이 안 뜸
    await expect(k.statusAlert(k.boardChat(page))).toHaveCount(0);
    await expect(page.getByText(EMPTY_TEXT)).toHaveCount(0);
    // 그 뒤에 보낸 글이 봇에게 감 → 빈 엔터가 나갔다면 그보다 먼저 갔음, 봇마다 내 채팅은 이 글 하나뿐
    const marker = c.uniq('뒤글');
    await c.say(page, marker);
    await expectAllBotsHear(t, marker);
    await k.settleBots(t);
    for (const bot of t.bots) {
        const mine = bot.events.filter((r) => r.event === k.DAY_EVT && r.payload?.senderUuid === user.account.uuid);
        expect(mine.map((r) => r.payload.text), `${bot.nickname}가 받은 내 채팅`).toEqual([marker]);
    }
    await expect(page.getByText(EMPTY_TEXT)).toHaveCount(0);
});

test('A06-E-074 한글 150자 (6명 판) → 봇이 한글 150자 그대로 받음 @game', async ({ user, table }) => {
    const t = await dayTable(table, user, 6);
    const text = exactLength(randomHangul(6), '가', 150);
    expect(text).toHaveLength(150);
    expect(text, '한글만').toMatch(/^[가-힣]+$/);
    await c.say(user.page, text);
    await expectAllBotsHear(t, text);
});

test('A06-E-075 0.5초 안 두 번째 글 거절 (6명 판) → 0.3초 간격 두 글: 봇은 첫 글만 받고 칸에 거절 글 @game @realtime', async ({ user, table }) => {
    const t = await dayTable(table, user, 6);
    const page = user.page;
    const box = await c.readyToChat(page);
    const first = c.uniq('첫글');
    const second = c.uniq('둘째글');
    const gap = await sendTwice(box, first, second, 300);
    // 둘째 글이 0.5초 안에 나갔어야 이 규칙을 본 것
    expect(gap, '실제 간격(ms)').toBeLessThan(450);

    // 서버가 둘째 글을 거절 → 상태 줄에 거절 글이 읽힘
    const alert = k.statusAlert(k.boardChat(page));
    await expect(alert).toHaveText(/\S/);
    await expectReadable(alert, k.STATUS_READABLE);
    await expectAllBotsHear(t, first);
    await k.settleBots(t);
    expect(k.whoSaw(t.bots, second), '둘째 글을 받은 봇').toEqual([]);
});

test('A06-E-076 0.6초 간격이면 둘 다 (6명 판) → 0.6초 간격 두 글: 봇이 2줄 받음 @game @realtime', async ({ user, table }) => {
    const t = await dayTable(table, user, 6);
    const page = user.page;
    const box = await c.readyToChat(page);
    const first = c.uniq('첫글');
    const second = c.uniq('둘째글');
    const gap = await sendTwice(box, first, second, 600);
    expect(gap, '실제 간격(ms)').toBeGreaterThanOrEqual(600);
    await expect(box).toHaveValue('');
    await expectAllBotsHear(t, first);
    await expectAllBotsHear(t, second);
});

test('A06-E-077 밤 직업 채팅도 0.5초 (7명 판 직접 의사 2) → 의사 0.3초 간격 두 글: 의사 봇은 1줄만 받음 @game @realtime', async ({ user, table }) => {
    const t = await doctorNight(table, user, 7);
    const page = user.page;
    const mate = t.bots[1];
    const box = await c.readyToChat(page);
    const first = c.uniq('첫밤글');
    const second = c.uniq('둘째밤글');
    const gap = await sendTwice(box, first, second, 300);
    expect(gap, '실제 간격(ms)').toBeLessThan(450);

    await expect.poll(() => k.heard(mate, k.ROLE_EVT, first), { message: '의사 봇이 첫 글을 받음' }).toBe(true);
    // 둘째 글 거절 답이 화면에 온 뒤 봇 쪽을 봄
    await expect(k.statusAlert(k.boardChat(page))).toHaveText(/\S/);
    await k.settleBots(t);
    expect(k.sawText(mate, second), '의사 봇이 둘째 글을 받음').toBe(false);
    const fromMe = mate.events.filter((r) => r.event === k.ROLE_EVT && r.payload?.senderUuid === user.account.uuid);
    expect(fromMe.length, '의사 봇이 받은 줄 수').toBe(1);
});

test('A06-E-078 다른 사람끼리는 안 막힘 (7명 판) → 봇이 보낸 바로 뒤(0.1초쯤) 사람이 보내도 봇이 사람 글을 받음 @game', async ({ user, table }) => {
    const t = await dayTable(table, user, 7);
    const page = user.page;
    const box = await c.readyToChat(page);
    const mine = c.uniq('사람글');
    const botText = c.uniq('봇글');
    // 사람 글을 미리 쳐 두고, 봇 글이 나가자마자 Enter
    await box.fill(mine);
    expect((await c.botSay(t, 1, botText))?.ok, '봇 낮 채팅').toBe(true);
    await box.press('Enter');
    await expect(box).toHaveValue('');
    await expectAllBotsHear(t, mine);
    await c.expectLine(page, t.bots[1].nickname, botText);
});

test('A06-E-079 금지어 가림 (5명 판) → "너 (금지어)야": 봇이 받은 글·내 칸 글이 같은 길이 *로 가려짐 @game', async ({ user, table }) => {
    const t = await dayTable(table, user, 5);
    const page = user.page;
    // 낱말은 시험마다 무작위 (같이 도는 다른 시험 채팅에 안 걸리게, 목록의 "바보" 자리)
    const word = await c.addBannedWord();
    try {
        const text = `너 ${word}야`;
        const masked = `너 ${'*'.repeat(word.length)}야`;
        await c.say(page, text);
        await expectAllBotsHear(t, masked);
        expect(k.whoSaw(t.bots, text), '원문을 받은 봇').toEqual([]);
        await c.expectLine(page, user.account.nickname, masked);
        await expect(c.chatLog(page)).not.toContainText(word);
    } finally {
        await c.removeBannedWord(word);
    }
});

test('A06-E-080 밤 의사 금지어 (6명 판) → 의사가 금지어만 보내면 의사 봇이 받은 글이 *만 @game', async ({ user, table }) => {
    const t = await doctorNight(table, user, 6);
    const mate = t.bots[1];
    const word = await c.addBannedWord();
    try {
        const masked = '*'.repeat(word.length);
        await c.say(user.page, word);
        await expect.poll(() => k.heard(mate, k.ROLE_EVT, masked), { message: '의사 봇이 가려진 글을 받음' }).toBe(true);
        expect(k.sawText(mate, word), '의사 봇이 원문을 받음').toBe(false);
    } finally {
        await c.removeBannedWord(word);
    }
});

test('A06-E-081 죽은 사람 금지어 (8명 판) → 죽은 사람이 금지어만 보내면 죽은 봇이 받은 글이 *만 @game', async ({ user, table }) => {
    test.setTimeout(300_000);
    const { deadBot } = await k.twoDead(table, user);
    const page = user.page;
    const word = await c.addBannedWord();
    try {
        const masked = '*'.repeat(word.length);
        await c.readyToChat(page, { timeoutMs: 60_000 });
        await c.say(page, word);
        await expect.poll(() => k.heard(deadBot, k.DEAD_EVT, masked), { message: '죽은 봇이 가려진 글을 받음' }).toBe(true);
        expect(k.sawText(deadBot, word), '죽은 봇이 원문을 받음').toBe(false);
    } finally {
        await c.removeBannedWord(word);
    }
});

// 스크립트를 끼워 넣은 글 (값 3) — 목록에 적힌 글 그대로
const SCRIPT_TEXTS = [
    ['A06-E-082', 'script 꼬리표', '<script>alert(1)</script>'],
    ['A06-E-083', 'img 오류 손잡이', '<img src=x onerror=alert(1)>'],
    ['A06-E-084', 'javascript 주소 링크', '<a href="javascript:alert(1)">눌러</a>'],
];
for (const [id, label, payload] of SCRIPT_TEXTS) {
    test(`${id} 스크립트 글이 글자로만: ${label} (5명 판) → 사람 칸에 글자 그대로, 대화 상자 안 뜸, 그 줄 안 img·a·script 요소 0 @game`, async ({ user, table }) => {
        const page = user.page;
        // 스크립트가 돌면 뜰 대화 상자를 적어 둠
        const dialogs = [];
        page.on('dialog', (dialog) => {
            dialogs.push(dialog.message());
            dialog.dismiss().catch(() => {});
        });
        const t = await dayTable(table, user, 5);
        await c.readyToChat(page);

        expect((await c.botSay(t, 1, payload))?.ok, '봇 낮 채팅').toBe(true);
        const row = c.chatLog(page).getByRole('listitem').filter({ hasText: payload });
        await expect(row).toHaveCount(1);
        await expect(row).toContainText(c.line(t.bots[1].nickname, payload));
        await expect(row.locator('script, img, a')).toHaveCount(0);

        // 그 뒤에 온 다른 글까지 그려진 뒤에도 대화 상자가 없음 (그림 오류 손잡이는 조금 늦게 돎)
        const marker = c.uniq('뒤글');
        await k.botSayOk(t, 2, marker);
        await c.expectLine(page, t.bots[2].nickname, marker);
        expect(dialogs, '뜬 대화 상자').toEqual([]);
    });
}

test('A06-E-085 인터넷 끊김 (6명 판) → 끊긴 채 엔터: 끊김 문구가 읽힘, 다시 이어져도 그 글은 늦게 안 감 @game', async ({ user, table }) => {
    const t = await dayTable(table, user, 6);
    const page = user.page;
    const box = await c.readyToChat(page);
    const text = c.uniq('끊긴글');
    await box.fill(text);

    await user.context.setOffline(true);
    try {
        await expect.poll(() => page.evaluate(() => navigator.onLine), { message: '브라우저가 끊김을 앎' }).toBe(false);
        await box.press('Enter');
        await expectStatus(page, OFFLINE_TEXT);
    } finally {
        await user.context.setOffline(false);
    }
    await expect.poll(() => page.evaluate(() => navigator.onLine), { message: '브라우저가 다시 이어짐' }).toBe(true);

    // 다시 이어진 뒤 새 글을 보내 봇이 받음 → 끊겼을 때 글이 쌓여 있었다면 그보다 먼저 갔을 것
    const marker = c.uniq('다시이어짐');
    await expect(async () => {
        await box.fill(marker);
        await box.press('Enter');
        await expect(box).toHaveValue('', { timeout: 2000 });
    }).toPass({ timeout: 30_000 });
    await expectAllBotsHear(t, marker);
    await k.settleBots(t);
    expect(k.whoSaw(t.bots, text), '끊겼을 때 글을 받은 봇').toEqual([]);
});

test('A06-E-086 줄바꿈 든 글 (5명 판) → Shift+Enter로 두 줄: 봇이 줄바꿈 든 글을 받음 [지금 동작] @game', async ({ user, table }) => {
    const t = await dayTable(table, user, 5);
    const page = user.page;
    const box = await c.readyToChat(page);
    const first = c.uniq('윗줄');
    const second = c.uniq('아랫줄');
    await box.click();
    await page.keyboard.type(first);
    await page.keyboard.press('Shift+Enter');
    await page.keyboard.type(second);
    // Shift+Enter는 보내지 않고 줄만 바꿈
    await expect(box).toHaveValue(`${first}\n${second}`);
    await page.keyboard.press('Enter');
    await expect(box).toHaveValue('');
    await expectAllBotsHear(t, `${first}\n${second}`);
});

test('A06-E-087 나쁜 글자 (5명 판) → 글 방향 바꾸는 숨은 글자를 붙여 넣고 엔터: "사용할 수 없는 문자가 포함되어 있습니다.", 받은 봇 0 @game', async ({ user, table }) => {
    const t = await dayTable(table, user, 5);
    const page = user.page;
    const box = await c.readyToChat(page);
    // U+202E = 글 방향을 오른쪽→왼쪽으로 바꾸는 안 보이는 글자 (파일에 그 글자를 직접 안 적으려고 번호로 만듦)
    const text = `${c.uniq('숨은')}${String.fromCharCode(0x202e)}글자`;
    await box.fill(text);
    await box.press('Enter');
    await expectStatus(page, BAD_CHAR_TEXT);
    await k.settleBots(t);
    expect(t.bots.filter((b) => k.chatFrom(b, user.account.uuid)).length, '사람 채팅을 받은 봇 수').toBe(0);
});

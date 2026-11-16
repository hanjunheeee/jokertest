'use strict';

// 죽은 사람 채팅 브라우저 시험 (PC) — 죽으면 "죽은 사람끼리" 표시, 죽은 사람 글은 죽은 사람만 받음, 죽어도 낮 말은 읽음, 죽은 광대는 광대 밤 채팅 읽기만
// 목록 A06-판중-채팅.md 번호 A06-E-043~054
const { test, expect } = require('../../helpers/fixtures');
const { expectReadable } = require('../../helpers/visible');
const { customRoleSettings } = require('../../helpers/game');
const a = require('./a-day/_lib');
const c = require('./c-chat/_lib');
const k = require('./_a06-simple-kit');

// 처형·밤 살해 뒤 화면 연출(추방 영상·사망 뒤 선택·암살 영상)이 끝나고 채팅 칸이 열릴 때까지
const afterDeath = (page) => c.readyToChat(page, { timeoutMs: 60_000 });

// 'rgb(169, 169, 169)' → [169, 169, 169]
const rgbOf = (text) => (text.match(/\d+(\.\d+)?/g) ?? []).slice(0, 3).map(Number);

// 8명 자동 구성 판에서 사람(시민)이 1일 재판으로 처형된 직후 밤
async function executedCitizen(table, user) {
    const t = await k.deal(table, user, { bots: 7, me: 'CITIZEN', botRoles: ['JOKER', 'DOCTOR', 'GUARD'] });
    await a.toDay(t);
    await k.execute(t, user.account.uuid);
    return t;
}

// 7명 판 직접 구성 광대 2에서 사람(광대)이 1일 재판으로 처형된 직후 밤 (봇 0 = 산 동료 광대)
async function executedJoker(table, user) {
    const t = await k.deal(table, user, { bots: 6, me: 'JOKER', botRoles: ['JOKER'], settings: customRoleSettings({ JOKER: 2 }) });
    await a.toDay(t);
    await k.execute(t, user.account.uuid);
    return t;
}

test('A06-E-043 처형된 뒤 "죽은 사람끼리"가 진짜 보임 (8명 판) → 표시가 읽히고 입력칸 있음 @game @smoke', async ({ user, table }) => {
    test.setTimeout(240_000);
    await executedCitizen(table, user);
    const page = user.page;
    await afterDeath(page);
    await expectReadable(c.deadBadge(page), k.BADGE_READABLE);
    await expect(c.chatBox(page)).toBeVisible();
    await expect(c.chatBox(page)).toBeEditable();
});

test('A06-E-044 죽은 사람 낮 글은 산 봇이 못 받음 (8명 판, 봇 1명 먼저 죽음) → 2일 낮 죽은 봇만 받음, 산 봇 0 @game', async ({ user, table }) => {
    test.setTimeout(300_000);
    const { t, deadBot } = await k.twoDead(table, user);
    const page = user.page;
    const s = await t.state();
    expect([s.phase, s.dayIndex], '2일 낮').toEqual(['DAY', 2]);

    const text = c.uniq('죽은낮말');
    await afterDeath(page);
    await c.say(page, text);
    await expect.poll(() => k.heard(deadBot, k.DEAD_EVT, text), { message: '죽은 봇이 받음' }).toBe(true);
    await k.settleBots(t);
    expect(k.whoSaw(await k.aliveBots(t), text), '산 봇이 받음').toEqual([]);
});

test('A06-E-045 죽은 봇 글이 회색 줄로 (8명 판) → 죽은 사람 칸에 그 글이 회색 글자로 보임 @game', async ({ user, table }) => {
    test.setTimeout(300_000);
    const { t, deadBot } = await k.twoDead(table, user);
    const page = user.page;
    await afterDeath(page);

    const text = c.uniq('죽은봇말');
    await k.botSayOk(t, t.bots.indexOf(deadBot), text);
    await c.expectLine(page, deadBot.nickname, text);
    // 회색 = 빨강·초록·파랑 값이 같고 흰색·검정이 아님
    const [r, g, b] = rgbOf(await c.lineColor(page, text));
    expect([g, b], '회색 (세 값이 같음)').toEqual([r, r]);
    expect(r).toBeGreaterThan(60);
    expect(r).toBeLessThan(230);
});

test('A06-E-046 죽은 사람도 낮 말을 읽음 (8명 판) → 산 봇 낮 채팅이 죽은 사람 칸에 보임 @game', async ({ user, table }) => {
    test.setTimeout(300_000);
    const { t } = await k.twoDead(table, user);
    const page = user.page;
    await afterDeath(page);

    const liveIndex = 3;
    expect((await t.player(k.uid(t.bots[liveIndex])))?.alive, '산 봇').toBe(true);
    const text = c.uniq('산봇낮말');
    await k.botSayOk(t, liveIndex, text);
    await c.expectLine(page, t.bots[liveIndex].nickname, text);
});

test('A06-E-047 죽은 사람이 밤에 말함, 화면 안 잠김 (8명 판) → 입력칸을 누를 수 있고 보낸 글을 죽은 봇이 받음 @game', async ({ user, table }) => {
    test.setTimeout(300_000);
    const { t, deadBot } = await k.twoDead(table, user);
    const page = user.page;
    await c.phaseTo(t, 'NIGHT');
    // 밤이 된 뒤 죽은 봇이 보낸 글이 화면에 옴 = 화면이 밤까지 따라옴
    const marker = c.uniq('밤표시');
    await k.botSayOk(t, t.bots.indexOf(deadBot), marker);
    await c.expectLine(page, deadBot.nickname, marker);

    await afterDeath(page);
    // 진짜로 눌러짐 (덮개·잠금이 있으면 누르기가 안 됨)
    await c.chatBox(page).click();
    await expect(c.chatBox(page)).toBeFocused();

    const text = c.uniq('죽은밤말');
    await c.say(page, text);
    await expect.poll(() => k.heard(deadBot, k.DEAD_EVT, text), { message: '죽은 봇이 받음' }).toBe(true);
    expect((await t.state()).phase, '밤').toBe('NIGHT');
});

test('A06-E-048 죽은 시민 밤 입력칸 열림 (8명 판) → 원래 시민인 사람이 죽은 뒤 밤: 입력칸 있음, 까닭 글 없음 @game', async ({ user, table }) => {
    test.setTimeout(240_000);
    const t = await executedCitizen(table, user);
    const page = user.page;
    expect((await t.state()).phase, '처형 직후 밤').toBe('NIGHT');

    await afterDeath(page);
    // 내 글이 내 칸에 옴 = 화면이 밤(처형 뒤)까지 따라왔고 입력칸이 진짜 씀
    const text = c.uniq('죽은시민');
    await c.say(page, text);
    await c.expectLine(page, user.account.nickname, text);
    await expect(c.chatBox(page)).toBeVisible();
    await expect(k.closedNote(page)).toHaveCount(0);
    await expect(page.getByText(k.CLOSED_TEXT)).toHaveCount(0);
    expect((await t.state()).phase, '아직 밤').toBe('NIGHT');
});

test('A06-E-049 죽은 사람 재판 창 채팅 (8명 판) → 2일 재판 중 재판 창에서 보낸 글을 죽은 봇만 받음 @game', async ({ user, table }) => {
    test.setTimeout(300_000);
    const { t, deadBot } = await k.twoDead(table, user);
    const page = user.page;
    // 2일 낮: 산 봇 하나(시민)를 재판에 세움
    await k.openTribunal(t, k.uid(t.bots[5]));
    await expect(k.tribunalDialog(page)).toBeVisible({ timeout: 30_000 });

    await afterDeath(page);
    const text = c.uniq('재판저승');
    const box = k.inputIn(k.tribunalChat(page));
    await expect(box).toBeVisible();
    await c.say(page, text);
    await expect.poll(() => k.heard(deadBot, k.DEAD_EVT, text), { message: '죽은 봇이 받음' }).toBe(true);
    await k.settleBots(t);
    expect(k.whoSaw(await k.aliveBots(t), text), '산 봇이 받음').toEqual([]);
    expect((await t.state()).phase, '재판 중에 보냄').toBe('TRIBUNAL');
});

test('A06-E-050 죽은 광대가 광대 채팅을 읽음 (7명 판 직접 광대 2) → 처형된 사람 광대 칸에 산 광대 봇 밤 글이 보임 @game', async ({ user, table }) => {
    test.setTimeout(240_000);
    const t = await executedJoker(table, user);
    const page = user.page;
    await afterDeath(page);

    const text = c.uniq('산광대밤말');
    expect((await c.botNightSay(t, 0, text))?.ok, '산 광대 봇 밤 채팅').toBe(true);
    await c.expectLine(page, t.bots[0].nickname, text);
});

test('A06-E-051 죽은 광대 글은 산 광대가 못 받음 (7명 판) → 죽은 광대 사람 밤 글: 산 광대 봇 0, 죽은 봇이 받음 @game', async ({ user, table }) => {
    test.setTimeout(300_000);
    const t = await executedJoker(table, user);
    const page = user.page;
    // 그 밤 산 광대 봇이 시민 봇 하나를 죽임 (죽은 사람 글을 받을 죽은 봇) → 2일 낮 → 2일 밤
    const deadBot = t.bots[5];
    await k.nightKill(t, k.uid(deadBot));
    await c.phaseTo(t, 'NIGHT');

    const text = c.uniq('죽은광대');
    await afterDeath(page);
    await c.say(page, text);
    await expect.poll(() => k.heard(deadBot, k.DEAD_EVT, text), { message: '죽은 봇이 받음' }).toBe(true);
    await k.settleBots(t);
    expect(k.sawText(t.bots[0], text), '산 광대 봇이 받음').toBe(false);
    expect(k.whoSaw(await k.aliveBots(t), text), '산 봇이 받음').toEqual([]);
    expect((await t.state()).phase, '밤').toBe('NIGHT');
});

test('A06-E-052 죽은 의사는 의사 채팅 못 봄 (10명 판 직접 의사 2) → 처형된 사람 의사 칸에 의사 봇 밤 글 없음 @game', async ({ user, table }) => {
    test.setTimeout(300_000);
    const t = await k.deal(table, user, {
        bots: 9, me: 'DOCTOR', botRoles: ['JOKER', 'DOCTOR'], settings: customRoleSettings({ JOKER: 1, DOCTOR: 2 }),
    });
    const page = user.page;
    await a.toDay(t);
    await k.execute(t, user.account.uuid);
    await afterDeath(page);

    const text = c.uniq('의사밤말');
    expect((await c.botNightSay(t, 1, text))?.ok, '의사 봇 밤 채팅').toBe(true);
    // 의사 봇 자신은 받음 (글이 진짜 나갔다는 표시)
    await expect.poll(() => k.heard(t.bots[1], k.ROLE_EVT, text)).toBe(true);

    // 그 뒤에 내가 보낸 글이 내 칸에 옴 → 그 앞에 온 글이 있었다면 이미 보였음
    const marker = c.uniq('내표시');
    await c.say(page, marker);
    await c.expectLine(page, user.account.nickname, marker);
    await expect(c.chatLog(page)).not.toContainText(text);
    expect((await t.state()).phase, '밤').toBe('NIGHT');
});

test('A06-E-053 죽은 사람 투표 단계 글도 산 봇 0 (8명 판) → 2일 투표 단계에 보낸 글: 죽은 봇만 받음 @game', async ({ user, table }) => {
    test.setTimeout(300_000);
    const { t, deadBot } = await k.twoDead(table, user);
    const page = user.page;
    await t.advance();
    await a.waitState(t, (g) => g.phase === 'DAY' && g.dayPhase === 'DAY_VOTE');

    const text = c.uniq('투표중저승');
    await afterDeath(page);
    await c.say(page, text);
    await expect.poll(() => k.heard(deadBot, k.DEAD_EVT, text), { message: '죽은 봇이 받음' }).toBe(true);
    await k.settleBots(t);
    expect(k.whoSaw(await k.aliveBots(t), text), '산 봇이 받음').toEqual([]);
    const s = await t.state();
    expect([s.phase, s.dayPhase], '투표 단계에 보냄').toEqual(['DAY', 'DAY_VOTE']);
});

test('A06-E-054 산 사람 화면엔 죽은 사람 글·표시 없음 (8명 판) → 죽은 봇 글이 칸에 없고 "죽은 사람끼리"도 없음 @game', async ({ user, table }) => {
    test.setTimeout(240_000);
    const t = await k.deal(table, user, { bots: 7, me: 'CITIZEN', botRoles: ['JOKER', 'DOCTOR', 'GUARD'] });
    const page = user.page;
    await a.toDay(t);
    // 봇 하나를 1일 재판으로 처형 → 2일 낮 (사람은 살아 있음)
    const deadBot = t.bots[6];
    await k.execute(t, k.uid(deadBot));
    await k.intoDay(t, page);

    const text = c.uniq('죽은봇혼잣말');
    await k.botSayOk(t, 6, text);
    // 죽은 봇 자신은 받음 (글이 진짜 나갔다는 표시)
    await expect.poll(() => k.heard(deadBot, k.DEAD_EVT, text)).toBe(true);

    // 그 뒤에 산 봇이 보낸 낮 글이 내 칸에 옴 → 그 앞에 온 글이 있었다면 이미 보였음
    const marker = c.uniq('산봇표시');
    await k.botSayOk(t, 3, marker);
    await c.expectLine(page, t.bots[3].nickname, marker);
    await expect(c.chatLog(page)).not.toContainText(text);
    await expect(c.deadBadge(page)).toHaveCount(0);
});

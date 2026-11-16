'use strict';

// 밤 직업 채팅 브라우저 시험 (PC) — 시민은 밤에 채팅 칸이 닫히고 남의 직업 글을 못 봄, 광대·의사·경비원·마녀사냥꾼은 같은 직업끼리만
// 목록 A06-판중-채팅.md 번호 A06-E-019~036
const { test, expect } = require('../../helpers/fixtures');
const { customRoleSettings } = require('../../helpers/game');
const a = require('./a-day/_lib');
const c = require('./c-chat/_lib');
const n = require('./b-night/_night');
const k = require('./_a06-simple-kit');

// 6명 자동 구성 판(광대 1·의사 1·시민 4): 사람 시민, 봇 0 광대, 봇 1 의사 → 첫 밤
async function citizenNight(table, user) {
    const t = await k.deal(table, user, { bots: 5, me: 'CITIZEN', botRoles: ['JOKER', 'DOCTOR'] });
    await a.toDay(t);
    await c.phaseTo(t, 'NIGHT');
    return t;
}

test('A06-E-019 밤 시민 까닭 글이 진짜 보임 (6명 판) → "밤에는 시민이 채팅을 쓸 수 없습니다"가 읽히고 입력칸 없음 @game @smoke', async ({ user, table }) => {
    await citizenNight(table, user);
    const page = user.page;
    await k.readableOnceClear(page, k.closedNote(page));
    await expect(k.closedNote(page)).toHaveText(k.CLOSED_TEXT);
    await expect(c.chatBox(page)).toHaveCount(0);
    await expect(c.sendButton(page)).toHaveCount(0);
});

// 시민 화면에 남의 직업 밤 채팅이 안 옴 (값 2: 광대 봇·의사 봇)
const LEAK_CASES = [
    ['A06-E-020', '광대', 0],
    ['A06-E-021', '의사', 1],
];
for (const [id, roleName, botIndex] of LEAK_CASES) {
    test(`${id} 시민 화면에 ${roleName} 글 없음 (6명 판) → ${roleName} 봇이 밤 채팅을 해도 시민 채팅 칸에 그 글 없음 @game`, async ({ user, table }) => {
        // 판 차리기 전에 걸어야 화면 소켓이 받은 알림이 다 적힘
        const frames = c.watchSocket(user.page);
        const t = await citizenNight(table, user);
        const page = user.page;
        await k.readableOnceClear(page, k.closedNote(page));

        const text = c.uniq(`${roleName}밤말`);
        expect((await c.botNightSay(t, botIndex, text))?.ok, `${roleName} 봇 밤 채팅`).toBe(true);
        // 그 봇 자신은 받음 (글이 진짜 나갔다는 표시)
        await expect.poll(() => k.heard(t.bots[botIndex], k.ROLE_EVT, text)).toBe(true);

        // 그 뒤에 보낸 단계 알림이 화면에 올 때까지 → 그 앞에 보낸 채팅이 있었다면 이미 와 있음
        await k.fencePage(t, frames);
        expect(frames.filter((f) => f.event === k.ROLE_EVT).length, '시민 화면 소켓이 받은 직업 채팅 수').toBe(0);
        await expect(c.chatLog(page)).not.toContainText(text);
    });
}

test('A06-E-022 시민은 키보드로도 입력칸에 못 감 (6명 판) → 밤에 Tab을 여러 번 눌러도 채팅 글칸에 초점이 안 감 @game', async ({ user, table }) => {
    await citizenNight(table, user);
    const page = user.page;
    await k.readableOnceClear(page, k.closedNote(page));
    // 안내 창이 떠 있으면 Tab이 그 창 안에 갇힘 → 다 닫힌 뒤에 돎
    await k.noOverlays(page);

    // Tab으로 화면을 한 바퀴 넘게 돌며 초점이 간 것의 이름을 모음
    const visited = [];
    for (let i = 0; i < 60; i += 1) {
        await page.keyboard.press('Tab');
        visited.push(await page.evaluate(() => {
            const el = document.activeElement;
            if (!el || el === document.body) return '';
            return el.getAttribute('aria-label') || el.textContent.trim().slice(0, 30);
        }));
    }
    // 채팅 틀까지는 초점이 옴 (Tab이 채팅 자리를 지나갔다는 표시)
    expect(visited, 'Tab이 채팅 틀을 지나감').toContain('채팅 크게 보기');
    expect(visited, '채팅 글칸에 초점').not.toContain('채팅 입력');
    expect(visited, '보내기 단추에 초점').not.toContain('채팅 보내기');
    await expect(c.chatBox(page)).toHaveCount(0);
});

test('A06-E-023 시민이 다음 낮엔 다시 씀 (6명 판) → 밤엔 닫혔다가 낮이 되면 보낸 글을 봇 전원이 받음 @game', async ({ user, table }) => {
    const t = await citizenNight(table, user);
    const page = user.page;
    await k.readableOnceClear(page, k.closedNote(page));
    await expect(c.chatBox(page)).toHaveCount(0);

    await k.intoDay(t, page);
    await expect(k.closedNote(page)).toHaveCount(0);
    const text = c.uniq('다시낮');
    await c.say(page, text);
    await expect.poll(() => t.bots.filter((b) => k.heard(b, k.DAY_EVT, text)).length, { message: '낮 채팅을 받은 봇 수' }).toBe(t.bots.length);
});

// 같은 직업 채팅 (값 4): 사람 직업마다 판 인원·직접 구성이 다름 (목록 그대로)
const SAME_ROLE = [
    { name: '광대', role: 'JOKER', size: 7, counts: { JOKER: 2 } },
    { name: '의사', role: 'DOCTOR', size: 6, counts: { JOKER: 1, DOCTOR: 2 } },
    { name: '경비원', role: 'GUARD', size: 8, counts: { JOKER: 1, GUARD: 2 } },
    { name: '마녀사냥꾼', role: 'WITCH_HUNTER', size: 10, counts: { JOKER: 1, WITCH_HUNTER: 2 } },
];

// 사람과 같은 직업 봇이 하나 있는 판의 첫 밤 → { t, mate(같은 직업 봇), mateIndex }
async function sameRoleNight(table, user, row) {
    // 사람이 광대면 봇 0이 동료 광대, 아니면 봇 0 광대·봇 1이 동료
    const botRoles = row.role === 'JOKER' ? ['JOKER'] : ['JOKER', row.role];
    const mateIndex = row.role === 'JOKER' ? 0 : 1;
    const t = await k.deal(table, user, { bots: row.size - 1, me: row.role, botRoles, settings: customRoleSettings(row.counts) });
    await a.toDay(t);
    await k.intoNight(t, user.page);
    return { t, mate: t.bots[mateIndex], mateIndex };
}

SAME_ROLE.forEach((row, i) => {
    const id = `A06-E-${String(24 + i).padStart(3, '0')}`;
    test(`${id} 사람 ${row.name} 밤 채팅은 같은 직업 봇만 받음 (${row.size}명 판 직접 ${row.name} 2) → 다른 봇 0 @game`, async ({ user, table }) => {
        if (row.size >= 8) test.setTimeout(240_000);
        const { t, mate } = await sameRoleNight(table, user, row);
        const text = c.uniq(`${row.name}끼리`);
        await c.say(user.page, text);
        await expect.poll(() => k.heard(mate, k.ROLE_EVT, text), { message: '같은 직업 봇이 받음' }).toBe(true);
        await k.settleBots(t);
        expect(k.whoSaw(t.bots.filter((b) => b !== mate), text), '다른 봇이 받음').toEqual([]);
    });
});

SAME_ROLE.forEach((row, i) => {
    const id = `A06-E-${String(28 + i).padStart(3, '0')}`;
    test(`${id} 같은 직업(${row.name}) 봇 글이 사람 화면에 보임 (${row.size}명 판 직접 ${row.name} 2) @game`, async ({ user, table }) => {
        if (row.size >= 8) test.setTimeout(240_000);
        const { t, mate, mateIndex } = await sameRoleNight(table, user, row);
        await c.readyToChat(user.page);
        const text = c.uniq(`${row.name}봇말`);
        expect((await c.botNightSay(t, mateIndex, text))?.ok, '동료 봇 밤 채팅').toBe(true);
        await c.expectLine(user.page, mate.nickname, text);
    });
});

test('A06-E-032 직업 혼자면 자기 글만 (5명 판 광대 1) → 자기 칸에 자기 글, 받은 봇 0 @game', async ({ user, table }) => {
    const t = await k.deal(table, user, { bots: 4, me: 'JOKER' });
    const page = user.page;
    await a.toDay(t);
    await k.intoNight(t, page);
    const text = c.uniq('혼잣말');
    await c.say(page, text);
    await c.expectLine(page, user.account.nickname, text);
    await k.settleBots(t);
    expect(k.whoSaw(t.bots, text), '글을 받은 봇').toEqual([]);
});

test('A06-E-033 둘째 밤에도 시민 닫힘 (7명 판) → 1일 밤·2일 밤 모두 입력칸 없음 + 까닭 글 @game', async ({ user, table }) => {
    test.setTimeout(240_000);
    const t = await k.deal(table, user, { bots: 6, me: 'CITIZEN', botRoles: ['JOKER', 'DOCTOR'] });
    const page = user.page;
    await a.toDay(t);
    await c.phaseTo(t, 'NIGHT');
    await k.readableOnceClear(page, k.closedNote(page));

    // 2일 낮(입력칸 다시 열림)을 거쳐 2일 밤
    await k.intoDay(t, page);
    await expect(c.chatBox(page)).toBeVisible();
    await expect(k.closedNote(page)).toHaveCount(0);
    await t.advanceUntil((s) => s.phase === 'NIGHT' && s.dayIndex === 2, { stepDelayMs: 500 });
    await k.readableOnceClear(page, k.closedNote(page));
    await expect(k.closedNote(page)).toHaveText(k.CLOSED_TEXT);
    await expect(c.chatBox(page)).toHaveCount(0);
});

test('A06-E-034 둘째 밤에도 의사 채팅 됨 (7명 판 직접 의사 2) → 2일 밤 사람 의사 글을 의사 봇이 받음 @game', async ({ user, table }) => {
    test.setTimeout(240_000);
    const t = await k.deal(table, user, {
        bots: 6, me: 'DOCTOR', botRoles: ['JOKER', 'DOCTOR'], settings: customRoleSettings({ JOKER: 1, DOCTOR: 2 }),
    });
    const page = user.page;
    const mate = t.bots[1];
    await a.toDay(t);
    await k.intoNight(t, page);
    await k.intoDay(t, page);
    await t.advanceUntil((s) => s.phase === 'NIGHT' && s.dayIndex === 2, { stepDelayMs: 500 });
    await k.confirmNotice(page, '밤이 되었습니다');

    const text = c.uniq('둘째밤');
    await c.say(page, text);
    await expect.poll(() => k.heard(mate, k.ROLE_EVT, text), { message: '의사 봇이 받음' }).toBe(true);
    await k.settleBots(t);
    expect(k.whoSaw(t.bots.filter((b) => b !== mate), text), '다른 봇이 받음').toEqual([]);
});

test('A06-E-035 동료가 죽으면 그 동료는 못 받음 (8명 판 직접 의사 2) → 1일 처형된 의사 봇은 밤 의사 글 0 @game', async ({ user, table }) => {
    test.setTimeout(240_000);
    const t = await k.deal(table, user, {
        bots: 7, me: 'DOCTOR', botRoles: ['JOKER', 'DOCTOR'], settings: customRoleSettings({ JOKER: 1, DOCTOR: 2 }),
    });
    const page = user.page;
    const deadMate = t.bots[1];
    await a.toDay(t);
    await k.execute(t, k.uid(deadMate));
    await k.confirmNotice(page, '밤이 되었습니다');

    const text = c.uniq('남은의사');
    await c.say(page, text);
    // 내 글은 내 칸에 옴 (글이 진짜 나갔다는 표시)
    await c.expectLine(page, user.account.nickname, text);
    await k.settleBots(t);
    expect(k.sawText(deadMate, text), '죽은 의사 봇이 받음').toBe(false);
    expect(k.whoSaw(t.bots, text), '글을 받은 봇').toEqual([]);
});

test('A06-E-036 밤에 광대에게 찍힌 사람도 밤 끝까지 직업 채팅 (6명 판 직접 의사 1) → 지목된 뒤에도 보낸 글이 나감 [지금 동작] @game', async ({ user, table }) => {
    const t = await k.deal(table, user, {
        bots: 5, me: 'DOCTOR', botRoles: ['JOKER'], settings: customRoleSettings({ JOKER: 1, DOCTOR: 1 }),
    });
    const page = user.page;
    const me = user.account;
    await a.toDay(t);
    await k.intoNight(t, page);

    // 광대 차례에 광대 봇이 사람(의사)을 찍음
    await n.toTurn(t, 'JOKER');
    expect((await n.botNight(t, t.bots[0], me.uuid))?.ok, '광대 봇 지목').toBe(true);

    // 찍힌 직후 (광대 차례 중)
    const first = c.uniq('찍힌뒤');
    await c.say(page, first);
    await c.expectLine(page, me.nickname, first);

    // 광대 차례가 닫히고 의사 차례가 된 뒤 (그 밤 남은 동안)
    await t.advance();
    await a.waitState(t, (g) => g.phase === 'NIGHT' && g.nightTurnRole === 'DOCTOR');
    const second = c.uniq('밤끝까지');
    await c.say(page, second);
    await c.expectLine(page, me.nickname, second);
    expect((await t.state()).phase, '아직 그 밤').toBe('NIGHT');
});

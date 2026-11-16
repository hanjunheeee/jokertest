'use strict';

// 채팅이 겹치고 끊기는 순간을 사람 여럿으로 확인(어려움): 다섯 사람 같은 순간 보내기, 새로고침 중 온 글, 번갈아 0.3초, 새 탭으로 옮김
// 목록 A06-H-009·010·012·019 — 쓰는 동안엔 안 돌림: npx playwright test --list tests/ingame/a06-hard-concurrent.spec.js
const { test, expect } = require('../../helpers/fixtures');
const { customRoleSettings } = require('../../helpers/game');
const ui = require('../../helpers/ui');
const c = require('./c-chat/_lib');
const { hostGame } = require('../room/roomHelpers');

// 단계 시간을 길게 둠: 단계는 손잡이로 넘기고, 확인하는 동안 진짜 마감이 끼어들지 않게 (이 파일은 마감 시간을 안 봄)
const SLOW = Object.freeze({ dayDiscussionTime: 150, dayVoteTime: 90, tribunalTime: 120, nightActionTime: 120 });
const DAY_NOTICE = '낮이 되었습니다';
const DAY_EVT = 'day_chat_message_received';

// 시험마다 다른 글 (다른 시험 채팅과 안 섞이게)
const uniq = (prefix) => `${prefix}${Math.random().toString(36).slice(2, 7)}`;
const nick = (who) => who.account.nickname;
const heardAny = (bot, text) => bot.events.some((r) => r.payload?.text === text);
const hears = (bot, event, text) => bot.waitForEvent(event, { match: (p) => p?.text === text });
// 그 사람이 보낸 낮 채팅 중 봇이 받은 글 (온 순서대로)
const heardFrom = (bot, who) => bot.events
    .filter((r) => r.event === DAY_EVT && r.payload?.senderUuid === who.account.uuid)
    .map((r) => r.payload.text);

/**
 * 판 차리기: 사람 여럿 + 봇, 직업을 전부 정하고 서버 값으로 한 번 확인 → 역할 확인 창 닫음
 * counts를 주면 직접 구성(예: { JOKER: 1, DOCTOR: 2 }), 안 주면 자동 구성
 */
async function seat(table, humans, { humanRoles, botRoles, counts = null }) {
    const t = await table.setup({
        humans,
        bots: botRoles.length,
        settings: counts ? customRoleSettings(counts, SLOW) : { ...SLOW },
        roles: ({ bots }) => ({
            ...Object.fromEntries(humans.map((h, i) => [h.account.uuid, humanRoles[i]])),
            ...Object.fromEntries(bots.map((b, i) => [b.account.uuid, botRoles[i]])),
        }),
    });
    const s = await t.state();
    const roleOf = (uuid) => s.players.find((p) => p.uuid === uuid)?.role;
    humans.forEach((h, i) => expect(roleOf(h.account.uuid), `사람 ${i} 직업`).toBe(humanRoles[i]));
    t.bots.forEach((b, i) => expect(roleOf(b.account.uuid), `봇 ${i} 직업`).toBe(botRoles[i]));
    await Promise.all(humans.map((h) => ui.readRoleReveal(h.page)));
    return t;
}

/** 연출·안내 창을 닫아 가며 채팅 칸을 쓸 수 있을 때까지 (밤 암살 영상이 멈춰 있으면 그 창의 단추) */
async function ready(page) {
    await expect(async () => {
        const stuck = page.locator('[data-ingame-night-success-kill] button').first();
        if (await stuck.isVisible().catch(() => false)) await stuck.click({ timeout: 1000 }).catch(() => {});
        await c.readyToChat(page, { timeoutMs: 2500 });
    }).toPass({ timeout: 40000 });
}

/**
 * 화면이 낮·밤 시작을 따라왔는지: "낮이 되었습니다"·"밤이 되었습니다" 창이 뜰 때까지 → 확인 눌러 닫고 채팅 칸 준비
 * (PC 시간 바는 접혀 있어 단계 글이 안 보임 → 이 창이 단계가 바뀐 표시, 앞 단계 창·추방 연출은 닫아 가며 기다림)
 */
async function passNotice(page, text) {
    const notice = page.getByRole('dialog', { name: '단계 전환 안내' });
    await expect(async () => {
        const stuck = page.locator('[data-ingame-night-success-kill] button').first();
        if (await stuck.isVisible().catch(() => false)) await stuck.click({ timeout: 1000 }).catch(() => {});
        const expulsion = page.locator('[data-ingame-tribunal-expulsion]').last();
        if (await expulsion.isVisible().catch(() => false)) await expulsion.click({ timeout: 500, force: true }).catch(() => {});
        if (await notice.isVisible().catch(() => false)) {
            const said = await notice.innerText().catch(() => '');
            if (!said.includes(text)) await notice.getByRole('button', { name: '확인' }).click({ timeout: 1000 }).catch(() => {});
        }
        await expect(notice).toContainText(text, { timeout: 1000 });
    }).toPass({ timeout: 45000 });
    await notice.getByRole('button', { name: '확인' }).click();
    await ready(page);
}

/** 화면에서 말하고 내 칸에 그 줄이 보일 때까지 (서버가 나에게도 돌려준 것) */
async function sayAndSee(who, text) {
    await c.say(who.page, text);
    await c.expectLine(who.page, nick(who), text);
}

test('A06-H-009 다섯 사람 같은 순간 낮 채팅 (사람 5 = 5명): 동시에 보내면 다섯 화면 모두 5줄, 빠진 줄 0 @game @hard @smoke', async ({ user, players }) => {
    test.setTimeout(300_000);
    const guests = [await players.add(), await players.add(), await players.add(), await players.add()];
    const people = [user, ...guests];
    // 봇이 없는 판이라 사람이 방장 (화면으로 방 만들기), 직업은 정해 둠: 방장 광대·나머지 시민
    const t = await hostGame({
        host: user,
        guests,
        roles: Object.fromEntries(people.map((p, i) => [p.account.uuid, i === 0 ? 'JOKER' : 'CITIZEN'])),
    });
    const start = await t.state();
    expect(start.players).toHaveLength(5);
    expect(start.players.find((p) => p.uuid === user.account.uuid)?.role).toBe('JOKER');
    await Promise.all(people.map((p) => ui.readRoleReveal(p.page)));
    await t.advanceUntil('DAY');
    await Promise.all(people.map((p) => passNotice(p.page, DAY_NOTICE)));

    // 다섯 명이 글을 써 두고 같은 순간 엔터
    const texts = people.map((_, i) => uniq(`동시${i}`));
    await Promise.all(people.map((p, i) => c.chatBox(p.page).fill(texts[i])));
    await Promise.all(people.map((p) => c.chatBox(p.page).press('Enter')));

    for (const viewer of people) {
        for (let i = 0; i < people.length; i += 1) await c.expectLine(viewer.page, nick(people[i]), texts[i]);
        await expect(c.chatLog(viewer.page).getByRole('listitem')).toHaveCount(5);
    }
});

test('A06-H-010 새로고침 중 온 글 (사람 2 + 봇 3 = 5명): 한 사람이 화면을 다시 여는 동안 온 글은 다시 붙은 뒤에도 없음 @game @hard', async ({ user, players, table }) => {
    test.setTimeout(240_000);
    const reloader = user;
    const sender = await players.add();
    const t = await seat(table, [reloader, sender], {
        humanRoles: ['CITIZEN', 'CITIZEN'],
        botRoles: ['JOKER', 'CITIZEN', 'CITIZEN'],
    });
    await t.advanceUntil('DAY');
    await Promise.all([passNotice(reloader.page, DAY_NOTICE), passNotice(sender.page, DAY_NOTICE)]);

    // 새로고침의 앞 절반(화면이 내려감)과 뒤 절반(다시 열림) 사이에 글이 오게 둘로 나눔:
    // 한 번에 새로고침하면 옛 화면이 받을지 새 화면이 못 받을지가 그때그때 달라짐
    const url = reloader.page.url();
    await reloader.page.goto('about:blank');
    const gone = sender.page.locator(`[data-ingame-player-nickname="${nick(reloader)}"][data-ingame-player-status="disconnected"]`);
    await expect(gone).toHaveCount(1, { timeout: 20000 });

    const missed = uniq('그사이');
    await sayAndSee(sender, missed);
    await Promise.all(t.bots.map((b) => hears(b, DAY_EVT, missed)));

    // 다시 열림 → 같은 판에 다시 붙음
    await reloader.page.goto(url);
    await expect(reloader.page).toHaveURL(/\/ingame/, { timeout: 20000 });
    await ready(reloader.page);
    // 다시 붙은 뒤 온 글은 보임 → 그때도 그사이 온 글은 없음 (판 값에 채팅 기록이 없어 다시 안 옴)
    const after = uniq('붙은뒤');
    await sayAndSee(sender, after);
    await c.expectLine(reloader.page, nick(sender), after);
    await expect(c.chatLog(reloader.page)).not.toContainText(missed);
});

test('A06-H-012 두 사람 번갈아 0.3초 (사람 2 + 봇 3 = 5명): 번갈아 보내면 다 가고 한 사람이 0.3초 만에 연달아 보낸 글만 거절 @game @hard @realtime', async ({ user, players, table }) => {
    test.setTimeout(240_000);
    const one = user;
    const two = await players.add();
    const t = await seat(table, [one, two], {
        humanRoles: ['CITIZEN', 'CITIZEN'],
        botRoles: ['JOKER', 'CITIZEN', 'CITIZEN'],
    });
    await t.advanceUntil('DAY');
    await Promise.all([passNotice(one.page, DAY_NOTICE), passNotice(two.page, DAY_NOTICE)]);

    const boxOne = c.chatBox(one.page);
    const boxTwo = c.chatBox(two.page);
    // 그 시각까지 진짜로 기다림 (0.5초 간격 규칙을 보는 케이스라 손잡이·가짜 시계 없음)
    const until = (at) => one.page.waitForTimeout(Math.max(0, at - Date.now()));
    const texts = [uniq('가하나'), uniq('나하나'), uniq('가둘'), uniq('나둘')];

    // 번갈아 0.3초: 가(0초) → 나(0.3초) → 가(0.6초) → 나(0.9초) — 한 사람 기준으로는 0.6초 간격
    await boxOne.fill(texts[0]);
    await boxTwo.fill(texts[1]);
    await boxOne.press('Enter');
    const start = Date.now();
    const sentAt = [start];
    await until(start + 300);
    await boxTwo.press('Enter');
    sentAt.push(Date.now());
    await expect(boxOne).toHaveValue('');
    await boxOne.fill(texts[2]);
    await until(start + 600);
    await boxOne.press('Enter');
    sentAt.push(Date.now());
    await expect(boxTwo).toHaveValue('');
    await boxTwo.fill(texts[3]);
    // 나의 둘째 글은 나의 첫 글이 실제로 나간 때부터 0.6초 뒤 (느린 날 첫 글 누름이 늦게 끝나면 처음 시각 기준으론 0.5초 안이 됨)
    await until(Math.max(start + 900, sentAt[1] + 600));
    await boxTwo.press('Enter');
    sentAt.push(Date.now());
    // 이 케이스가 맞게 차려졌는지: 서로 다른 사람 사이는 0.5초 안, 같은 사람 사이는 0.5초 넘게
    expect(sentAt[1] - sentAt[0]).toBeLessThan(480);
    expect(sentAt[2] - sentAt[1]).toBeLessThan(480);
    expect(sentAt[3] - sentAt[2]).toBeLessThan(480);
    expect(sentAt[2] - sentAt[0]).toBeGreaterThan(520);
    expect(sentAt[3] - sentAt[1]).toBeGreaterThan(520);
    await Promise.all(t.bots.flatMap((b) => texts.map((text) => hears(b, DAY_EVT, text))));

    // 한 사람이 연달아 0.3초: 첫 글은 가고 둘째 글은 거절
    await expect(boxOne).toHaveValue('');
    const passed = uniq('연달아첫');
    const refused = uniq('연달아둘');
    await until(sentAt[2] + 650);
    await boxOne.fill(passed);
    await boxOne.press('Enter');
    const firstAt = Date.now();
    await expect(boxOne).toHaveValue('');
    await boxOne.fill(refused);
    await until(firstAt + 300);
    await boxOne.press('Enter');
    expect(Date.now() - firstAt, '연달아 두 글 사이가 0.5초를 넘으면 이 케이스가 아님').toBeLessThan(480);

    // 같은 사람이 0.65초 뒤 표지 글: 표지가 봇에 오면 그 앞에 보낸 거절 글 처리도 끝난 것
    await until(firstAt + 650);
    const mark = uniq('표지');
    await boxOne.fill(mark);
    await boxOne.press('Enter');
    await Promise.all(t.bots.map((b) => hears(b, DAY_EVT, mark)));
    for (const b of t.bots) {
        expect(heardFrom(b, one)).toEqual([texts[0], texts[2], passed, mark]);
        expect(heardFrom(b, two)).toEqual([texts[1], texts[3]]);
        expect(heardAny(b, refused)).toBe(false);
    }
    await expect(c.chatLog(two.page)).not.toContainText(refused);
});

test('A06-H-019 판 중 새 탭으로 옮김 (사람 2 + 봇 5 = 7명): 새 탭 글은 다른 사람 화면에 보이고 옛 탭 글은 안 보임 @game @hard', async ({ user, players, table }) => {
    test.setTimeout(240_000);
    const mover = user;
    const watcher = await players.add();
    const t = await seat(table, [mover, watcher], {
        humanRoles: ['CITIZEN', 'CITIZEN'],
        botRoles: ['JOKER', 'DOCTOR', 'CITIZEN', 'CITIZEN', 'CITIZEN'],
    });
    await t.advanceUntil('DAY');
    await Promise.all([passNotice(mover.page, DAY_NOTICE), passNotice(watcher.page, DAY_NOTICE)]);

    // 같은 브라우저(같은 쿠키) 새 탭으로 판을 이어 감 → 옛 탭은 밀려남 (밀려난 탭의 알림 창은 받아서 닫음)
    mover.page.on('dialog', (dialog) => dialog.accept().catch(() => {}));
    const tab = await mover.context.newPage();
    tab.on('dialog', (dialog) => dialog.accept().catch(() => {}));
    await tab.goto(mover.page.url());
    await expect(tab).toHaveURL(/\/ingame/, { timeout: 20000 });
    await ready(tab);

    const fromNew = uniq('새탭');
    await c.say(tab, fromNew);
    await c.expectLine(watcher.page, nick(mover), fromNew);
    await Promise.all(t.bots.map((b) => hears(b, DAY_EVT, fromNew)));

    // 옛 탭에서 보내 봄 (밀려나 칸이 막혔으면 못 치는 것도 "안 감"이라 그대로 넘어감)
    const fromOld = uniq('옛탭');
    await c.chatBox(mover.page).fill(fromOld, { timeout: 5000 }).catch(() => {});
    await c.chatBox(mover.page).press('Enter', { timeout: 5000 }).catch(() => {});

    // 새 탭 표지 글이 다른 사람 화면에 보인 뒤에도 옛 탭 글은 없음
    const mark = uniq('새탭표지');
    await c.say(tab, mark);
    await c.expectLine(watcher.page, nick(mover), mark);
    await expect(c.chatLog(watcher.page)).not.toContainText(fromOld);
    await Promise.all(t.bots.map((b) => hears(b, DAY_EVT, mark)));
    for (const b of t.bots) expect(heardAny(b, fromOld), `봇 ${b.nickname}이 옛 탭 글을 받음`).toBe(false);
});

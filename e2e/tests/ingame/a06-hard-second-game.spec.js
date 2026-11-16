'use strict';

// 같은 방 둘째 판에서 직업이 바뀐 사람의 채팅(어려움): 첫 판 의사 → 둘째 판 시민이면 밤에 닫히고, 첫 판 채팅이 둘째 판 칸에 없음
// 목록 A06-H-008 — 쓰는 동안엔 안 돌림: npx playwright test --list tests/ingame/a06-hard-second-game.spec.js
const { test, expect, e2e } = require('../../helpers/fixtures');
const { Table, customRoleSettings } = require('../../helpers/game');
const { expectReadable } = require('../../helpers/visible');
const ui = require('../../helpers/ui');
const day = require('./a-day/_lib');
const c = require('./c-chat/_lib');
const { waitResult } = require('../room/roomHelpers');

// 단계 시간을 길게 둠: 단계는 손잡이로 넘기고, 확인하는 동안 진짜 마감이 끼어들지 않게 (이 파일은 마감 시간을 안 봄)
const SLOW = Object.freeze({ dayDiscussionTime: 150, dayVoteTime: 90, tribunalTime: 120, nightActionTime: 120 });
const NIGHT_CLOSED = '밤에는 귀족이 채팅을 쓸 수 없습니다';
const DAY_NOTICE = '낮이 되었습니다';
const NIGHT_NOTICE = '밤이 되었습니다';

// 시험마다 다른 글 (다른 시험 채팅과 안 섞이게)
const uniq = (prefix) => `${prefix}${Math.random().toString(36).slice(2, 7)}`;
const nick = (who) => who.account.nickname;
const closedReason = (page) => page.getByText(NIGHT_CLOSED, { exact: true });

/** 조건에 맞는 봇만 (서버 판 값 기준) */
async function pick(t, match) {
    const s = await t.state();
    return t.bots.filter((b) => match(s.players.find((p) => p.uuid === b.account.uuid)));
}

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

/** 밤 시민 화면: 입력칸 대신 까닭 글이 읽힘 (추방 연출·늦게 뜬 안내 창은 넘겨 가며) */
async function expectNightClosed(page) {
    await expect(async () => {
        const expulsion = page.locator('[data-ingame-tribunal-expulsion]').last();
        if (await expulsion.isVisible().catch(() => false)) await expulsion.click({ timeout: 500, force: true }).catch(() => {});
        await c.dismissOverlays(page);
        await expectReadable(closedReason(page), { timeout: 1500 });
    }).toPass({ timeout: 45000 });
    await expect(c.chatBox(page)).toHaveCount(0);
}

/** 화면에서 말하고 내 칸에 그 줄이 보일 때까지 (서버가 나에게도 돌려준 것) */
async function sayAndSee(who, text) {
    await c.say(who.page, text);
    await c.expectLine(who.page, nick(who), text);
}

/** 판이 끝난 화면: 앞 연출(추방·암살 영상)을 넘기고 결과 화면 본체까지 → 참가자 목록 */
async function toResult(page) {
    await expect(async () => {
        const stuck = page.locator('[data-ingame-night-success-kill] button').first();
        if (await stuck.isVisible().catch(() => false)) await stuck.click({ timeout: 1000 }).catch(() => {});
        const expulsion = page.locator('[data-ingame-tribunal-expulsion]').last();
        if (await expulsion.isVisible().catch(() => false)) await expulsion.click({ timeout: 500, force: true }).catch(() => {});
        await expect(page).toHaveURL(/\/gameresult/, { timeout: 2000 });
    }).toPass({ timeout: 60000 });
    return waitResult(page);
}

test('A06-H-008 같은 방 둘째 판에서 직업이 바뀜 (사람 2 + 봇 4 = 6명, "대기방으로"): 첫 판 의사가 둘째 판 시민이면 밤에 닫히고 첫 판 채팅이 칸에 없음 @game @hard @smoke', async ({ user, players, table }) => {
    test.setTimeout(420_000);
    const first = user;
    const second = await players.add();
    const t = await seat(table, [first, second], {
        humanRoles: ['DOCTOR', 'CITIZEN'],
        botRoles: ['JOKER', 'CITIZEN', 'CITIZEN', 'CITIZEN'],
    });
    const jokerBot = t.bots[0];

    // 첫 판: 낮 글 하나, 밤 의사 글 하나
    await t.advanceUntil('DAY');
    await Promise.all([passNotice(first.page, DAY_NOTICE), passNotice(second.page, DAY_NOTICE)]);
    const oldDay = uniq('첫판낮');
    await sayAndSee(first, oldDay);
    await c.expectLine(second.page, nick(first), oldDay);
    const firstNight = await t.advanceUntil('NIGHT');
    await Promise.all([passNotice(first.page, NIGHT_NOTICE), expectNightClosed(second.page)]);
    const oldNight = uniq('첫판밤');
    await sayAndSee(first, oldNight);

    // 첫 판 끝내기: 둘째 낮에 광대 봇을 처형 (봇 표 3만으로는 기권 3을 못 넘어 사람 한 명이 화면으로 같이 찍음)
    await t.advanceUntil((s) => s.phase === 'DAY' && s.dayIndex > firstNight.dayIndex);
    await Promise.all([passNotice(first.page, DAY_NOTICE), passNotice(second.page, DAY_NOTICE)]);
    await t.advanceUntil('DAY_VOTE');
    await day.voteUi(first.page, jokerBot.nickname);
    const citizens = await pick(t, (p) => p.alive && p.role === 'CITIZEN');
    await day.botsVote(t, jokerBot.account.uuid, citizens);
    expect((await day.resolveVote(t)).phase, '광대 봇 재판이 열려야 함').toBe('TRIBUNAL');
    await day.botsTribunal(t, 'GUILTY', citizens);
    await day.resolveTribunal(t);
    await day.waitState(t, (s) => s.phase === 'ENDED');
    await Promise.all([toResult(first.page), toResult(second.page)]);

    // "대기방으로": 봇(원래 방장 먼저)과 사람 모두 같은 방으로 돌아감
    for (const bot of t.bots) {
        const reply = await bot.request('return_to_room', { gameId: t.gameId });
        expect(reply?.ok, `봇 대기방으로 답 ${reply?.code}`).toBe(true);
    }
    for (const person of [first, second]) {
        await person.page.getByRole('button', { name: '대기방으로' }).click();
        await expect(person.page).toHaveURL(/\/game-matching/, { timeout: 15000 });
    }
    let room = null;
    await expect.poll(async () => {
        room = await e2e.roomOf(t.bots[0].account.uuid);
        return room?.players.length ?? 0;
    }, { timeout: 15000 }).toBe(6);
    expect(room.roomCode).toBe(t.roomCode);
    const hostBot = t.bots.find((b) => b.account.uuid === room.hostUuid);
    expect(hostBot, '원래 방장 봇이 다시 방장이어야 함').toBeTruthy();

    // 둘째 판: 직업을 바꿔 정함 (첫 판 의사 → 시민, 첫 판 시민 → 의사)
    await e2e.setRoles({
        [first.account.uuid]: 'CITIZEN',
        [second.account.uuid]: 'DOCTOR',
        [t.bots[0].account.uuid]: 'JOKER',
        [t.bots[1].account.uuid]: 'CITIZEN',
        [t.bots[2].account.uuid]: 'CITIZEN',
        [t.bots[3].account.uuid]: 'CITIZEN',
    }, { roomId: room.roomId });
    for (const bot of t.bots) await bot.setReady(room.roomId, room.settingsVersion);
    for (const person of [first, second]) await ui.readyUi(person.page);
    const started = await hostBot.startGame(room.roomId, room.settingsVersion);
    expect(started.gameId).not.toBe(t.gameId);
    const next = new Table({ room, bots: t.bots, humans: [first, second] });
    next.gameId = started.gameId;
    for (const person of [first, second]) await expect(person.page).toHaveURL(/\/ingame/, { timeout: 20000 });
    const roleOf = async (uuid) => (await next.player(uuid))?.role;
    expect(await roleOf(first.account.uuid)).toBe('CITIZEN');
    expect(await roleOf(second.account.uuid)).toBe('DOCTOR');
    await Promise.all([first, second].map((p) => ui.readRoleReveal(p.page)));

    // 둘째 판 낮: 새 글은 오가고 첫 판 글은 칸에 없음
    await next.advanceUntil('DAY');
    await Promise.all([passNotice(first.page, DAY_NOTICE), passNotice(second.page, DAY_NOTICE)]);
    const newDay = uniq('둘째판낮');
    await sayAndSee(second, newDay);
    await c.expectLine(first.page, nick(second), newDay);
    for (const person of [first, second]) {
        await expect(c.chatLog(person.page)).not.toContainText(oldDay);
        await expect(c.chatLog(person.page)).not.toContainText(oldNight);
    }

    // 둘째 판 밤: 첫 판 의사였던 사람은 이제 시민 → 닫힘·까닭 글, 새 의사 글도 그 화면에 없음
    await next.advanceUntil('NIGHT');
    await Promise.all([expectNightClosed(first.page), passNotice(second.page, NIGHT_NOTICE)]);
    const newNight = uniq('둘째판밤');
    await sayAndSee(second, newNight);
    await expect(c.chatLog(first.page)).not.toContainText(newNight);
    await expect(c.chatLog(first.page)).not.toContainText(oldNight);
    await expect(c.chatLog(first.page)).not.toContainText(oldDay);
    await expectNightClosed(first.page);
});

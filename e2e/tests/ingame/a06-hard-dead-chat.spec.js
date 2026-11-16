'use strict';

// 죽은 사람끼리 채팅을 사람 여럿 화면으로 확인(어려움): 죽은 둘은 서로 보이고 산 사람 화면엔 없음, 처형된 시민과 산 시민
// 목록 A06-H-006·007 — 쓰는 동안엔 안 돌림: npx playwright test --list tests/ingame/a06-hard-dead-chat.spec.js
const { test, expect } = require('../../helpers/fixtures');
const { customRoleSettings } = require('../../helpers/game');
const { expectReadable } = require('../../helpers/visible');
const ui = require('../../helpers/ui');
const day = require('./a-day/_lib');
const c = require('./c-chat/_lib');

// 단계 시간을 길게 둠: 단계는 손잡이로 넘기고, 확인하는 동안 진짜 마감이 끼어들지 않게 (이 파일은 마감 시간을 안 봄)
const SLOW = Object.freeze({ dayDiscussionTime: 150, dayVoteTime: 90, tribunalTime: 120, nightActionTime: 120 });
const NIGHT_CLOSED = '밤에는 귀족이 채팅을 쓸 수 없습니다';
const DAY_NOTICE = '낮이 되었습니다';
const DEAD_EVT = 'dead_chat_message_received';
// "죽은 사람끼리" 표시 읽힘 확인 값: 표시를 감싼 칸이 눌림을 안 받게 돼 있어 "가려짐" 검사는 못 씀 (보임·화면 안·대비는 봄)
const BADGE_READABLE = Object.freeze({ uncovered: false });

// 시험마다 다른 글 (다른 시험 채팅과 안 섞이게)
const uniq = (prefix) => `${prefix}${Math.random().toString(36).slice(2, 7)}`;
const nick = (who) => who.account.nickname;
const heardAny = (bot, text) => bot.events.some((r) => r.payload?.text === text);
// 앞서 보낸 알림이 봇에 다 닿았는지: 같은 소켓으로 묻고 답을 받음 (소켓 하나 안에서는 순서가 지켜져 고정 쉬기 없이 "안 옴"을 봄)
const settle = (t, bots = t.bots) => Promise.all(bots.map((b) => b.snapshot(t.gameId)));
const closedReason = (page) => page.getByText(NIGHT_CLOSED, { exact: true });
// 채팅 칸의 죽은 사람 줄 (회색으로 그리는 줄)
const deadRows = (page) => c.chatLog(page).locator('li[data-chat-channel="DEAD"]');

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

/** 봇 표로 한 사람을 처형 (낮 투표 → 재판 유죄), 사람은 안 내서 기권으로 셈 */
async function execute(t, uuid) {
    await t.assertBotsCanExecute(uuid);
    await t.advanceUntil('DAY_VOTE');
    const voters = await pick(t, (p) => p.alive && p.uuid !== uuid);
    await day.botsVote(t, uuid, voters);
    expect((await day.resolveVote(t)).phase, '봇 표로 재판이 열려야 함').toBe('TRIBUNAL');
    await day.botsTribunal(t, 'GUILTY', voters);
    await day.resolveTribunal(t);
    await day.waitState(t, (s) => s.players.find((p) => p.uuid === uuid)?.alive === false);
}

/** 죽은 사람 화면: 연출 뒤에 뜨는 "사망 후 선택"에서 관전 계속하기 (앞 연출·안내 창이 잠깐 가려 여러 번 봄) */
async function keepWatching(page) {
    const dialog = page.getByRole('dialog', { name: '사망 후 선택' });
    await expect(async () => {
        const stuck = page.locator('[data-ingame-night-success-kill] button').first();
        if (await stuck.isVisible().catch(() => false)) await stuck.click({ timeout: 1000 }).catch(() => {});
        await c.dismissOverlays(page, { keepWatching: false });
        await dialog.getByRole('button', { name: '관전 계속하기' }).click({ timeout: 2000 });
    }).toPass({ timeout: 60000 });
    await expect(dialog).toBeHidden();
    await ready(page);
}

/** 화면에서 말하고 내 칸에 그 줄이 보일 때까지 (서버가 나에게도 돌려준 것) */
async function sayAndSee(who, text) {
    await c.say(who.page, text);
    await c.expectLine(who.page, nick(who), text);
}

/** 광대 봇들이 밤에 한 사람을 죽임: 광대 차례까지 → 직접 지목 → 그 사람이 죽을 때까지 (광대 사람은 안 골라도 최다표로 정해짐) */
async function killAtNight(t, victimUuid) {
    await t.advanceUntil((s) => s.phase === 'NIGHT' && s.nightTurnRole === 'JOKER');
    for (const joker of await pick(t, (p) => p.role === 'JOKER' && p.alive)) {
        const reply = await joker.request('submit_night_action', { gameId: t.gameId, targetId: victimUuid });
        expect(reply?.ok, `광대 봇 지목 답 ${reply?.code}`).toBe(true);
    }
    await t.advanceUntil((s) => s.players.find((p) => p.uuid === victimUuid)?.alive === false);
}

test('A06-H-006 죽은 두 사람끼리 대화 (사람 죽은 2·산 1 + 봇 7 = 10명): 죽은 둘은 서로 글이 보이고 산 사람 화면엔 죽은 사람 줄 0 @game @hard @smoke', async ({ user, players, table }) => {
    test.setTimeout(300_000);
    const executed = user;
    const killed = await players.add();
    const alive = await players.add();
    const t = await seat(table, [executed, killed, alive], {
        humanRoles: ['CITIZEN', 'CITIZEN', 'CITIZEN'],
        botRoles: ['JOKER', 'DOCTOR', 'GUARD', 'WITCH_HUNTER', 'CITIZEN', 'CITIZEN', 'CITIZEN'],
    });
    await t.advanceUntil('DAY');
    await Promise.all([executed, killed, alive].map((p) => passNotice(p.page, DAY_NOTICE)));

    // 1일 재판으로 한 사람 처형 → 그 밤 광대 봇이 또 한 사람을 죽임 → 둘째 낮 (죽은 사람 둘·산 사람 하나)
    await execute(t, executed.account.uuid);
    await Promise.all([keepWatching(executed.page), expectNightClosed(killed.page), expectNightClosed(alive.page)]);
    await killAtNight(t, killed.account.uuid);
    expect((await t.state()).phase).toBe('DAY');
    await Promise.all([ready(executed.page), keepWatching(killed.page), passNotice(alive.page, DAY_NOTICE)]);

    // 죽은 둘이 주고받음
    const first = uniq('죽은하나');
    const second = uniq('죽은둘');
    await sayAndSee(executed, first);
    await c.expectLine(killed.page, nick(executed), first);
    await sayAndSee(killed, second);
    await c.expectLine(executed.page, nick(killed), second);
    expect(await c.lineChannel(killed.page, first)).toBe('DEAD');
    await expectReadable(c.deadBadge(executed.page), BADGE_READABLE);
    await expectReadable(c.deadBadge(killed.page), BADGE_READABLE);

    // 산 사람: 자기 낮 글이 보인 뒤에도(그 앞에 온 알림은 다 그려짐) 죽은 사람 줄이 하나도 없음
    await sayAndSee(alive, uniq('산사람'));
    await expect(deadRows(alive.page)).toHaveCount(0);
    await expect(c.chatLog(alive.page)).not.toContainText(first);
    await expect(c.chatLog(alive.page)).not.toContainText(second);
    await expect(c.deadBadge(alive.page)).toHaveCount(0);
    // 산 봇도 죽은 사람 글을 못 받음
    const aliveBots = await pick(t, (p) => p.alive);
    await settle(t, aliveBots);
    for (const b of aliveBots) {
        expect(heardAny(b, first), `산 봇 ${b.nickname}이 죽은 사람 글을 받음`).toBe(false);
        expect(heardAny(b, second), `산 봇 ${b.nickname}이 죽은 사람 글을 받음`).toBe(false);
    }
});

test('A06-H-007 처형된 시민과 산 시민 (사람 시민·시민 + 봇 3 = 5명): 처형된 시민의 밤 글은 산 시민 화면에 없고 산 시민은 닫힘·까닭 글 @game @hard', async ({ user, players, table }) => {
    test.setTimeout(240_000);
    const executed = user;
    const alive = await players.add();
    const t = await seat(table, [executed, alive], {
        humanRoles: ['CITIZEN', 'CITIZEN'],
        botRoles: ['JOKER', 'CITIZEN', 'CITIZEN'],
    });
    await t.advanceUntil('DAY');
    await Promise.all([passNotice(executed.page, DAY_NOTICE), passNotice(alive.page, DAY_NOTICE)]);

    // 1일 재판으로 시민 한 사람 처형 → 그 밤
    const firstDay = await t.state();
    await execute(t, executed.account.uuid);
    await Promise.all([keepWatching(executed.page), expectNightClosed(alive.page)]);
    expect((await t.state()).phase).toBe('NIGHT');

    // 죽은 시민은 밤에도 죽은 사람 채팅을 씀 (입력칸 열림, 까닭 글 없음)
    await expect(closedReason(executed.page)).toHaveCount(0);
    const text = uniq('죽은시민');
    await sayAndSee(executed, text);
    expect(await c.lineChannel(executed.page, text)).toBe('DEAD');
    await expectReadable(c.deadBadge(executed.page), BADGE_READABLE);

    // 산 시민 화면: 그 글이 없고 입력칸은 닫힌 채 까닭 글
    await expect(c.chatLog(alive.page)).not.toContainText(text);
    await expectNightClosed(alive.page);
    const aliveBots = await pick(t, (p) => p.alive);
    await settle(t, aliveBots);
    for (const b of aliveBots) expect(heardAny(b, text), `산 봇 ${b.nickname}이 죽은 사람 글을 받음`).toBe(false);

    // 다음 낮: 산 시민이 자기 글을 본 뒤에도 죽은 사람 줄이 없음, 죽은 시민 봇이 없어 받은 봇도 없음
    await t.advanceUntil((s) => s.phase === 'DAY' && s.dayIndex > firstDay.dayIndex);
    await passNotice(alive.page, DAY_NOTICE);
    await sayAndSee(alive, uniq('다음낮'));
    await expect(deadRows(alive.page)).toHaveCount(0);
    await expect(c.chatLog(alive.page)).not.toContainText(text);
    for (const b of t.bots) expect(b.events.filter((r) => r.event === DEAD_EVT)).toHaveLength(0);
});

'use strict';

// 재판 창 채팅을 세 화면으로 확인(어려움): 피고 반론은 배심·죽은 사람 화면에 보이고, 죽은 사람 글은 피고·배심 화면에 없음
// 목록 A06-H-011 — 쓰는 동안엔 안 돌림: npx playwright test --list tests/ingame/a06-hard-tribunal-chat.spec.js
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
// "죽은 사람끼리" 표시 읽힘 확인 값: 표시를 감싼 칸이 눌림을 안 받게 돼 있어 "가려짐" 검사는 못 씀 (보임·화면 안·대비는 봄)
const BADGE_READABLE = Object.freeze({ uncovered: false });

// 시험마다 다른 글 (다른 시험 채팅과 안 섞이게)
const uniq = (prefix) => `${prefix}${Math.random().toString(36).slice(2, 7)}`;
const nick = (who) => who.account.nickname;
const heardAny = (bot, text) => bot.events.some((r) => r.payload?.text === text);
// 앞서 보낸 알림이 봇에 다 닿았는지: 같은 소켓으로 묻고 답을 받음 (소켓 하나 안에서는 순서가 지켜져 고정 쉬기 없이 "안 옴"을 봄)
const settle = (t, bots = t.bots) => Promise.all(bots.map((b) => b.snapshot(t.gameId)));
const closedReason = (page) => page.getByText(NIGHT_CLOSED, { exact: true });
const tribunal = (page) => page.getByRole('dialog', { name: '재판', exact: true });

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

/** 봇 표로 한 사람을 재판에 세움 (사람은 안 내서 기권으로 셈) → 표 낸 봇들 */
async function toTribunal(t, uuid) {
    await t.assertBotsCanExecute(uuid);
    await t.advanceUntil('DAY_VOTE');
    const voters = await pick(t, (p) => p.alive && p.uuid !== uuid);
    await day.botsVote(t, uuid, voters);
    expect((await day.resolveVote(t)).phase, '봇 표로 재판이 열려야 함').toBe('TRIBUNAL');
    return voters;
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

test('A06-H-011 재판 세 화면 (사람 피고·배심·죽은 사람 + 봇 4 = 7명): 피고 반론은 배심·죽은 사람 화면에 보이고 죽은 사람 글은 피고·배심 화면에 없음 @game @hard @smoke', async ({ user, players, table }) => {
    test.setTimeout(300_000);
    const dead = user;
    const defendant = await players.add();
    const juror = await players.add();
    const t = await seat(table, [dead, defendant, juror], {
        humanRoles: ['CITIZEN', 'CITIZEN', 'CITIZEN'],
        botRoles: ['JOKER', 'DOCTOR', 'CITIZEN', 'CITIZEN'],
    });
    await t.advanceUntil('DAY');
    await Promise.all([dead, defendant, juror].map((p) => passNotice(p.page, DAY_NOTICE)));

    // 1일 재판으로 한 사람 처형 → 밤을 지나 둘째 낮 → 다른 사람이 피고
    const firstDay = await t.state();
    await execute(t, dead.account.uuid);
    await Promise.all([keepWatching(dead.page), expectNightClosed(defendant.page), expectNightClosed(juror.page)]);
    await t.advanceUntil((s) => s.phase === 'DAY' && s.dayIndex > firstDay.dayIndex);
    await Promise.all([ready(dead.page), passNotice(defendant.page, DAY_NOTICE), passNotice(juror.page, DAY_NOTICE)]);
    await toTribunal(t, defendant.account.uuid);
    await Promise.all([dead, defendant, juror].map((p) => expect(tribunal(p.page)).toBeVisible({ timeout: 20000 })));

    // 피고 반론: 배심과 죽은 사람 재판 창에 보임
    const plea = uniq('반론');
    await sayAndSee(defendant, plea);
    await c.expectLine(juror.page, nick(defendant), plea);
    await c.expectLine(dead.page, nick(defendant), plea);

    // 죽은 사람 글: 자기 재판 창엔 죽은 사람 줄로 보이고, 배심이 표지 글을 보낸 뒤에도 피고·배심 화면엔 없음
    const whisper = uniq('죽은말');
    await sayAndSee(dead, whisper);
    expect(await c.lineChannel(dead.page, whisper)).toBe('DEAD');
    await expectReadable(tribunal(dead.page).getByText('죽은 사람끼리', { exact: true }), BADGE_READABLE);
    const mark = uniq('배심표지');
    await sayAndSee(juror, mark);
    await c.expectLine(defendant.page, nick(juror), mark);
    await expect(c.chatLog(juror.page)).not.toContainText(whisper);
    await expect(c.chatLog(defendant.page)).not.toContainText(whisper);
    const aliveBots = await pick(t, (p) => p.alive);
    await settle(t, aliveBots);
    for (const b of aliveBots) expect(heardAny(b, whisper), `산 봇 ${b.nickname}이 죽은 사람 글을 받음`).toBe(false);
});

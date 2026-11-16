'use strict';

// 신고 때 남는 채팅 증거를 사람 여럿으로 확인(어려움): 두 사람이 같은 대상을 신고하면 신고마다 증거 한 줄, 밤 암살로 끝난 판의 결과 화면 신고
// 목록 A06-H-015·016 — 쓰는 동안엔 안 돌림: npx playwright test --list tests/ingame/a06-hard-evidence.spec.js
const { test, expect } = require('../../helpers/fixtures');
const { customRoleSettings } = require('../../helpers/game');
const { expectReadable } = require('../../helpers/visible');
const db = require('../../helpers/db');
const ui = require('../../helpers/ui');
const day = require('./a-day/_lib');
const c = require('./c-chat/_lib');
const { waitResult } = require('../room/roomHelpers');

// 단계 시간을 길게 둠: 단계는 손잡이로 넘기고, 확인하는 동안 진짜 마감이 끼어들지 않게 (이 파일은 마감 시간을 안 봄)
const SLOW = Object.freeze({ dayDiscussionTime: 150, dayVoteTime: 90, tribunalTime: 120, nightActionTime: 120 });
const NIGHT_CLOSED = '밤에는 시민이 채팅을 쓸 수 없습니다';
const DAY_NOTICE = '낮이 되었습니다';
const NIGHT_NOTICE = '밤이 되었습니다';
const ROLE_EVT = 'joker_chat_message';
const REPORT_SENT = '신고가 접수되었습니다. 운영자가 확인합니다.';
const REPORT_DUPLICATE = '이미 이 판에서 신고한 플레이어입니다.';

// 시험마다 다른 글 (다른 시험 채팅과 안 섞이게)
const uniq = (prefix) => `${prefix}${Math.random().toString(36).slice(2, 7)}`;
const nick = (who) => who.account.nickname;
const hears = (bot, event, text) => bot.waitForEvent(event, { match: (p) => p?.text === text });
const closedReason = (page) => page.getByText(NIGHT_CLOSED, { exact: true });
const recordSheet = (page) => page.getByRole('dialog', { name: '플레이어별 전적목록' });

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

const reportDialog = (page) => page.getByRole('dialog', { name: '플레이어 신고' });

/** 신고 창에서 사유 "욕설"로 신고하기 → 창에 뜬 안내 글 칸 */
async function submitReport(page) {
    const dialog = reportDialog(page);
    await expect(dialog).toBeVisible();
    await dialog.getByRole('radio', { name: '욕설' }).click();
    await dialog.getByRole('button', { name: '신고하기' }).click();
    return dialog;
}

/** 그 판에서 그 대상을 신고한 줄과 같이 저장된 채팅 증거 (신고마다 한 줄, 증거가 없으면 messages = null) */
async function evidenceRows(gameId, targetUuid) {
    const rows = await db.query(
        'SELECT r.reporter_id AS reporter, e.messages AS messages FROM reports r LEFT JOIN report_chat_evidence e ON e.report_id = r.id WHERE r.game_id = ? AND r.target_id = ?',
        [gameId, targetUuid],
    );
    return rows.map((row) => ({
        reporter: row.reporter,
        messages: typeof row.messages === 'string' ? JSON.parse(row.messages) : row.messages,
    }));
}

/** 판 중 신고: 전적 목록을 열고 그 사람 줄의 신고 단추 → 신고 창 */
async function openReport(page, nickname) {
    await page.getByRole('button', { name: '플레이어별 전적목록' }).first().click();
    await expect(recordSheet(page)).toBeVisible();
    await recordSheet(page).getByRole('button', { name: `${nickname} 신고`, exact: true }).click();
    await expect(reportDialog(page)).toBeVisible();
}

test('A06-H-015 두 사람이 같은 대상 신고 (사람 2 + 봇 4 = 6명): 신고마다 증거 한 줄씩 2줄, 한 사람이 또 신고하면 "이미 신고한" 안내 @game @hard @smoke', async ({ user, players, table }) => {
    test.setTimeout(240_000);
    const one = user;
    const two = await players.add();
    const t = await seat(table, [one, two], {
        humanRoles: ['CITIZEN', 'CITIZEN'],
        botRoles: ['JOKER', 'DOCTOR', 'CITIZEN', 'CITIZEN'],
    });
    const target = t.bots[2];
    await t.advanceUntil('DAY');
    await Promise.all([passNotice(one.page, DAY_NOTICE), passNotice(two.page, DAY_NOTICE)]);

    // 신고할 봇이 낮 채팅을 한 줄 씀 → 두 사람 화면에 보임
    const said = uniq('나쁜말');
    expect((await c.botSay(t, 2, said))?.ok).toBe(true);
    await c.expectLine(one.page, target.nickname, said);
    await c.expectLine(two.page, target.nickname, said);

    // 두 사람이 각자 신고
    for (const person of [one, two]) {
        await openReport(person.page, target.nickname);
        const dialog = await submitReport(person.page);
        await expectReadable(dialog.getByText(REPORT_SENT, { exact: true }));
    }
    let rows = [];
    await expect.poll(async () => {
        rows = await evidenceRows(t.gameId, target.account.uuid);
        return rows.filter((r) => Array.isArray(r.messages)).length;
    }, { timeout: 15000 }).toBe(2);
    expect(rows.map((r) => r.reporter).sort()).toEqual([one.account.uuid, two.account.uuid].sort());
    for (const row of rows) {
        expect(row.messages.filter((line) => line.text === said).map((line) => line.channel)).toEqual(['DAY']);
    }

    // 한 사람이 화면을 새로 연 뒤 같은 대상을 또 신고 → 중복 안내, 증거는 2줄 그대로
    await one.page.reload();
    await expect(one.page).toHaveURL(/\/ingame/, { timeout: 20000 });
    await ready(one.page);
    await openReport(one.page, target.nickname);
    const again = await submitReport(one.page);
    await expectReadable(again.getByText(REPORT_DUPLICATE, { exact: true }));
    expect(await evidenceRows(t.gameId, target.account.uuid)).toHaveLength(2);
});

test('A06-H-016 밤 암살로 판 끝 → 결과 화면 신고 (사람 2 + 봇 6 = 8명): 그 밤 광대 채팅이 증거에 광대 채널 줄로 남음 @game @hard', async ({ user, players, table }) => {
    test.setTimeout(420_000);
    const joker = user;
    const citizen = await players.add();
    const t = await seat(table, [joker, citizen], {
        humanRoles: ['JOKER', 'CITIZEN'],
        botRoles: ['JOKER', 'CITIZEN', 'CITIZEN', 'CITIZEN', 'CITIZEN', 'CITIZEN'],
        counts: { JOKER: 2 },
    });
    const [jokerBot, firstOut, secondOut, thirdOut, lastOut, survivor] = t.bots;
    await t.advanceUntil('DAY');
    await Promise.all([passNotice(joker.page, DAY_NOTICE), passNotice(citizen.page, DAY_NOTICE)]);

    // 광대 2 : 나머지 6 → 낮 처형·밤 암살을 두 번씩 해서 2 : 2가 되는 둘째 밤에 광대 승
    // 1일: 시민 봇 처형 (봇 표 5 > 기권 3) → 밤: 광대 봇이 시민 봇 암살
    await execute(t, firstOut.account.uuid);
    await Promise.all([passNotice(joker.page, NIGHT_NOTICE), expectNightClosed(citizen.page)]);
    await killAtNight(t, secondOut.account.uuid);
    await Promise.all([passNotice(joker.page, DAY_NOTICE), passNotice(citizen.page, DAY_NOTICE)]);

    // 2일: 시민 봇 처형 (봇 표 3만으로는 기권 3을 못 넘어 광대 사람이 화면으로 같이 찍음)
    await t.advanceUntil('DAY_VOTE');
    await day.voteUi(joker.page, thirdOut.nickname);
    const voters = await pick(t, (p) => p.alive && p.uuid !== thirdOut.account.uuid);
    await day.botsVote(t, thirdOut.account.uuid, voters);
    expect((await day.resolveVote(t)).phase, '재판이 열려야 함').toBe('TRIBUNAL');
    await day.botsTribunal(t, 'GUILTY', voters);
    await day.resolveTribunal(t);
    await day.waitState(t, (s) => s.players.find((p) => p.uuid === thirdOut.account.uuid)?.alive === false);
    expect((await t.state()).phase).toBe('NIGHT');
    await Promise.all([passNotice(joker.page, NIGHT_NOTICE), expectNightClosed(citizen.page)]);

    // 둘째 밤: 광대 사람이 광대 채팅 → 광대 봇이 받음 → 광대 봇이 암살 → 판 끝 (광대 승)
    const plot = uniq('광대밤말');
    await sayAndSee(joker, plot);
    await hears(jokerBot, ROLE_EVT, plot);
    await killAtNight(t, lastOut.account.uuid);
    await day.waitState(t, (s) => s.phase === 'ENDED');

    // 결과 화면에서 시민 사람이 신고 → 증거에 그 밤 광대 채널 줄
    const list = await toResult(citizen.page);
    await list.getByRole('button', { name: `${survivor.nickname} 신고`, exact: true }).click();
    const dialog = await submitReport(citizen.page);
    await expectReadable(dialog.getByText(REPORT_SENT, { exact: true }));

    let rows = [];
    await expect.poll(async () => {
        rows = await evidenceRows(t.gameId, survivor.account.uuid);
        return rows.filter((r) => Array.isArray(r.messages)).length;
    }, { timeout: 15000 }).toBe(1);
    const lines = rows[0].messages.filter((line) => line.text === plot);
    expect(lines.map((line) => ({ channel: line.channel, senderUuid: line.senderUuid }))).toEqual([
        { channel: 'JOKER', senderUuid: joker.account.uuid },
    ]);
});

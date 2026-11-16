'use strict';

// 한 판을 처음부터 끝까지 채팅으로 따라감(어려움): 역할 확인 막힘 → 낮 대화 → 재판 반론 → 밤 직업 → 죽은 사람끼리 → 결과 화면 신고 → 채널별 증거
// 목록 A06-H-005 — 쓰는 동안엔 안 돌림: npx playwright test --list tests/ingame/a06-hard-full-game.spec.js
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
const NIGHT_CLOSED = '밤에는 귀족이 채팅을 쓸 수 없습니다';
const DAY_NOTICE = '낮이 되었습니다';
const NIGHT_NOTICE = '밤이 되었습니다';
const DAY_EVT = 'day_chat_message_received';
const REPORT_SENT = '신고가 접수되었습니다. 운영자가 확인합니다.';
// "죽은 사람끼리" 표시 읽힘 확인 값: 표시를 감싼 칸이 눌림을 안 받게 돼 있어 "가려짐" 검사는 못 씀 (보임·화면 안·대비는 봄)
const BADGE_READABLE = Object.freeze({ uncovered: false });

// 시험마다 다른 글 (다른 시험 채팅과 안 섞이게)
const uniq = (prefix) => `${prefix}${Math.random().toString(36).slice(2, 7)}`;
const nick = (who) => who.account.nickname;
const heardAny = (bot, text) => bot.events.some((r) => r.payload?.text === text);
const hears = (bot, event, text) => bot.waitForEvent(event, { match: (p) => p?.text === text });
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

test('A06-H-005 한 판 처음부터 끝까지 채팅 (사람 3 + 봇 5 = 8명): 역할 확인 막힘 → 낮 대화 → 재판 반론 → 밤 직업 → 죽은 사람끼리 → 결과 화면 신고 → 증거에 채널별 줄 @game @hard @smoke', async ({ user, players, table }) => {
    test.setTimeout(420_000);
    const doctor = user;
    const defendant = await players.add();
    const victim = await players.add();
    const t = await seat(table, [doctor, defendant, victim], {
        humanRoles: ['DOCTOR', 'CITIZEN', 'CITIZEN'],
        botRoles: ['JOKER', 'GUARD', 'CITIZEN', 'CITIZEN', 'CITIZEN'],
    });
    const [jokerBot, guardBot] = t.bots;

    // 1) 역할 확인 10초: 입력칸·보내기가 꺼져 있어 글을 치고 엔터를 쳐도 안 나감 (손잡이로 안 넘김 → 아직 그 10초 안인지 봄)
    const blocked = uniq('확인중');
    const box = c.chatBox(doctor.page);
    await expect(box, '역할 확인 중 입력칸').toBeDisabled({ timeout: 3000 });
    await expect(c.sendButton(doctor.page), '역할 확인 중 보내기 단추').toBeDisabled({ timeout: 3000 });
    // 꺼진 칸이라 글도 Enter도 안 받음 (그래도 눌러 봄, 막혀도 기다리지 않게 짧게)
    await box.fill(blocked, { force: true, timeout: 1000 }).catch(() => {});
    await box.press('Enter', { timeout: 1000 }).catch(() => {});
    expect((await t.state()).phase).toBe('ROLE_REVEAL');

    // 2) 첫 낮: 둘이 대화, 봇 전원이 받음 (의사 소켓에서 낮 글보다 먼저 나간 글이 있었다면 봇에 이미 와 있음)
    await t.advanceUntil('DAY');
    await Promise.all([doctor, defendant, victim].map((p) => passNotice(p.page, DAY_NOTICE)));
    const dayA = uniq('낮하나');
    const dayB = uniq('낮둘');
    await sayAndSee(doctor, dayA);
    await c.expectLine(defendant.page, nick(doctor), dayA);
    await sayAndSee(defendant, dayB);
    await c.expectLine(doctor.page, nick(defendant), dayB);
    await Promise.all(t.bots.map((b) => hears(b, DAY_EVT, dayA)));
    for (const b of t.bots) expect(heardAny(b, blocked), `봇 ${b.nickname}이 역할 확인 중 글을 받음`).toBe(false);
    await expect(c.chatLog(doctor.page)).not.toContainText(blocked);

    // 3) 재판: 피고(사람)가 재판 창에서 반론 → 다른 사람 재판 창에 보임 → 유죄로 처형
    const voters = await toTribunal(t, defendant.account.uuid);
    await Promise.all([doctor, defendant, victim].map((p) => expect(tribunal(p.page)).toBeVisible({ timeout: 20000 })));
    const plea = uniq('반론');
    await sayAndSee(defendant, plea);
    await c.expectLine(doctor.page, nick(defendant), plea);
    await expectReadable(tribunal(doctor.page).getByRole('textbox', { name: '채팅 입력' }), { contrast: false });
    await day.botsTribunal(t, 'GUILTY', voters);
    await day.resolveTribunal(t);
    await day.waitState(t, (s) => s.players.find((p) => p.uuid === defendant.account.uuid)?.alive === false);

    // 4) 첫 밤: 의사는 직업 채팅, 시민은 닫힘, 처형된 사람은 죽은 사람 채팅
    await Promise.all([keepWatching(defendant.page), passNotice(doctor.page, NIGHT_NOTICE), expectNightClosed(victim.page)]);
    const nightDoctor = uniq('밤의사');
    await sayAndSee(doctor, nightDoctor);
    const deadFirst = uniq('죽은첫글');
    await sayAndSee(defendant, deadFirst);
    await expect(c.chatLog(doctor.page)).not.toContainText(deadFirst);

    // 5) 그 밤 광대 봇이 시민 사람을 죽임 → 둘째 낮: 죽은 둘이 대화, 산 의사 화면엔 없음
    await killAtNight(t, victim.account.uuid);
    await Promise.all([ready(defendant.page), keepWatching(victim.page), passNotice(doctor.page, DAY_NOTICE)]);
    const deadA = uniq('죽은하나');
    const deadB = uniq('죽은둘');
    await sayAndSee(defendant, deadA);
    await c.expectLine(victim.page, nick(defendant), deadA);
    await sayAndSee(victim, deadB);
    await c.expectLine(defendant.page, nick(victim), deadB);
    await expectReadable(c.deadBadge(victim.page), BADGE_READABLE);
    const dayC = uniq('낮셋');
    await sayAndSee(doctor, dayC);
    await expect(c.chatLog(doctor.page)).not.toContainText(deadA);
    await expect(c.chatLog(doctor.page)).not.toContainText(deadB);

    // 6) 둘째 낮 재판으로 광대 봇 처형 → 시민 승 → 결과 화면
    await execute(t, jokerBot.account.uuid);
    expect((await t.state()).phase).toBe('ENDED');
    const list = await toResult(doctor.page);

    // 7) 결과 화면에서 신고 → 그 판 채팅이 채널이 붙어 증거로 남음
    await list.getByRole('button', { name: `${guardBot.nickname} 신고`, exact: true }).click();
    const dialog = await submitReport(doctor.page);
    await expectReadable(dialog.getByText(REPORT_SENT, { exact: true }));

    let rows = [];
    await expect.poll(async () => {
        rows = await evidenceRows(t.gameId, guardBot.account.uuid);
        return rows.filter((r) => Array.isArray(r.messages)).length;
    }, { timeout: 15000 }).toBe(1);
    expect(rows[0].reporter).toBe(doctor.account.uuid);
    const channelOf = (text) => rows[0].messages.find((line) => line.text === text)?.channel ?? null;
    expect({
        dayA: channelOf(dayA), dayB: channelOf(dayB), plea: channelOf(plea), nightDoctor: channelOf(nightDoctor),
        deadFirst: channelOf(deadFirst), deadA: channelOf(deadA), deadB: channelOf(deadB), dayC: channelOf(dayC),
    }).toEqual({
        dayA: 'DAY', dayB: 'DAY', plea: 'DAY', nightDoctor: 'DOCTOR',
        deadFirst: 'DEAD', deadA: 'DEAD', deadB: 'DEAD', dayC: 'DAY',
    });
    // 역할 확인 중 막힌 글은 증거에도 없음
    expect(channelOf(blocked)).toBeNull();
});

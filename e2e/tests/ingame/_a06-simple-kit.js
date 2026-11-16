'use strict';

// A06(판 중 채팅·이모티콘) PC 브라우저 간단 시험이 같이 쓰는 도우미 — 직업 맞춘 판 열기·재판 열기·처형·밤 살해·봇이 받은 글 보기·덮개 창 닫고 읽힘 확인
// ingame/a06-*.spec.js 중 간단 몫(목록 A06-E-001~112)이 씀, 이름이 .spec.js가 아니라 시험으로 안 셈
const { expect } = require('../../helpers/fixtures');
const { expectReadable } = require('../../helpers/visible');
const a = require('./a-day/_lib');
const c = require('./c-chat/_lib');
const n = require('./b-night/_night');

// 단계 시간은 넉넉히 (단계는 손잡이로 넘김, 확인하는 동안 저절로 다음 단계로 안 넘어가게)
const ROOMY = Object.freeze({ dayDiscussionTime: 150, dayVoteTime: 90, tribunalTime: 120, nightActionTime: 120 });

// 채팅 받기 알림 이름 (낮 · 죽은 사람 · 밤 같은 직업)
const DAY_EVT = 'day_chat_message_received';
const DEAD_EVT = 'dead_chat_message_received';
const ROLE_EVT = 'joker_chat_message';
const CHAT_EVENTS = Object.freeze([DAY_EVT, DEAD_EVT, ROLE_EVT]);

// 밤 시민 입력칸 자리에 뜨는 까닭 글
const CLOSED_TEXT = '밤에는 시민이 채팅을 쓸 수 없습니다';

// 입력칸 아래 상태 줄 읽힘 확인 값: 줄이 눌림을 안 받는 글이라 "가려짐" 검사는 못 씀, 바탕이 채팅 틀 그림이라 사진으로 대비를 잼
const STATUS_READABLE = Object.freeze({ uncovered: false, method: 'pixels' });
// "죽은 사람끼리" 표시 읽힘 확인 값: 표시를 감싼 칸이 눌림을 안 받아 "가려짐" 검사는 못 씀
const BADGE_READABLE = Object.freeze({ uncovered: false });

const uid = (who) => who.account.uuid;

/**
 * 판 차리기 + 직업 확인 (사람 1 + 봇)
 * @param {object} o
 * @param {number} o.bots 봇 수 (사람까지 5~10명)
 * @param {string} o.me 사람 직업
 * @param {(string|null)[]} [o.botRoles] 봇 순서대로 직업 (안 적은 봇은 남는 직업 = 시민)
 * @param {object} [o.settings] 방 설정 덮어쓰기 (직접 구성은 customRoleSettings)
 */
async function deal(table, user, { bots, me, botRoles = [], settings = {} }) {
    const t = await table.setup({
        humans: [user],
        bots,
        settings: { ...ROOMY, ...settings },
        roles: ({ bots: list }) => {
            const out = { [uid(user)]: me };
            botRoles.forEach((role, i) => { if (role) out[uid(list[i])] = role; });
            return out;
        },
    });
    // 정한 직업이 맞았는지 (안 맞으면 뒤 확인이 다 틀어짐)
    const s = await t.state();
    const roleOf = (uuid) => s.players.find((p) => p.uuid === uuid)?.role;
    expect(s.players, '판 인원').toHaveLength(bots + 1);
    expect(roleOf(uid(user)), '사람 직업').toBe(me);
    botRoles.forEach((role, i) => { if (role) expect(roleOf(uid(t.bots[i])), `봇 ${i} 직업`).toBe(role); });
    return t;
}

/** 판 요약에서 살아 있는 봇만 */
const aliveBotsOf = (t, s) => t.bots.filter((b) => s.players.find((p) => p.uuid === uid(b))?.alive === true);

/** 지금 살아 있는 봇 (서버 기준) */
async function aliveBots(t) {
    return aliveBotsOf(t, await t.state());
}

/**
 * 낮에 재판 열기: 산 봇이 모두 피고를 찍고 투표 마감 → 재판 단계 판 요약
 * 사람은 표를 안 냄(기권) → 봇 표가 기권보다 많아야 열림 (모자라면 바로 알림)
 */
async function openTribunal(t, defendantUuid) {
    let s = await t.state();
    expect(s.phase, '낮에만 재판을 엶').toBe('DAY');
    await t.assertBotsCanExecute(defendantUuid);
    if (s.dayPhase !== 'DAY_VOTE') {
        await t.advance();
        s = await a.waitState(t, (g) => g.phase === 'DAY' && g.dayPhase === 'DAY_VOTE');
    }
    const voters = aliveBotsOf(t, s).filter((b) => uid(b) !== defendantUuid);
    await a.botsVote(t, voters.map((b) => [b, defendantUuid]));
    const after = await a.resolveVote(t);
    expect(after.phase, '재판이 열림').toBe('TRIBUNAL');
    expect(after.tribunal?.defendantUuid, '피고').toBe(defendantUuid);
    return after;
}

/** 재판 판결: 피고 아닌 산 봇이 모두 같은 표 → 재판 마감 → 재판을 벗어난 판 요약 */
async function verdict(t, vote) {
    const s = await t.state();
    expect(s.phase, '재판 중').toBe('TRIBUNAL');
    const jurors = aliveBotsOf(t, s).filter((b) => uid(b) !== s.tribunal.defendantUuid);
    await a.botsTribunal(t, jurors.map((b) => [b, vote]));
    return a.resolveTribunal(t);
}

/** 그 사람을 낮 재판으로 처형 → 처형 뒤 판 요약 (밤, 또는 판 끝) */
async function execute(t, uuid) {
    await openTribunal(t, uuid);
    const after = await verdict(t, 'GUILTY');
    expect(after.players.find((p) => p.uuid === uuid)?.alive, '처형됨').toBe(false);
    return after;
}

/** 밤에 산 광대 봇이 모두 그 사람을 찍음 → 다음 낮 (그 사람 죽음) */
async function nightKill(t, victimUuid) {
    const s = await n.toTurn(t, 'JOKER');
    const jokers = aliveBotsOf(t, s).filter((b) => s.players.find((p) => p.uuid === uid(b)).role === 'JOKER');
    expect(jokers.length, '산 광대 봇').toBeGreaterThan(0);
    for (const joker of jokers) expect((await n.botNight(t, joker, victimUuid))?.ok, '광대 봇 지목').toBe(true);
    await c.phaseTo(t, 'DAY');
    expect((await t.player(victimUuid))?.alive, '밤에 죽음').toBe(false);
}

/**
 * 8명 자동 구성 판(광대 1·의사 1·경비원 1·시민 5)에서 봇 하나와 사람이 둘 다 죽은 2일 낮까지
 * 봇 하나를 1일 재판으로 처형(먼저 죽음) → 그 밤 광대 봇이 사람을 죽임
 * @returns {Promise<{ t:any, deadBot:any }>} deadBot = 먼저 죽은 봇 (죽은 사람 글을 받을 봇)
 */
async function twoDead(table, user) {
    const t = await deal(table, user, { bots: 7, me: 'CITIZEN', botRoles: ['JOKER', 'DOCTOR', 'GUARD'] });
    await a.toDay(t);
    const deadBot = t.bots[6];
    await execute(t, uid(deadBot));
    await nightKill(t, uid(user));
    return { t, deadBot };
}

/** 봇이 그 알림으로 그 글을 받았는지 */
const heard = (bot, event, text) => bot.events.some((r) => r.event === event && r.payload?.text === text);
/** 봇이 어느 알림으로든 그 글을 받았는지 */
const sawText = (bot, text) => bot.events.some((r) => r.payload?.text === text);
/** 봇이 그 사람이 보낸 채팅을 하나라도 받았는지 */
const chatFrom = (bot, senderUuid) => bot.events.some((r) => CHAT_EVENTS.includes(r.event) && r.payload?.senderUuid === senderUuid);

/**
 * 봇마다 서버를 한 번 다녀옴 → 이보다 먼저 서버가 보낸 알림은 그 봇에 다 와 있음 (소켓은 보낸 차례대로 옴)
 * "못 받았다"를 볼 때 기다리는 시간 대신 씀
 */
async function settleBots(t, bots = t.bots) {
    await Promise.all(bots.map((b) => b.snapshot(t.gameId)));
}

/** 그 글을 받은 봇 닉네임 목록 (없어야 할 때 빈 목록인지 봄) */
const whoSaw = (bots, text) => bots.filter((b) => sawText(b, text)).map((b) => b.nickname);

/** 봇 낮·죽은 사람 채팅 보내기, 같은 봇이 0.5초 안에 또 보내 거절되면 받을 때까지 다시 */
async function botSayOk(t, botIndex, text) {
    await expect.poll(async () => (await c.botSay(t, botIndex, text))?.ok === true, { intervals: [200], timeout: 5000, message: '봇 채팅 보냄' }).toBe(true);
}

// 화면 자리 찾기
const boardChat = (page) => page.getByRole('complementary', { name: '채팅' });
const closeupOf = (page) => page.getByRole('dialog', { name: '채팅 클로즈업' });
const tribunalDialog = (page) => page.getByRole('dialog', { name: '재판', exact: true });
const tribunalChat = (page) => page.locator('[aria-label="최후의 반론 채팅"]');
const closedNote = (scope) => scope.locator('[data-night-chat-closed]');
const inputIn = (scope) => scope.getByRole('textbox', { name: '채팅 입력' });
const logIn = (scope) => scope.getByRole('log', { name: '채팅 내역' });
const statusAlert = (scope) => scope.getByRole('alert');

/** 덮개 창(단계 안내·밤 차례 안내·사망 뒤 선택)을 닫아 가며 그 요소가 사람 눈에 읽힐 때까지 (못 끝난 암살 영상의 건너뛰기도 누름) */
async function readableOnceClear(page, locator, options = {}) {
    await expect(async () => {
        await c.dismissOverlays(page);
        await c.skipDawnVideo(page);
        await expectReadable(locator, { ...options, timeout: 1500 });
    }).toPass({ timeout: 40_000 });
}

/**
 * 덮개 창이 다 닫힌 채로 조금 이어질 때까지 (밤 안내를 닫으면 바로 밤 차례 안내가 이어 떠서, 한 번 비었다고 끝이 아님)
 * 키보드 초점처럼 창 하나만 떠도 틀어지는 확인 앞에 씀
 */
async function noOverlays(page) {
    let calm = 0;
    await expect.poll(async () => {
        await c.dismissOverlays(page);
        calm = (await page.getByRole('dialog').count()) === 0 ? calm + 1 : 0;
        return calm;
    }, { intervals: [300], timeout: 30_000, message: '덮개 창이 다 닫힘' }).toBeGreaterThanOrEqual(3);
}

/**
 * 산 사람 화면에 "밤이 되었습니다"·"낮이 되었습니다" 안내가 뜰 때까지 → 확인 (화면이 그 단계까지 따라왔다는 표시)
 * 앞 연출(재판 추방·낮 시작 암살 영상 등)이 길 수 있어 넉넉히 기다림, 추방 연출은 눌러 넘김
 */
async function confirmNotice(page, text) {
    const dialog = page.getByRole('dialog', { name: '단계 전환 안내' }).filter({ hasText: text });
    await expect(async () => {
        const expulsion = page.locator('[data-ingame-tribunal-expulsion]').last();
        if (await expulsion.isVisible().catch(() => false)) await expulsion.click({ timeout: 500, force: true }).catch(() => {});
        // 낮 안내는 낮 시작 연출(암살 영상·글 창) 뒤에 뜸 → 못 끝난 영상의 건너뛰기·글 창 확인을 넘김
        await c.skipDawnVideo(page);
        await n.closeDawnReport(page);
        await expect(dialog).toBeVisible({ timeout: 1000 });
    }).toPass({ timeout: 45_000 });
    await dialog.getByRole('button', { name: '확인' }).click();
    await expect(dialog).toBeHidden();
}

/** 밤까지 넘기고 산 사람 화면이 밤 안내를 확인 */
async function intoNight(t, page) {
    await c.phaseTo(t, 'NIGHT');
    await confirmNotice(page, '밤이 되었습니다');
}

/** 다음 낮까지 넘기고 산 사람 화면이 낮 안내를 확인 */
async function intoDay(t, page) {
    await c.phaseTo(t, 'DAY');
    await confirmNotice(page, '낮이 되었습니다');
}

/**
 * 화면 소켓이 지금까지 온 알림을 다 받게 함: 단계를 한 번 넘겨 판 전체 알림을 하나 보내고, 그게 화면 소켓에 올 때까지
 * frames = c.watchSocket(page) 기록 (판 차리기 전에 걸어 둔 것). 밤 시민처럼 화면에 아무 줄도 안 오는 때 "안 왔다"를 보려고 씀
 */
async function fencePage(t, frames) {
    const before = frames.length;
    const fired = await t.advance();
    expect(fired.fired, '넘긴 단계').not.toBeNull();
    await expect.poll(() => frames.slice(before).some((f) => !CHAT_EVENTS.includes(f.event)), { message: '단계 알림이 화면 소켓에 옴' }).toBe(true);
}

module.exports = {
    ROOMY, DAY_EVT, DEAD_EVT, ROLE_EVT, CHAT_EVENTS, CLOSED_TEXT, STATUS_READABLE, BADGE_READABLE,
    uid, deal, aliveBots, openTribunal, verdict, execute, nightKill, twoDead,
    heard, sawText, chatFrom, settleBots, whoSaw, botSayOk,
    boardChat, closeupOf, tribunalDialog, tribunalChat, closedNote, inputIn, logIn, statusAlert,
    readableOnceClear, noOverlays, confirmNotice, intoNight, intoDay, fencePage,
};

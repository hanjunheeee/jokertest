'use strict';

// 신고 채팅 증거 브라우저 시험 (PC) — 판 중·결과 화면에서 신고하면 그 판 채팅 원문 묶음이 DB에 한 줄 남고, 신고가 없으면 안 남음
// 목록 A06-판중-채팅.md 번호 A06-E-101~107 (DB는 시험 DB의 reports·report_chat_evidence 표를 직접 봄)
const { test, expect } = require('../../helpers/fixtures');
const db = require('../../helpers/db');
const a = require('./a-day/_lib');
const c = require('./c-chat/_lib');
const k = require('./_a06-simple-kit');
const { waitResult } = require('../room/roomHelpers');

const SENT_TEXT = '신고가 접수되었습니다. 운영자가 확인합니다.';
const sheet = (page) => page.getByRole('dialog', { name: '플레이어별 전적목록', exact: true });
const reportDialog = (page) => page.getByRole('dialog', { name: '플레이어 신고' });

// 자동 구성 판: 사람 시민, 봇 0 광대 (6명부터 봇 1 의사) → 첫 낮 토론
async function dayTable(table, user, size) {
    const t = await k.deal(table, user, { bots: size - 1, me: 'CITIZEN', botRoles: size >= 6 ? ['JOKER', 'DOCTOR'] : ['JOKER'] });
    await a.toDay(t);
    return t;
}

// 신고 창에서 사유(욕설)를 고르고 신고하기 → 접수 안내까지
async function submitReport(page) {
    const dialog = reportDialog(page);
    await expect(dialog).toBeVisible();
    await dialog.getByRole('radio', { name: '욕설' }).click();
    await dialog.getByRole('button', { name: '신고하기' }).click();
    await expect(dialog).toContainText(SENT_TEXT);
}

// 판 화면: 플레이어 목록 창을 열어 그 사람 줄의 신고 단추 → 신고 접수
async function reportFromList(page, nickname) {
    await page.getByRole('button', { name: '플레이어별 전적목록', exact: true }).click();
    await expect(sheet(page)).toBeVisible();
    await sheet(page).getByRole('button', { name: `${nickname} 신고`, exact: true }).click();
    await submitReport(page);
}

// 그 판에 접수된 신고 줄 (누가 누구를)
function reportsOf(gameId) {
    return db.query('SELECT id, reporter_id, target_id FROM reports WHERE game_id = ?', [gameId]);
}

// 그 판 채팅 증거 줄 (messages는 채팅 묶음: [{ at, channel, senderUuid, nickname, text }])
async function evidenceOf(gameId) {
    const rows = await db.query('SELECT report_id, game_id, messages FROM report_chat_evidence WHERE game_id = ?', [gameId]);
    return rows.map((row) => ({ ...row, messages: typeof row.messages === 'string' ? JSON.parse(row.messages) : row.messages }));
}

// 신고 1줄(신고한 사람·대상)과 그 신고에 붙은 증거 1줄을 확인하고 증거의 채팅 묶음을 돌려줌
async function expectOneEvidence(t, reporterUuid, targetUuid) {
    const reports = await reportsOf(t.gameId);
    expect(reports, '그 판 신고 줄').toHaveLength(1);
    expect([reports[0].reporter_id, reports[0].target_id], '신고한 사람·대상').toEqual([reporterUuid, targetUuid]);
    const evidence = await evidenceOf(t.gameId);
    expect(evidence, '그 판 채팅 증거 줄').toHaveLength(1);
    expect(Number(evidence[0].report_id), '증거가 붙은 신고').toBe(Number(reports[0].id));
    return evidence[0].messages;
}

/**
 * 화면이 만드는 웹소켓을 적어 두기 (판 차리기 전에 부름)
 * 밤 시민은 입력칸이 없어 화면으로는 글을 못 보냄 → 화면 소켓으로 채팅 사건을 직접 보내 보려고 씀
 */
async function tapSockets(page) {
    await page.addInitScript(() => {
        const Native = window.WebSocket;
        window.__a06Sockets = [];
        window.__a06Acks = [];
        window.WebSocket = class extends Native {
            constructor(...args) {
                super(...args);
                window.__a06Sockets.push(this);
                // 서버 답(socket.io 답 글은 "43"으로 시작)만 모음
                this.addEventListener('message', (event) => {
                    if (typeof event.data === 'string' && event.data.startsWith('43')) window.__a06Acks.push(event.data);
                });
            }
        };
    });
}

// 사건 하나를 화면 소켓으로 보내고 서버 답을 기다림 → 답 값 (ackId = 이 요청의 답 번호, 화면이 쓰는 번호와 안 겹치게 큰 수)
async function emitFromPage(page, ackId, event, payload) {
    await page.evaluate((frame) => {
        const open = window.__a06Sockets.filter((socket) => socket.readyState === 1);
        if (open.length === 0) throw new Error('열린 화면 소켓이 없음');
        open[open.length - 1].send(frame);
    }, `42${ackId}${JSON.stringify([event, payload])}`);
    const head = `43${ackId}[`;
    let reply = null;
    await expect.poll(async () => {
        const acks = await page.evaluate(() => window.__a06Acks);
        const hit = acks.find((raw) => raw.startsWith(head));
        reply = hit ? JSON.parse(hit.slice(head.length - 1))[0] : null;
        return reply !== null;
    }, { message: `${event} 서버 답` }).toBe(true);
    return reply;
}

test('A06-E-101 판 중 신고 → 채팅 증거 (6명 판) → 낮 채팅 3줄 뒤 플레이어 목록에서 봇 신고: 증거 1줄에 그 판 원문 3줄 @game @smoke', async ({ user, table }) => {
    const t = await dayTable(table, user, 6);
    const page = user.page;
    const me = user.account;
    const mine = c.uniq('사람낮말');
    const botA = c.uniq('봇낮말');
    const botB = c.uniq('봇낮말');
    await c.say(page, mine);
    await k.botSayOk(t, 2, botA);
    await k.botSayOk(t, 3, botB);
    await c.expectLine(page, t.bots[3].nickname, botB);

    await reportFromList(page, t.bots[2].nickname);

    const messages = await expectOneEvidence(t, me.uuid, k.uid(t.bots[2]));
    expect(messages.map((m) => m.text), '증거 글 (보낸 차례대로)').toEqual([mine, botA, botB]);
    expect(messages.map((m) => m.channel), '증거 채널').toEqual(['DAY', 'DAY', 'DAY']);
    expect(messages.map((m) => m.senderUuid), '증거 보낸 사람').toEqual([me.uuid, k.uid(t.bots[2]), k.uid(t.bots[3])]);
});

test('A06-E-102 신고 없으면 증거 없음 (5명 판) → 채팅 뒤 판이 끝나도 그 판 증거 0줄 @game', async ({ user, table }) => {
    const t = await dayTable(table, user, 5);
    const page = user.page;
    const mine = c.uniq('사람낮말');
    const botText = c.uniq('봇낮말');
    await c.say(page, mine);
    await k.botSayOk(t, 2, botText);
    // 채팅이 진짜 오갔음 (안 오갔으면 "안 남음"이 뜻이 없음)
    await expect.poll(() => t.bots.filter((b) => k.heard(b, k.DAY_EVT, mine)).length).toBe(t.bots.length);
    await c.expectLine(page, t.bots[2].nickname, botText);

    // 광대 봇을 처형 → 시민 승으로 판 끝 → 결과 화면
    const end = await k.execute(t, k.uid(t.bots[0]));
    expect(end.phase, '판 끝').toBe('ENDED');
    await waitResult(page);

    expect(await reportsOf(t.gameId), '그 판 신고 줄').toHaveLength(0);
    expect(await evidenceOf(t.gameId), '그 판 채팅 증거 줄').toHaveLength(0);
});

test('A06-E-103 결과 화면 신고 (5명 판) → 결과 화면에서 신고해도 증거 1줄 @game', async ({ user, table }) => {
    const t = await dayTable(table, user, 5);
    const page = user.page;
    const me = user.account;
    const mine = c.uniq('사람낮말');
    const botText = c.uniq('봇낮말');
    await c.say(page, mine);
    await k.botSayOk(t, 2, botText);
    await c.expectLine(page, t.bots[2].nickname, botText);

    const end = await k.execute(t, k.uid(t.bots[0]));
    expect(end.phase, '판 끝').toBe('ENDED');
    const list = await waitResult(page);
    await list.getByRole('button', { name: `${t.bots[2].nickname} 신고`, exact: true }).click();
    await submitReport(page);

    const messages = await expectOneEvidence(t, me.uuid, k.uid(t.bots[2]));
    expect(messages.map((m) => m.text), '증거 글').toEqual([mine, botText]);
});

test('A06-E-104 증거에 밤·죽은 사람 채팅도 채널 붙어 (8명 판) → 의사 채팅·죽은 사람 채팅 뒤 신고: 증거 줄에 DOCTOR·DEAD 채널 줄 @game', async ({ user, table }) => {
    test.setTimeout(240_000);
    // 8명 자동 구성(광대 1·의사 1·경비원 1): 사람 의사, 봇 0 광대, 봇 1 경비원
    const t = await k.deal(table, user, { bots: 7, me: 'DOCTOR', botRoles: ['JOKER', 'GUARD'] });
    const page = user.page;
    const me = user.account;
    await a.toDay(t);
    // 시민 봇 하나를 1일 재판으로 처형 → 그 밤
    const deadBot = t.bots[6];
    await k.execute(t, k.uid(deadBot));
    await k.confirmNotice(page, '밤이 되었습니다');

    const doctorText = c.uniq('의사밤말');
    await c.say(page, doctorText);
    await c.expectLine(page, me.nickname, doctorText);
    const deadText = c.uniq('죽은봇말');
    await k.botSayOk(t, 6, deadText);
    await expect.poll(() => k.heard(deadBot, k.DEAD_EVT, deadText), { message: '죽은 봇 글이 나감' }).toBe(true);

    await reportFromList(page, t.bots[2].nickname);

    const messages = await expectOneEvidence(t, me.uuid, k.uid(t.bots[2]));
    expect(messages.map((m) => [m.channel, m.text]), '증거 줄 (채널, 글)').toEqual([
        ['DOCTOR', doctorText],
        ['DEAD', deadText],
    ]);
    expect(messages.map((m) => m.senderUuid), '증거 보낸 사람').toEqual([me.uuid, k.uid(deadBot)]);
});

test('A06-E-105 금지어 글 증거는 원문 (5명 판) → 금지어 채팅은 화면에 가려져도 증거 글은 원문 @game', async ({ user, table }) => {
    const t = await dayTable(table, user, 5);
    const page = user.page;
    const me = user.account;
    // 낱말은 시험마다 무작위 (같이 도는 다른 시험 채팅에 안 걸리게, 목록의 "바보" 자리)
    const word = await c.addBannedWord();
    try {
        await c.say(page, word);
        // 화면·봇이 받은 글은 가려짐
        await c.expectLine(page, me.nickname, '*'.repeat(word.length));
        await expect.poll(() => t.bots.filter((b) => k.heard(b, k.DAY_EVT, '*'.repeat(word.length))).length).toBe(t.bots.length);

        await reportFromList(page, t.bots[2].nickname);
        const messages = await expectOneEvidence(t, me.uuid, k.uid(t.bots[2]));
        expect(messages.map((m) => m.text), '증거 글 (원문)').toEqual([word]);
    } finally {
        await c.removeBannedWord(word);
    }
});

test('A06-E-106 거절된 시민 밤 글은 증거에 없음 (6명 판) → 밤 시민이 사건으로 보낸 글은 거절되고 신고 증거에 없음 @game', async ({ user, table }) => {
    // 판 차리기 전에 걸어야 화면 소켓이 적힘
    await tapSockets(user.page);
    const t = await dayTable(table, user, 6);
    const page = user.page;
    const me = user.account;
    // 증거 줄이 생기게 낮에 한 줄 (증거가 아예 없으면 "그 글 없음"이 뜻이 없음)
    const dayText = c.uniq('낮한줄');
    await c.say(page, dayText);
    await c.expectLine(page, me.nickname, dayText);

    await c.phaseTo(t, 'NIGHT');
    await k.readableOnceClear(page, k.closedNote(page));
    await expect(c.chatBox(page)).toHaveCount(0);

    // 칸이 없어 화면 소켓으로 직접 보냄: 밤 직업 채팅 길·낮 채팅 길 둘 다
    const roleText = c.uniq('시민밤말');
    const plainText = c.uniq('시민밤말');
    const roleReply = await emitFromPage(page, 9001, 'submit_joker_chat_message', { gameId: t.gameId, text: roleText });
    const plainReply = await emitFromPage(page, 9002, 'submit_game_chat_message', { gameId: t.gameId, text: plainText });
    expect(roleReply.ok, '밤 직업 채팅 길 답').toBe(false);
    expect(plainReply.ok, '낮 채팅 길 답').toBe(false);
    await k.settleBots(t);
    expect([...k.whoSaw(t.bots, roleText), ...k.whoSaw(t.bots, plainText)], '거절된 글을 받은 봇').toEqual([]);

    await reportFromList(page, t.bots[2].nickname);
    const messages = await expectOneEvidence(t, me.uuid, k.uid(t.bots[2]));
    expect(messages.map((m) => m.text), '증거 글').toEqual([dayText]);
});

test('A06-E-107 채팅 없는 판 신고 (5명 판) → 신고 1줄은 남고 증거는 0줄 @game', async ({ user, table }) => {
    const t = await dayTable(table, user, 5);
    const page = user.page;
    const me = user.account;
    await c.readyToChat(page);
    await reportFromList(page, t.bots[2].nickname);

    const reports = await reportsOf(t.gameId);
    expect(reports, '그 판 신고 줄').toHaveLength(1);
    expect([reports[0].reporter_id, reports[0].target_id], '신고한 사람·대상').toEqual([me.uuid, k.uid(t.bots[2])]);
    expect(await evidenceOf(t.gameId), '그 판 채팅 증거 줄').toHaveLength(0);
});

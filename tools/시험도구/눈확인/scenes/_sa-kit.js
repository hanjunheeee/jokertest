'use strict';

// 사·아·자 묶음 장면 도우미 파일, 판 차리기(직업 고정)·판 끝내기(광대 봇 나감·처형)·결과 화면까지·창 닫고 새 창·친구 봇 초대
// sa.js·a.js·ja.js가 불러 씀 — 판 굴리기·고르개는 e2e 도우미(_a09·_a08 kit) 그대로, 앉히기·시작은 lib/table.js
const crypto = require('node:crypto');
const { fromE2e, e2eRequire } = require('../lib/paths');
const { seat, start, customRoleSettings } = require('../lib/table');

const { expect } = e2eRequire('@playwright/test');
const ui = fromE2e('helpers/ui');
const { api, botApi } = fromE2e('helpers/friends');
const { waitResult } = fromE2e('tests/room/roomHelpers');
const K = fromE2e('tests/ingame/_a09-simple-kit');
const H = fromE2e('tests/result/_a08-hard-kit');
const HH = fromE2e('tests/ingame/_a09-hard-kit');

const U = (x) => x.account.uuid;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// 결과판 (참가자 정체 목록)
const board = (page) => page.getByRole('region', { name: '가면무도회 참가자 정체' });
const onResult = (page) => /\/gameresult/.test(page.url());
const ROLES = ['JOKER', 'DOCTOR', 'GUARD', 'WITCH_HUNTER'];

/**
 * 판 열기: 사람(humanRoles, 기본 귀족) + 봇(botRoles 차례, 첫 봇이 방장) → 시작 → 역할 창 닫음
 * 직업 수는 사람·봇 직업을 세어 직접 구성으로 맞춤, 사람 직업이 안 맞으면 바로 던짐(again으로 다시)
 * @example await openTable(s, { humans: [me], botRoles: ['CITIZEN', 'DOCTOR', 'WITCH_HUNTER', 'JOKER'] })
 * @returns {Promise<import('../../../../e2e/helpers/game').Table>}
 */
async function openTable(s, { humans, humanRoles = [], botRoles }) {
    const mine = humans.map((_, i) => humanRoles[i] ?? 'CITIZEN');
    const all = [...mine, ...botRoles];
    const counts = Object.fromEntries(ROLES.map((r) => [r, all.filter((x) => x === r).length]));
    const seated = await seat(s, {
        humans,
        bots: botRoles.length,
        settings: customRoleSettings(counts),
        roles: ({ bots }) => ({
            ...Object.fromEntries(humans.map((h, i) => [U(h), mine[i]])),
            ...Object.fromEntries(bots.map((b, i) => [U(b), botRoles[i]])),
        }),
    });
    const t = await start(seated);
    s.state.table = t;
    s.state.room = seated.room;
    s.keep(() => t.stopBots().catch(() => {}));
    await Promise.all(humans.map((h) => ui.readRoleReveal(h.page).catch(() => null)));
    const st = await t.state();
    humans.forEach((h, i) => {
        if (K.roleOf(st, U(h)) !== mine[i]) throw new Error(`사람 직업이 정한 대로 안 됨 (${h.label}: ${K.roleOf(st, U(h))}) → again`);
    });
    return t;
}

/** 서버 판 값에서 그 직업 봇 (예약이 봇끼리 바뀌어도 맞게 찾음) */
async function botOf(t, role) {
    const st = await t.state();
    const bot = t.bots.find((b) => K.roleOf(st, U(b)) === role);
    if (!bot) throw new Error(`${role} 봇 없음`);
    return bot;
}

/** 판 끝내기 (빠름): 광대 봇이 산 채로 나감 → 산 광대 0 → 시민 승, 추방 영상 없이 바로 결과 */
async function endByLeave(t) {
    await H.jokerLeaves(t, await botOf(t, 'JOKER'));
}

/** 판 끝내기 (보통 끝): 봇 표로 광대 봇 처형 → 시민 승 (사람은 기권, 봇 표가 기권보다 많아야 재판) */
async function endByVote(t) {
    const end = await K.execute(t, U(await botOf(t, 'JOKER')));
    if (end.phase !== 'ENDED') throw new Error(`광대를 처형했는데 판이 안 끝남: ${end.phase}`);
}

/** 결과 화면 본체(결과판)까지: 추방 연출 넘기기(처형으로 끝난 판) → 결과 영상 넘기기 */
async function toResult(page, { expulsion = false } = {}) {
    if (expulsion) await K.pastExpulsion(page);
    await H.allAtResult([{ page }]);
    return board(page);
}

/** 창(탭) 닫기 → 서버가 끊김을 알 때까지 (붙어 있는 봇이 알림을 받아 봄) */
async function closeTab(t, entry) {
    const since = Date.now();
    await entry.page.close();
    await K.droppedAt(t, U(entry), since);
}

/** 같은 브라우저(쿠키 그대로) 새 창 → 그 사람 창을 바꿔 끼움 (사진·창 늘어놓기가 새 창을 씀) */
async function reopen(s, entry) {
    const page = await entry.context.newPage();
    Object.assign(entry, { page, windowId: undefined, emuSession: undefined });
    s.watchAlerts(page);
    if (s.hidden) await s.windows.hide(entry);
    return page;
}

/** 친구 봇 하나 (판 전에 친구 맺어 둠) → 봇 */
async function befriend(s, me) {
    const [friend] = await s.spawnBots(1);
    await botApi(friend, 'POST', '/friends/requests', { receiverId: U(me) });
    const incoming = await api(me, 'GET', '/friends/requests/incoming');
    const row = incoming.find((r) => r.id === U(friend));
    if (!row) throw new Error('친구 신청이 안 옴');
    await api(me, 'PUT', `/friends/requests/${row.request_id}/accept`);
    return friend;
}

/** 친구 봇이 대기방을 만들고 나를 초대 (초대는 3분 뒤 사라짐) → 방 { roomCode, … } */
async function inviteFrom(friend, me) {
    const room = await friend.createRoom();
    await botApi(friend, 'POST', '/friends/invites', { receiverId: U(me), creationKey: crypto.randomUUID() });
    return room;
}

module.exports = {
    U, sleep, board, onResult, expect, ui, waitResult, K, H, HH,
    openTable, botOf, endByLeave, endByVote, toResult, closeTab, reopen, befriend, inviteFrom,
};

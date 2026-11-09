'use strict';

// 대기방·방 목록 파일, 대기방 고르개·봇 입장과 준비·사람이 방장인 판 차리기·봇 방장 설정 바꾸기 + 공개 방 목록에서 줄 찾기
// roomHelpers/index.js가 다시 내보냄 (tests/room·tests/result는 require('./roomHelpers')로 씀)
const crypto = require('node:crypto');
const { expect } = require('@playwright/test');
const { e2e } = require('../../../helpers/internal');
const { Table } = require('../../../helpers/game');
const ui = require('../../../helpers/ui');
const { sleep } = require('../../../helpers/wait');
const { createRoomUi } = require('./setupScreen');

/** 대기방 파티 인원 글자 기다림 */
async function expectPartyCount(page, n) {
    await expect(page.getByText(`파티 인원 ${n}명`)).toBeVisible();
}

/** 준비한 사람 실루엣 수 */
function readySilhouettes(page) {
    return page.getByRole('img', { name: '준비 완료한 참가자' });
}

/** 시작 막힘 창 */
function blockedDialog(page) {
    return page.locator('[data-game-start-blocked]');
}

/** 봇들 입장 + 준비 (방 설정 버전은 지금 서버 값) */
async function botsJoinAndReady(bots, uuidOfHost, roomCode) {
    for (const bot of bots) await bot.joinByCode(roomCode);
    const room = await e2e.roomOf(uuidOfHost);
    for (const bot of bots) await bot.setReady(room.roomId, room.settingsVersion);
    return room;
}

/**
 * 사람이 방장인 판 차리기: 화면으로 방 만들기 → 손님(사람) 코드 입장·준비 → 봇 입장·준비 → 역할 → 방장 준비·시작
 * @returns {Promise<Table>} gameId 들어 있음 (봇은 bots 도우미가 닫음)
 */
async function hostGame({ host, guests = [], botList = [], roles = null, settings = {} }) {
    const room = await createRoomUi(host, { jokers: 1, ...settings });
    for (const g of guests) await ui.joinRoomByCodeUi(g.page, room.roomCode);
    for (const g of guests) await ui.readyUi(g.page);
    for (const g of guests) await expect(g.page.getByRole('button', { name: '준비취소' })).toBeVisible();
    if (botList.length > 0) await botsJoinAndReady(botList, host.account.uuid, room.roomCode);
    if (roles) await e2e.setRoles(roles);
    await expect(host.page.getByText(`파티 인원 ${1 + guests.length + botList.length}명`)).toBeVisible();
    await ui.readyUi(host.page);
    await expect(host.page.getByRole('button', { name: '준비취소' })).toBeVisible();
    await host.page.getByRole('button', { name: '게임시작' }).click();
    for (const p of [host, ...guests]) await expect(p.page).toHaveURL(/\/ingame/, { timeout: 20000 });
    const game = await e2e.gameOf(host.account.uuid);
    const t = new Table({ room, bots: botList, humans: [host, ...guests] });
    t.gameId = game.gameId;
    return t;
}

/** 봇 방장이 방 설정 바꾸기 (지금 서버 값에 changes 덮어씀) → ack */
async function botUpdateSettings(bot, changes = {}) {
    const live = await e2e.roomOf(bot.uuid);
    const s = live.settings;
    const payload = {
        roomId: live.roomId, requestId: crypto.randomUUID(), expectedSettingsVersion: live.settingsVersion,
        accessType: changes.accessType ?? 'open', maxPlayers: s.maxPlayers, jokerCount: s.jokerCount,
        roleCompositionMode: s.roleCompositionMode ?? 'auto', dayDiscussionTime: s.dayDiscussionTime, dayVoteTime: s.dayVoteTime,
        nightActionTime: s.nightActionTime, ...(s.tribunalTime ? { tribunalTime: s.tribunalTime } : {}),
        ...(s.roleCounts ? { roleCounts: s.roleCounts } : {}), ...changes,
    };
    return bot.request('update_room_settings', payload);
}

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// 첫 쪽부터 끝 쪽까지 한 번 훑기 (쪽은 30개까지), 찾으면 그 줄 아니면 null
async function scanRoomPages(panel, title) {
    const prev = panel.getByRole('button', { name: '이전 페이지' });
    while (await prev.isEnabled().catch(() => false)) await prev.click();
    for (let i = 0; i < 30; i += 1) {
        const row = panel.getByRole('button', { name: new RegExp(`^${escapeRe(title)},`) });
        if (await row.count() > 0) return row.first();
        const next = panel.getByRole('button', { name: '다음 페이지' });
        if (!(await next.isEnabled().catch(() => false))) return null;
        await next.click();
    }
    return null;
}

/** 방 목록에서 제목으로 줄 찾기 (쪽 넘기며, 못 찾으면 0.4초 쉬고 처음부터), 시간 넘으면 null */
async function findRoomRow(page, title, { timeoutMs = 10000 } = {}) {
    const deadline = Date.now() + timeoutMs;
    const panel = page.getByRole('region', { name: '공개 방 목록' });
    await expect(panel).toBeVisible();
    while (Date.now() < deadline) {
        const row = await scanRoomPages(panel, title);
        if (row) return row;
        await sleep(400);
    }
    return null;
}

/** 멀티플레이 방 목록 화면 열기 */
async function openRoomList(page) {
    await page.goto('/multiplay');
    await expect(page.getByRole('region', { name: '공개 방 목록' })).toBeVisible();
}
module.exports = { expectPartyCount, readySilhouettes, blockedDialog, botsJoinAndReady, hostGame, botUpdateSettings, findRoomRow, openRoomList };

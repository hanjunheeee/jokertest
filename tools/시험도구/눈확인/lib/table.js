'use strict';

// 판 차리기 도우미, 사람 창 + 봇 방장으로 방 만들고 입장·준비까지(앉히기) → 시작은 따로 (역할 확인 창을 진짜로 보이게)
// 판 안 장면(바·사·아)이 씀 — 한 판으로 엮을 땐 chainTable로 s.state.table을 이어 씀, 판 굴리는 건 e2e Table 그대로
const { fromE2e, e2eRequire } = require('./paths');

const { expect } = e2eRequire('@playwright/test');
const ui = fromE2e('helpers/ui');
const { e2e } = fromE2e('helpers/internal');
const { Table, fitMaxPlayers, customRoleSettings, FAST_ROOM_SETTINGS } = fromE2e('helpers/game');

// 사람이 보는 동안 단계가 덜 넘어가게 서버가 받는 가장 긴 값 (토론 150·투표 90·재판 120·밤 120초) — 멈추는 수단은 없음
const ROOMY = Object.freeze({ dayDiscussionTime: 150, dayVoteTime: 90, tribunalTime: 120, nightActionTime: 120 });

/**
 * 앉히기: 봇 방장 방 → 봇·사람 입장 → 전원 준비 → 역할 예약 (시작은 안 함)
 * @param {import('./session').Session} s
 * @param {object} o
 * @param {object[]} o.humans s.person()으로 연 사람들
 * @param {number} [o.bots=1] 봇 수 (첫 봇이 방장)
 * @param {object} [o.settings] 방 설정 덮어쓰기 (기본 ROOMY 시간)
 * @param {(ctx:{humans:object[],bots:object[]})=>Record<string,string>} [o.roles] { uuid: 'JOKER' } 만드는 함수
 * @returns {Promise<{room:object, bots:object[], humans:object[], host:object}>}
 */
async function seat(s, { humans, bots: botCount = 1, settings = {}, roles = null }) {
    const bots = await s.spawnBots(botCount);
    const host = bots[0];
    const total = humans.length + bots.length;
    if (total < 5) throw new Error(`판은 5명 이상 (지금 ${total}명)`);
    const room = await host.createRoom({ ...FAST_ROOM_SETTINGS, ...ROOMY, maxPlayers: fitMaxPlayers(total), ...settings });
    for (const bot of bots.slice(1)) await bot.joinByCode(room.roomCode);
    for (const h of humans) await ui.joinRoomByCodeUi(h.page, room.roomCode);
    for (const bot of bots) await bot.setReady(room.roomId, room.settingsVersion);
    for (const h of humans) await ui.readyUi(h.page);
    const presets = roles ? roles({ humans, bots }) : null;
    if (presets) await e2e.setRoles(presets, { roomId: room.roomId });
    return { room, bots, humans, host };
}

/** 앉힌 판 시작 → e2e Table (gameId 들어 있음), 사람 화면이 판 화면이 될 때까지 */
async function start(seated) {
    const started = await seated.host.startGame(seated.room.roomId, seated.room.settingsVersion);
    const t = new Table({ room: seated.room, bots: seated.bots, humans: seated.humans });
    t.gameId = started.gameId;
    for (const h of seated.humans) await expect(h.page).toHaveURL(/\/ingame/, { timeout: 20000 });
    return t;
}

/**
 * 엮인 장면용: s.state.table이 있으면 그대로, 없으면 사람 n명 + 봇으로 새 판 시작 → 역할 창 닫음
 * 한 판으로 이어 보는 장면들은 prepare에서 이걸 부르고 advanceUntil로 멈출 자리까지 굴림
 * @param {import('./session').Session} s
 * @param {{ people?: number, bots?: number, settings?: object, roles?: Function, mobile?: boolean }} [o]
 * @returns {Promise<import('../../../../e2e/helpers/game').Table>}
 */
async function chainTable(s, { people = 1, bots = 4, settings = {}, roles = null, mobile = false } = {}) {
    if (s.state.table) return s.state.table;
    const humans = [];
    for (let i = 0; i < people; i += 1) humans.push(await s.person({ mobile }));
    const t = await start(await seat(s, { humans, bots, settings, roles }));
    s.state.table = t;
    s.keep(() => t.stopBots().catch(() => {}));
    await Promise.all(humans.map((h) => ui.readRoleReveal(h.page).catch(() => null)));
    return t;
}

module.exports = { ROOMY, seat, start, chainTable, customRoleSettings };

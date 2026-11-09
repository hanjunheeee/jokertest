'use strict';

// 브라우저 시험용 게임 손잡이 파일, 역할 미리 정하기·판/방 들여다보기·지금 단계 바로 끝내기
// routes/e2e.routes.js(E2E_HOOKS=1, 운영 아님)와 matchmaking/room/startLaunch.js(역할 미리 정하기 반영)가 씀, Node 여러 개 길은 remoteHooks.js
const { isE2eHooksEnabled } = require('../../config/e2eHooks');
const cluster = require('../../cluster');
const { GAME_ROLES } = require('../../game-core/core/rules/roles');
const { getSessionById, getPlayerGameId } = require('../../game-core/queries/byId');
const { gameRooms, playerRoom } = require('../matchmaking/core/state');
const runs = require('../gameSession/core/state');
const e2eTimers = require('./timers');

// 역할 예약 두 가지 (판 시작 때 한 번 쓰고 지움) — 시험마다 계정·방이 달라서 병렬로 돌아도 안 섞임
// 방 예약: 방 id → { presets: uuid → 역할, at } (그 방이 시작할 때만 씀)
const roomPresets = new Map();
// 사람 예약: uuid → { role, at } (방 id를 모를 때, 그 사람이 든 판이 시작할 때 씀)
const userPresets = new Map();
// 시작 안 한 채 버려진 예약은 이만큼 지나면 버림 (시험 하나 길이보다 넉넉히)
const PRESET_TTL_MS = 15 * 60 * 1000;

function pruneStale(now = Date.now()) {
    for (const [roomId, entry] of roomPresets) if (now - entry.at > PRESET_TTL_MS) roomPresets.delete(roomId);
    for (const [uuid, entry] of userPresets) if (now - entry.at > PRESET_TTL_MS) userPresets.delete(uuid);
}

/**
 * 역할 미리 정하기: { uuid: 'JOKER' } 모양만, 모르는 역할이면 던짐
 * @param {Record<string,string>} presets
 * @param {{ roomId?: string }} [o] roomId 주면 그 방 예약 (그 방 판에만 씀), 없으면 사람 예약
 * @returns {number} 그 예약 칸에 걸린 수 (방 예약이면 그 방 것, 아니면 사람 예약 전체)
 */
function setRolePresets(presets, { roomId } = {}) {
    if (!presets || typeof presets !== 'object' || Array.isArray(presets)) throw new Error('presets는 { uuid: 역할 } 모양');
    const entries = Object.entries(presets);
    for (const [, role] of entries) if (!GAME_ROLES[role]) throw new Error(`모르는 역할: ${role}`);
    if (roomId !== undefined && roomId !== null && (typeof roomId !== 'string' || roomId.length === 0 || roomId.length > 128)) throw new Error('roomId는 글자');
    const now = Date.now();
    pruneStale(now);
    if (roomId) {
        const entry = roomPresets.get(roomId) ?? { presets: new Map(), at: now };
        for (const [uuid, role] of entries) entry.presets.set(uuid, role);
        entry.at = now;
        roomPresets.set(roomId, entry);
        return entry.presets.size;
    }
    for (const [uuid, role] of entries) userPresets.set(uuid, { role, at: now });
    return userPresets.size;
}

/**
 * 예약 지우기
 * @param {string[]|{ uuids?: string[], roomId?: string }} [target] 안 주면 전부 (서버 안·단위 시험용 — 경로는 all: true일 때만)
 */
function clearRolePresets(target) {
    if (target === undefined) { roomPresets.clear(); userPresets.clear(); return; }
    const { uuids, roomId } = Array.isArray(target) ? { uuids: target } : (target ?? {});
    if (roomId) roomPresets.delete(roomId);
    if (Array.isArray(uuids)) {
        for (const uuid of uuids) {
            userPresets.delete(uuid);
            for (const entry of roomPresets.values()) entry.presets.delete(uuid);
        }
    }
}

// 예약 수 (확인용)
function pendingRolePresets() {
    return { rooms: roomPresets.size, users: userPresets.size };
}

/**
 * 역할 나누기: 바라는 사람에게 그 역할, 나머지는 되도록 원래 역할 그대로, 모자라는 자리는 남은 역할로 채움 (역할별 인원은 그대로)
 * 사슬 바꿈(가→나 역할, 나→다 역할, 다→가 역할)도 맞춤 — 그 역할 자리가 바라는 사람 수보다 적을 때만 못 맞춤
 * @param {{uuid:string, role:string}[]} players 이 배열의 role을 바꿈
 * @param {Map<string,string>} wanted uuid → 바라는 역할
 * @returns {string[]} 못 맞춘 uuid
 * @example 역할 [광대,의사,경비원] + 바람 {의사였던 나: 경비원, 경비원이던 봇: 광대} → [의사, 경비원, 광대] (광대였던 봇이 남은 의사)
 */
function assignRoles(players, wanted) {
    const supply = new Map();
    for (const p of players) supply.set(p.role, (supply.get(p.role) ?? 0) + 1);
    const granted = new Map();
    const unmet = [];
    const wishers = players.filter((p) => wanted.has(p.uuid));
    // 이미 그 역할인 사람 먼저 (자리가 모자랄 때 지금 가진 사람이 그대로 갖게)
    const ordered = [...wishers.filter((p) => p.role === wanted.get(p.uuid)), ...wishers.filter((p) => p.role !== wanted.get(p.uuid))];
    for (const p of ordered) {
        const role = wanted.get(p.uuid);
        if ((supply.get(role) ?? 0) > 0) { supply.set(role, supply.get(role) - 1); granted.set(p.uuid, role); } else unmet.push(p.uuid);
    }
    // 나머지(못 맞춘 사람 포함): 원래 역할 자리가 남았으면 그대로, 아니면 나중에 남은 자리로
    const needing = [];
    for (const p of players) {
        if (granted.has(p.uuid)) continue;
        if ((supply.get(p.role) ?? 0) > 0) supply.set(p.role, supply.get(p.role) - 1); else needing.push(p);
    }
    const leftovers = [...supply.entries()].flatMap(([role, n]) => Array.from({ length: n }, () => role));
    needing.forEach((p, i) => { p.role = leftovers[i]; });
    for (const p of players) if (granted.has(p.uuid)) p.role = granted.get(p.uuid);
    return unmet;
}

// 판 시작 직전: 이 방 예약 + 이 판 사람 예약을 꺼내(지우고) 역할 나누기, 못 맞춘 uuid 목록 돌려줌
function applyRolePresets(session) {
    if (!isE2eHooksEnabled() || (roomPresets.size === 0 && userPresets.size === 0)) return [];
    pruneStale();
    const players = [...session.players.values()];
    const wanted = new Map();
    const roomEntry = session.roomId ? roomPresets.get(session.roomId) : undefined;
    if (roomEntry) {
        roomPresets.delete(session.roomId);
        for (const [uuid, role] of roomEntry.presets) if (session.players.has(uuid)) wanted.set(uuid, role);
    }
    const consumed = [];
    for (const p of players) {
        const entry = userPresets.get(p.uuid);
        if (!entry) continue;
        userPresets.delete(p.uuid);
        consumed.push(p.uuid);
        // 방 예약이 먼저 (더 좁은 예약)
        if (!wanted.has(p.uuid)) wanted.set(p.uuid, entry.role);
    }
    // 사람 예약은 전 Node에 넣어 둠 → 여기서 쓴 것은 다른 Node 것도 지움 (뒷판에 잘못 쓰이지 않게)
    if (consumed.length > 0 && cluster.isShared()) void cluster.rpc.callAll('e2e.clear', { uuids: consumed });
    if (wanted.size === 0) return [];
    const unmet = assignRoles(players, wanted);
    if (unmet.length > 0) console.warn('[e2e] 역할 미리 정하기 못 맞춤 (그 역할 자리가 모자람)', { gameId: session.id, count: unmet.length });
    return unmet;
}

// 판 요약: 단계·날짜·사람마다 역할·생존 (시험만 봄)
function describeSession(session) {
    if (!session) return null;
    return {
        gameId: session.id,
        roomId: session.roomId,
        roomCode: session.roomCode,
        phase: session.phase,
        dayIndex: session.dayIndex,
        dayPhase: session.dayPhase ?? null,
        dayVoteRound: session.dayVoteRound ?? null,
        nightTurnRole: session.phase === 'NIGHT' ? (session.nightTurnRole ?? null) : null,
        tribunal: session.tribunal
            ? { defendantUuid: session.tribunal.defendantUuid ?? null, resolved: !!session.tribunal.resolved }
            : null,
        winResult: session.winResult ?? null,
        players: [...session.players.values()].map((p) => ({
            uuid: p.uuid, nickname: p.nickname, role: p.role, alive: p.alive, isParticipating: p.isParticipating,
        })),
    };
}

function findSessionByUser(uuid) {
    const gameId = getPlayerGameId(uuid);
    return gameId ? getSessionById(gameId) : undefined;
}

// 방 요약: 코드·방장·사람·설정 버전 (방 코드 얻기용)
function describeRoomByUser(uuid) {
    const roomId = playerRoom.get(uuid);
    const room = roomId ? gameRooms.get(roomId) : undefined;
    if (!room) return null;
    return {
        roomId: room.id,
        roomCode: room.code ?? null,
        hostUuid: room.hostUuid ?? null,
        settingsVersion: room.settingsVersion ?? null,
        settings: room.settings ?? null,
        players: [...room.players.entries()].map(([playerUuid, p]) => ({ uuid: playerUuid, nickname: p?.nickname ?? null, isReady: !!p?.isReady })),
    };
}

// 지금 단계의 마감 타이머를 바로 돌림 (밤은 연출 대기 먼저), 돌린 이름 돌려줌 (없으면 null)
function advanceSession(gameId) {
    const session = getSessionById(gameId);
    if (!session) return { ok: false, code: 'SESSION_NOT_FOUND' };
    const before = session.phase;
    const candidates = [];
    if (session.phase === 'ROLE_REVEAL') candidates.push(['ROLE_REVEAL', runs.roleRevealRuns.get(gameId)?.timerId]);
    if (session.phase === 'DAY') candidates.push(['DAY', runs.dayPhaseRuns.get(gameId)?.timerId]);
    if (session.phase === 'TRIBUNAL') candidates.push(['TRIBUNAL', runs.tribunalRuns.get(gameId)?.timerId]);
    if (session.phase === 'NIGHT') {
        const nightRun = runs.nightTurnRuns.get(gameId);
        candidates.push(['NIGHT_WAIT', nightRun?.wait?.timerId], ['NIGHT_TURN', nightRun?.timerId]);
    }
    for (const [name, handle] of candidates) {
        if (e2eTimers.isPending(handle)) {
            e2eTimers.fireNow(handle);
            return { ok: true, fired: name, before, after: getSessionById(gameId)?.phase ?? 'GONE' };
        }
    }
    return { ok: true, fired: null, before, after: session.phase };
}

module.exports = {
    setRolePresets,
    clearRolePresets,
    pendingRolePresets,
    assignRoles,
    applyRolePresets,
    describeSession,
    findSessionByUser,
    describeRoomByUser,
    advanceSession,
    getSessionById,
};

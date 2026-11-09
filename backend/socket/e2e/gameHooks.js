'use strict';

// 브라우저 시험용 게임 손잡이 파일, 역할 미리 정하기·판/방 들여다보기·지금 단계 바로 끝내기
// routes/e2e.routes.js(E2E_HOOKS=1, 운영 아님)와 matchmaking/room/start.js(역할 미리 정하기 반영)가 씀
const { isE2eHooksEnabled } = require('../../config/e2eHooks');
const { GAME_ROLES } = require('../../game-core/core/rules/roles');
const { getSessionById, getPlayerGameId } = require('../../game-core/queries/byId');
const { gameRooms, playerRoom } = require('../matchmaking/core/state');
const runs = require('../gameSession/core/state');
const e2eTimers = require('./timers');

// uuid → 바라는 역할 (판 시작 때 한 번 쓰고 지움)
const rolePresets = new Map();

// 역할 미리 정하기: { uuid: 'JOKER' } 모양만, 모르는 역할이면 던짐
function setRolePresets(presets) {
    if (!presets || typeof presets !== 'object' || Array.isArray(presets)) throw new Error('presets는 { uuid: 역할 } 모양');
    for (const [uuid, role] of Object.entries(presets)) {
        if (!GAME_ROLES[role]) throw new Error(`모르는 역할: ${role}`);
        rolePresets.set(uuid, role);
    }
    return rolePresets.size;
}

function clearRolePresets(uuids) {
    if (Array.isArray(uuids)) uuids.forEach((uuid) => rolePresets.delete(uuid));
    else rolePresets.clear();
}

// 판 시작 직전: 미리 정한 사람과 그 역할을 가진 사람끼리 역할 바꿈 (역할별 인원은 그대로), 못 맞춘 uuid 목록 돌려줌
function applyRolePresets(session) {
    if (!isE2eHooksEnabled() || rolePresets.size === 0) return [];
    const players = [...session.players.values()];
    const wanted = players.filter((p) => rolePresets.has(p.uuid));
    const unmet = [];
    // 바꾼 사람은 다시 안 건드림 (앞에서 맞춘 역할을 뒤에서 뺏지 않게)
    const locked = new Set();
    for (const player of wanted) {
        const role = rolePresets.get(player.uuid);
        rolePresets.delete(player.uuid);
        if (player.role === role) { locked.add(player.uuid); continue; }
        const donor = players.find((p) => p.role === role && !locked.has(p.uuid) && !(rolePresets.has(p.uuid) && rolePresets.get(p.uuid) !== role) && p.uuid !== player.uuid);
        if (!donor) { unmet.push(player.uuid); continue; }
        donor.role = player.role;
        player.role = role;
        locked.add(player.uuid);
    }
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
    applyRolePresets,
    describeSession,
    findSessionByUser,
    describeRoomByUser,
    advanceSession,
    getSessionById,
};

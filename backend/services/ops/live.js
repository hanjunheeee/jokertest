'use strict';

// 지금 상황 요약 파일, 대기방·진행 판·접속 수를 개인정보 없이 숫자로 (관리자 서버 실시간 화면용)
// 내부 API GET /internal/live가 부름, 대기방·판 장부는 읽기만

// 장부 기본 출처 (부를 때 읽음, 시험이 바꿔 끼움)
const defaultSources = () => ({
    gameRooms: require('../../socket/matchmaking/core/state').gameRooms,
    gameSessions: require('../../game-core/core/registry/state').gameSessions,
    onlineUsers: require('../../socket/emitter').onlineUsers,
});

const toIso = (ms) => (Number.isFinite(ms) ? new Date(ms).toISOString() : null);

// 대기방 한 줄: 방 id·코드·공개 여부·인원·최대 인원 (명단·닉네임 안 실음)
const summarizeRoom = (room) => ({
    roomId: room.id,
    code: room.code ?? null,
    accessType: room.accessType ?? null,
    playerCount: room.players?.size ?? 0,
    maxPlayers: room.settings?.maxPlayers ?? null,
});

// 진행 판 한 줄: 판·방 id·코드·인원·산 사람 수·단계·날짜·시작 시각
const summarizeSession = (session) => {
    const players = session.players instanceof Map ? [...session.players.values()] : [];
    return {
        gameId: session.id,
        roomId: session.roomId ?? null,
        roomCode: session.roomCode ?? null,
        playerCount: players.length,
        aliveCount: players.filter((player) => player?.alive === true).length,
        phase: session.phase ?? null,
        dayIndex: Number.isInteger(session.dayIndex) ? session.dayIndex : null,
        startedAt: toIso(session.startedAt),
    };
};

// 전체 요약
const getLiveSummary = (sources = defaultSources(), now = new Date()) => {
    const rooms = [...sources.gameRooms.values()].map(summarizeRoom);
    const games = [...sources.gameSessions.values()].map(summarizeSession);
    return {
        at: now.toISOString(),
        onlineCount: sources.onlineUsers.size,
        roomCount: rooms.length,
        gameCount: games.length,
        rooms,
        games,
    };
};

module.exports = { getLiveSummary, summarizeRoom, summarizeSession };

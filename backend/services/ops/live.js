'use strict';

// 지금 상황 요약 파일, 대기방·진행 판·접속 수를 개인정보 없이 숫자로 (관리자 서버 실시간 화면용)
// 내부 API GET /internal/live가 부름, 대기방·판 장부는 읽기만 (Node 여러 개면 RPC ops.liveSummary로 전 Node 것을 합침)
const cluster = require('../../cluster');

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

// 다른 Node가 묻는 것: 이 Node 요약 (부를 때 module.exports로 읽어 시험 갈아끼우기 먹게)
cluster.rpc.register('ops.liveSummary', () => module.exports.getLiveSummary());

// Node 하나 답 → 칸마다 node 붙인 방·판 + Node 줄
const tagNode = (node, summary) => ({
    rooms: (summary.rooms ?? []).map((room) => ({ ...room, node })),
    games: (summary.games ?? []).map((game) => ({ ...game, node })),
    line: { node, ok: true, onlineCount: summary.onlineCount ?? 0, roomCount: summary.roomCount ?? 0, gameCount: summary.gameCount ?? 0 },
});

// 여러 Node 답 합치기: 접속 수 합, 방·판에 node 칸, Node마다 한 줄, 못 물은 Node가 있으면 partial
const mergeLiveResults = ({ results, partial }, now = new Date()) => {
    const rooms = [];
    const games = [];
    const nodes = [];
    for (const result of results) {
        if (!result.ok) { nodes.push({ node: result.node, ok: false, code: result.code }); continue; }
        const tagged = tagNode(result.node, result.value ?? {});
        rooms.push(...tagged.rooms);
        games.push(...tagged.games);
        nodes.push(tagged.line);
    }
    const onlineCount = nodes.reduce((sum, line) => sum + (line.onlineCount ?? 0), 0);
    return {
        at: now.toISOString(), onlineCount, roomCount: rooms.length, gameCount: games.length, rooms, games, nodes, partial,
    };
};

// Node 여러 개 요약: node 주면 그 Node 것만 (?node=n2), 아니면 전 Node callAll 합침
const getClusterLiveSummary = async ({ node } = {}) => {
    if (typeof node === 'string' && node) {
        try {
            const value = await cluster.rpc.call(node, 'ops.liveSummary', null);
            return mergeLiveResults({ results: [{ node, ok: true, value }], partial: false });
        } catch (error) {
            return mergeLiveResults({ results: [{ node, ok: false, code: error?.code ?? 'RPC_FAILED' }], partial: true });
        }
    }
    return mergeLiveResults(await cluster.rpc.callAll('ops.liveSummary', null));
};

module.exports = { getLiveSummary, getClusterLiveSummary, mergeLiveResults, summarizeRoom, summarizeSession };

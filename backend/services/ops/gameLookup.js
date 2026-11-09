'use strict';

// 다른 Node 판 묻기 파일, 신고가 다른 Node 판의 "같이 한 판"·채팅 증거를 판 Node에 RPC로 물음 (못 물으면 null·빈 배열)
// services/ops/report.js가 부름, RPC game.participants·game.chatEvidence 처리기도 여기서 등록
const cluster = require('../../cluster');

const UUID_PATTERN = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
const isId = (value) => typeof value === 'string' && UUID_PATTERN.test(value);

// 이 Node 장부 (부를 때 읽음)
const localGameSessions = () => require('../../game-core/core/registry/state').gameSessions;
const localChatBuffer = () => require('./chatBuffer');

// 판 주인 Node (나·없음·죽음·Redis 못 씀이면 null) — game:<id>는 조각 3이 채움, 없으면 "못 찾음"
async function findOwner(gameId) {
    if (!cluster.isShared()) return null;
    const found = await cluster.directory.locate(cluster.directory.keys().game(gameId));
    if (!found.available || !found.node || found.self || !found.alive) return null;
    return found.node;
}

// 진행 중 판에 이 사람들이 있는지 판 Node에 물음 → { found:true, both } 또는 null(못 물음·그 판 없음 → DB로)
async function remoteParticipants(gameId, uuids) {
    const node = await findOwner(gameId);
    if (!node) return null;
    try {
        const reply = await cluster.rpc.call(node, 'game.participants', { gameId, uuids });
        return reply?.found === true ? reply : null;
    } catch {
        return null;
    }
}

// 첫 답 중 채팅이 있는 것 (나 빼고)
const firstMessages = (results) => {
    for (const result of results) {
        if (result.ok && result.node !== cluster.serverId() && Array.isArray(result.value?.messages) && result.value.messages.length > 0) {
            return result.value.messages;
        }
    }
    return [];
};

// 판 채팅 증거를 판 Node 버퍼에서 → 배열 (없으면 빈 배열)
// 판이 끝나 디렉터리에서 빠졌어도 버퍼는 10분 남음 → 주인을 모르면 전 Node에 물음 (신고는 드물어서 괜찮음)
async function remoteChatEvidence(gameId) {
    if (!cluster.isShared()) return [];
    const node = await findOwner(gameId);
    if (node) {
        try {
            const reply = await cluster.rpc.call(node, 'game.chatEvidence', { gameId });
            if (Array.isArray(reply?.messages) && reply.messages.length > 0) return reply.messages;
        } catch { /* 아래 전 Node로 */ }
    }
    const { results } = await cluster.rpc.callAll('game.chatEvidence', { gameId });
    return firstMessages(results);
}

// 다른 Node가 묻는 것: 이 Node 진행 판 기준 (판 없으면 found:false)
cluster.rpc.register('game.participants', (args) => {
    const uuids = Array.isArray(args?.uuids) ? args.uuids.filter(isId).slice(0, 10) : [];
    const session = isId(args?.gameId) ? localGameSessions().get(args.gameId) : null;
    if (!(session?.players instanceof Map)) return { found: false };
    return { found: true, both: uuids.length > 0 && uuids.every((uuid) => session.players.has(uuid)) };
});

// 다른 Node가 묻는 것: 이 Node 채팅 버퍼 복사본
cluster.rpc.register('game.chatEvidence', (args) => ({
    messages: isId(args?.gameId) ? localChatBuffer().getGameChatMessages(args.gameId) : [],
}));

module.exports = { remoteParticipants, remoteChatEvidence };

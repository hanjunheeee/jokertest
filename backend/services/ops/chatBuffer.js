'use strict';

// 판 채팅 보관 파일, 판마다 채팅을 메모리에 모아 두고 판 끝 뒤 10분까지 들고 있음 (신고 증거용)
// socket/gameSession/handlers/chat.js가 넣고 departure/end.js가 판 끝 표시, 신고 접수가 꺼내 감 (DB엔 신고 때만 씀)

// 판 하나 최대 줄 수·판 수·글 길이 (메모리 상한, 넘으면 오래된 것부터 버림)
const MAX_MESSAGES_PER_GAME = 500;
const MAX_GAMES = 300;
const MAX_TEXT_LENGTH = 500;
// 판 끝 뒤 보관 시간, 끝 표시 못 받은 판도 마지막 채팅 뒤 이만큼 지나면 버림
const KEEP_AFTER_END_MS = 10 * 60 * 1000;
const STALE_ACTIVE_MS = 3 * 60 * 60 * 1000;

// 판 id → { messages, endedAt, lastAt } (Map은 넣은 순서 = 오래된 순서)
const buffers = new Map();

// 지난 것 버리기: 끝나고 10분 지남 · 끝 표시 없이 3시간 조용함
const sweep = (nowMs) => {
    for (const [gameId, entry] of buffers) {
        if (entry.endedAt !== null && nowMs - entry.endedAt >= KEEP_AFTER_END_MS) buffers.delete(gameId);
        else if (entry.endedAt === null && nowMs - entry.lastAt >= STALE_ACTIVE_MS) buffers.delete(gameId);
    }
};

// 판 수 상한: 끝난 판 먼저, 없으면 가장 오래된 판 버림
const enforceGameLimit = () => {
    while (buffers.size > MAX_GAMES) {
        let victim = null;
        for (const [gameId, entry] of buffers) {
            if (entry.endedAt !== null) { victim = gameId; break; }
        }
        buffers.delete(victim ?? buffers.keys().next().value);
    }
};

// 채팅 한 줄 넣기 (모양 틀리면 조용히 버림, 채팅 보내기를 막지 않음)
const recordGameChatMessage = (gameId, { channel, senderUuid, nickname = null, text, sentAt }, { now = Date.now } = {}) => {
    if (typeof gameId !== 'string' || !gameId || typeof text !== 'string') return false;
    const nowMs = now();
    sweep(nowMs);
    let entry = buffers.get(gameId);
    if (!entry) {
        entry = { messages: [], endedAt: null, lastAt: nowMs };
        buffers.set(gameId, entry);
        enforceGameLimit();
    }
    entry.lastAt = nowMs;
    entry.messages.push({
        at: Number.isFinite(sentAt) ? new Date(sentAt).toISOString() : new Date(nowMs).toISOString(),
        channel: typeof channel === 'string' ? channel : null,
        senderUuid: typeof senderUuid === 'string' ? senderUuid : null,
        nickname: typeof nickname === 'string' ? nickname : null,
        text: text.slice(0, MAX_TEXT_LENGTH),
    });
    if (entry.messages.length > MAX_MESSAGES_PER_GAME) {
        entry.messages.splice(0, entry.messages.length - MAX_MESSAGES_PER_GAME);
    }
    return true;
};

// 판 끝 표시 (이때부터 10분 뒤 버림)
const markGameEnded = (gameId, { now = Date.now } = {}) => {
    const entry = buffers.get(gameId);
    if (entry && entry.endedAt === null) entry.endedAt = now();
};

// 판 채팅 복사본 (없거나 지났으면 빈 배열)
const getGameChatMessages = (gameId, { now = Date.now } = {}) => {
    sweep(now());
    const entry = buffers.get(gameId);
    return entry ? entry.messages.map((message) => ({ ...message })) : [];
};

const getBufferStats = () => ({
    games: buffers.size,
    messages: [...buffers.values()].reduce((sum, entry) => sum + entry.messages.length, 0),
});

const __resetForTests = () => buffers.clear();

module.exports = {
    MAX_MESSAGES_PER_GAME,
    MAX_GAMES,
    MAX_TEXT_LENGTH,
    KEEP_AFTER_END_MS,
    STALE_ACTIVE_MS,
    recordGameChatMessage,
    markGameEnded,
    getGameChatMessages,
    getBufferStats,
    __resetForTests,
};

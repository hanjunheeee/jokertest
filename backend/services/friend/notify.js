// 친구 사건 전송 파일, 효과음 사건 만들기 · 신청·수락·거절·차단 사건 보내기
// controllers/friend.controller.js가 index.js 거쳐 서비스 다음에 부름 (전송 실패해도 응답은 그대로)
const { emitToUser } = require("../../socket/emitter");

// 효과음 사건 만들기, 요청·계정 id 없으면 null (소리 없이 사건만 보냄)
function buildFriendSfxEvent(kind, stage, accountId, requestId) {
    if (!Number.isInteger(requestId)) return null;
    if (typeof accountId !== 'string' || accountId.length === 0) return null;
    return {
        kind,
        eventId: `friend-request:${requestId}:${stage}`,
        accountId,
        origin: 'live',
    };
}

// 친구 사건 보내기, 실패해도 기록만 하고 삼킴 (DB 처리는 이미 끝났기 때문)
function emitFriendEventSafely(userId, event, payload, code) {
    try {
        emitToUser(userId, event, payload);
    } catch {
        console.error('[친구 사건 통지 실패]', { code, userId });
    }
}

// 신청 받는 쪽에 받음 사건 (옛 실패 기록 문구 그대로 두려고 감싸개 안 씀)
exports.notifyRequestReceived = (receiverId, requestId) => {
    const sfxEvent = buildFriendSfxEvent('friend-request-received', 'received', receiverId, requestId);
    try {
        emitToUser(receiverId, 'friend_request_received', sfxEvent ? { sfxEvent } : {});
    } catch {
        console.error('[친구 요청 통지 실패]', { code: 'FRIEND_REQUEST_NOTIFY_ERROR', receiverId });
    }
};

// 신청 보낸 쪽에 수락 사건
exports.notifyRequestAccepted = (requesterId, byUuid, requestId) => {
    const sfxEvent = buildFriendSfxEvent('friend-request-accepted', 'accepted', requesterId, requestId);
    emitFriendEventSafely(
        requesterId, 'friend_request_accepted',
        { byUuid, ...(sfxEvent ? { sfxEvent } : {}) },
        'FRIEND_REQUEST_ACCEPT_NOTIFY_ERROR',
    );
};

// 신청 보낸 쪽에 거절 사건
exports.notifyRequestDeclined = (requesterId, byUuid, requestId) => {
    const sfxEvent = buildFriendSfxEvent('friend-request-declined', 'declined', requesterId, requestId);
    emitFriendEventSafely(
        requesterId, 'friend_request_declined',
        { byUuid, ...(sfxEvent ? { sfxEvent } : {}) },
        'FRIEND_REQUEST_DECLINE_NOTIFY_ERROR',
    );
};

// 차단 뒤 관계 무효 사건, 화면이 친구·초대 다시 받음 (컨트롤러가 두 사람 각각 부름)
exports.notifyBlocked = (userId) => {
    emitFriendEventSafely(userId, 'friend_relation_invalidated', { reason: 'BLOCKED' }, 'FRIEND_BLOCK_NOTIFY_ERROR');
};

// 차단 풀기 뒤 관계 무효 사건 (컨트롤러가 푼 사람에게만 부름)
exports.notifyUnblocked = (userId) => {
    emitFriendEventSafely(userId, 'friend_relation_invalidated', { reason: 'UNBLOCKED' }, 'FRIEND_UNBLOCK_NOTIFY_ERROR');
};

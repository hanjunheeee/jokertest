// 친구 사건 전송 파일, 효과음 사건 만들기 · 친구 사건 보내기 (보내다 실패해도 삼키고 기록만 함)
// friend 컨트롤러가 서비스 호출 끝난 뒤 부름, 응답(200)은 전송 실패와 상관없이 컨트롤러가 그대로 보냄
const { emitToUser } = require("../../socket/emitter");

// 요청 id·계정 id가 올바를 때만 효과음 사건 만듦, 아니면 null
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

// 친구 사건 보내기, 실패하면 코드·대상만 기록하고 삼킴
function emitFriendEventSafely(userId, event, payload, code) {
    try {
        emitToUser(userId, event, payload);
    } catch (emitError) {
        console.error('[친구 사건 통지 실패]', { code, userId });
    }
}

// 친구 신청 받는 쪽에 알림 (실패 기록 문구·코드는 옮기기 전 그대로 따로 둠)
exports.notifyRequestReceived = (receiverId, requestId) => {
    const sfxEvent = buildFriendSfxEvent('friend-request-received', 'received', receiverId, requestId);
    try {
        emitToUser(receiverId, 'friend_request_received', sfxEvent ? { sfxEvent } : {});
    } catch (emitError) {
        console.error('[친구 요청 통지 실패]', { code: 'FRIEND_REQUEST_NOTIFY_ERROR', receiverId });
    }
};

// 신청 보낸 쪽에 수락 알림
exports.notifyRequestAccepted = (requesterId, byUuid, requestId) => {
    const sfxEvent = buildFriendSfxEvent('friend-request-accepted', 'accepted', requesterId, requestId);
    emitFriendEventSafely(
        requesterId, 'friend_request_accepted',
        { byUuid, ...(sfxEvent ? { sfxEvent } : {}) },
        'FRIEND_REQUEST_ACCEPT_NOTIFY_ERROR',
    );
};

// 신청 보낸 쪽에 거절 알림
exports.notifyRequestDeclined = (requesterId, byUuid, requestId) => {
    const sfxEvent = buildFriendSfxEvent('friend-request-declined', 'declined', requesterId, requestId);
    emitFriendEventSafely(
        requesterId, 'friend_request_declined',
        { byUuid, ...(sfxEvent ? { sfxEvent } : {}) },
        'FRIEND_REQUEST_DECLINE_NOTIFY_ERROR',
    );
};

// 차단 뒤 관계 무효 알림 (한 명씩 부름)
exports.notifyBlocked = (userId) => {
    emitFriendEventSafely(userId, 'friend_relation_invalidated', { reason: 'BLOCKED' }, 'FRIEND_BLOCK_NOTIFY_ERROR');
};

// 차단 풀기 뒤 관계 무효 알림
exports.notifyUnblocked = (userId) => {
    emitFriendEventSafely(userId, 'friend_relation_invalidated', { reason: 'UNBLOCKED' }, 'FRIEND_UNBLOCK_NOTIFY_ERROR');
};

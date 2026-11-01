'use strict';

// 게임 초대 전송 파일, 받음 · 바뀜 사건 보내기
// 보내다 실패해도 던지지 않음, 사건 이름은 문자열 그대로
const notificationService = require('../../notification');
const { getDeps } = require('./deps');

// 받는 사람에게 새 초대
function emitInviteReceived(receiverId, publicInvite) {
    try {
        const emit = getDeps().emitToUser;
        if (typeof emit !== 'function') return;
        emit(receiverId, 'game_invite_received', {
            invite: publicInvite,
            sfxEvent: {
                kind: 'game-invite',
                eventId: notificationService.gameInviteSourceKey(publicInvite.inviteId),
                accountId: receiverId,
                origin: 'live',
            },
        });
    } catch {
        console.error('[게임 초대 전달 실패]', { code: 'GAME_INVITE_EMIT_ERROR', receiverId });
    }
}

// 관련된 사람들에게 바뀐 초대
function emitInviteUpdated(userIds, publicInvite) {
    const emit = getDeps().emitToUser;
    if (typeof emit !== 'function') return;
    for (const userId of new Set(userIds.filter(Boolean))) {
        try {
            emit(userId, 'game_invite_updated', { invite: publicInvite });
        } catch {
            console.error('[게임 초대 상태 전달 실패]', { code: 'GAME_INVITE_UPDATE_EMIT_ERROR', userId });
        }
    }
}

module.exports = {
    emitInviteReceived,
    emitInviteUpdated,
};

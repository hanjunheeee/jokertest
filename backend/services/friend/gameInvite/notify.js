'use strict';

// 게임 초대 전송 파일, 받음 · 바뀜 사건 보내기
// create.js(받음)·cancel.js(바뀜)가 부름, 실패해도 안 던짐 (초대 저장은 이미 끝났기 때문)
const notificationService = require('../../notification');
const { getDeps } = require('./deps');

// 받는 사람에게 새 초대 + 효과음 사건
function emitInviteReceived(receiverId, publicInvite) {
    try {
        // emitter 못 불러왔으면 건너뜀
        const emit = getDeps().emitToUser;
        if (typeof emit !== 'function') return;
        // 사건 이름은 글자 그대로 (프론트 시험이 송신 이름을 글자로 읽음)
        // 효과음 id = 알림 출처 키 (알림 쪽과 소리 한 번만 나게)
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

// 보낸·받는 사람에게 바뀐 초대 (한 명 실패해도 나머지는 보냄)
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

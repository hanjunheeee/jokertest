'use strict';

// 알림 전송 파일, 만든 알림을 그 사용자 소켓으로 보냄
// 보내다 실패해도 던지지 않음 (알림 저장은 이미 끝났으므로)
const { getDeps } = require('./deps');
const { NOTIFICATION_TYPES } = require('./constants');

// 시스템 알림이면 효과음 사건도 같이, 사건 이름은 문자열 그대로
const emitNotificationCreated = (userId, notification) => {
    if (notification === null || notification === undefined) return;
    try {
        const emit = getDeps().emitToUser;
        if (typeof emit !== 'function') return;

        const payload = { notification };
        if (notification.type === NOTIFICATION_TYPES.SYSTEM) {
            payload.sfxEvent = {
                kind: 'system-notification',
                eventId: `notification:${notification.id}`,
                accountId: userId,
                origin: 'live',
            };
        }
        emit(userId, 'notification_created', payload);
    } catch (error) {
        console.error('[알림 전달 실패]', { code: 'NOTIFICATION_EMIT_ERROR', userId, notificationId: notification?.id });
    }
};

module.exports = {
    emitNotificationCreated,
};

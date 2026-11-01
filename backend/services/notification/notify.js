'use strict';

// 알림 공개 모양·전송 파일, DB 행을 화면에 보낼 모양으로 바꿈 · 만든 알림을 그 사용자 소켓으로 보냄
// 만들기·목록이 모양을 씀, 보내다 실패해도 던지지 않음 (알림 저장은 이미 끝났으므로)
const { getDeps } = require('./deps');
const { NOTIFICATION_TYPES } = require('./constants');

// 행이 없으면 null, 모델 행이면 plain으로 풀어서
const toPublicNotification = (row) => {
    if (row === null || row === undefined) return null;
    const plain = typeof row.get === 'function' ? row.get({ plain: true }) : row;
    return {
        id: plain.id,
        type: plain.type,
        sourceKey: plain.source_key,
        title: plain.title,
        body: plain.body,
        target: plain.target ?? null,
        createdAt: plain.created_at,
        readAt: plain.read_at ?? null,
    };
};

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
    toPublicNotification,
    emitNotificationCreated,
};

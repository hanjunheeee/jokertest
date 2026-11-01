'use strict';

// 알림 공개 모양·전송 파일, DB 행 → 화면 모양 · 만든 알림을 그 사람 소켓으로 보냄
// create·manage가 모양 씀, 전송은 create·friend/requests.js·friend/gameInvite/create.js·achievement/evaluate.js가 부름
const { getDeps } = require('./deps');
const { NOTIFICATION_TYPES } = require('./constants');

// 알림 행 → 화면 모양, 행 없으면 null (모델 행이면 plain으로 풂)
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

// 만든 알림 전송, 실패해도 안 던짐 (알림 저장은 이미 끝났기 때문)
const emitNotificationCreated = (userId, notification) => {
    // 보낼 알림 없으면 끝
    if (notification === null || notification === undefined) return;
    try {
        // emitter 못 불러왔으면 건너뜀
        const emit = getDeps().emitToUser;
        if (typeof emit !== 'function') return;

        // 시스템 알림만 효과음 붙임 (나머지는 각 종류 사건이 소리 맡음)
        const payload = { notification };
        if (notification.type === NOTIFICATION_TYPES.SYSTEM) {
            payload.sfxEvent = {
                kind: 'system-notification',
                eventId: `notification:${notification.id}`,
                accountId: userId,
                origin: 'live',
            };
        }
        // 사건 이름은 글자 그대로 (프론트 시험이 송신 이름을 글자로 읽음)
        emit(userId, 'notification_created', payload);
    } catch {
        console.error('[알림 전달 실패]', { code: 'NOTIFICATION_EMIT_ERROR', userId, notificationId: notification?.id });
    }
};

module.exports = {
    toPublicNotification,
    emitNotificationCreated,
};

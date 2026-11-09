'use strict';

// 운영 알림 파일, 관리자 서버가 보낸 공지를 알림으로 저장 + 접속 중이면 바로 보냄
// 내부 API POST /internal/announcements가 부름, 저장·전송은 기존 알림 서비스 그대로 (같은 공지 id는 한 번만)
const { createError } = require('../../utils/appError');

// 한 번에 보낼 수 있는 대상 수·글 길이 (알림 표 칸 크기와 같음)
const MAX_TARGETS = 5000;
const MAX_TITLE = 120;
const MAX_BODY = 500;
const ANNOUNCEMENT_ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;
const UUID_PATTERN = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

const announcementSourceKey = (announcementId) => `announcement:${announcementId}`;

// 기본 의존 (부를 때 읽음, 시험이 바꿔 끼움)
const defaultDeps = () => ({
    notificationService: require('../notification'),
    onlineUsers: require('../../socket/emitter').onlineUsers,
});

// 요청 모양 검사: 공지 id·제목·본문 + 전체(target 'online') 또는 uuid 목록
const validateAnnouncement = (body) => {
    const { announcementId, title, body: text, target, userUuids } = body ?? {};
    if (typeof announcementId !== 'string' || !ANNOUNCEMENT_ID_PATTERN.test(announcementId)) {
        throw createError('announcementId는 영문·숫자·-·_ 1~64자여야 합니다.', 400, 'INVALID_ANNOUNCEMENT');
    }
    if (typeof title !== 'string' || !title.trim() || title.trim().length > MAX_TITLE) {
        throw createError(`title은 1~${MAX_TITLE}자여야 합니다.`, 400, 'INVALID_ANNOUNCEMENT');
    }
    if (typeof text !== 'string' || !text.trim() || text.trim().length > MAX_BODY) {
        throw createError(`body는 1~${MAX_BODY}자여야 합니다.`, 400, 'INVALID_ANNOUNCEMENT');
    }
    if (target === 'online') {
        return { announcementId, title: title.trim(), body: text.trim(), target: 'online', userUuids: null };
    }
    if (target !== 'users' || !Array.isArray(userUuids) || userUuids.length === 0 || userUuids.length > MAX_TARGETS) {
        throw createError(`target은 'online' 또는 'users'(userUuids 1~${MAX_TARGETS}개)여야 합니다.`, 400, 'INVALID_ANNOUNCEMENT');
    }
    if (!userUuids.every((uuid) => typeof uuid === 'string' && UUID_PATTERN.test(uuid))) {
        throw createError('userUuids에 uuid가 아닌 값이 있습니다.', 400, 'INVALID_ANNOUNCEMENT');
    }
    return { announcementId, title: title.trim(), body: text.trim(), target: 'users', userUuids: [...new Set(userUuids)] };
};

// 한 사람에게 저장·전송, 결과는 created·duplicated·failed 중 하나
const sendToOne = async (deps, userId, { sourceKey, title, body, announcementId }) => {
    try {
        const saved = await deps.notificationService.createNotification({
            userId,
            type: deps.notificationService.NOTIFICATION_TYPES.SYSTEM,
            sourceKey,
            title,
            body,
            target: { kind: 'announcement', announcementId },
        });
        if (!saved.created) return 'duplicated';
        deps.notificationService.emitNotificationCreated(userId, saved.notification);
        return 'created';
    } catch (error) {
        // 없는 계정(외래 키)·DB 오류: 다른 사람 전송은 계속, 로그엔 오류 이름만
        console.error('[운영 알림 저장 실패]', error?.name ?? 'Error');
        return 'failed';
    }
};

// 보내기: 대상마다 알림 저장(같은 공지 id면 있던 것) → 새로 만든 것만 소켓 전송, 한 사람 실패는 세기만
const sendAnnouncement = async (input, deps = defaultDeps()) => {
    const { announcementId, title, body, target, userUuids } = validateAnnouncement(input);
    const recipients = target === 'online' ? [...deps.onlineUsers.keys()].slice(0, MAX_TARGETS) : userUuids;
    const sourceKey = announcementSourceKey(announcementId);

    const counts = { created: 0, duplicated: 0, failed: 0 };
    for (const userId of recipients) {
        const outcome = await sendToOne(deps, userId, { sourceKey, title, body, announcementId });
        counts[outcome] += 1;
    }
    const { created, duplicated, failed } = counts;
    return { announcementId, target, recipientCount: recipients.length, created, duplicated, failed };
};

module.exports = {
    MAX_TARGETS,
    announcementSourceKey,
    validateAnnouncement,
    sendAnnouncement,
};
